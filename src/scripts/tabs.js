import { invoke } from '@tauri-apps/api/core';
import { state, getEditorInstance, removeTab, resetTabModified, setFocusedInstance } from './state.js';
import { setEditorModel, disposeModel } from './monaco.js';
import { checkAndCloseEmptyInstances } from './splitEditor.js';
import { updateFileTreeHighlight } from './fileTree.js';

// ===== TAB RENDERING =====

export function renderInstanceTabs(instanceId) {
    const instance = getEditorInstance(instanceId);
    if (!instance) {
        console.error(`Instance ${instanceId} not found for tab rendering`);
        return;
    }

    const tabsContainer = document.getElementById(`tabs-${instanceId}`);
    if (!tabsContainer) {
        console.error(`Tabs container for instance ${instanceId} not found`);
        return;
    }

    tabsContainer.innerHTML = '';

    // Convert tabs to array and maintain order
    const tabsArray = Array.from(instance.tabs.entries());

    tabsArray.forEach(([filePath, tab]) => {
        const tabElement = document.createElement('div');
        tabElement.className = 'editor-tab';
        tabElement.setAttribute('data-path', filePath);
        tabElement.setAttribute('data-instance', instanceId);
        
        if (filePath === instance.activeTab) {
            tabElement.classList.add('active');
        }
        
        if (tab.modified) {
            tabElement.classList.add('modified');
        }

        tabElement.innerHTML = `
            <span class="material-symbols-outlined">description</span>
            <span class="tab-name">${escapeHtml(tab.name)}</span>
            ${tab.modified ? '<span class="modified-indicator">●</span>' : ''}
            <button class="tab-close">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;

        // Tab click - switch to this tab
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                switchTab(instanceId, filePath);
            }
        });

        // Close button
        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(instanceId, filePath);
        });

        tabsContainer.appendChild(tabElement);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function renderAllInstanceTabs() {
    state.editorInstances.forEach(instance => {
        renderInstanceTabs(instance.id);
    });
}

// ===== TAB SWITCHING =====

export function switchTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) {
        console.error(`Instance ${instanceId} not found`);
        return;
    }

    const tab = instance.tabs.get(filePath);
    if (!tab) {
        console.error(`Tab ${filePath} not found in instance ${instanceId}`);
        return;
    }

    // Set focus to this instance
    setFocusedInstance(instanceId);

    // Set the model for this tab
    setEditorModel(instanceId, filePath);
    
    // Re-render tabs to update active state
    renderInstanceTabs(instanceId);
    
    // Update file tree highlight
    console.log('Switched to tab, updating highlight for:', filePath);
    updateFileTreeHighlight(filePath);
    
    console.log(`Switched to tab: ${tab.name} in instance ${instanceId}`);
}

// ===== TAB CLOSING =====

export function closeTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tab = instance.tabs.get(filePath);
    if (!tab) return;
    
    if (tab.modified) {
        showUnsavedChangesModal(instanceId, filePath, tab.name);
    } else {
        performCloseTab(instanceId, filePath);
    }
}

function performCloseTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    console.log(`Closing tab: ${filePath} from instance ${instanceId}`);

    // Remove tab from this instance only
    removeTab(instanceId, filePath);
    
    // Try to dispose the global model (will only dispose if no other instance uses it)
    disposeModel(filePath);
    
    // Re-render this instance's tabs
    renderInstanceTabs(instanceId);

    // Handle active tab switching
    if (instance.tabs.size === 0) {
        // No more tabs in this instance
        instance.activeTab = null;
        if (instance.editor) {
            instance.editor.setModel(null);
        }
        
        // Clear file tree highlight when no tabs are open
        updateFileTreeHighlight(null);
        
        // Check if we should close this empty instance
        checkAndCloseEmptyInstances();
        
        // If all instances are closed, show welcome screen
        if (state.editorInstances.length === 0) {
            const welcomeScreen = document.getElementById('welcomeScreen');
            if (welcomeScreen) {
                welcomeScreen.classList.remove('hidden');
            }
        }
    } else {
        // Switch to another tab in this instance
        if (instance.activeTab === filePath || !instance.activeTab) {
            // Need to switch to a different tab
            const remainingTabs = Array.from(instance.tabs.keys());
            if (remainingTabs.length > 0) {
                const newActiveTab = remainingTabs[remainingTabs.length - 1];
                switchTab(instanceId, newActiveTab);
            }
        } else {
            // Active tab is still valid, just refresh the model
            setEditorModel(instanceId, instance.activeTab);
            updateFileTreeHighlight(instance.activeTab);
        }
    }
}

// ===== CLOSE FILE FROM ALL INSTANCES =====

export function closeFileFromAllInstances(filePath) {
    console.log(`Closing file from all instances: ${filePath}`);
    
    // Collect all instances that have this file
    const instancesToUpdate = [];
    state.editorInstances.forEach(instance => {
        if (instance.tabs.has(filePath)) {
            instancesToUpdate.push(instance.id);
        }
    });
    
    // Close the file from each instance
    instancesToUpdate.forEach(instanceId => {
        const instance = getEditorInstance(instanceId);
        if (!instance) return;
        
        // Remove the tab
        removeTab(instanceId, filePath);
        
        // If this was the active tab, switch to another
        if (instance.activeTab === filePath) {
            const remainingTabs = Array.from(instance.tabs.keys());
            if (remainingTabs.length > 0) {
                // Switch to another tab in same instance
                switchTab(instanceId, remainingTabs[0]);
            } else {
                // No more tabs in this instance
                instance.activeTab = null;
                if (instance.editor) {
                    instance.editor.setModel(null);
                }
            }
        }
        
        // Re-render tabs
        renderInstanceTabs(instanceId);
    });
    
    // Dispose the model
    disposeModel(filePath);
    
    // Check if we need to close empty instances
    checkAndCloseEmptyInstances();
    
    // If all instances are closed, show welcome screen and clear highlight
    if (state.editorInstances.length === 0) {
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.remove('hidden');
        }
        updateFileTreeHighlight(null);
    } else {
        // Update highlight to currently focused instance's active tab
        const focusedInstance = state.editorInstances.find(i => i.focused);
        if (focusedInstance && focusedInstance.activeTab) {
            updateFileTreeHighlight(focusedInstance.activeTab);
        } else {
            // No active tab in focused instance, clear highlight
            updateFileTreeHighlight(null);
        }
    }
}

// ===== UNSAVED CHANGES MODAL =====

function showUnsavedChangesModal(instanceId, filePath, fileName) {
    state.pendingCloseData = { instanceId, filePath };
    
    const modal = document.getElementById('unsavedModal');
    const fileNameEl = document.getElementById('unsavedFileName');
    
    if (fileNameEl) fileNameEl.textContent = fileName;
    if (modal) modal.classList.add('active');

    setupUnsavedButtons();
}

function setupUnsavedButtons() {
    const saveBtn = document.getElementById('saveBtn');
    const dontSaveBtn = document.getElementById('dontSaveBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    // Remove old listeners by cloning
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        
        newSaveBtn.addEventListener('click', async () => {
            if (state.pendingCloseData) {
                await saveFile(state.pendingCloseData.instanceId, state.pendingCloseData.filePath);
                performCloseTab(state.pendingCloseData.instanceId, state.pendingCloseData.filePath);
                closeUnsavedModal();
            }
        });
    }

    if (dontSaveBtn) {
        const newDontSaveBtn = dontSaveBtn.cloneNode(true);
        dontSaveBtn.parentNode.replaceChild(newDontSaveBtn, dontSaveBtn);
        
        newDontSaveBtn.addEventListener('click', () => {
            if (state.pendingCloseData) {
                performCloseTab(state.pendingCloseData.instanceId, state.pendingCloseData.filePath);
                closeUnsavedModal();
            }
        });
    }

    if (cancelBtn) {
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener('click', () => {
            closeUnsavedModal();
        });
    }
}

function closeUnsavedModal() {
    const modal = document.getElementById('unsavedModal');
    if (modal) modal.classList.remove('active');
    state.pendingCloseData = null;
}

// ===== FILE SAVING =====

export async function saveFile(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tab = instance.tabs.get(filePath);
    if (!tab) return;

    try {
        await invoke('save_file', {
            path: filePath,
            content: tab.content
        });

        // Reset modified state for all instances with this file
        state.editorInstances.forEach(inst => {
            const instTab = inst.tabs.get(filePath);
            if (instTab) {
                instTab.originalContent = tab.content;
                instTab.modified = false;
            }
        });
        
        // Re-render all affected tabs
        renderAllInstanceTabs();
        
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.textContent = `Saved: ${tab.name}`;
            statusMessage.style.color = 'var(--success)';
            setTimeout(() => {
                statusMessage.textContent = 'Ready';
                statusMessage.style.color = '';
            }, 2000);
        }
        
        console.log(`File saved: ${filePath}`);
    } catch (error) {
        console.error('Error saving file:', error);
        
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.textContent = `Error saving: ${tab.name}`;
            statusMessage.style.color = 'var(--error)';
        }
    }
}

export async function saveActiveFile() {
    const focusedInstance = state.editorInstances.find(i => i.focused);
    if (focusedInstance && focusedInstance.activeTab) {
        await saveFile(focusedInstance.id, focusedInstance.activeTab);
    }
}

export function closeActiveTab() {
    const focusedInstance = state.editorInstances.find(i => i.focused);
    if (focusedInstance && focusedInstance.activeTab) {
        closeTab(focusedInstance.id, focusedInstance.activeTab);
    }
}

// ===== UTILITY FUNCTIONS =====

export function getActiveTabInInstance(instanceId) {
    const instance = getEditorInstance(instanceId);
    if (!instance || !instance.activeTab) return null;
    return instance.tabs.get(instance.activeTab);
}

export function hasUnsavedChanges() {
    for (const instance of state.editorInstances) {
        for (const [, tab] of instance.tabs) {
            if (tab.modified) return true;
        }
    }
    return false;
}