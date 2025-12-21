import { state, setTerminalVisible } from './state.js';
import { saveActiveFile, closeActiveTab, reopenClosedTab } from './tabs.js';
import { focusEditor } from './monaco.js';

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

    // Save: Ctrl+S
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
        return;
    }

    // Close Tab: Ctrl+W
    if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        closeActiveTab();
        return;
    }

    // Reopen Closed Tab: Ctrl+Shift+T
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        reopenClosedTab();
        return;
    }

    // Toggle Terminal: Ctrl+`
    if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
        return;
    }

    // Close Modal: Escape
    if (e.key === 'Escape') {
        closeModals();
        return;
    }

    // Focus Editor: Escape (when in other areas)
    if (e.key === 'Escape' && document.activeElement !== state.editor?.getDomNode()) {
        focusEditor();
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

function toggleTerminal() {
    setTerminalVisible(!state.terminalVisible);
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.classList.remove('active');
    });
}