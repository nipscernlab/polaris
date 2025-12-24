import { invoke } from '@tauri-apps/api/core';
import { state, getEditorInstance, removeTab, resetTabModified } from './state.js';
import { setEditorModel } from './monaco.js';
import { checkAndCloseEmptyInstances } from './splitEditor.js';

// ===== TAB MANAGEMENT =====

export function renderInstanceTabs(instanceId) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tabsContainer = document.getElementById(`tabs-${instanceId}`);
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    instance.tabs.forEach((tab, filePath) => {
        const tabElement = document.createElement('div');
        tabElement.className = 'editor-tab';
        tabElement.setAttribute('data-path', filePath);
        
        if (filePath === instance.activeTab) {
            tabElement.classList.add('active');
        }
        
        if (tab.modified) {
            tabElement.classList.add('modified');
        }

        tabElement.innerHTML = `
            <span class="material-symbols-outlined">description</span>
            <span>${tab.name}</span>
            <button class="tab-close">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;

        // Tab click
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

export function switchTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance || instance.activeTab === filePath) return;

    instance.activeTab = filePath;
    setEditorModel(instanceId, filePath);
    renderInstanceTabs(instanceId);
}

export function closeTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tab = instance.tabs.get(filePath);
    
    if (tab && tab.modified) {
        showUnsavedChangesModal(instanceId, filePath, tab.name);
    } else {
        performCloseTab(instanceId, filePath);
    }
}

function performCloseTab(instanceId, filePath) {
    removeTab(instanceId, filePath);
    
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    renderInstanceTabs(instanceId);

    // If no tabs left, check if we should close this instance
    if (instance.tabs.size === 0) {
        checkAndCloseEmptyInstances();
        
        // If all instances are closed, show welcome screen
        if (state.editorInstances.length === 0) {
            const welcomeScreen = document.getElementById('welcomeScreen');
            if (welcomeScreen) {
                welcomeScreen.classList.remove('hidden');
            }
        }
    } else if (instance.activeTab) {
        setEditorModel(instanceId, instance.activeTab);
    }
}

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

    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (state.pendingCloseData) {
                await saveFile(state.pendingCloseData.instanceId, state.pendingCloseData.filePath);
                performCloseTab(state.pendingCloseData.instanceId, state.pendingCloseData.filePath);
                closeUnsavedModal();
            }
        };
    }

    if (dontSaveBtn) {
        dontSaveBtn.onclick = () => {
            if (state.pendingCloseData) {
                performCloseTab(state.pendingCloseData.instanceId, state.pendingCloseData.filePath);
                closeUnsavedModal();
            }
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            closeUnsavedModal();
        };
    }
}

function closeUnsavedModal() {
    const modal = document.getElementById('unsavedModal');
    if (modal) modal.classList.remove('active');
    state.pendingCloseData = null;
}

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

        resetTabModified(instanceId, filePath);
        renderInstanceTabs(instanceId);
        
        const statusMessage = document.getElementById('statusMessage');
        if (statusMessage) {
            statusMessage.textContent = `Saved: ${tab.name}`;
            statusMessage.style.color = 'var(--success)';
            setTimeout(() => {
                statusMessage.textContent = 'Ready';
                statusMessage.style.color = '';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving file:', error);
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