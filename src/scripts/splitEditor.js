import * as monaco from 'monaco-editor';
import { state, createEditorInstance, removeEditorInstance, setFocusedInstance, getEditorInstance } from './state.js';
import { initMonacoEditor } from './monaco.js';
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
        await createFirstEditor();
        return state.editorInstances[0];
    }
    
    // Return focused instance or first instance
    const focused = state.editorInstances.find(i => i.focused);
    return focused || state.editorInstances[0];
}

async function createFirstEditor() {
    const container = document.getElementById('editorContainer');
    if (!container) return null;

    const editorDiv = document.createElement('div');
    editorDiv.className = 'editor-instance';
    editorDiv.id = 'editor-1';
    
    editorDiv.innerHTML = `
        <div class="editor-header">
            <div class="editor-tabs" id="tabs-1"></div>
            <div class="editor-actions">
                <button class="editor-action" id="splitBtn-1" title="Split Editor (Ctrl+\\)">
                    <span class="material-symbols-outlined">splitscreen</span>
                </button>
                <button class="editor-action" id="commandBtn-1" title="Command Palette (Ctrl+Shift+P)">
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

export async function splitEditor() {
    const numInstances = state.editorInstances.length;
    
    if (numInstances === 0) {
        console.log('No editors to split');
        return;
    }
    
    if (numInstances >= 3) {
        console.log('Maximum of 3 editor instances reached');
        return;
    }

    const container = document.getElementById('editorContainer');
    const newId = state.nextEditorId;
    
    // Create new editor div
    const editorDiv = document.createElement('div');
    editorDiv.className = 'editor-instance';
    editorDiv.id = `editor-${newId}`;
    
    editorDiv.innerHTML = `
        <div class="editor-header">
            <div class="editor-tabs" id="tabs-${newId}"></div>
            <div class="editor-actions">
                <button class="editor-action" id="splitBtn-${newId}" title="Split Editor">
                    <span class="material-symbols-outlined">splitscreen</span>
                </button>
                <button class="editor-action" id="commandBtn-${newId}" title="Command Palette">
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
    const instance = createEditorInstance(editor);
    
    // Setup event listeners
    setupEditorListeners(instance.id);
    
    // Setup Split.js
    updateSplit();
    
    // Update split button states
    updateSplitButtons();

    console.log('✅ Editor split created');
}

function updateSplit() {
    // Destroy existing split
    if (splitInstance) {
        splitInstance.destroy();
        splitInstance = null;
    }

    const instances = state.editorInstances;
    
    if (instances.length > 1) {
        const elements = instances.map(i => document.getElementById(`editor-${i.id}`));
        const sizes = new Array(instances.length).fill(100 / instances.length);
        
        splitInstance = Split(elements, {
            sizes: sizes,
            minSize: 300,
            gutterSize: 4,
            cursor: 'col-resize',
            direction: 'horizontal'
        });
    }
}

function setupEditorListeners(instanceId) {
    const editorDiv = document.getElementById(`editor-${instanceId}`);
    if (!editorDiv) return;

    // Focus handling
    editorDiv.addEventListener('mousedown', () => {
        setFocusedInstance(instanceId);
        updateFocusVisuals();
    });

    // Split button
    const splitBtn = document.getElementById(`splitBtn-${instanceId}`);
    if (splitBtn) {
        splitBtn.addEventListener('click', splitEditor);
    }

    // Command palette button
    const commandBtn = document.getElementById(`commandBtn-${instanceId}`);
    if (commandBtn) {
        commandBtn.addEventListener('click', () => {
            document.getElementById('commandPaletteOverlay')?.classList.add('active');
            document.getElementById('commandSearch')?.focus();
        });
    }
}

function updateFocusVisuals() {
    state.editorInstances.forEach(instance => {
        const editorDiv = document.getElementById(`editor-${instance.id}`);
        if (editorDiv) {
            if (instance.focused) {
                editorDiv.style.opacity = '1';
            } else {
                editorDiv.style.opacity = '0.7';
            }
        }
    });
}

export function updateSplitButtons() {
    const hasEditors = state.editorInstances.length > 0;
    const canSplit = state.editorInstances.length < 3;
    
    state.editorInstances.forEach(instance => {
        const splitBtn = document.getElementById(`splitBtn-${instance.id}`);
        if (splitBtn) {
            splitBtn.disabled = !canSplit;
            splitBtn.style.display = hasEditors ? 'flex' : 'none';
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
        console.log('Unsaved tabs:', unsavedTabs);
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
        splitInstance.destroy();
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