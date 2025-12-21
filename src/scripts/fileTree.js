import { invoke } from '@tauri-apps/api/core';
import { state, addTab, setCurrentSpf } from './state.js';
import { setEditorModel } from './monaco.js';
import { renderTabs, switchToTab } from './tabs.js';
import { showStatus } from './main.js';

export function initFileTree() {
    console.log('📁 Initializing file tree...');
}

export async function refreshFileTree(folderPath) {
    const fileTreeContainer = document.getElementById('fileTree');
    
    try {
        const fileTree = await invoke('get_file_tree', { 
            path: folderPath 
        });
        
        state.fileTreeData = fileTree;
        renderFileTree(fileTree, fileTreeContainer);
    } catch (error) {
        console.error('Error loading file tree:', error);
        showError(fileTreeContainer, error);
    }
}

function renderFileTree(data, container) {
    container.innerHTML = '';
    
    if (!data || !data.children || data.children.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">folder_off</span>
                <p>No files found</p>
            </div>
        `;
        return;
    }

    const tree = createTreeElements(data.children);
    container.appendChild(tree);
}

function createTreeElements(items) {
    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const element = document.createElement('div');
        element.className = 'file-tree-item';
        element.setAttribute('data-path', item.path);
        
        // CORREÇÃO AQUI: O Rust envia "dir", não "directory"
        const isDir = item.type === 'dir'; 

        // Check if it's an .spf file
        const isSpfFile = item.type === 'file' && item.name.endsWith('.spf');
        
        // Se for Diretório
        if (isDir) {
            element.classList.add('folder');
            element.innerHTML = `
                <div class="tree-item-content">
                    <span class="material-symbols-outlined folder-icon">folder</span>
                    <span>${item.name}</span>
                </div>
            `;

            // Container para os filhos (inicialmente oculto)
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'file-tree-children';
            childrenContainer.style.display = 'none'; // Começa fechado

            // Adiciona evento de clique APENAS no conteúdo do item (texto/icone), não no container de filhos
            const contentDiv = element.querySelector('.tree-item-content');
            contentDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Toggle visual
                const isHidden = childrenContainer.style.display === 'none';
                childrenContainer.style.display = isHidden ? 'block' : 'none';
                
                const icon = contentDiv.querySelector('.folder-icon');
                icon.textContent = isHidden ? 'folder_open' : 'folder';
            });

            element.appendChild(childrenContainer);

            // Renderiza filhos recursivamente se houver
            if (item.children && item.children.length > 0) {
                childrenContainer.appendChild(createTreeElements(item.children));
            }
        } 
        // Se for Arquivo
        else {
            element.classList.add('file');
            
            // Mark SPF files specially
            if (isSpfFile) {
                element.classList.add('spf-file');
            }
            
            element.innerHTML = `
                <div class="tree-item-content">
                    <span class="material-symbols-outlined">${isSpfFile ? 'settings' : 'description'}</span>
                    <span>${item.name}</span>
                </div>
            `;

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                openFile(item);
            });
        }

        fragment.appendChild(element);
    });

    return fragment;
}

function toggleFolder(element, item) {
    const childrenContainer = element.nextElementSibling;
    
    if (childrenContainer && childrenContainer.classList.contains('file-tree-children')) {
        const isExpanded = childrenContainer.style.display !== 'none';
        childrenContainer.style.display = isExpanded ? 'none' : 'block';
        
        const icon = element.querySelector('.material-symbols-outlined');
        icon.textContent = isExpanded ? 'folder' : 'folder_open';
    }
}

async function openFile(item) {
    const filePath = item.path;
    const fileName = item.name;

    // If tab already exists, just switch to it
    if (state.openTabs.has(filePath)) {
        switchToTab(filePath);
        return;
    }

    try {
        // Read file content
        const content = await invoke('read_file', { path: filePath });
        
        // Check if it's an SPF file
        const isSpfFile = fileName.endsWith('.spf');
        
        if (isSpfFile) {
            // Parse SPF content as JSON
            try {
                const spfData = JSON.parse(content);
                setCurrentSpf(filePath, spfData);
                
                // Mark this file in the tree
                markSpfProjectInTree(filePath);
                
                showStatus(`Opened SPF project: ${fileName}`, 'success');
            } catch (parseError) {
                console.error('Error parsing SPF file:', parseError);
                showStatus('Warning: SPF file is not valid JSON', 'warning');
            }
        }
        
        // Add tab
        addTab(filePath, fileName, content);
        
        // Render tabs
        renderTabs();
        
        // Set editor model
        setEditorModel(filePath);
        
        // Update file tree selection
        updateFileTreeSelection(filePath);
        
        showStatus(`Opened: ${fileName}`, 'success');
    } catch (error) {
        console.error('Error opening file:', error);
        showStatus(`Error opening: ${fileName}`, 'error');
    }
}

function markSpfProjectInTree(spfPath) {
    // Remove previous SPF project markers
    document.querySelectorAll('.file-tree-item.spf-project').forEach(el => {
        el.classList.remove('spf-project');
    });
    
    // Mark the new SPF project
    const spfElement = document.querySelector(`[data-path="${spfPath}"]`);
    if (spfElement) {
        spfElement.classList.add('spf-project');
    }
}

function updateFileTreeSelection(filePath) {
    // Remove previous selection
    document.querySelectorAll('.file-tree-item.active').forEach(el => {
        el.classList.remove('active');
    });

    // Add selection to current file
    const fileElement = document.querySelector(`[data-path="${filePath}"]`);
    if (fileElement) {
        fileElement.classList.add('active');
    }
}

function showError(container, error) {
    container.innerHTML = `
        <div class="empty-state">
            <span class="material-symbols-outlined">error</span>
            <p>Error loading files</p>
        </div>
    `;
}