import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { state, addTab, getFocusedInstance } from './state.js';
import { setEditorModel } from './monaco.js';
import { renderInstanceTabs, switchTab, closeFileFromAllInstances } from './tabs.js';
import { ensureEditorExists, updateSplitButtons } from './splitEditor.js';

// File tree state
let fileTreeItems = [];
let draggedItem = null;
let contextMenu = null;
let expandedPaths = new Set();

// ===== INITIALIZATION =====

export function initFileTree() {
    console.log('Initializing file tree...');
    
    const fileTreeContainer = document.getElementById('fileTree');
    if (!fileTreeContainer) {
        console.error('File tree container not found');
        return;
    }

    renderEmptyTree();
    setupContextMenu();
    setupDragAndDrop();
    setupFolderNameModal();
    
    console.log('File tree initialized');
}

// ===== TREE RENDERING =====

function renderEmptyTree() {
    const container = document.getElementById('fileTree');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-explorer">
            <span class="material-symbols-outlined">folder_open</span>
            <p>Empty Project</p>
            <p class="hint">Right-click to create files or folders</p>
        </div>
    `;
}

export async function refreshFileTree(folderPath) {
    if (!folderPath) return;

    const fileTreeContainer = document.getElementById('fileTree');
    
    try {
        // Save expanded state before refresh
        saveExpandedState();
        
        const fileTree = await invoke('get_file_tree', { path: folderPath });
        state.fileTreeData = fileTree;
        
        const existingIndex = fileTreeItems.findIndex(item => item.path === fileTree.path);
        if (existingIndex !== -1) {
            fileTreeItems[existingIndex] = fileTree;
        } else {
            fileTreeItems = [fileTree];
        }
        
        renderFileTree();
        
        // Restore expanded state after render
        setTimeout(() => {
            restoreExpandedState();
            
            // Restore highlight for active tab
            const focusedInstance = getFocusedInstance();
            if (focusedInstance && focusedInstance.activeTab) {
                console.log('Restoring highlight after refresh for:', focusedInstance.activeTab);
                updateFileTreeHighlight(focusedInstance.activeTab);
            }
        }, 50);
    } catch (error) {
        console.error('Error loading file tree:', error);
        showError(fileTreeContainer);
    }
}

function saveExpandedState() {
    expandedPaths.clear();
    document.querySelectorAll('.file-tree-item.expanded').forEach(el => {
        const path = el.getAttribute('data-path');
        if (path) {
            expandedPaths.add(path);
        }
    });
}

function restoreExpandedState() {
    expandedPaths.forEach(path => {
        const element = document.querySelector(`.file-tree-item[data-path="${CSS.escape(path)}"]`);
        if (element && !element.classList.contains('expanded')) {
            toggleFolder(element);
        }
    });
}

function renderFileTree() {
    const container = document.getElementById('fileTree');
    if (!container) return;

    container.innerHTML = '';
    
    if (fileTreeItems.length === 0) {
        renderEmptyTree();
        return;
    }

    const tree = createTreeElements(fileTreeItems, 0);
    container.appendChild(tree);
}

function createTreeElements(items, level) {
    const fragment = document.createDocumentFragment();

    const sortedItems = [...items].sort((a, b) => {
        const aIsDir = isDirectoryItem(a);
        const bIsDir = isDirectoryItem(b);
        if (aIsDir === bIsDir) return a.name.localeCompare(b.name);
        return aIsDir ? -1 : 1;
    });

    sortedItems.forEach(item => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-item-wrapper', '');
        wrapper.setAttribute('data-path', item.path);
        
        const isDir = isDirectoryItem(item);
        
        const element = document.createElement('div');
        element.className = 'file-tree-item';
        element.setAttribute('data-path', item.path);
        element.setAttribute('data-name', item.name);
        element.setAttribute('data-is-dir', isDir);
        element.style.paddingLeft = `${12 + (level * 16)}px`;
        element.draggable = true;
        
        if (isDir) {
            element.classList.add('folder');
            element.innerHTML = `
                <div class="expand-icon">
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
                <span class="material-symbols-outlined folder-icon">folder</span>
                <span class="item-name">${escapeHtml(item.name)}</span>
            `;

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFolder(element);
            });
        } else {
            const isSpfFile = item.name.endsWith('.spf');
            element.classList.add('file');
            
            if (isSpfFile) {
                element.classList.add('spf-file');
            }
            
            const icon = getFileIcon(item.name);
            element.innerHTML = `
                <div class="expand-icon" style="visibility: hidden;"></div>
                <span class="material-symbols-outlined">${icon}</span>
                <span class="item-name">${escapeHtml(item.name)}</span>
            `;

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                openFile(item);
            });
        }

        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, item);
        });

        setupItemDragEvents(element, item);

        wrapper.appendChild(element);

        if (isDir) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'file-tree-children';
            childrenContainer.style.display = 'none';
            
            if (item.children && item.children.length > 0) {
                childrenContainer.appendChild(createTreeElements(item.children, level + 1));
            }
            
            wrapper.appendChild(childrenContainer);
        }

        fragment.appendChild(wrapper);
    });

    return fragment;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isDirectoryItem(item) {
    return item.node_type === 'dir' || 
           item.type === 'directory' || 
           item.is_dir === true || 
           (item.children && Array.isArray(item.children));
}

function getFileIcon(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    
    const iconMap = {
        'js': 'code',
        'ts': 'code',
        'html': 'html',
        'css': 'style',
        'json': 'data_object',
        'spf': 'settings',
        'md': 'description',
        'py': 'code',
        'rs': 'code',
        'v': 'memory',
        'sv': 'memory',
        'c': 'code',
        'cpp': 'code',
        'h': 'code',
        'java': 'code',
        'go': 'code',
        'sh': 'terminal',
        'bat': 'terminal',
        'txt': 'description'
    };

    return iconMap[ext] || 'description';
}

function toggleFolder(element) {
    const wrapper = element.parentElement;
    const childrenContainer = wrapper.querySelector('.file-tree-children');
    
    element.classList.toggle('expanded');
    const isExpanded = element.classList.contains('expanded');

    const folderIcon = element.querySelector('.folder-icon');
    if (folderIcon) {
        folderIcon.textContent = isExpanded ? 'folder_open' : 'folder';
    }

    if (childrenContainer) {
        childrenContainer.style.display = isExpanded ? 'block' : 'none';
    }
}

// ===== FILE TREE HIGHLIGHT SYNC =====

export function updateFileTreeHighlight(filePath) {
    console.log('Updating file tree highlight for:', filePath);
    
    // Remove all previous highlights
    document.querySelectorAll('.file-tree-item.active').forEach(el => {
        el.classList.remove('active');
    });

    if (!filePath) {
        console.log('No file path provided, clearing highlights');
        return;
    }

    // Add highlight to the active file
    const fileElement = document.querySelector(`.file-tree-item[data-path="${CSS.escape(filePath)}"]`);
    if (fileElement) {
        console.log('Found file element, adding highlight');
        fileElement.classList.add('active');
        
        // Ensure parent folders are expanded
        let parent = fileElement.parentElement;
        while (parent) {
            if (parent.hasAttribute('data-item-wrapper')) {
                const folderElement = parent.querySelector('.file-tree-item.folder');
                if (folderElement && !folderElement.classList.contains('expanded')) {
                    console.log('Expanding parent folder');
                    toggleFolder(folderElement);
                }
            }
            parent = parent.parentElement;
        }
        
        // Scroll into view if needed
        fileElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
        console.log('File element not found in tree for path:', filePath);
    }
}

// ===== FILE OPERATIONS =====

async function openFile(item) {
    const filePath = item.path;
    const fileName = item.name;

    try {
        const instance = await ensureEditorExists();
        
        if (!instance) {
            console.error('Failed to create editor instance');
            return;
        }

        const instanceId = instance.id;

        // If tab already exists in THIS instance, just switch to it
        if (instance.tabs.has(filePath)) {
            switchTab(instanceId, filePath);
            return;
        }

        // Read file content
        const content = await invoke('read_file', { path: filePath });
        
        // Add new tab to focused instance
        addTab(instanceId, filePath, fileName, content);
        renderInstanceTabs(instanceId);
        setEditorModel(instanceId, filePath);
        
        // Update highlight after opening file
        console.log('File opened, updating highlight for:', filePath);
        updateFileTreeHighlight(filePath);
        
        updateSplitButtons();
        
        console.log('File opened:', fileName);
    } catch (error) {
        console.error('Error opening file:', error);
    }
}

// ===== CONTEXT MENU =====

function setupContextMenu() {
    const container = document.getElementById('fileTree');
    if (!container) return;

    container.addEventListener('contextmenu', (e) => {
        if (e.target.id === 'fileTree' || e.target.closest('.empty-explorer')) {
            e.preventDefault();
            showContextMenu(e, null);
        }
    });

    document.addEventListener('click', () => {
        hideContextMenu();
    });
}

function showContextMenu(event, item) {
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;

    const menuItems = [];

    if (!item) {
        menuItems.push(
            { label: 'New File', icon: 'description', action: () => createNewFile(state.workspace) },
            { label: 'New Folder', icon: 'folder', action: () => createNewFolder(state.workspace) }
        );
    } else if (isDirectoryItem(item)) {
        menuItems.push(
            { label: 'New File', icon: 'description', action: () => createNewFile(item.path) },
            { label: 'New Folder', icon: 'folder', action: () => createNewFolder(item.path) },
            { label: 'Rename', icon: 'edit', action: () => renameItem(item) },
            { label: 'Delete', icon: 'delete', action: () => deleteItem(item), danger: true }
        );
    } else {
        menuItems.push(
            { label: 'Rename', icon: 'edit', action: () => renameItem(item) },
            { label: 'Delete', icon: 'delete', action: () => deleteItem(item), danger: true }
        );
    }

    menuItems.forEach(menuItem => {
        const itemEl = document.createElement('div');
        itemEl.className = 'context-menu-item';
        if (menuItem.danger) itemEl.classList.add('danger');
        
        itemEl.innerHTML = `
            <span class="material-symbols-outlined">${menuItem.icon}</span>
            <span>${menuItem.label}</span>
        `;
        
        itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            menuItem.action();
            hideContextMenu();
        });
        
        contextMenu.appendChild(itemEl);
    });

    document.body.appendChild(contextMenu);

    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = `${event.clientX - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = `${event.clientY - rect.height}px`;
    }
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
    }
}

// ===== FOLDER NAME MODAL =====

function setupFolderNameModal() {
    const modal = document.getElementById('folderNameModal');
    const overlay = document.getElementById('folderNameOverlay');
    const input = document.getElementById('folderNameInput');
    const createBtn = document.getElementById('createFolderBtn');
    const cancelBtn = document.getElementById('cancelFolderBtn');
    
    if (!modal || !overlay || !input || !createBtn || !cancelBtn) return;
    
    // Close modal on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeFolderNameModal();
        }
    });
    
    // Close on cancel button
    cancelBtn.addEventListener('click', () => {
        closeFolderNameModal();
    });
    
    // Handle Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createBtn.click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeFolderNameModal();
        }
    });
}

function showFolderNameModal(parentPath, callback) {
    const modal = document.getElementById('folderNameModal');
    const overlay = document.getElementById('folderNameOverlay');
    const input = document.getElementById('folderNameInput');
    const createBtn = document.getElementById('createFolderBtn');
    
    if (!modal || !overlay || !input || !createBtn) return;
    
    // Clear previous value
    input.value = '';
    
    // Show modal
    overlay.classList.add('active');
    
    // Focus input
    setTimeout(() => {
        input.focus();
    }, 100);
    
    // Setup create button handler
    const handleCreate = async () => {
        const folderName = input.value.trim();
        if (!folderName) return;
        
        closeFolderNameModal();
        await callback(folderName);
    };
    
    // Remove old listeners
    const newCreateBtn = createBtn.cloneNode(true);
    createBtn.parentNode.replaceChild(newCreateBtn, createBtn);
    
    // Add new listener
    newCreateBtn.addEventListener('click', handleCreate);
}

function closeFolderNameModal() {
    const overlay = document.getElementById('folderNameOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ===== CREATE FILE/FOLDER =====

async function createNewFile(parentPath = null) {
    try {
        const filePath = await save({
            title: 'Create New File',
            defaultPath: parentPath || state.workspace,
            filters: [{
                name: 'All Files',
                extensions: ['*']
            }]
        });

        if (filePath) {
            await invoke('create_file', { path: filePath });
            await refreshFileTree(state.workspace);
            console.log('File created:', filePath);
        }
    } catch (error) {
        console.error('Error creating file:', error);
    }
}

async function createNewFolder(parentPath) {
    showFolderNameModal(parentPath, async (folderName) => {
        try {
            const pathSeparator = parentPath.includes('/') ? '/' : '\\';
            const newFolderPath = `${parentPath}${pathSeparator}${folderName}`;
            
            await invoke('create_folder', { path: newFolderPath });
            await refreshFileTree(state.workspace);
            
            console.log('Folder created:', newFolderPath);
        } catch (error) {
            console.error('Error creating folder:', error);
            alert(`Failed to create folder: ${error}`);
        }
    });
}

// ===== RENAME =====

async function renameItem(item) {
    const itemElement = document.querySelector(`.file-tree-item[data-path="${CSS.escape(item.path)}"]`);
    if (!itemElement) return;

    const nameSpan = itemElement.querySelector('.item-name');
    if (!nameSpan) return;

    const oldName = item.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'rename-input';
    
    nameSpan.replaceWith(input);
    input.focus();
    
    const dotIndex = oldName.lastIndexOf('.');
    if (dotIndex > 0 && !isDirectoryItem(item)) {
        input.setSelectionRange(0, dotIndex);
    } else {
        input.select();
    }

    const finishRename = async (save) => {
        const newNameSpan = document.createElement('span');
        newNameSpan.className = 'item-name';
        newNameSpan.textContent = save && input.value ? input.value : oldName;
        input.replaceWith(newNameSpan);

        if (save && input.value && input.value !== oldName) {
            const newName = input.value;
            const oldPath = item.path;
            const pathSeparator = oldPath.includes('/') ? '/' : '\\';
            const pathParts = oldPath.split(pathSeparator);
            pathParts[pathParts.length - 1] = newName;
            const newPath = pathParts.join(pathSeparator);

            try {
                await invoke('rename_item', {
                    oldPath: oldPath,
                    newPath: newPath
                });

                await refreshFileTree(state.workspace);
                
                console.log('Renamed:', oldName, '->', newName);
            } catch (error) {
                console.error('Error renaming item:', error);
                alert(`Failed to rename: ${error}`);
                newNameSpan.textContent = oldName;
            }
        }
    };

    input.addEventListener('blur', () => finishRename(true));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            finishRename(false);
        }
    });
}

// ===== DELETE =====

async function deleteItem(item) {
    const itemType = isDirectoryItem(item) ? 'folder' : 'file';
    
    const confirmed = window.confirm(`Are you sure you want to delete this ${itemType} "${item.name}"?`);
    if (!confirmed) return;

    try {
        // If it's a file, close it from all Monaco instances first
        if (!isDirectoryItem(item)) {
            closeFileFromAllInstances(item.path);
        }
        
        // Delete from filesystem
        await invoke('delete_item', { path: item.path });
        
        // Refresh file tree
        await refreshFileTree(state.workspace);
        
        console.log('Deleted:', item.name);
    } catch (error) {
        console.error('Error deleting item:', error);
        alert(`Failed to delete ${itemType}: ${error}`);
    }
}

// ===== DRAG AND DROP =====

function setupDragAndDrop() {
    const container = document.getElementById('fileTree');
    if (!container) return;

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
}

function setupItemDragEvents(element, item) {
    element.addEventListener('dragstart', (e) => {
        draggedItem = item;
        element.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.path);
    });

    element.addEventListener('dragend', () => {
        element.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        draggedItem = null;
    });

    if (isDirectoryItem(item)) {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedItem && draggedItem.path !== item.path && !isChildOf(item.path, draggedItem.path)) {
                element.classList.add('drag-over');
                e.dataTransfer.dropEffect = 'move';
            }
        });

        element.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            if (!element.contains(e.relatedTarget)) {
                element.classList.remove('drag-over');
            }
        });

        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('drag-over');
            
            if (draggedItem && draggedItem.path !== item.path && !isChildOf(item.path, draggedItem.path)) {
                await moveItem(draggedItem, item.path);
            }
        });
    }
}

function isChildOf(childPath, parentPath) {
    const pathSeparator = childPath.includes('/') ? '/' : '\\';
    return childPath.startsWith(parentPath + pathSeparator);
}

async function moveItem(item, targetPath) {
    try {
        const fileName = item.name;
        const pathSeparator = item.path.includes('/') ? '/' : '\\';
        const newPath = `${targetPath}${pathSeparator}${fileName}`;

        if (item.path === newPath) {
            return;
        }

        await invoke('move_item', {
            sourcePath: item.path,
            targetPath: newPath
        });

        await refreshFileTree(state.workspace);
        
        console.log('Moved:', item.name, 'to', targetPath);
    } catch (error) {
        console.error('Error moving item:', error);
        alert(`Failed to move item: ${error}`);
    }
}

// ===== ERROR HANDLING =====

function showError(container) {
    container.innerHTML = `
        <div class="empty-explorer">
            <span class="material-symbols-outlined">error</span>
            <p>Error loading files</p>
        </div>
    `;
}

export { fileTreeItems };