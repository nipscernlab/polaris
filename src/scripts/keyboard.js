import { state } from './state.js';
import { saveActiveFile, closeActiveTab } from './tabs.js';
import { splitEditor } from './splitEditor.js';

export function initKeyboardShortcuts() {
    console.log('⌨️ Initializing keyboard shortcuts...');

    document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e) {
    // Command Palette: Ctrl+Shift+P
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        openCommandPalette();
        return;
    }

    // Save: Ctrl+S (only if there's an editor)
    if (e.ctrlKey && e.key === 's' && state.editorInstances.length > 0) {
        e.preventDefault();
        saveActiveFile();
        return;
    }

    // Close Tab: Ctrl+W (only if there's an editor)
    if (e.ctrlKey && e.key === 'w' && state.editorInstances.length > 0) {
        e.preventDefault();
        closeActiveTab();
        return;
    }

    // Split Editor: Ctrl+\ (only if there's an editor and can split)
    if (e.ctrlKey && e.key === '\\' && state.editorInstances.length > 0 && state.editorInstances.length < 3) {
        e.preventDefault();
        splitEditor();
        return;
    }

    // Close Modal: Escape
    if (e.key === 'Escape') {
        closeModals();
        return;
    }
}

function openCommandPalette() {
    const overlay = document.getElementById('commandPaletteOverlay');
    const searchInput = document.getElementById('commandSearch');
    
    if (overlay && searchInput) {
        overlay.classList.add('active');
        setTimeout(() => searchInput.focus(), 100);
    }
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.classList.remove('active');
    });
}