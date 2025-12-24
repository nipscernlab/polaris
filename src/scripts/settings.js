import { appState, applySettings, showNotification } from './main.js';
import { setEditorTheme } from './monaco.js';

// ===== SETTINGS MANAGEMENT =====

export function initSettings() {
    console.log('⚙️ Initializing settings...');

    const overlay = document.getElementById('settingsOverlay');
    const closeBtn = document.getElementById('closeSettings');
    const saveBtn = document.getElementById('saveSettings');
    const resetBtn = document.getElementById('resetSettings');

    // Close settings modal
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeSettings();
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSettings);
    }

    // Save settings
    if (saveBtn) {
        saveBtn.addEventListener('click', saveSettings);
    }

    // Reset settings
    if (resetBtn) {
        resetBtn.addEventListener('click', resetSettings);
    }

    // Load current settings into form
    loadSettingsToForm();

    // Add input change listeners for live preview
    addInputListeners();

    console.log('✅ Settings initialized');
}

function loadSettingsToForm() {
    const settings = appState.settings;

    // Editor settings
    const fontSize = document.getElementById('fontSize');
    const tabSize = document.getElementById('tabSize');
    const lineNumbers = document.getElementById('lineNumbers');
    const wordWrap = document.getElementById('wordWrap');
    const editorTheme = document.getElementById('editorTheme');

    if (fontSize) fontSize.value = settings.fontSize;
    if (tabSize) tabSize.value = settings.tabSize;
    if (lineNumbers) lineNumbers.checked = settings.lineNumbers;
    if (wordWrap) wordWrap.checked = settings.wordWrap;
    if (editorTheme) editorTheme.value = settings.editorTheme;
}

function addInputListeners() {
    // Real-time preview for font size
    const fontSize = document.getElementById('fontSize');
    if (fontSize) {
        fontSize.addEventListener('input', (e) => {
            if (appState.editor) {
                appState.editor.updateOptions({
                    fontSize: parseInt(e.target.value)
                });
            }
        });
    }

    // Real-time preview for tab size
    const tabSize = document.getElementById('tabSize');
    if (tabSize) {
        tabSize.addEventListener('input', (e) => {
            if (appState.editor) {
                appState.editor.updateOptions({
                    tabSize: parseInt(e.target.value)
                });
            }
        });
    }

    // Real-time preview for line numbers
    const lineNumbers = document.getElementById('lineNumbers');
    if (lineNumbers) {
        lineNumbers.addEventListener('change', (e) => {
            if (appState.editor) {
                appState.editor.updateOptions({
                    lineNumbers: e.target.checked ? 'on' : 'off'
                });
            }
        });
    }

    // Real-time preview for word wrap
    const wordWrap = document.getElementById('wordWrap');
    if (wordWrap) {
        wordWrap.addEventListener('change', (e) => {
            if (appState.editor) {
                appState.editor.updateOptions({
                    wordWrap: e.target.checked ? 'on' : 'off'
                });
            }
        });
    }

    // Real-time preview for theme
    const editorTheme = document.getElementById('editorTheme');
    if (editorTheme) {
        editorTheme.addEventListener('change', (e) => {
            setEditorTheme(e.target.value);
        });
    }
}

function saveSettings() {
    // Read settings from form
    const newSettings = {
        fontSize: parseInt(document.getElementById('fontSize').value),
        tabSize: parseInt(document.getElementById('tabSize').value),
        lineNumbers: document.getElementById('lineNumbers').checked,
        wordWrap: document.getElementById('wordWrap').checked,
        editorTheme: document.getElementById('editorTheme').value
    };

    // Update app state
    Object.assign(appState.settings, newSettings);

    // Save to localStorage
    try {
        localStorage.setItem('polaris_settings', JSON.stringify(appState.settings));
        console.log('Settings saved:', appState.settings);
        
        // Apply settings
        applySettings();
        
        // Show success message
        showNotification('Settings saved successfully', 'success');
        
        // Close modal after a short delay
        setTimeout(() => {
            closeSettings();
        }, 800);
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('Error saving settings', 'error');
    }
}

function resetSettings() {
    // Default settings
    const defaultSettings = {
        fontSize: 14,
        tabSize: 4,
        lineNumbers: true,
        wordWrap: false,
        editorTheme: 'vs-dark'
    };

    // Update app state
    Object.assign(appState.settings, defaultSettings);

    // Update form
    loadSettingsToForm();

    // Apply settings
    applySettings();

    // Save to localStorage
    try {
        localStorage.setItem('polaris_settings', JSON.stringify(defaultSettings));
        console.log('Settings reset to defaults');
        showNotification('Settings reset to defaults', 'info');
    } catch (error) {
        console.error('Error resetting settings:', error);
    }
}

function closeSettings() {
    const overlay = document.getElementById('settingsOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}