import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { state, setWorkspace, closeAllTabs, loadSettings } from './state.js';
import { initSplitEditor } from './splitEditor.js';
import { initFileTree, refreshFileTree } from './fileTree.js';
import { initCommandPalette } from './commandPalette.js';
import { initKeyboardShortcuts } from './keyboard.js';
import { initSidebarResizer } from './sidebarResizer.js';
import { closeWavetraceViewer, wavetraceState } from './wavetrace.js';

// ===== INITIALIZATION =====
async function initApp() {
    console.log('Initializing POLARIS Editor...');

    try {
        // Load settings first
        loadSettings();
        
        // Initialize all components
        initWindowControls();
        initSplitEditor();
        initFileTree();
        initCommandPalette();
        initKeyboardShortcuts();
        initSidebarResizer();
        setupFolderOpening();
        setupActivityBar();

        console.log('POLARIS Editor initialized');
    } catch (error) {
        console.error('⚠ Error initializing POLARIS:', error);
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
            // Close wavetrace if active
            if (wavetraceState.active) {
                closeWavetraceViewer();
            }
            
            // Check for unsaved changes
            const { hasUnsavedChanges } = await import('./tabs.js');
            if (hasUnsavedChanges()) {
                const confirmed = window.confirm('You have unsaved changes. Close anyway?');
                if (!confirmed) return;
            }
            
            await appWindow.close();
        } catch (error) {
            console.error('Error closing:', error);
        }
    });
}

// ===== ACTIVITY BAR =====
function setupActivityBar() {
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    
    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            toggleSidebarBtn.classList.toggle('active');
        });
    }
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
        // Close wavetrace if active
        if (wavetraceState.active) {
            closeWavetraceViewer();
        }
        
        closeAllTabs();
        
        const folderName = folderPath.split(/[/\\]/).pop();
        setWorkspace(folderPath, folderName);

        await refreshFileTree(folderPath);

        const welcomeScreen = document.getElementById('welcomeScreen');
        if (welcomeScreen) {
            welcomeScreen.classList.add('hidden');
        }

        console.log('Workspace loaded:', folderName);
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