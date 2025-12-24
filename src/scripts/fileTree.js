import { invoke } from '@tauri-apps/api/core';
import { state, addTab, getFocusedInstance } from './state.js';
import { setEditorModel } from './monaco.js';
import { renderInstanceTabs, switchTab } from './tabs.js';
import { ensureEditorExists, updateSplitButtons } from './splitEditor.js';

export function initFileTree() {
    console.log('📁 Initializing file tree...');
}

export async function refreshFileTree(folderPath) {
    const fileTreeContainer = document.getElementById('fileTree');
    
    try {
        const fileTree = await invoke('get_file_tree', { path: folderPath });
        state.fileTreeData = fileTree;
        renderFileTree(fileTree, fileTreeContainer);
    } catch (error) {
        console.error('Error loading file tree:', error);
        showError(fileTreeContainer);
    }
}

function renderFileTree(data, container) {
    container.innerHTML = '';
    
    // Verificação de segurança para dados vazios ou inválidos
    if (!data || (!data.children && !Array.isArray(data))) {
        container.innerHTML = `
            <div class="empty-explorer">
                <span class="material-symbols-outlined">folder_off</span>
                <p>No files found</p>
            </div>
        `;
        return;
    }

    // Suporte caso a raiz seja diretamente um array ou um objeto com children
    const items = Array.isArray(data) ? data : (data.children || []);
    
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-explorer">
                <span class="material-symbols-outlined">folder_open</span>
                <p>Empty Folder</p>
            </div>
        `;
        return;
    }

    const tree = createTreeElements(items, 0);
    container.appendChild(tree);
}

function createTreeElements(items, level) {
    const fragment = document.createDocumentFragment();

    // Ordena: Pastas primeiro, depois arquivos
    const sortedItems = [...items].sort((a, b) => {
        const aIsDir = isDirectoryItem(a);
        const bIsDir = isDirectoryItem(b);
        if (aIsDir === bIsDir) return a.name.localeCompare(b.name);
        return aIsDir ? -1 : 1;
    });

    sortedItems.forEach(item => {
        const wrapper = document.createElement('div');
        
        // Verifica se é diretório de forma robusta
        const isDir = isDirectoryItem(item);
        
        const element = document.createElement('div');
        element.className = 'file-tree-item';
        element.setAttribute('data-path', item.path);
        element.style.paddingLeft = `${12 + (level * 16)}px`;
        
        if (isDir) {
            // === RENDERIZAÇÃO DE PASTA ===
            element.classList.add('folder');
            element.innerHTML = `
                <div class="expand-icon">
                    <span class="material-symbols-outlined">chevron_right</span>
                </div>
                <span class="material-symbols-outlined">folder</span>
                <span>${item.name}</span>
            `;

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFolder(element);
            });
        } else {
            // === RENDERIZAÇÃO DE ARQUIVO ===
            const isSpfFile = item.name.endsWith('.spf');
            element.classList.add('file');
            
            if (isSpfFile) {
                element.classList.add('spf-file');
            }
            
            element.innerHTML = `
                <div class="expand-icon" style="visibility: hidden;"></div>
                <span class="material-symbols-outlined">${isSpfFile ? 'settings' : 'description'}</span>
                <span>${item.name}</span>
            `;

            element.addEventListener('click', (e) => {
                e.stopPropagation();
                openFile(item);
            });
        }

        wrapper.appendChild(element);

        // Se for diretório, cria o container de filhos (mesmo se vazio, para permitir expansão futura ou visual correta)
        if (isDir) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'file-tree-children';
            childrenContainer.style.display = 'none'; // Começa fechado
            
            if (item.children && item.children.length > 0) {
                childrenContainer.appendChild(createTreeElements(item.children, level + 1));
            }
            
            wrapper.appendChild(childrenContainer);
        }

        fragment.appendChild(wrapper);
    });

    return fragment;
}

// Função auxiliar para determinar se um item é diretório
function isDirectoryItem(item) {
    return item.type === 'directory' || 
           item.is_dir === true || 
           (item.children && Array.isArray(item.children));
}

function toggleFolder(element) {
    const wrapper = element.parentElement;
    const childrenContainer = wrapper.querySelector('.file-tree-children');
    
    // Alterna a classe 'expanded' no elemento pai para controle visual
    element.classList.toggle('expanded');
    const isExpanded = element.classList.contains('expanded');

    // Atualiza ícones
    const icon = element.querySelector('.expand-icon .material-symbols-outlined');
    if (icon) {
        icon.textContent = isExpanded ? 'expand_more' : 'chevron_right';
    }
    
    const folderIcon = element.querySelectorAll('.material-symbols-outlined')[1];
    if (folderIcon) {
        folderIcon.textContent = isExpanded ? 'folder_open' : 'folder';
    }

    // Mostra/Esconde filhos se o container existir
    if (childrenContainer) {
        childrenContainer.style.display = isExpanded ? 'block' : 'none';
    }
}

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

        if (instance.tabs.has(filePath)) {
            switchTab(instanceId, filePath);
            return;
        }

        const content = await invoke('read_file', { path: filePath });
        
        addTab(instanceId, filePath, fileName, content);
        renderInstanceTabs(instanceId);
        setEditorModel(instanceId, filePath);
        
        updateFileTreeSelection(filePath);
        updateSplitButtons();
        
        console.log('✅ File opened:', fileName);
    } catch (error) {
        console.error('Error opening file:', error);
    }
}

function updateFileTreeSelection(filePath) {
    document.querySelectorAll('.file-tree-item.active').forEach(el => {
        el.classList.remove('active');
    });

    const fileElement = document.querySelector(`[data-path="${filePath}"]`);
    if (fileElement) {
        fileElement.classList.add('active');
    }
}

function showError(container) {
    container.innerHTML = `
        <div class="empty-explorer">
            <span class="material-symbols-outlined">error</span>
            <p>Error loading files</p>
        </div>
    `;
}