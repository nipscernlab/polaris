import { saveActiveFile } from './tabs.js';
import { splitEditor } from './splitEditor.js';

const commands = [
    {
        id: 'file.save',
        icon: 'save',
        title: 'Save File',
        description: 'Save the current file',
        action: () => saveActiveFile()
    },
    {
        id: 'editor.split',
        icon: 'splitscreen',
        title: 'Split Editor',
        description: 'Split the editor into multiple panes',
        action: () => splitEditor()
    },
    {
        id: 'file.openFolder',
        icon: 'folder_open',
        title: 'Open Folder',
        description: 'Open a folder as workspace',
        action: () => document.getElementById('openFolderBtn')?.click()
    }
];

let filteredCommands = [...commands];
let selectedIndex = 0;

export function initCommandPalette() {
    console.log('🔍 Initializing command palette...');

    const overlay = document.getElementById('commandPaletteOverlay');
    const searchInput = document.getElementById('commandSearch');

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeCommandPalette();
        }
    });

    searchInput?.addEventListener('input', (e) => {
        filterCommands(e.target.value);
        renderCommands();
    });

    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, filteredCommands.length - 1);
            renderCommands();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            renderCommands();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeCommand(selectedIndex);
        } else if (e.key === 'Escape') {
            closeCommandPalette();
        }
    });

    renderCommands();
}

function filterCommands(query) {
    const lowerQuery = query.toLowerCase();
    
    if (!query.trim()) {
        filteredCommands = [...commands];
    } else {
        filteredCommands = commands.filter(cmd =>
            cmd.title.toLowerCase().includes(lowerQuery) ||
            cmd.description.toLowerCase().includes(lowerQuery)
        );
    }
    
    selectedIndex = 0;
}

function renderCommands() {
    const commandList = document.getElementById('commandList');
    if (!commandList) return;

    commandList.innerHTML = '';

    if (filteredCommands.length === 0) {
        commandList.innerHTML = `
            <div style="padding: 40px; text-align: center; color: var(--text-tertiary);">
                <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.5;">search_off</span>
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
            <span class="material-symbols-outlined">${cmd.icon}</span>
            <div class="command-info">
                <div class="command-title">${cmd.title}</div>
                <div class="command-description">${cmd.description}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            executeCommand(index);
        });

        commandList.appendChild(item);
    });
}

function executeCommand(index) {
    if (filteredCommands[index]) {
        filteredCommands[index].action();
        closeCommandPalette();
    }
}

function closeCommandPalette() {
    const overlay = document.getElementById('commandPaletteOverlay');
    const searchInput = document.getElementById('commandSearch');
    
    overlay?.classList.remove('active');
    if (searchInput) {
        searchInput.value = '';
        filterCommands('');
        renderCommands();
    }
}