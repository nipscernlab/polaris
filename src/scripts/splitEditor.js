import { state, createEditorInstance, removeEditorInstance, setFocusedInstance, getFocusedInstance, addTab } from './state.js';
import { initMonacoEditor, setEditorModel } from './monaco.js';
import { renderInstanceTabs } from './tabs.js';

let splitInstance = null;

// ===== SPLIT EDITOR INITIALIZATION =====

export function initSplitEditor() {
    console.log('📐 Initializing split editor system...');
    
    // DO NOT create initial editor instance
    // It will be created when user opens first file
    
    console.log('✅ Split editor system initialized');
}

// ===== ENSURE EDITOR EXISTS =====

export async function ensureEditorExists() {
    // Check if we have at least one editor instance
    if (state.editorInstances.length === 0) {
        console.log('Creating initial editor instance...');
        
        // Hide welcome screen
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.add('hidden');
        }
        
        // Create editor container
        const container = document.getElementById('editorContainer');
        if (!container) {
            console.error('Editor container not found');
            return null;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Create new editor instance
        const editorDiv = createEditorDiv(state.nextEditorId);
        container.appendChild(editorDiv);
        
        // Initialize Monaco
        const monacoContainer = editorDiv.querySelector('.editor-monaco');
        const editor = await initMonacoEditor(monacoContainer, state.nextEditorId);
        
        if (editor) {
            const instance = createEditorInstance(editor);
            
            // Setup focus event
            monacoContainer.addEventListener('click', () => {
                setFocusedInstance(instance.id);
                updateFocusVisuals();
            });
            
            updateSplitButtons();
            
            console.log('✅ Initial editor instance created:', instance.id);
            return instance;
        }
        
        return null;
    }
    
    // Return focused instance or first available
    return getFocusedInstance() || state.editorInstances[0];
}

// ===== SPLIT EDITOR =====

export async function splitEditor() {
    const focusedInstance = getFocusedInstance();
    
    if (!focusedInstance) {
        console.log('No focused instance to split');
        return;
    }
    
    // Don't allow more than 3 splits
    if (state.editorInstances.length >= 3) {
        console.log('Maximum of 3 editor instances reached');
        return;
    }
    
    const container = document.getElementById('editorContainer');
    if (!container) return;
    
    // Create new editor div
    const newEditorDiv = createEditorDiv(state.nextEditorId);
    container.appendChild(newEditorDiv);
    
    // Calculate sizes based on number of instances
    const numInstances = state.editorInstances.length + 1;
    const sizes = new Array(numInstances).fill(100 / numInstances);
    
    // Initialize or update Split.js
    if (!splitInstance) {
        const Split = window.Split;
        if (Split) {
            splitInstance = Split(
                Array.from(container.querySelectorAll('.editor-instance')),
                {
                    sizes: sizes,
                    minSize: 200,
                    gutterSize: 8,
                    cursor: 'col-resize',
                    direction: 'horizontal'
                }
            );
        }
    } else {
        // Update existing split
        splitInstance.destroy();
        const Split = window.Split;
        if (Split) {
            splitInstance = Split(
                Array.from(container.querySelectorAll('.editor-instance')),
                {
                    sizes: sizes,
                    minSize: 200,
                    gutterSize: 8,
                    cursor: 'col-resize',
                    direction: 'horizontal'
                }
            );
        }
    }
    
    // Initialize Monaco for new instance
    const monacoContainer = newEditorDiv.querySelector('.editor-monaco');
    const editor = await initMonacoEditor(monacoContainer, state.nextEditorId);
    
    if (editor) {
        const newInstance = createEditorInstance(editor);
        
        // Setup focus event
        monacoContainer.addEventListener('click', () => {
            setFocusedInstance(newInstance.id);
            updateFocusVisuals();
        });
        
        // Copy active tab from focused instance to new instance
        if (focusedInstance.activeTab) {
            const activeTab = focusedInstance.tabs.get(focusedInstance.activeTab);
            if (activeTab) {
                addTab(newInstance.id, activeTab.path, activeTab.name, activeTab.content);
                renderInstanceTabs(newInstance.id);
                setEditorModel(newInstance.id, activeTab.path);
            }
        }
        
        // Focus new instance
        setFocusedInstance(newInstance.id);
        updateFocusVisuals();
        
        updateSplitButtons();
        
        console.log('✅ Editor split created:', newInstance.id);
    }
}

// ===== CLOSE EDITOR INSTANCE =====

export function closeEditorInstance(instanceId) {
    const instance = state.editorInstances.find(i => i.id === instanceId);
    if (!instance) return;
    
    // Don't allow closing if only one instance
    if (state.editorInstances.length <= 1) {
        console.log('Cannot close last editor instance');
        return;
    }
    
    // Check for unsaved changes
    const hasUnsaved = Array.from(instance.tabs.values()).some(tab => tab.modified);
    if (hasUnsaved) {
        const confirmed = window.confirm('This editor has unsaved changes. Close anyway?');
        if (!confirmed) return;
    }
    
    // Dispose editor
    if (instance.editor) {
        instance.editor.dispose();
    }
    
    // Remove from DOM
    const editorDiv = document.getElementById(`editor-${instanceId}`);
    if (editorDiv) {
        editorDiv.remove();
    }
    
    // Remove from state
    removeEditorInstance(instanceId);
    
    // Destroy and recreate split if needed
    if (splitInstance) {
        splitInstance.destroy();
        splitInstance = null;
    }
    
    const container = document.getElementById('editorContainer');
    if (container && state.editorInstances.length > 1) {
        const Split = window.Split;
        if (Split) {
            const editorDivs = Array.from(container.querySelectorAll('.editor-instance'));
            if (editorDivs.length > 1) {
                const numInstances = editorDivs.length;
                const sizes = new Array(numInstances).fill(100 / numInstances);
                
                splitInstance = Split(editorDivs, {
                    sizes: sizes,
                    minSize: 200,
                    gutterSize: 8,
                    cursor: 'col-resize',
                    direction: 'horizontal'
                });
            }
        }
    }
    
    // If no instances left, show welcome screen
    if (state.editorInstances.length === 0) {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.remove('hidden');
        }
    }
    
    updateFocusVisuals();
    updateSplitButtons();
    
    console.log('✅ Editor instance closed:', instanceId);
}

// ===== CHECK AND CLOSE EMPTY INSTANCES =====

export function checkAndCloseEmptyInstances() {
    // Don't close if only one instance remains
    if (state.editorInstances.length <= 1) {
        return;
    }
    
    // Find empty instances (no tabs)
    const emptyInstances = state.editorInstances.filter(inst => inst.tabs.size === 0);
    
    // Close all but one empty instance
    if (emptyInstances.length > 0 && emptyInstances.length < state.editorInstances.length) {
        emptyInstances.forEach(instance => {
            closeEditorInstance(instance.id);
        });
    }
}

// ===== CREATE EDITOR DIV =====

function createEditorDiv(id) {
    const div = document.createElement('div');
    div.id = `editor-${id}`;
    div.className = 'editor-instance';
    
    div.innerHTML = `
        <div class="editor-header">
            <div class="editor-tabs" id="tabs-${id}"></div>
            <div class="editor-actions">
                <button class="editor-action" id="split-${id}" title="Split Editor">
                    <span class="material-symbols-outlined">vertical_split</span>
                </button>
                <button class="editor-action" id="close-${id}" title="Close Editor">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
        <div class="editor-monaco" id="monaco-${id}"></div>
    `;
    
    // Setup split button
    const splitBtn = div.querySelector(`#split-${id}`);
    if (splitBtn) {
        splitBtn.addEventListener('click', () => {
            if (state.editorInstances.length < 3) {
                splitEditor();
            }
        });
    }
    
    // Setup close button
    const closeBtn = div.querySelector(`#close-${id}`);
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeEditorInstance(id);
        });
    }
    
    return div;
}

// ===== UPDATE SPLIT BUTTONS =====

export function updateSplitButtons() {
    state.editorInstances.forEach(instance => {
        const splitBtn = document.getElementById(`split-${instance.id}`);
        const closeBtn = document.getElementById(`close-${instance.id}`);
        
        if (splitBtn) {
            splitBtn.disabled = state.editorInstances.length >= 3;
        }
        
        if (closeBtn) {
            closeBtn.disabled = state.editorInstances.length <= 1;
        }
    });
}

// ===== UPDATE FOCUS VISUALS =====

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

// ===== EXPORT FUNCTIONS =====

export { splitInstance };