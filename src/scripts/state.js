// ===== STATE MANAGEMENT =====

export const state = {
    workspace: null,
    workspaceName: null,
    fileTreeData: null,
    editorInstances: [],
    nextEditorId: 1,
    pendingCloseData: null,
    settings: {
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Consolas', monospace",
        tabSize: 4,
        lineNumbers: true,
        minimap: true,
        wordWrap: false,
        interfaceZoom: 1.0
    }
};

// ===== SETTINGS PERSISTENCE =====

export function loadSettings() {
    try {
        const saved = localStorage.getItem('polaris_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.settings = { ...state.settings, ...parsed };
            
            // Apply interface zoom immediately
            applyInterfaceZoom(state.settings.interfaceZoom);
            
            console.log('Settings loaded:', state.settings);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

export function saveSettings() {
    try {
        localStorage.setItem('polaris_settings', JSON.stringify(state.settings));
        console.log('Settings saved');
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

export function updateSettings(updates) {
    state.settings = { ...state.settings, ...updates };
    saveSettings();
}

export function applyInterfaceZoom(zoomLevel) {
    const app = document.getElementById('app');
    if (app) {
        app.style.transform = `scale(${zoomLevel})`;
        app.style.transformOrigin = 'top left';
        app.style.width = `${100 / zoomLevel}%`;
        app.style.height = `${100 / zoomLevel}%`;
    }
}

// ===== WORKSPACE MANAGEMENT =====

export function setWorkspace(path, name) {
    state.workspace = path;
    state.workspaceName = name;
    
    const workspaceInfo = document.getElementById('workspaceInfo');
    if (workspaceInfo) {
        workspaceInfo.textContent = name || 'No Folder Open';
    }
}

// ===== EDITOR INSTANCE MANAGEMENT =====

export function createEditorInstance(editor) {
    const instance = {
        id: state.nextEditorId++,
        editor: editor,
        tabs: new Map(),
        activeTab: null,
        focused: true
    };
    
    // Unfocus all other instances
    state.editorInstances.forEach(inst => inst.focused = false);
    
    state.editorInstances.push(instance);
    return instance;
}

export function getEditorInstance(id) {
    return state.editorInstances.find(inst => inst.id === id);
}

export function removeEditorInstance(id) {
    const index = state.editorInstances.findIndex(inst => inst.id === id);
    if (index !== -1) {
        state.editorInstances.splice(index, 1);
    }
    
    // If removed instance was focused, focus first remaining instance
    if (state.editorInstances.length > 0) {
        const hasFocused = state.editorInstances.some(inst => inst.focused);
        if (!hasFocused) {
            state.editorInstances[0].focused = true;
        }
    }
}

export function setFocusedInstance(id) {
    state.editorInstances.forEach(inst => {
        inst.focused = inst.id === id;
    });
}

export function getFocusedInstance() {
    return state.editorInstances.find(inst => inst.focused) || state.editorInstances[0];
}

// ===== TAB MANAGEMENT =====

export function addTab(instanceId, filePath, fileName, content) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    // Check if tab already exists in this instance
    if (instance.tabs.has(filePath)) {
        instance.activeTab = filePath;
        return;
    }

    const tab = {
        name: fileName,
        path: filePath,
        content: content,
        originalContent: content,
        modified: false,
        model: null
    };

    instance.tabs.set(filePath, tab);
    instance.activeTab = filePath;
    
    console.log(`Tab added to instance ${instanceId}:`, fileName);
}

export function removeTab(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    instance.tabs.delete(filePath);
    
    // Update active tab
    if (instance.activeTab === filePath) {
        const remainingTabs = Array.from(instance.tabs.keys());
        instance.activeTab = remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null;
    }
    
    console.log(`Tab removed from instance ${instanceId}:`, filePath);
}

export function updateTabContent(instanceId, filePath, newContent) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tab = instance.tabs.get(filePath);
    if (!tab) return;

    tab.content = newContent;
    tab.modified = newContent !== tab.originalContent;
    
    // Sync content to other instances with the same file
    syncContentToOtherInstances(instanceId, filePath, newContent);
}

export function syncContentToOtherInstances(sourceInstanceId, filePath, newContent) {
    state.editorInstances.forEach(instance => {
        if (instance.id === sourceInstanceId) return;
        
        const tab = instance.tabs.get(filePath);
        if (tab) {
            tab.content = newContent;
            tab.modified = newContent !== tab.originalContent;
            
            // Update Monaco model if this is the active tab
            if (instance.activeTab === filePath && tab.model) {
                const currentModelValue = tab.model.getValue();
                if (currentModelValue !== newContent) {
                    const position = instance.editor.getPosition();
                    tab.model.setValue(newContent);
                    if (position) {
                        instance.editor.setPosition(position);
                    }
                }
            }
        }
    });
}

export function resetTabModified(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance) return;

    const tab = instance.tabs.get(filePath);
    if (tab) {
        tab.originalContent = tab.content;
        tab.modified = false;
        
        // Sync to other instances
        state.editorInstances.forEach(inst => {
            if (inst.id === instanceId) return;
            const otherTab = inst.tabs.get(filePath);
            if (otherTab) {
                otherTab.originalContent = tab.content;
                otherTab.modified = false;
            }
        });
    }
}

export function getTabFromAnyInstance(filePath) {
    for (const instance of state.editorInstances) {
        const tab = instance.tabs.get(filePath);
        if (tab) return tab;
    }
    return null;
}

// ===== UTILITY FUNCTIONS =====

export function closeAllTabs() {
    state.editorInstances.forEach(instance => {
        instance.tabs.clear();
        instance.activeTab = null;
    });
}

export function getAllOpenFilePaths() {
    const paths = new Set();
    state.editorInstances.forEach(instance => {
        instance.tabs.forEach((tab, path) => {
            paths.add(path);
        });
    });
    return Array.from(paths);
}