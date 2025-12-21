import { invoke } from '@tauri-apps/api/core';
import { state, removeTab, resetTabModified } from './state.js';
import { setEditorModel } from './monaco.js';
import { showStatus } from './main.js';

export function initTabs() {
    console.log('📑 Initializing tabs...');
}

export function renderTabs() {
    const tabsContainer = document.getElementById('tabs');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';

    state.openTabs.forEach((tab, filePath) => {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.setAttribute('data-path', filePath);
        
        if (filePath === state.activeTab) {
            tabElement.classList.add('active');
        }
        
        if (tab.modified) {
            tabElement.classList.add('modified');
        }

        tabElement.innerHTML = `
            <span class="material-symbols-outlined">description</span>
            <span>${tab.name}</span>
            <button class="tab-close" aria-label="Close">
                <span class="material-symbols-outlined">close</span>
            </button>
        `;

        // Tab click
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                switchToTab(filePath);
            }
        });

        // Close button
        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(filePath);
        });

        tabsContainer.appendChild(tabElement);
    });
}

export function switchToTab(filePath) {
    if (state.activeTab === filePath) return;

    state.activeTab = filePath;
    setEditorModel(filePath);
    renderTabs();
}

export function closeTab(filePath) {
    const tab = state.openTabs.get(filePath);
    
    if (tab && tab.modified) {
        // Show unsaved changes modal
        showUnsavedChangesModal(filePath, tab.name);
    } else {
        performCloseTab(filePath);
    }
}

function performCloseTab(filePath) {
    removeTab(filePath);
    renderTabs();

    // If no tabs left, show welcome screen
    if (state.openTabs.size === 0) {
        const editorEl = document.getElementById('monacoEditor');
        const welcomeScreen = document.getElementById('welcomeScreen');
        
        if (editorEl) editorEl.classList.remove('active');
        if (welcomeScreen) welcomeScreen.classList.remove('hidden');
        
        if (state.editor) {
            state.editor.setModel(null);
        }
    } else if (state.activeTab) {
        setEditorModel(state.activeTab);
    }
}

function showUnsavedChangesModal(filePath, fileName) {
    state.pendingCloseTab = filePath;
    
    const modal = document.getElementById('unsavedChangesModal');
    const fileNameEl = document.getElementById('unsavedFileName');
    
    if (fileNameEl) fileNameEl.textContent = fileName;
    if (modal) modal.classList.add('active');

    // Setup buttons
    setupUnsavedChangesButtons();
}

function setupUnsavedChangesButtons() {
    const saveBtn = document.getElementById('saveAndCloseBtn');
    const dontSaveBtn = document.getElementById('dontSaveBtn');
    const cancelBtn = document.getElementById('cancelCloseBtn');

    if (saveBtn) {
        saveBtn.onclick = async () => {
            if (state.pendingCloseTab) {
                await saveFile(state.pendingCloseTab);
                performCloseTab(state.pendingCloseTab);
                closeUnsavedChangesModal();
            }
        };
    }

    if (dontSaveBtn) {
        dontSaveBtn.onclick = () => {
            if (state.pendingCloseTab) {
                performCloseTab(state.pendingCloseTab);
                closeUnsavedChangesModal();
            }
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            closeUnsavedChangesModal();
        };
    }
}

function closeUnsavedChangesModal() {
    const modal = document.getElementById('unsavedChangesModal');
    if (modal) modal.classList.remove('active');
    state.pendingCloseTab = null;
}

export async function saveFile(filePath) {
    const tab = state.openTabs.get(filePath);
    if (!tab) return;

    try {
        await invoke('save_file', {
            path: filePath,
            content: tab.content
        });

        resetTabModified(filePath);
        renderTabs();
        showStatus(`Saved: ${tab.name}`, 'success');
    } catch (error) {
        console.error('Error saving file:', error);
        showStatus(`Error saving: ${tab.name}`, 'error');
    }
}

export async function saveActiveFile() {
    if (state.activeTab) {
        await saveFile(state.activeTab);
    }
}

export function closeActiveTab() {
    if (state.activeTab) {
        closeTab(state.activeTab);
    }
}

export function reopenClosedTab() {
    // TODO: Implement tab history
    showStatus('Reopen closed tab not implemented yet', 'info');
}