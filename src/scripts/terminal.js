// terminal.js - POLARIS Terminal (FIXED - Context Menu, Drag-Drop, Proper Input)
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

class IntegratedTerminal {
    constructor() {
        this.terminals = new Map();
        this.activeTerminalId = null;
        this.nextTerminalId = 1;
        this.panelElement = null;
        this.isVisible = false;
        this.panelHeight = 300;
        this.minHeight = 100;
        this.maxHeight = 800;
        this.isResizing = false;
        this.eventListeners = new Map();
        this.draggedTab = null;
        this.colorPalette = [
            '#8b5cf6', // purple
            '#ef4444', // red
            '#f59e0b', // orange
            '#eab308', // yellow
            '#22c55e', // green
            '#06b6d4', // cyan
            '#3b82f6', // blue
            '#ec4899', // pink
            '#78716c', // gray
        ];
        
        this.init();
    }

    init() {
        this.createPanel();
        this.createContextMenu();
        this.setupEventListeners();
        this.createNewTerminal();
    }

    createPanel() {
        const panel = document.createElement('div');
        panel.className = 'terminal-panel';
        panel.innerHTML = `
            <div class="terminal-resize-handle"></div>
            <div class="terminal-header">
                <div class="terminal-header-left">
                    <div class="terminal-title">
                        <span class="material-symbols-outlined">terminal</span>
                        <span>Terminal</span>
                    </div>
                    <div class="terminal-tabs" id="terminalTabs"></div>
                </div>
                <div class="terminal-header-right">
                    <button class="terminal-action" id="terminalAdd" title="New Terminal">
                        <span class="material-symbols-outlined">add</span>
                    </button>
                    <button class="terminal-action" id="terminalSplit" title="Split Terminal">
                        <span class="material-symbols-outlined">vertical_split</span>
                    </button>
                    <button class="terminal-action" id="terminalTrash" title="Kill Terminal">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                    <button class="terminal-action" id="terminalMaximize" title="Maximize Panel">
                        <span class="material-symbols-outlined">expand_less</span>
                    </button>
                    <button class="terminal-action danger" id="terminalClose" title="Close Panel">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>
            <div class="terminal-content" id="terminalContent"></div>
        `;

        this.panelElement = panel;
        const editorArea = document.querySelector('.editor-area');
        if (editorArea) {
            editorArea.appendChild(panel);
        }

        this.createColorPicker();
    }

    createContextMenu() {
        const menu = document.createElement('div');
        menu.className = 'terminal-context-menu';
        menu.id = 'terminalContextMenu';
        menu.innerHTML = `
            <div class="terminal-context-item" id="contextRename">
                <span class="material-symbols-outlined">edit</span>
                <span>Rename</span>
            </div>
            <div class="terminal-context-item" id="contextChangeColor">
                <span class="material-symbols-outlined">palette</span>
                <span>Change Color</span>
            </div>
            <div class="terminal-context-divider"></div>
            <div class="terminal-context-item danger" id="contextClose">
                <span class="material-symbols-outlined">close</span>
                <span>Close Terminal</span>
            </div>
        `;
        document.body.appendChild(menu);

        document.addEventListener('click', () => {
            menu.classList.remove('active');
        });
    }

    createColorPicker() {
        const picker = document.createElement('div');
        picker.className = 'terminal-color-picker';
        picker.id = 'terminalColorPicker';
        
        const colors = this.colorPalette.map(color => 
            `<button class="color-option" data-color="${color}" style="background: ${color}"></button>`
        ).join('');
        
        picker.innerHTML = `<div class="color-picker-grid">${colors}</div>`;
        document.body.appendChild(picker);

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.terminal-color-picker') && 
                !e.target.closest('.terminal-color-dot')) {
                picker.classList.remove('active');
            }
        });
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.isVisible) {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.closest('.terminal-panel')) {
                    this.hide();
                }
            }
        });

        document.getElementById('terminalAdd')?.addEventListener('click', () => {
            this.createNewTerminal();
        });

        document.getElementById('terminalSplit')?.addEventListener('click', () => {
            this.splitTerminal();
        });

        document.getElementById('terminalTrash')?.addEventListener('click', () => {
            this.killActiveTerminal();
        });

        document.getElementById('terminalMaximize')?.addEventListener('click', () => {
            this.toggleMaximize();
        });

        document.getElementById('terminalClose')?.addEventListener('click', () => {
            this.hide();
        });

        this.setupResize();
    }

    setupResize() {
        const resizeHandle = this.panelElement.querySelector('.terminal-resize-handle');
        
        let startY = 0;
        let startHeight = 0;

        const startResize = (e) => {
            if (!e.target.classList.contains('terminal-resize-handle')) {
                return;
            }

            this.isResizing = true;
            startY = e.clientY;
            startHeight = this.panelHeight;
            this.panelElement.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
            
            e.preventDefault();
            e.stopPropagation();
            
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResize);
        };

        const resize = (e) => {
            if (!this.isResizing) return;
            
            const delta = startY - e.clientY;
            let newHeight = startHeight + delta;
            newHeight = Math.max(this.minHeight, Math.min(newHeight, this.maxHeight));
            
            this.panelHeight = newHeight;
            this.panelElement.style.height = `${newHeight}px`;
            
            this.terminals.forEach(terminal => {
                terminal.fitAddon.fit();
            });
        };

        const stopResize = () => {
            this.isResizing = false;
            this.panelElement.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        };

        resizeHandle.addEventListener('mousedown', startResize);
    }

    async createNewTerminal() {
        const terminalId = this.nextTerminalId++;
        
        const container = document.createElement('div');
        container.className = 'terminal-instance';
        container.id = `terminal-${terminalId}`;
        document.getElementById('terminalContent').appendChild(container);

        const term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: 'JetBrains Mono, Consolas, monospace',
            fontSize: 13,
            lineHeight: 1.4,
            theme: {
                background: '#0a0a0f',
                foreground: '#e8e8f0',
                cursor: '#8b5cf6',
                cursorAccent: '#0a0a0f',
                selection: 'rgba(168, 85, 247, 0.3)',
                black: '#1a1a24',
                red: '#ef4444',
                green: '#10b981',
                yellow: '#f59e0b',
                blue: '#3b82f6',
                magenta: '#a78bfa',
                cyan: '#06b6d4',
                white: '#e8e8f0',
                brightBlack: '#5a5a6e',
                brightRed: '#f87171',
                brightGreen: '#34d399',
                brightYellow: '#fbbf24',
                brightBlue: '#60a5fa',
                brightMagenta: '#c4b5fd',
                brightCyan: '#22d3ee',
                brightWhite: '#ffffff',
            },
            allowTransparency: true,
            scrollback: 10000,
            convertEol: true,
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        const searchAddon = new SearchAddon();
        
        term.loadAddon(fitAddon);
        term.loadAddon(webLinksAddon);
        term.loadAddon(searchAddon);

        term.open(container);
        fitAddon.fit();

        const platform = await invoke('get_platform');
        const shellPath = await invoke('get_shell_path');
        const cwd = await invoke('get_current_directory');

        const ptyId = await invoke('create_pty', { 
            shell: shellPath,
            cwd: cwd
        });

        let defaultName = 'bash';
        if (platform === 'windows') {
            if (shellPath.toLowerCase().includes('powershell')) {
                defaultName = 'powershell';
            } else {
                defaultName = 'cmd';
            }
        }

        this.terminals.set(terminalId, {
            term,
            fitAddon,
            searchAddon,
            container,
            ptyId,
            platform,
            title: defaultName,
            color: this.colorPalette[0],
        });

        term.onData(async (data) => {
            try {
                await invoke('write_pty', { ptyId, data });
            } catch (error) {
                console.error('Error writing to PTY:', error);
            }
        });

        await this.setupPtyOutputListener(terminalId, ptyId, term);

        term.onResize(async ({ cols, rows }) => {
            try {
                await invoke('resize_pty', { ptyId, cols, rows });
            } catch (error) {
                console.error('Error resizing PTY:', error);
            }
        });

        this.createTab(terminalId);
        this.switchTerminal(terminalId);

        if (!this.isVisible) {
            this.show();
        }

        term.focus();
        return terminalId;
    }

    async setupPtyOutputListener(terminalId, ptyId, term) {
        const eventName = `pty-output-${ptyId}`;
        
        const unlisten = await listen(eventName, (event) => {
            if (event.payload && event.payload.data) {
                term.write(event.payload.data);
            }
        });

        this.eventListeners.set(terminalId, unlisten);

        try {
            await invoke('start_pty_stream', { ptyId });
        } catch (error) {
            console.error('Error starting PTY stream:', error);
            term.write('\r\n\x1b[1;31mFailed to start terminal stream\x1b[0m\r\n');
        }
    }

    createTab(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;

        const tab = document.createElement('div');
        tab.className = 'terminal-tab';
        tab.dataset.terminalId = terminalId;
        tab.innerHTML = `
            <div class="terminal-tab-indicator" style="background: ${terminal.color}"></div>
            <span class="terminal-tab-icon material-symbols-outlined">terminal</span>
            <span class="terminal-tab-title">${terminal.title}</span>
            <span class="terminal-color-dot" style="background: ${terminal.color}"></span>
            <span class="terminal-tab-close material-symbols-outlined">close</span>
        `;

        tab.addEventListener('click', (e) => {
            if (!e.target.classList.contains('terminal-tab-close') && 
                !e.target.classList.contains('terminal-color-dot')) {
                this.switchTerminal(terminalId);
            }
        });

        tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(terminalId, e.clientX, e.clientY);
        });

        tab.querySelector('.terminal-tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.killTerminal(terminalId);
        });

        const colorDot = tab.querySelector('.terminal-color-dot');
        colorDot.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showColorPicker(terminalId, colorDot);
        });

        this.setupTabDragAndDrop(tab);

        document.getElementById('terminalTabs').appendChild(tab);
    }

    setupTabDragAndDrop(tab) {
        let isDragging = false;
        let startX = 0;
        let hasMovedEnough = false;

        const startDrag = (e) => {
            if (e.target.closest('.terminal-tab-close') || 
                e.target.closest('.terminal-color-dot')) {
                return;
            }

            isDragging = true;
            hasMovedEnough = false;
            startX = e.clientX;
            this.draggedTab = tab;
            
            e.preventDefault();
        };

        const doDrag = (e) => {
            if (!isDragging || !this.draggedTab) return;

            const moveDistance = Math.abs(e.clientX - startX);
            
            if (moveDistance > 5 && !hasMovedEnough) {
                hasMovedEnough = true;
                this.draggedTab.classList.add('dragging');
                document.body.style.cursor = 'grabbing';
            }

            if (!hasMovedEnough) return;

            const tabsContainer = document.getElementById('terminalTabs');
            const afterElement = this.getDragAfterElement(tabsContainer, e.clientX);

            if (afterElement == null) {
                tabsContainer.appendChild(this.draggedTab);
            } else {
                tabsContainer.insertBefore(this.draggedTab, afterElement);
            }
        };

        const endDrag = () => {
            if (isDragging) {
                isDragging = false;
                if (this.draggedTab) {
                    this.draggedTab.classList.remove('dragging');
                    this.draggedTab = null;
                }
                document.body.style.cursor = '';
            }
        };

        tab.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', endDrag);
    }

    getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.terminal-tab:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    showContextMenu(terminalId, x, y) {
        const menu = document.getElementById('terminalContextMenu');
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.add('active');

        const rename = document.getElementById('contextRename');
        const changeColor = document.getElementById('contextChangeColor');
        const close = document.getElementById('contextClose');

        const newRename = rename.cloneNode(true);
        const newChangeColor = changeColor.cloneNode(true);
        const newClose = close.cloneNode(true);

        rename.parentNode.replaceChild(newRename, rename);
        changeColor.parentNode.replaceChild(newChangeColor, changeColor);
        close.parentNode.replaceChild(newClose, close);

        newRename.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startRenaming(terminalId);
            menu.classList.remove('active');
        });

        newChangeColor.addEventListener('click', (e) => {
            e.stopPropagation();
            const tab = document.querySelector(`[data-terminal-id="${terminalId}"]`);
            const colorDot = tab?.querySelector('.terminal-color-dot');
            if (colorDot) {
                this.showColorPicker(terminalId, colorDot);
            }
            menu.classList.remove('active');
        });

        newClose.addEventListener('click', (e) => {
            e.stopPropagation();
            this.killTerminal(terminalId);
            menu.classList.remove('active');
        });
    }

    startRenaming(terminalId) {
        const tab = document.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (!tab) return;

        const titleElement = tab.querySelector('.terminal-tab-title');
        const currentTitle = titleElement.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'terminal-tab-rename-input';
        input.value = currentTitle;

        titleElement.style.display = 'none';
        titleElement.parentNode.insertBefore(input, titleElement);

        input.focus();
        input.select();

        const finishRename = (save) => {
            if (save) {
                const newName = input.value.trim();
                if (newName.length > 0) {
                    const terminal = this.terminals.get(terminalId);
                    if (terminal) {
                        terminal.title = newName;
                        titleElement.textContent = newName;
                    }
                }
            }

            input.remove();
            titleElement.style.display = '';
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishRename(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishRename(false);
            }
        });

        input.addEventListener('blur', () => {
            finishRename(true);
        });
    }

    showColorPicker(terminalId, colorDot) {
        const picker = document.getElementById('terminalColorPicker');
        const rect = colorDot.getBoundingClientRect();

        picker.style.top = `${rect.bottom + 20}px`;
        picker.style.left = `${rect.left - 60}px`;
        picker.classList.add('active');

        const oldButtons = picker.querySelectorAll('.color-option');
        oldButtons.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });

        picker.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = btn.dataset.color;
                this.setTerminalColor(terminalId, color);
                picker.classList.remove('active');
            });
        });
    }

    setTerminalColor(terminalId, color) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;

        terminal.color = color;

        const tab = document.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (tab) {
            const colorDot = tab.querySelector('.terminal-color-dot');
            const indicator = tab.querySelector('.terminal-tab-indicator');
            
            if (colorDot) colorDot.style.background = color;
            if (indicator) indicator.style.background = color;
        }
    }

    switchTerminal(terminalId) {
        this.terminals.forEach((terminal, id) => {
            terminal.container.classList.remove('active');
            const tab = document.querySelector(`[data-terminal-id="${id}"]`);
            if (tab) tab.classList.remove('active');
        });

        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.container.classList.add('active');
            const tab = document.querySelector(`[data-terminal-id="${terminalId}"]`);
            if (tab) tab.classList.add('active');
            
            this.activeTerminalId = terminalId;
            
            setTimeout(() => {
                terminal.fitAddon.fit();
                terminal.term.focus();
            }, 50);
        }
    }

    async killTerminal(terminalId) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;

        const unlisten = this.eventListeners.get(terminalId);
        if (unlisten) {
            unlisten();
            this.eventListeners.delete(terminalId);
        }

        try {
            await invoke('kill_pty', { ptyId: terminal.ptyId });
        } catch (error) {
            console.error('Error killing PTY:', error);
        }

        terminal.term.dispose();
        terminal.container.remove();

        const tab = document.querySelector(`[data-terminal-id="${terminalId}"]`);
        if (tab) tab.remove();

        this.terminals.delete(terminalId);

        if (this.terminals.size > 0) {
            const nextId = Array.from(this.terminals.keys())[0];
            this.switchTerminal(nextId);
        } else {
            this.hide();
        }
    }

    killActiveTerminal() {
        if (this.activeTerminalId !== null) {
            this.killTerminal(this.activeTerminalId);
        }
    }

    splitTerminal() {
        this.createNewTerminal();
    }

    show() {
        this.isVisible = true;
        this.panelElement.classList.add('active');
        this.panelElement.style.height = `${this.panelHeight}px`;
        
        this.terminals.forEach(terminal => {
            terminal.fitAddon.fit();
        });

        const activeTerminal = this.terminals.get(this.activeTerminalId);
        if (activeTerminal) {
            activeTerminal.term.focus();
        }
    }

    hide() {
        this.isVisible = false;
        this.panelElement.classList.remove('active');
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    toggleMaximize() {
        const editorArea = document.querySelector('.editor-area');
        const maxHeight = editorArea.clientHeight - 100;
        
        if (this.panelHeight >= maxHeight - 50) {
            this.panelHeight = 300;
        } else {
            this.panelHeight = maxHeight;
        }
        
        this.panelElement.style.height = `${this.panelHeight}px`;
        this.terminals.forEach(terminal => {
            terminal.fitAddon.fit();
        });
    }

    clear() {
        const activeTerminal = this.terminals.get(this.activeTerminalId);
        if (activeTerminal) {
            activeTerminal.term.clear();
        }
    }

    dispose() {
        this.eventListeners.forEach(unlisten => {
            unlisten();
        });
        this.eventListeners.clear();

        this.terminals.forEach((terminal, id) => {
            this.killTerminal(id);
        });
        
        if (this.panelElement) {
            this.panelElement.remove();
        }

        const picker = document.getElementById('terminalColorPicker');
        if (picker) picker.remove();

        const menu = document.getElementById('terminalContextMenu');
        if (menu) menu.remove();
    }
}

let terminalInstance = null;

export function initTerminal() {
    if (!terminalInstance) {
        terminalInstance = new IntegratedTerminal();
    }
    return terminalInstance;
}

export function getTerminal() {
    return terminalInstance;
}