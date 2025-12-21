import { state, setTerminalVisible } from './state.js';
import { saveActiveFile } from './tabs.js';
import { showStatus } from './main.js';

const commands = [
    {
        id: 'file.save',
        icon: 'save',
        title: 'Save File',
        description: 'Save the current file',
        action: () => saveActiveFile()
    },
    {
        id: 'view.terminal',
        icon: 'terminal',
        title: 'Toggle Terminal',
        description: 'Show or hide the terminal',
        action: () => setTerminalVisible(!state.terminalVisible)
    },
    {
        id: 'project.new',
        icon: 'create_new_folder',
        title: 'New Project',
        description: 'Create a new project',
        action: () => openNewProjectModal()
    },
    {
        id: 'compile.cmm',
        icon: 'code',
        title: 'Compile C-- (CMM)',
        description: 'Compile C-- source code',
        action: () => showStatus('CMM compilation not implemented', 'info')
    },
    {
        id: 'compile.asm',
        icon: 'memory',
        title: 'Compile Assembly',
        description: 'Compile assembly source code',
        action: () => showStatus('ASM compilation not implemented', 'info')
    },
    {
        id: 'compile.icarus',
        icon: 'flash_on',
        title: 'Run Icarus Verilog',
        description: 'Simulate with Icarus Verilog',
        action: () => showStatus('Icarus simulation not implemented', 'info')
    },
    {
        id: 'view.gtkwave',
        icon: 'show_chart',
        title: 'Open GTKWave',
        description: 'View waveforms in GTKWave',
        action: () => showStatus('GTKWave viewer not implemented', 'info')
    },
    {
        id: 'build.full',
        icon: 'build',
        title: 'Full Build',
        description: 'Build the entire project',
        action: () => showStatus('Full build not implemented', 'info')
    },
    {
        id: 'build.stop',
        icon: 'stop',
        title: 'Stop Compilation',
        description: 'Stop the current compilation',
        action: () => showStatus('Stop compilation not implemented', 'info')
    }
];

let filteredCommands = [...commands];
let selectedIndex = 0;

export function initCommandPalette() {
    console.log('🔍 Initializing command palette...');

    const overlay = document.getElementById('commandPaletteOverlay');
    const searchInput = document.getElementById('commandSearch');
    const commandPaletteBtn = document.getElementById('commandPaletteBtn');

    // Open from button
    if (commandPaletteBtn) {
        commandPaletteBtn.addEventListener('click', () => {
            overlay?.classList.add('active');
            searchInput?.focus();
        });
    }

    // Close on overlay click
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeCommandPalette();
            }
        });
    }

    // Search input
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterCommands(e.target.value);
            renderCommands();
        });

        searchInput.addEventListener('keydown', (e) => {
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
    }

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

function openNewProjectModal() {
    const modal = document.getElementById('newProjectModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('projectName')?.focus();
    }
}