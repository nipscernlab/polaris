import { state, updateSettings, saveSettings } from './state.js';
import { splitEditor } from './splitEditor.js';
import { saveActiveFile, closeActiveTab } from './tabs.js';

// ===== KEYBOARD SHORTCUTS =====

export function initKeyboardShortcuts() {
    console.log('Initializing keyboard shortcuts...');

    document.addEventListener('keydown', handleKeyboardShortcut);

    console.log('Keyboard shortcuts initialized');
}

function handleKeyboardShortcut(e) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl+S - Save file
    if (ctrlKey && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
        return;
    }

    // Ctrl+W - Close tab
    if (ctrlKey && e.key === 'w') {
        e.preventDefault();
        closeActiveTab();
        return;
    }

    // Ctrl+\ - Split editor
    if (ctrlKey && e.key === '\\') {
        e.preventDefault();
        splitEditor();
        return;
    }

    // Ctrl+Shift+P - Command palette
    if (ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        openCommandPalette();
        return;
    }

    // Ctrl+B - Toggle sidebar
    if (ctrlKey && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
        return;
    }

    // Ctrl+Plus - Zoom in interface
    if (ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomInterface(0.1);
        return;
    }

    // Ctrl+Minus - Zoom out interface
    if (ctrlKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        zoomInterface(-0.1);
        return;
    }

    // Ctrl+0 - Reset interface zoom
    if (ctrlKey && e.key === '0') {
        e.preventDefault();
        resetInterfaceZoom();
        return;
    }
}

function openCommandPalette() {
    const commandPalette = document.getElementById('commandPaletteOverlay');
    if (commandPalette) {
        commandPalette.classList.add('active');
    }
    const commandSearch = document.getElementById('commandSearch');
    if (commandSearch) {
        commandSearch.focus();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');
    
    if (sidebar && toggleBtn) {
        // Use the resizer's toggle function if available
        const event = new CustomEvent('polaris-toggle-sidebar');
        document.dispatchEvent(event);
    }
}

function zoomInterface(delta) {
    const currentZoom = state.settings.interfaceZoom || 1.0;
    let newZoom = currentZoom + delta;
    
    // Clamp between 0.5 and 2.0
    newZoom = Math.max(0.5, Math.min(2.0, newZoom));
    newZoom = Math.round(newZoom * 10) / 10; // Round to 1 decimal
    
    if (newZoom !== currentZoom) {
        updateSettings({ interfaceZoom: newZoom });
        applyInterfaceZoom(newZoom);
        saveSettings();
        
        // Show zoom level notification
        showZoomNotification(newZoom);
    }
}

function resetInterfaceZoom() {
    updateSettings({ interfaceZoom: 1.0 });
    applyInterfaceZoom(1.0);
    saveSettings();
    showZoomNotification(1.0);
}

function applyInterfaceZoom(zoomLevel) {
    const app = document.getElementById('app');
    if (app) {
        // Use transform scale with proper origin
        app.style.transform = `scale(${zoomLevel})`;
        app.style.transformOrigin = 'top left';
        
        // Adjust container size to compensate for scale
        app.style.width = `${100 / zoomLevel}%`;
        app.style.height = `${100 / zoomLevel}%`;
    }
}

function showZoomNotification(zoomLevel) {
    const percentage = Math.round(zoomLevel * 100);
    const statusMessage = document.getElementById('statusMessage');
    
    if (statusMessage) {
        const originalText = statusMessage.textContent;
        const originalColor = statusMessage.style.color;
        
        statusMessage.textContent = `Interface Zoom: ${percentage}%`;
        statusMessage.style.color = 'var(--accent)';
        
        setTimeout(() => {
            statusMessage.textContent = originalText || 'Ready';
            statusMessage.style.color = originalColor;
        }, 1500);
    }
}

// ===== EXPORT FUNCTIONS =====

export { handleKeyboardShortcut, applyInterfaceZoom };