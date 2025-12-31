import * as monaco from 'monaco-editor';
import { state, createEditorInstance, removeEditorInstance, setFocusedInstance, getEditorInstance, addTab } from './state.js';
import { initMonacoEditor, setEditorModel } from './monaco.js';
import { renderInstanceTabs } from './tabs.js';

let splitInstance = null;

// ===== SPLIT EDITOR MANAGEMENT =====

export function initSplitEditor() {
    console.log('🔀 Split editor system ready (no editors created yet)');
    // Don't create any editors on init - wait for first file to be opened
}

export async function ensureEditorExists() {
    // If no editors exist, create the first one
    if (state.editorInstances.length === 0) {
        const instance = await createFirstEditor();
        return instance;
    }
    
    // Return focused instance or first instance
    const focused = state.editorInstances.find(i => i.focused);
    return focused || state.editorInstances[0];
}

async function createFirstEditor() {
    const container = document.getElementById('editorContainer');
    if (!container) {
        console.error('Editor container not found');
        return null;
    }

    const editorDiv = document.createElement('div');
    editorDiv.className = 'editor-instance';
    editorDiv.id = 'editor-1';
    
    editorDiv.innerHTML = `
        <div class="editor-header">
            <div class="editor-tabs" id="tabs-1"></div>
            <div class="editor-actions">
                <button class="editor-action split-btn" data-instance-id="1" title="Split Editor (Ctrl+\\)">
                    <span class="material-symbols-outlined">splitscreen_right</span>
                </button>
                <button class="editor-action command-btn" data-instance-id="1" title="Command Palette (Ctrl+Shift+P)">
                    <span class="material-symbols-outlined">search</span>
                </button>
            </div>
        </div>
        <div class="editor-monaco" id="monaco-1"></div>
    `;
    
    container.appendChild(editorDiv);

    // Initialize Monaco editor
    const monacoContainer = document.getElementById('monaco-1');
    const editor = await initMonacoEditor(monacoContainer, 1);
    
    if (!editor) {
        console.error('Failed to create Monaco editor');
        editorDiv.remove();
        return null;
    }
    
    // Create instance
    const instance = createEditorInstance(editor);
    
    // Setup event listeners
    setupEditorListeners(instance.id);
    
    // Hide welcome screen
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) {
        welcomeScreen.classList.add('hidden');
    }

    console.log('✅ First editor created');
    return instance;
}

export async function splitEditor(sourceInstanceId = null) {
    const numInstances = state.editorInstances.length;
    
    if (numInstances === 0) {
        console.log('No editors to split');
        return;
    }
    
    if (numInstances >= 3) {
        console.log('Maximum of 3 editor instances reached');
        return;
    }

    // Get source instance - prioritize the focused one or use specified
    let sourceInstance;
    if (sourceInstanceId) {
        sourceInstance = getEditorInstance(sourceInstanceId);
    } else {
        sourceInstance = state.editorInstances.find(i => i.focused) || state.editorInstances[0];
    }

    if (!sourceInstance) {
        console.error('No source instance found');
        return;
    }

    // Check if source has an active tab
    if (!sourceInstance.activeTab) {
        console.log('No active file to split');
        return;
    }

    const container = document.getElementById('editorContainer');
    if (!container) {
        console.error('Editor container not found');
        return;
    }

    const newId = state.nextEditorId;
    
    // Create new editor div
    const editorDiv = document.createElement('div');
    editorDiv.className = 'editor-instance';
    editorDiv.id = `editor-${newId}`;
    
    editorDiv.innerHTML = `
        <div class="editor-header">
            <div class="editor-tabs" id="tabs-${newId}"></div>
            <div class="editor-actions">
                <button class="editor-action split-btn" data-instance-id="${newId}" title="Split Editor">
                    <span class="material-symbols-outlined">splitscreen_right</span>
                </button>
                <button class="editor-action command-btn" data-instance-id="${newId}" title="Command Palette">
                    <span class="material-symbols-outlined">search</span>
                </button>
            </div>
        </div>
        <div class="editor-monaco" id="monaco-${newId}"></div>
    `;
    
    container.appendChild(editorDiv);

    // Initialize Monaco editor
    const monacoContainer = document.getElementById(`monaco-${newId}`);
    const editor = await initMonacoEditor(monacoContainer, newId);
    
    if (!editor) {
        console.error('Failed to create split editor');
        editorDiv.remove();
        return;
    }
    
    // Create instance
    const newInstance = createEditorInstance(editor);
    
    // CRITICAL: Copy the ACTIVE tab from source instance (the one that was focused)
    const sourceTab = sourceInstance.tabs.get(sourceInstance.activeTab);
    if (sourceTab) {
        addTab(newInstance.id, sourceTab.path, sourceTab.name, sourceTab.content);
        renderInstanceTabs(newInstance.id);
        setEditorModel(newInstance.id, sourceTab.path);
    }
    
    // Setup event listeners
    setupEditorListeners(newInstance.id);
    
    // Setup Split.js with improved gutter
    updateSplit();
    
    // Update split button states
    updateSplitButtons();
    
    // Focus the new editor
    setFocusedInstance(newInstance.id);
    editor.focus();

    console.log(`✅ Editor split created with file: ${sourceTab.name}`);
}

function updateSplit() {
    // Destroy existing split
    if (splitInstance) {
        try {
            splitInstance.destroy();
        } catch (error) {
            console.error('Error destroying split:', error);
        }
        splitInstance = null;
    }

    const instances = state.editorInstances;
    
    if (instances.length > 1) {
        const elements = instances
            .map(i => document.getElementById(`editor-${i.id}`))
            .filter(el => el !== null);
        
        if (elements.length > 1) {
            const sizes = new Array(elements.length).fill(100 / elements.length);
            
            try {
                splitInstance = Split(elements, {
                    sizes: sizes,
                    minSize: 300,
                    gutterSize: 8,
                    cursor: 'col-resize',
                    direction: 'horizontal',
                    snapOffset: 30,
                    gutterStyle: (dimension, gutterSize) => ({
                        'width': `${gutterSize}px`,
                        'background-color': 'var(--border)',
                        'cursor': 'col-resize',
                        'transition': 'background-color 0.2s ease'
                    }),
                    onDrag: () => {
                        // Trigger Monaco layout update during drag
                        instances.forEach(inst => {
                            if (inst.editor) {
                                inst.editor.layout();
                            }
                        });
                    }
                });
                
                // Add hover effect to gutters
                const gutters = document.querySelectorAll('.gutter');
                gutters.forEach(gutter => {
                    gutter.addEventListener('mouseenter', () => {
                        gutter.style.backgroundColor = 'var(--accent)';
                    });
                    gutter.addEventListener('mouseleave', () => {
                        gutter.style.backgroundColor = 'var(--border)';
                    });
                });
            } catch (error) {
                console.error('Error creating split:', error);
            }
        }
    }
}

function setupEditorListeners(instanceId) {
    const editorDiv = document.getElementById(`editor-${instanceId}`);
    if (!editorDiv) return;

    // Focus handling - click anywhere in editor div
    editorDiv.addEventListener('mousedown', () => {
        setFocusedInstance(instanceId);
        updateFocusVisuals();
    });

    // Split button
    const splitBtn = editorDiv.querySelector('.split-btn');
    if (splitBtn) {
        const newSplitBtn = splitBtn.cloneNode(true);
        splitBtn.parentNode.replaceChild(newSplitBtn, splitBtn);
        
        newSplitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            splitEditor(instanceId);
        });
    }

    // Command palette button
    const commandBtn = editorDiv.querySelector('.command-btn');
    if (commandBtn) {
        const newCommandBtn = commandBtn.cloneNode(true);
        commandBtn.parentNode.replaceChild(newCommandBtn, commandBtn);
        
        newCommandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const commandPalette = document.getElementById('commandPaletteOverlay');
            if (commandPalette) {
                commandPalette.classList.add('active');
            }
            const commandSearch = document.getElementById('commandSearch');
            if (commandSearch) {
                commandSearch.focus();
            }
        });
    }
}

function updateFocusVisuals() {
    state.editorInstances.forEach(instance => {
        const editorDiv = document.getElementById(`editor-${instance.id}`);
        if (editorDiv) {
            if (instance.focused) {
                editorDiv.style.opacity = '1';
                editorDiv.style.borderLeft = '3px solid var(--accent)';
                editorDiv.style.background = 'var(--bg-primary)';
            } else {
                editorDiv.style.opacity = '0.85';
                editorDiv.style.borderLeft = '3px solid transparent';
                editorDiv.style.background = '#08080d';
            }
        }
    });
}

export function updateSplitButtons() {
    const hasEditors = state.editorInstances.length > 0;
    const canSplit = state.editorInstances.length < 3;
    
    state.editorInstances.forEach(instance => {
        const editorDiv = document.getElementById(`editor-${instance.id}`);
        if (!editorDiv) return;
        
        const splitBtn = editorDiv.querySelector('.split-btn');
        if (splitBtn) {
            // Only disable if no active tab or max instances reached
            const hasActiveTab = instance.activeTab !== null;
            splitBtn.disabled = !canSplit || !hasActiveTab;
            splitBtn.style.display = hasEditors ? 'flex' : 'none';
            
            if (!canSplit || !hasActiveTab) {
                splitBtn.style.opacity = '0.5';
                splitBtn.style.cursor = 'not-allowed';
            } else {
                splitBtn.style.opacity = '1';
                splitBtn.style.cursor = 'pointer';
            }
        }
    });
}

export async function closeEditorInstance(instanceId) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    // Check for unsaved changes
    const unsavedTabs = [];
    instance.tabs.forEach((tab, path) => {
        if (tab.modified) {
            unsavedTabs.push({ path, name: tab.name });
        }
    });

    if (unsavedTabs.length > 0) {
        const confirmed = window.confirm(`There are ${unsavedTabs.length} unsaved file(s). Close anyway?`);
        if (!confirmed) return;
    }

    // Dispose editor
    if (instance.editor) {
        instance.editor.dispose();
    }

    // Remove DOM element
    const editorDiv = document.getElementById(`editor-${instanceId}`);
    if (editorDiv) {
        editorDiv.remove();
    }

    // Remove from state
    removeEditorInstance(instanceId);

    // Update split
    if (state.editorInstances.length > 1) {
        updateSplit();
    } else if (splitInstance) {
        try {
            splitInstance.destroy();
        } catch (error) {
            console.error('Error destroying split:', error);
        }
        splitInstance = null;
    }

    // Update buttons
    updateSplitButtons();

    // Show welcome screen if no instances
    if (state.editorInstances.length === 0) {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.remove('hidden');
        }
    }
}

export function checkAndCloseEmptyInstances() {
    const instancesToClose = [];
    
    state.editorInstances.forEach(instance => {
        if (instance.tabs.size === 0) {
            instancesToClose.push(instance.id);
        }
    });

    instancesToClose.forEach(id => {
        closeEditorInstance(id);
    });
}