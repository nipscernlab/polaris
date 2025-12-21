// ===== CENTRALIZED APPLICATION STATE =====

export const state = {
    // Workspace
    workspacePath: null,
    workspaceName: null,

    // Project
    currentSpfPath: null,
    currentSpfData: null,

    // Editor
    editor: null,
    openTabs: new Map(), // path -> { name, content, modified, model }
    activeTab: null,

    // File Tree
    fileTreeData: null,

    // Terminal
    terminalVisible: false,
    terminalHistory: [],

    // Settings
    settings: {
        fontSize: 14,
        tabSize: 4,
        lineNumbers: true,
        wordWrap: false,
        theme: 'aurora-dark',
        fontFamily: 'JetBrains Mono',
        minimap: true,
        padding: 16
    },

    // UI State
    commandPaletteOpen: false,
    unsavedChangesModalOpen: false,
    pendingCloseTab: null
};

// ===== STATE MUTATIONS =====

export function setWorkspace(path, name) {
    state.workspacePath = path;
    state.workspaceName = name;
    
    // Update UI
    const workspaceNameEl = document.getElementById('workspaceName');
    if (workspaceNameEl) {
        workspaceNameEl.textContent = name || 'No Folder Opened';
    }
}

export function addTab(filePath, fileName, content) {
    if (!state.openTabs.has(filePath)) {
        state.openTabs.set(filePath, {
            name: fileName,
            content: content,
            originalContent: content,
            modified: false,
            model: null
        });
    }
    state.activeTab = filePath;
}

export function removeTab(filePath) {
    const tab = state.openTabs.get(filePath);
    if (tab && tab.model) {
        tab.model.dispose();
    }
    state.openTabs.delete(filePath);
    
    // Set new active tab
    if (state.activeTab === filePath) {
        const tabs = Array.from(state.openTabs.keys());
        state.activeTab = tabs.length > 0 ? tabs[tabs.length - 1] : null;
    }
}

export function markTabModified(filePath, modified) {
    const tab = state.openTabs.get(filePath);
    if (tab) {
        tab.modified = modified;
    }
}

export function updateTabContent(filePath, content) {
    const tab = state.openTabs.get(filePath);
    if (tab) {
        tab.content = content;
        tab.modified = content !== tab.originalContent;
    }
}

export function resetTabModified(filePath) {
    const tab = state.openTabs.get(filePath);
    if (tab) {
        tab.originalContent = tab.content;
        tab.modified = false;
    }
}

export function closeAllTabs() {
    state.openTabs.forEach((tab, path) => {
        if (tab.model) {
            tab.model.dispose();
        }
    });
    state.openTabs.clear();
    state.activeTab = null;
}

export function getActiveTab() {
    if (!state.activeTab) return null;
    return state.openTabs.get(state.activeTab);
}

export function hasUnsavedChanges() {
    for (const [path, tab] of state.openTabs) {
        if (tab.modified) {
            return true;
        }
    }
    return false;
}

export function getModifiedTabs() {
    const modified = [];
    for (const [path, tab] of state.openTabs) {
        if (tab.modified) {
            modified.push({ path, name: tab.name });
        }
    }
    return modified;
}

export function setTerminalVisible(visible) {
    state.terminalVisible = visible;
    const terminalContainer = document.getElementById('terminalContainer');
    if (terminalContainer) {
        terminalContainer.classList.toggle('visible', visible);
    }
}

export function saveSettings() {
    try {
        localStorage.setItem('aurora_settings', JSON.stringify(state.settings));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

export function loadSettings() {
    try {
        const saved = localStorage.getItem('aurora_settings');
        if (saved) {
            Object.assign(state.settings, JSON.parse(saved));
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

export function setCurrentSpf(spfPath, spfData) {
    state.currentSpfPath = spfPath;
    state.currentSpfData = spfData;
    
    // Enable/disable Processor Hub button
    const processorHubBtn = document.getElementById('processorHubBtn');
    if (processorHubBtn) {
        processorHubBtn.disabled = !spfPath;
        processorHubBtn.title = spfPath ? 'Open Processor Hub' : 'Open a .spf project first';
    }
}

export function hasSpfProject() {
    return state.currentSpfPath !== null;
}