import { state, updateSettings, applyInterfaceZoom } from './state.js';
import { applyEditorSettings } from './monaco.js';
import { splitEditor } from './splitEditor.js';
import { saveActiveFile, closeActiveTab } from './tabs.js';

// ===== COMMAND PALETTE =====

let commands = [];
let filteredCommands = [];
let selectedIndex = 0;

export function initCommandPalette() {
    console.log('🔍 Initializing command palette...');

    setupCommands();
    setupEventListeners();

    console.log('✅ Command palette initialized');
}

function setupCommands() {
    commands = [
        {
            id: 'file.save',
            label: 'Save File',
            description: 'Save the current file',
            icon: 'save',
            shortcut: 'Ctrl+S',
            action: () => saveActiveFile()
        },
        {
            id: 'file.close',
            label: 'Close Tab',
            description: 'Close the current tab',
            icon: 'close',
            shortcut: 'Ctrl+W',
            action: () => closeActiveTab()
        },
        {
            id: 'editor.split',
            label: 'Split Editor',
            description: 'Split the editor horizontally',
            icon: 'vertical_split',
            shortcut: 'Ctrl+\\',
            action: () => splitEditor()
        },
        {
            id: 'view.toggleSidebar',
            label: 'Toggle Sidebar',
            description: 'Show or hide the sidebar',
            icon: 'side_navigation',
            shortcut: 'Ctrl+B',
            action: () => toggleSidebar()
        },
        {
            id: 'view.zoomIn',
            label: 'Zoom In',
            description: 'Increase interface zoom',
            icon: 'zoom_in',
            shortcut: 'Ctrl++',
            action: () => zoomInterface(0.1)
        },
        {
            id: 'view.zoomOut',
            label: 'Zoom Out',
            description: 'Decrease interface zoom',
            icon: 'zoom_out',
            shortcut: 'Ctrl+-',
            action: () => zoomInterface(-0.1)
        },
        {
            id: 'view.zoomReset',
            label: 'Reset Zoom',
            description: 'Reset interface zoom to 100%',
            icon: 'fit_screen',
            shortcut: 'Ctrl+0',
            action: () => resetInterfaceZoom()
        },
        {
            id: 'editor.increaseFontSize',
            label: 'Increase Font Size',
            description: 'Make editor text larger',
            icon: 'text_increase',
            action: () => changeFontSize(1)
        },
        {
            id: 'editor.decreaseFontSize',
            label: 'Decrease Font Size',
            description: 'Make editor text smaller',
            icon: 'text_decrease',
            action: () => changeFontSize(-1)
        },
        {
            id: 'editor.toggleMinimap',
            label: 'Toggle Minimap',
            description: 'Show or hide the minimap',
            icon: 'map',
            action: () => toggleMinimap()
        },
        {
            id: 'editor.toggleLineNumbers',
            label: 'Toggle Line Numbers',
            description: 'Show or hide line numbers',
            icon: 'format_list_numbered',
            action: () => toggleLineNumbers()
        },
        {
            id: 'editor.toggleWordWrap',
            label: 'Toggle Word Wrap',
            description: 'Enable or disable word wrapping',
            icon: 'wrap_text',
            action: () => toggleWordWrap()
        }
    ];
}

function setupEventListeners() {
    const overlay = document.getElementById('commandPaletteOverlay');
    const searchInput = document.getElementById('commandSearch');
    const commandList = document.getElementById('commandList');

    if (!overlay || !searchInput || !commandList) {
        console.error('Command palette elements not found');
        return;
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeCommandPalette();
        }
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        filterCommands(e.target.value);
        renderCommands();
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCommandPalette();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
            renderCommands();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderCommands();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeSelectedCommand();
        }
    });

    // Show command palette on open
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.target === overlay && overlay.classList.contains('active')) {
                searchInput.value = '';
                filterCommands('');
                renderCommands();
                searchInput.focus();
            }
        });
    });

    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
}

function filterCommands(query) {
    const lowerQuery = query.toLowerCase();
    selectedIndex = 0;

    if (!query) {
        filteredCommands = [...commands];
    } else {
        filteredCommands = commands.filter(cmd => {
            return cmd.label.toLowerCase().includes(lowerQuery) ||
                   (cmd.description && cmd.description.toLowerCase().includes(lowerQuery));
        });
    }
}

function renderCommands() {
    const commandList = document.getElementById('commandList');
    if (!commandList) return;

    commandList.innerHTML = '';

    if (filteredCommands.length === 0) {
        commandList.innerHTML = `
            <div class="command-empty">
                <span class="material-symbols-outlined">search_off</span>
                <p>No commands found</p>
            </div>
        `;
        return;
    }

    filteredCommands.forEach((cmd, index) => {
        const item = document.createElement('div');
        item.className = 'command-item';
        if (index === selectedIndex) {
            item.classList.add('selected');
        }

        item.innerHTML = `
            <div class="command-item-left">
                <div class="command-icon">
                    <span class="material-symbols-outlined">${cmd.icon || 'terminal'}</span>
                </div>
                <div class="command-info">
                    <div class="command-title">${cmd.label}</div>
                    ${cmd.description ? `<div class="command-description">${cmd.description}</div>` : ''}
                </div>
            </div>
            ${cmd.shortcut ? `
                <div class="command-shortcut">
                    ${cmd.shortcut.split('+').map(key => `<kbd>${key}</kbd>`).join('')}
                </div>
            ` : ''}
        `;

        item.addEventListener('click', () => {
            executeCommand(cmd);
        });

        item.addEventListener('mouseenter', () => {
            selectedIndex = index;
            renderCommands();
        });

        commandList.appendChild(item);
    });

    // Scroll selected item into view
    const selectedItem = commandList.querySelector('.command-item.selected');
    if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
    }
}

function executeSelectedCommand() {
    if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
    }
}

function executeCommand(cmd) {
    closeCommandPalette();
    if (cmd.action) {
        cmd.action();
    }
}

function closeCommandPalette() {
    const overlay = document.getElementById('commandPaletteOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ===== COMMAND ACTIONS =====

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    
    if (sidebar && toggleBtn) {
        sidebar.classList.toggle('collapsed');
        toggleBtn.classList.toggle('active');
    }
}

function zoomInterface(delta) {
    const currentZoom = state.settings.interfaceZoom || 1.0;
    let newZoom = currentZoom + delta;
    
    newZoom = Math.max(0.5, Math.min(2.0, newZoom));
    newZoom = Math.round(newZoom * 10) / 10;
    
    if (newZoom !== currentZoom) {
        updateSettings({ interfaceZoom: newZoom });
        applyInterfaceZoom(newZoom);
    }
}

function resetInterfaceZoom() {
    updateSettings({ interfaceZoom: 1.0 });
    applyInterfaceZoom(1.0);
}

function changeFontSize(delta) {
    const currentSize = state.settings.fontSize;
    const newSize = Math.max(8, Math.min(30, currentSize + delta));
    
    if (newSize !== currentSize) {
        updateSettings({ fontSize: newSize });
        applyEditorSettings();
    }
}

function toggleMinimap() {
    updateSettings({ minimap: !state.settings.minimap });
    applyEditorSettings();
}

function toggleLineNumbers() {
    updateSettings({ lineNumbers: !state.settings.lineNumbers });
    applyEditorSettings();
}

function toggleWordWrap() {
    updateSettings({ wordWrap: !state.settings.wordWrap });
    applyEditorSettings();
}