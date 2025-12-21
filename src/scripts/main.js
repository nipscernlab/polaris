import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { state, setWorkspace, closeAllTabs, loadSettings } from './state.js';
import { initMonacoEditor } from './monaco.js';
import { initFileTree, refreshFileTree } from './fileTree.js';
import { initTerminal } from './terminal.js';
import { initCommandPalette } from './commandPalette.js';
import { initTabs, renderTabs } from './tabs.js';
import { initKeyboardShortcuts } from './keyboard.js';
import { initProjectModal } from './project.js';
import { initProcessorHub } from './processorHub.js';

// ===== INITIALIZATION =====
async function initApp() {
    console.log('🚀 Initializing AURORA Editor...');

    try {
        // Load settings
        loadSettings();

        // Initialize window controls
        initWindowControls();

        // Initialize Monaco Editor
        await initMonacoEditor();

        // Initialize tabs
        initTabs();

        // Initialize file tree
        initFileTree();

        // Initialize terminal
        initTerminal();

        // Initialize command palette
        initCommandPalette();

        // Initialize keyboard shortcuts
        initKeyboardShortcuts();

        // Initialize project modal
        initProjectModal();

        // Initialize processor hub
        initProcessorHub();

        // Setup folder opening
        setupFolderOpening();

        console.log('✅ AURORA Editor initialized');
    } catch (error) {
        console.error('❌ Error initializing AURORA:', error);
    }
}

// ===== WINDOW CONTROLS =====
function initWindowControls() {
    const appWindow = getCurrentWindow();

    const minimizeBtn = document.getElementById('minimizeBtn');
    const maximizeBtn = document.getElementById('maximizeBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', async () => {
            try {
                await appWindow.minimize();
            } catch (error) {
                console.error('Error minimizing:', error);
            }
        });
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', async () => {
            try {
                const isMaximized = await appWindow.isMaximized();
                if (isMaximized) {
                    await appWindow.unmaximize();
                } else {
                    await appWindow.maximize();
                }
            } catch (error) {
                console.error('Error toggling maximize:', error);
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            try {
                await appWindow.close();
            } catch (error) {
                console.error('Error closing:', error);
            }
        });
    }
}

// ===== FOLDER OPENING =====
function setupFolderOpening() {
    const openFolderBtn = document.getElementById('openFolderBtn');
    const openFolderEmptyBtn = document.getElementById('openFolderEmptyBtn');
    const openFolderWelcomeBtn = document.getElementById('openFolderWelcomeBtn');

    [openFolderBtn, openFolderEmptyBtn, openFolderWelcomeBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', openFolder);
        }
    });
}

async function openFolder() {
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: 'Select Folder to Open'
        });

        if (selected && typeof selected === 'string') {
            await loadWorkspace(selected);
        }
    } catch (error) {
        console.error('Error opening folder:', error);
        showStatus('Error opening folder', 'error');
    }
}

async function loadWorkspace(folderPath) {
    try {
        // Close all open tabs
        closeAllTabs();
        renderTabs();

        // Extract folder name
        const folderName = folderPath.split(/[/\\]/).pop();
        setWorkspace(folderPath, folderName);

        // Load file tree
        await refreshFileTree(folderPath);

        // Hide welcome screen
        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.add('hidden');
        }

        showStatus(`Opened folder: ${folderName}`, 'success');
    } catch (error) {
        console.error('Error loading workspace:', error);
        showStatus('Error loading workspace', 'error');
    }
}

// ===== STATUS MESSAGES =====
export function showStatus(message, type = 'info') {
    const statusMessage = document.getElementById('statusMessage');
    if (statusMessage) {
        statusMessage.textContent = message;
        statusMessage.style.color = getStatusColor(type);

        // Reset after 3 seconds
        setTimeout(() => {
            statusMessage.textContent = 'Ready';
            statusMessage.style.color = '';
        }, 3000);
    }
}

function getStatusColor(type) {
    const colors = {
        'success': 'var(--success)',
        'error': 'var(--error)',
        'warning': 'var(--warning)',
        'info': 'var(--info)'
    };
    return colors[type] || 'var(--text-tertiary)';
}

// ===== START APPLICATION =====
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}