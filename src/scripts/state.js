// ===== CENTRALIZED STATE MANAGEMENT =====

export const state = {
    // Workspace
    workspacePath: null,
    workspaceName: null,

    // Editor Instances
    editorInstances: [], // Array of { id, editor, tabs: Map, activeTab, focused }
    nextEditorId: 1,
    focusedInstanceId: null,

    // File Tree
    fileTreeData: null,

    // Settings
    settings: {
        fontSize: 14,
        tabSize: 4,
        lineNumbers: true,
        wordWrap: false,
        theme: 'polaris-dark',
        fontFamily: 'JetBrains Mono',
        minimap: true,
        padding: 16
    },

    // UI State
    unsavedModalOpen: false,
    pendingCloseData: null
};

// ===== WORKSPACE =====

export function setWorkspace(path, name) {
    state.workspacePath = path;
    state.workspaceName = name;
    
    const workspaceInfo = document.getElementById('workspaceInfo');
    if (workspaceInfo) {
        workspaceInfo.textContent = name || 'No Folder Open';
    }
}

// ===== EDITOR INSTANCES =====

export function createEditorInstance(editorElement) {
    const instance = {
        id: state.nextEditorId++,
        editor: editorElement,
        tabs: new Map(),
        activeTab: null,
        focused: false
    };
    
    state.editorInstances.push(instance);
    
    if (state.editorInstances.length === 1) {
        setFocusedInstance(instance.id);
    }
    
    return instance;
}

export function removeEditorInstance(instanceId) {
    const index = state.editorInstances.findIndex(i => i.id === instanceId);
    if (index !== -1) {
        const instance = state.editorInstances[index];
        
        // Dispose all models
        instance.tabs.forEach(tab => {
            if (tab.model) {
                tab.model.dispose();
            }
        });
        
        // Dispose editor
        if (instance.editor) {
            instance.editor.dispose();
        }
        
        state.editorInstances.splice(index, 1);
        
        // Update focus
        if (state.focusedInstanceId === instanceId) {
            if (state.editorInstances.length > 0) {
                setFocusedInstance(state.editorInstances[0].id);
            } else {
                state.focusedInstanceId = null;
            }
        }
    }
}

export function getEditorInstance(instanceId) {
    return state.editorInstances.find(i => i.id === instanceId);
}

export function getFocusedInstance() {
    if (!state.focusedInstanceId) return null;
    return getEditorInstance(state.focusedInstanceId);
}

export function setFocusedInstance(instanceId) {
    state.editorInstances.forEach(instance => {
        instance.focused = instance.id === instanceId;
    });
    state.focusedInstanceId = instanceId;
}

// ===== TABS =====

export function addTab(instanceId, filePath, fileName, content) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    if (!instance.tabs.has(filePath)) {
        instance.tabs.set(filePath, {
            name: fileName,
            path: filePath,
            content: content,
            originalContent: content,
            modified: false,
            model: null
        });
    }
    
    instance.activeTab = filePath;
}

export function removeTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tab = instance.tabs.get(filePath);
    if (tab && tab.model) {
        tab.model.dispose();
    }
    
    instance.tabs.delete(filePath);
    
    // Update active tab
    if (instance.activeTab === filePath) {
        const tabs = Array.from(instance.tabs.keys());
        instance.activeTab = tabs.length > 0 ? tabs[tabs.length - 1] : null;
    }
}

export function getTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return null;
    return instance.tabs.get(filePath);
}

export function updateTabContent(instanceId, filePath, content) {
    const tab = getTab(instanceId, filePath);
    if (tab) {
        tab.content = content;
        tab.modified = content !== tab.originalContent;
    }
}

export function resetTabModified(instanceId, filePath) {
    const tab = getTab(instanceId, filePath);
    if (tab) {
        tab.originalContent = tab.content;
        tab.modified = false;
    }
}

export function hasUnsavedChanges() {
    for (const instance of state.editorInstances) {
        for (const [path, tab] of instance.tabs) {
            if (tab.modified) {
                return true;
            }
        }
    }
    return false;
}

export function closeAllTabs() {
    state.editorInstances.forEach(instance => {
        instance.tabs.forEach(tab => {
            if (tab.model) {
                tab.model.dispose();
            }
        });
        instance.tabs.clear();
        instance.activeTab = null;
    });
}

// ===== SETTINGS =====

export function saveSettings() {
    try {
        localStorage.setItem('polaris_settings', JSON.stringify(state.settings));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

export function loadSettings() {
    try {
        const saved = localStorage.getItem('polaris_settings');
        if (saved) {
            Object.assign(state.settings, JSON.parse(saved));
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}