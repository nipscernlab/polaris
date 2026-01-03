import * as monaco from 'monaco-editor';
import { state, getEditorInstance, updateTabContent, updateSettings, saveSettings } from './state.js';
import { renderInstanceTabs } from './tabs.js';
import { updateFileTreeHighlight } from './fileTree.js';

let themesDefined = false;
const globalModels = new Map(); // Global model cache - one model per file path

// ===== MONACO EDITOR INITIALIZATION =====

export async function initMonacoEditor(container, instanceId) {
    console.log(`🔧 Initializing Monaco Editor instance ${instanceId}...`);

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
                    'editorLineNumber.activeForeground': '#8b8bcc',
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
            lineNumbersMinChars: 3,
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 10,
            minimap: {
                enabled: state.settings.minimap
            },
            wordWrap: state.settings.wordWrap ? 'on' : 'off',
            scrollBeyondLastLine: true,
            automaticLayout: true,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderLineHighlight: 'all',
            bracketPairColorization: {
                enabled: true
            },
            padding: {
                top: 16,
                bottom: 16
            },
            scrollbar: {
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
                useShadows: true
            }
        });

        // Setup editor event listeners
        setupEditorListeners(editor, instanceId);

        // Setup font zoom with Ctrl + Mouse Wheel
        setupFontZoom(editor, container);

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

    // Focus handling - UPDATE FILE TREE HIGHLIGHT
    editor.onDidFocusEditorText(() => {
        const { setFocusedInstance } = require('./state.js');
        setFocusedInstance(instanceId);
        updateFocusVisuals();
        
        // Update file tree highlight when editor gains focus
        const instance = getEditorInstance(instanceId);
        if (instance && instance.activeTab) {
            updateFileTreeHighlight(instance.activeTab);
        }
    });
    
    // Also update on model change
    editor.onDidChangeModel(() => {
        const instance = getEditorInstance(instanceId);
        if (instance && instance.activeTab && instance.focused) {
            updateFileTreeHighlight(instance.activeTab);
        }
    });
}

function setupFontZoom(editor, container) {
    container.addEventListener('wheel', (e) => {
        // Check if Ctrl (or Cmd on Mac) is pressed
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            
            const currentSize = state.settings.fontSize;
            let newSize = currentSize;
            
            // Zoom in/out based on wheel direction
            if (e.deltaY < 0) {
                // Scroll up - zoom in
                newSize = Math.min(currentSize + 1, 30);
            } else {
                // Scroll down - zoom out
                newSize = Math.max(currentSize - 1, 8);
            }
            
            if (newSize !== currentSize) {
                state.settings.fontSize = newSize;
                saveSettings();
                applyEditorSettings();
            }
        }
    }, { passive: false });
}

function updateFocusVisuals() {
    state.editorInstances.forEach(instance => {
        const editorDiv = document.getElementById(`editor-${instance.id}`);
        if (editorDiv) {
            if (instance.focused) {
                editorDiv.style.opacity = '1';
                editorDiv.style.borderLeft = '3px solid var(--accent)';
                editorDiv.style.background = 'var(--bg-primary)';
            } else {
                editorDiv.style.opacity = '0.85';
                editorDiv.style.borderLeft = '3px solid transparent';
                editorDiv.style.background = '#08080d';
            }
        }
    });
}

// ===== EDITOR MODEL MANAGEMENT =====

export function setEditorModel(instanceId, filePath) {
    const instance = getEditorInstance(instanceId);
    if (!instance || !instance.editor) {
        console.error(`Instance ${instanceId} not found or has no editor`);
        return;
    }

    const tab = instance.tabs.get(filePath);
    if (!tab) {
        console.error(`Tab ${filePath} not found in instance ${instanceId}`);
        return;
    }

    // Get or create global model for this file
    let model = globalModels.get(filePath);
    
    if (!model) {
        const uri = monaco.Uri.file(filePath);
        const language = getLanguageFromPath(filePath);
        
        // Create new model
        model = monaco.editor.createModel(tab.content, language, uri);
        globalModels.set(filePath, model);
        
        // Listen for model content changes to sync across instances
        model.onDidChangeContent(() => {
            const newContent = model.getValue();
            
            // Update all tabs with this file path
            state.editorInstances.forEach(inst => {
                const instTab = inst.tabs.get(filePath);
                if (instTab) {
                    instTab.content = newContent;
                    instTab.modified = newContent !== instTab.originalContent;
                }
            });
            
            // Re-render all affected tabs
            state.editorInstances.forEach(inst => {
                if (inst.tabs.has(filePath)) {
                    renderInstanceTabs(inst.id);
                }
            });
        });
    } else {
        // Update existing model content if needed
        if (model.getValue() !== tab.content) {
            model.setValue(tab.content);
        }
    }

    // Set model to this editor instance
    instance.editor.setModel(model);
    instance.activeTab = filePath;
    tab.model = model;

    // Update status bar and file tree
    updateStatusBar(tab.name, getLanguageFromPath(filePath));
    updateFileTreeHighlight(filePath);
    
    // Focus the editor
    instance.editor.focus();
    
    console.log(`Model set for instance ${instanceId}:`, filePath);
}

export function disposeModel(filePath) {
    // Check if any instance still has this file open
    let stillInUse = false;
    state.editorInstances.forEach(instance => {
        if (instance.tabs.has(filePath)) {
            stillInUse = true;
        }
    });
    
    // Only dispose if no instance uses this file
    if (!stillInUse) {
        const model = globalModels.get(filePath);
        if (model) {
            model.dispose();
            globalModels.delete(filePath);
            console.log(`Model disposed: ${filePath}`);
        }
    }
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
        'yml': 'yaml',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'cpp',
        'hpp': 'cpp',
        'java': 'java',
        'go': 'go',
        'sh': 'shell',
        'bash': 'shell',
        'sql': 'sql',
        'v': 'verilog',
        'sv': 'systemverilog',
        'vh': 'verilog',
        'bat': 'bat',
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

// ===== EDITOR SETTINGS =====

export function applyEditorSettings() {
    state.editorInstances.forEach(instance => {
        if (instance.editor) {
            instance.editor.updateOptions({
                fontSize: state.settings.fontSize,
                fontFamily: state.settings.fontFamily,
                tabSize: state.settings.tabSize,
                lineNumbers: state.settings.lineNumbers ? 'on' : 'off',
                wordWrap: state.settings.wordWrap ? 'on' : 'off',
                minimap: {
                    enabled: state.settings.minimap
                },
                padding: {
                    top: 16,
                    bottom: 16
                }
            });
            instance.editor.layout();
        }
    });
}

export function focusEditor(instanceId) {
    const instance = getEditorInstance(instanceId);
    if (instance && instance.editor) {
        instance.editor.focus();
    }
}