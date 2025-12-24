import { invoke } from '@tauri-apps/api/core';
import { state, setTerminalVisible } from './state.js';

export function initTerminal() {
    console.log('🖥️ Initializing terminal...');

    const clearBtn = document.getElementById('clearTerminalBtn');
    const closeBtn = document.getElementById('closeTerminalBtn');

    if (clearBtn) {
        clearBtn.addEventListener('click', clearTerminal);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            setTerminalVisible(false);
        });
    }

    // Initialize terminal output
    const terminalContent = document.getElementById('terminalContent');
    if (terminalContent) {
        terminalContent.innerHTML = `
            <div style="color: var(--text-tertiary);">
                POLARIS Terminal - Type commands below
                Use Ctrl+\` to toggle terminal
            </div>
        `;
    }
}

function clearTerminal() {
    const terminalContent = document.getElementById('terminalContent');
    if (terminalContent) {
        terminalContent.innerHTML = '';
    }
}

export async function executeCommand(command) {
    const terminalContent = document.getElementById('terminalContent');
    if (!terminalContent) return;

    // Add command to output
    const commandLine = document.createElement('div');
    commandLine.style.color = 'var(--accent)';
    commandLine.textContent = `> ${command}`;
    terminalContent.appendChild(commandLine);

    try {
        const output = await invoke('execute_command', { command });
        
        const outputLine = document.createElement('div');
        outputLine.style.whiteSpace = 'pre-wrap';
        outputLine.textContent = output;
        terminalContent.appendChild(outputLine);
    } catch (error) {
        const errorLine = document.createElement('div');
        errorLine.style.color = 'var(--error)';
        errorLine.textContent = error.toString();
        terminalContent.appendChild(errorLine);
    }

    // Scroll to bottom
    terminalContent.scrollTop = terminalContent.scrollHeight;
}