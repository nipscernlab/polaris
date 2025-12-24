import * as monaco from 'monaco-editor';
import { state, getEditorInstance, updateTabContent } from './state.js';
import { renderInstanceTabs } from './tabs.js';

let themesDefined = false;

// ===== MONACO EDITOR INITIALIZATION =====

export async function initMonacoEditor(container, instanceId) {
    console.log(`📝 Initializing Monaco Editor instance ${instanceId}...`);

    if (!container) {
        console.error('Monaco editor container not found');
        return null;
    }

    // Configure Monaco Environment (only once)
    if (!self.MonacoEnvironment) {
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
    }

    // Define custom theme (only once)
    if (!themesDefined) {
        try {
            monaco.editor.defineTheme('aurora-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '5a5a6e', fontStyle: 'italic' },
                    { token: 'keyword', foreground: '8b5cf6', fontStyle: 'bold' },
                    { token: 'string', foreground: '10b981' },
                    { token: 'number', foreground: 'f59e0b' },
                    { token: 'function', foreground: 'a78bfa' },
                    { token: 'variable', foreground: 'e8e8f0' },
                    { token: 'type', foreground: '3b82f6' },
                    { token: 'operator', foreground: 'c4b5fd' },
                ],
                colors: {
                    'editor.background': '#0a0a0f',
                    'editor.foreground': '#e8e8f0',
                    'editor.lineHighlightBackground': '#13131a',
                    'editor.selectionBackground': '#8b5cf640',
                    'editor.inactiveSelectionBackground': '#8b5cf620',
                    'editorCursor.foreground': '#8b5cf6',
                    'editorLineNumber.foreground': '#3a3a4c',
                    'editorLineNumber.activeForeground': '#b8b8cc',
                    'editor.findMatchBackground': '#8b5cf660',
                    'editorBracketMatch.background': '#2a2a38',
                    'editorBracketMatch.border': '#8b5cf6',
                    'editorIndentGuide.background': '#2a2a38',
                    'editorIndentGuide.activeBackground': '#3a3a4c',
                    'scrollbar.shadow': '#00000060',
                    'scrollbarSlider.background': '#2a2a3880',
                    'scrollbarSlider.hoverBackground': '#3a3a4c80',
                    'minimap.background': '#13131a',
                }
            });
            themesDefined = true;
        } catch (error) {
            console.error('Error defining theme:', error);
        }
    }

    // Create editor instance
    try {
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
            padding: {
                top: state.settings.padding,
                bottom: state.settings.padding
            },
            scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
            }
        });

        // Setup editor event listeners
        setupEditorListeners(editor, instanceId);

        console.log(`✅ Monaco Editor instance ${instanceId} initialized`);
        return editor;
    } catch (error) {
        console.error('Error creating Monaco editor:', error);
        return null;
    }
}

function setupEditorListeners(editor, instanceId) {
    // Track cursor position
    editor.onDidChangeCursorPosition((e) => {
        const instance = getEditorInstance(instanceId);
        if (instance && instance.focused) {
            const statusPosition = document.getElementById('statusPosition');
            if (statusPosition) {
                statusPosition.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
            }
        }
    });

    // Track content changes
    editor.onDidChangeModelContent(() => {
        const instance = getEditorInstance(instanceId);
        if (instance && instance.activeTab) {
            const currentContent = editor.getValue();
            updateTabContent(instanceId, instance.activeTab, currentContent);
            renderInstanceTabs(instanceId);
        }
    });

    // Focus handling
    editor.onDidFocusEditorText(() => {
        const { setFocusedInstance } = require('./state.js');
        setFocusedInstance(instanceId);
        
        // Update focus visuals
        state.editorInstances.forEach(inst => {
            const editorDiv = document.getElementById(`editor-${inst.id}`);
            if (editorDiv) {
                editorDiv.style.opacity = inst.id === instanceId ? '1' : '0.7';
            }
        });
    });
}

// ===== EDITOR UTILITIES =====

export function setEditorModel(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance || !instance.editor) return;

    const tab = instance.tabs.get(filePath);
    if (!tab) return;

    // Create or reuse model
    if (!tab.model) {
        const uri = monaco.Uri.file(filePath);
        const language = getLanguageFromPath(filePath);
        tab.model = monaco.editor.createModel(tab.content, language, uri);
    }

    instance.editor.setModel(tab.model);
    instance.activeTab = filePath;

    // Update status bar
    updateStatusBar(tab.name, getLanguageFromPath(filePath));
}

function getLanguageFromPath(filePath) {
    const extension = filePath.split('.').pop().toLowerCase();
    
    const languageMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'spf': 'json',
        'md': 'markdown',
        'py': 'python',
        'rs': 'rust',
        'toml': 'toml',
        'yaml': 'yaml',
        'c': 'c',
        'cmm': 'c',
        'cpp': 'cpp',
        'h': 'cpp',
        'java': 'java',
        'go': 'go',
        'sh': 'shell',
        'sql': 'sql',
        'txt': 'plaintext'
    };

    return languageMap[extension] || 'plaintext';
}

function updateStatusBar(fileName, language) {
    const statusLanguage = document.getElementById('statusLanguage');
    if (statusLanguage) {
        const langDisplay = language.charAt(0).toUpperCase() + language.slice(1);
        statusLanguage.textContent = langDisplay;
    }
}

export function applyEditorSettings() {
    state.editorInstances.forEach(instance => {
        if (instance.editor) {
            instance.editor.updateOptions({
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
    });
}

export function focusEditor(instanceId) {
    const instance = getEditorInstance(instanceId);
    if (instance && instance.editor) {
        instance.editor.focus();
    }
}