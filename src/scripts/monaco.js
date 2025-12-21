import * as monaco from 'monaco-editor';
import { state } from './state.js';

// ===== MONACO EDITOR INITIALIZATION =====
export async function initMonacoEditor() {
    console.log('📝 Initializing Monaco Editor...');

    const container = document.getElementById('monacoEditor');
    if (!container) {
        console.error('Monaco editor container not found');
        return;
    }

    // Configure Monaco Environment
    self.MonacoEnvironment = {
        getWorkerUrl: function (workerId, label) {
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                self.MonacoEnvironment = {
                    baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/'
                };
                importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/base/worker/workerMain.js');
            `)}`;
        }
    };

    // Define custom Aurora theme
    monaco.editor.defineTheme('aurora-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
            { token: 'comment', foreground: '71717a', fontStyle: 'italic' },
            { token: 'keyword', foreground: '8b5cf6', fontStyle: 'bold' },
            { token: 'string', foreground: '10b981' },
            { token: 'number', foreground: 'f59e0b' },
            { token: 'function', foreground: 'a78bfa' },
            { token: 'variable', foreground: 'e4e4e7' },
            { token: 'type', foreground: '3b82f6' },
            { token: 'operator', foreground: 'c4b5fd' },
        ],
        colors: {
            'editor.background': '#0d0d12',
            'editor.foreground': '#e4e4e7',
            'editor.lineHighlightBackground': '#16161e',
            'editor.selectionBackground': '#8b5cf640',
            'editor.inactiveSelectionBackground': '#8b5cf620',
            'editorCursor.foreground': '#8b5cf6',
            'editorLineNumber.foreground': '#3f3f46',
            'editorLineNumber.activeForeground': '#a1a1aa',
            'editor.findMatchBackground': '#8b5cf660',
            'editor.findMatchHighlightBackground': '#8b5cf640',
            'editorBracketMatch.background': '#27272a',
            'editorBracketMatch.border': '#8b5cf6',
            'editorIndentGuide.background': '#27272a',
            'editorIndentGuide.activeBackground': '#3f3f46',
            'editorWhitespace.foreground': '#27272a',
            'scrollbar.shadow': '#00000060',
            'scrollbarSlider.background': '#27272a80',
            'scrollbarSlider.hoverBackground': '#3f3f4680',
            'scrollbarSlider.activeBackground': '#52525b80',
            'minimap.background': '#16161e',
            'minimapSlider.background': '#27272a40',
            'minimapSlider.hoverBackground': '#3f3f4640',
            'minimapSlider.activeBackground': '#52525b40',
        }
    });

    // Create editor instance
    const editor = monaco.editor.create(container, {
        value: '',
        language: 'plaintext',
        theme: 'aurora-dark',
        fontSize: state.settings.fontSize,
        fontFamily: state.settings.fontFamily,
        tabSize: state.settings.tabSize,
        lineNumbers: state.settings.lineNumbers ? 'on' : 'off',
        minimap: {
            enabled: state.settings.minimap
        },
        wordWrap: state.settings.wordWrap ? 'on' : 'off',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'all',
        bracketPairColorization: {
            enabled: true
        },
        guides: {
            bracketPairs: true,
            indentation: true
        },
        padding: {
            top: state.settings.padding,
            bottom: state.settings.padding
        },
        scrollbar: {
            verticalScrollbarSize: 12,
            horizontalScrollbarSize: 12
        }
    });

    // Store editor in state
    state.editor = editor;

    // Setup editor event listeners
    setupEditorListeners(editor);

    console.log('✅ Monaco Editor initialized');
}

function setupEditorListeners(editor) {
    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
        const statusPosition = document.getElementById('statusPosition');
        if (statusPosition) {
            statusPosition.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
        }
    });

    // Track content changes
    editor.onDidChangeModelContent(() => {
        if (state.activeTab) {
            const currentContent = editor.getValue();
            const tab = state.openTabs.get(state.activeTab);
            
            if (tab) {
                tab.content = currentContent;
                tab.modified = currentContent !== tab.originalContent;
                
                // Update tab UI
                updateTabModifiedState(state.activeTab, tab.modified);
            }
        }
    });
}

function updateTabModifiedState(filePath, modified) {
    const tabElement = document.querySelector(`[data-path="${filePath}"]`);
    if (tabElement) {
        tabElement.classList.toggle('modified', modified);
    }
}

// ===== MONACO UTILITIES =====

export function setEditorModel(filePath) {
    if (!state.editor) return;

    const tab = state.openTabs.get(filePath);
    if (!tab) return;

    // Create or reuse model
    if (!tab.model) {
        const uri = monaco.Uri.file(filePath);
        const language = getLanguageFromPath(filePath);
        tab.model = monaco.editor.createModel(tab.content, language, uri);
    }

    state.editor.setModel(tab.model);
    state.activeTab = filePath;

    // Update status bar
    updateStatusBar(tab.name, getLanguageFromPath(filePath));

    // Show editor
    const editorEl = document.getElementById('monacoEditor');
    const welcomeScreen = document.getElementById('welcomeScreen');
    
    if (editorEl) editorEl.classList.add('active');
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
}

function getLanguageFromPath(filePath) {
    const extension = filePath.split('.').pop().toLowerCase();
    
    const languageMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'less': 'less',
        'json': 'json',
        'spf': 'json', // SPF files are JSON
        'md': 'markdown',
        'py': 'python',
        'rs': 'rust',
        'toml': 'toml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'c': 'c',
        'cmm': 'c', // C-- treated as C
        'cpp': 'cpp',
        'cc': 'cpp',
        'cxx': 'cpp',
        'h': 'cpp',
        'hpp': 'cpp',
        'java': 'java',
        'cs': 'csharp',
        'php': 'php',
        'rb': 'ruby',
        'go': 'go',
        'sh': 'shell',
        'bash': 'shell',
        'sql': 'sql',
        'txt': 'plaintext'
    };

    return languageMap[extension] || 'plaintext';
}

function updateStatusBar(fileName, language) {
    const statusLanguage = document.getElementById('statusLanguage');
    if (statusLanguage) {
        statusLanguage.textContent = language.charAt(0).toUpperCase() + language.slice(1);
    }
}

export function applyEditorSettings() {
    if (!state.editor) return;

    state.editor.updateOptions({
        fontSize: state.settings.fontSize,
        tabSize: state.settings.tabSize,
        lineNumbers: state.settings.lineNumbers ? 'on' : 'off',
        wordWrap: state.settings.wordWrap ? 'on' : 'off',
        minimap: {
            enabled: state.settings.minimap
        },
        padding: {
            top: state.settings.padding,
            bottom: state.settings.padding
        }
    });
}

export function focusEditor() {
    if (state.editor) {
        state.editor.focus();
    }
}