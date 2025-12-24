import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { state, setWorkspace, closeAllTabs, loadSettings } from './state.js';
import { initSplitEditor } from './splitEditor.js';
import { initFileTree, refreshFileTree } from './fileTree.js';
import { initCommandPalette } from './commandPalette.js';
import { initKeyboardShortcuts } from './keyboard.js';

// ===== INITIALIZATION =====
async function initApp() {
    console.log('🚀 Initializing AURORA Editor...');

    try {
        loadSettings();
        initWindowControls();
        initSplitEditor(); // Just initialize system, don't create editors
        initFileTree();
        initCommandPalette();
        initKeyboardShortcuts();
        setupFolderOpening();

        console.log('✅ AURORA Editor initialized');
    } catch (error) {
        console.error('❌ Error initializing AURORA:', error);
    }
}

// ===== WINDOW CONTROLS =====
function initWindowControls() {
    const appWindow = getCurrentWindow();

    document.getElementById('minimizeBtn')?.addEventListener('click', async () => {
        try {
            await appWindow.minimize();
        } catch (error) {
            console.error('Error minimizing:', error);
        }
    });

    document.getElementById('maximizeBtn')?.addEventListener('click', async () => {
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

    document.getElementById('closeBtn')?.addEventListener('click', async () => {
        try {
            await appWindow.close();
        } catch (error) {
            console.error('Error closing:', error);
        }
    });
}

// ===== FOLDER OPENING =====
function setupFolderOpening() {
    const buttons = [
        'openFolderBtn',
        'openFolderEmpty',
        'openFolderWelcome'
    ];

    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
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
            title: 'Open Folder'
        });

        if (selected && typeof selected === 'string') {
            await loadWorkspace(selected);
        }
    } catch (error) {
        console.error('Error opening folder:', error);
    }
}

async function loadWorkspace(folderPath) {
    try {
        closeAllTabs();
        
        const folderName = folderPath.split(/[/\\]/).pop();
        setWorkspace(folderPath, folderName);

        await refreshFileTree(folderPath);

        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.add('hidden');
        }

        console.log('✅ Workspace loaded:', folderName);
    } catch (error) {
        console.error('Error loading workspace:', error);
    }
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}