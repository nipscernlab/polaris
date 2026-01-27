// TENTANDO RECUPERAR O HISTORICO DE ALTERACOES


import * as PIXI from 'pixi.js';
import { invoke } from '@tauri-apps/api/core';

// ===== WAVETRACE STATE =====
const wavetraceState = {
    active: false,
    filePath: null,
    fileName: null,
    vcdData: null,
    app: null,
    container: null,
    signals: [],
    displayedSignals: [],
    signalColors: new Map(),
    signalRadix: new Map(),
    signalRenderMode: new Map(),
    timeScale: 1,
    timeOffset: 0,
    cursorPosition: null,
    selectedSignalId: null,
    signalHeight: 80,
    headerHeight: 50,
    sidebarWidth: 320,
    sidebarCollapsed: false,
    canvasScrollY: 0,
    isDragging: false,
    isDraggingCursor: false,
    isPanning: false,
    isResizingSidebar: false,
    dragStartX: 0,
    dragStartY: 0,
    panStartOffset: 0,
    infoPanelMinimized: false,
    resizeObserver: null,
    mutationObserver: null,
    colorPalette: [
        0x60a5fa, 0xa78bfa, 0x34d399, 0xfbbf24,
        0xf472b6, 0x22d3ee, 0xfb923c, 0x86efac,
        0xc084fc, 0x38bdf8, 0xa3e635, 0xfca5a5,
    ],
    colors: {
        background: 0x0a0a0f,
        grid: 0x252538,
        gridMajor: 0x3a3a50,
        text: 0xe8e8f0,
        textMuted: 0xa8a8c0,
        cursor: 0xa78bfa,
        selectedBg: 0x2a2a3c,
        highlight: 0x8b5cf6,
        signalBg: 0x0d0d12,
        signalBgAlt: 0x0a0a0f
    }
};

// ===== VCD PARSER =====
class VCDParser {
    constructor() {
        this.timescale = '1ns';
        this.scope = [];
        this.signals = new Map();
        this.values = new Map();
        this.timeValues = [];
    }

    parse(vcdContent) {
        const lines = vcdContent.split('\n');
        let inHeader = true;
        let currentTime = 0;
        let idToSignal = new Map();

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (!line || line.startsWith('$comment')) continue;

            if (inHeader) {
                if (line.startsWith('$timescale')) {
                    this.timescale = lines[++i].trim();
                } else if (line.startsWith('$scope')) {
                    const parts = line.split(/\s+/);
                    this.scope.push(parts[2] || 'unknown');
                } else if (line.startsWith('$upscope')) {
                    this.scope.pop();
                } else if (line.startsWith('$var')) {
                    const parts = line.split(/\s+/);
                    const type = parts[1];
                    const width = parseInt(parts[2]);
                    const id = parts[3];
                    const name = parts[4];
                    
                    const fullPath = [...this.scope, name].join('.');
                    
                    const signal = {
                        id,
                        name,
                        path: fullPath,
                        type,
                        width,
                        values: []
                    };
                    
                    this.signals.set(id, signal);
                    idToSignal.set(id, signal);
                } else if (line.startsWith('$enddefinitions')) {
                    inHeader = false;
                }
                continue;
            }

            if (line.startsWith('#')) {
                currentTime = parseInt(line.substring(1));
                if (!this.timeValues.includes(currentTime)) {
                    this.timeValues.push(currentTime);
                }
            } else if (line.length > 0) {
                let value, id;
                
                if (line[0] === 'b') {
                    const parts = line.split(/\s+/);
                    value = parts[0].substring(1);
                    id = parts[1];
                } else {
                    value = line[0];
                    id = line.substring(1);
                }

                const signal = idToSignal.get(id);
                if (signal) {
                    signal.values.push({ time: currentTime, value });
                }
            }
        }

        this.timeValues.sort((a, b) => a - b);
        
        return {
            timescale: this.timescale,
            signals: Array.from(this.signals.values()),
            timeRange: {
                start: this.timeValues[0] || 0,
                end: this.timeValues[this.timeValues.length - 1] || 0
            }
        };
    }
}

// ===== WAVETRACE INITIALIZATION =====
export async function openWavetraceViewer(filePath, fileName) {
    console.log('Opening Wavetrace viewer for:', fileName);

    try {
        const content = await invoke('read_file', { path: filePath });
        const parser = new VCDParser();
        const vcdData = parser.parse(content);
        
        wavetraceState.filePath = filePath;
        wavetraceState.fileName = fileName;
        wavetraceState.vcdData = vcdData;
        wavetraceState.signals = vcdData.signals;
        wavetraceState.active = true;

        const container = document.getElementById('wavetraceContainer');
        if (container) {
            container.classList.add('active');
        }

        assignSignalColors();
        initWavetraceUI();
        
        console.log(`Loaded ${vcdData.signals.length} signals from VCD file`);
    } catch (error) {
        console.error('Error opening VCD file:', error);
        alert(`Failed to open VCD file: ${error}`);
    }
}

function assignSignalColors() {
    wavetraceState.signals.forEach((signal, index) => {
        const colorIndex = index % wavetraceState.colorPalette.length;
        wavetraceState.signalColors.set(signal.id, wavetraceState.colorPalette[colorIndex]);
        wavetraceState.signalRadix.set(signal.id, signal.width > 1 ? 'hex' : 'binary');
        wavetraceState.signalRenderMode.set(signal.id, signal.width === 1 ? 'digital' : 'analog');
    });
}

function initWavetraceUI() {
    const container = document.getElementById('wavetraceContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="wt-header">
            <div class="wt-title-group">
                <div class="wt-logo">YAWT</div>
                <div class="wt-divider"></div>
                <span class="wt-filename">${wavetraceState.fileName}</span>
                <span class="wt-timescale">${wavetraceState.vcdData.timescale}</span>
            </div>
            <div class="wt-controls">
                <button class="wt-btn" id="wtZoomIn" title="Zoom In">
                    <span class="material-symbols-outlined">add</span>
                </button>
                <button class="wt-btn" id="wtZoomOut" title="Zoom Out">
                    <span class="material-symbols-outlined">remove</span>
                </button>
                <button class="wt-btn" id="wtVerticalExpand" title="Expand Height">
                    <span class="material-symbols-outlined">unfold_more</span>
                </button>
                <button class="wt-btn" id="wtVerticalShrink" title="Shrink Height">
                    <span class="material-symbols-outlined">unfold_less</span>
                </button>
                <button class="wt-btn" id="wtFitAll" title="Fit All">
                    <span class="material-symbols-outlined">fit_screen</span>
                </button>
                <button class="wt-btn wt-btn-close" id="wtClose" title="Close">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
        
        <div class="wt-main">
            <div class="wt-sidebar" id="wtSidebar">
                <div class="wt-sidebar-header">
                    <input type="text" id="signalSearch" class="wt-search" placeholder="Search signals...">
                </div>
                <div class="wt-signal-list" id="signalTree"></div>
                <div class="wt-sidebar-resizer"></div>
            </div>
            
            <button class="wt-sidebar-toggle" id="sidebarToggle">
                <span class="material-symbols-outlined">chevron_left</span>
            </button>
            
            <div class="wt-viewer">
                <div class="wt-canvas-wrapper" id="canvasWrapper">
                    <div class="wt-canvas" id="waveformCanvas"></div>
                    <div class="wt-cursor-info" id="cursorInfo" style="display: none;"></div>
                </div>
            </div>
        </div>
    `;

    setupWavetraceControls();
    renderSignalTree();
    initPixiRenderer();
    setupKeyboardNavigation();
    setupSidebarResize();
    observeLayoutChanges();
}

function observeLayoutChanges() {
    const mainSidebar = document.getElementById('sidebar');
    const wtSidebar = document.getElementById('wtSidebar');
    
    if (wavetraceState.resizeObserver) {
        wavetraceState.resizeObserver.disconnect();
    }
    
    wavetraceState.resizeObserver = new ResizeObserver(() => {
        if (wavetraceState.app) {
            requestAnimationFrame(() => {
                const canvas = document.getElementById('waveformCanvas');
                if (canvas && wavetraceState.active) {
                    wavetraceState.app.renderer.resize(canvas.clientWidth, canvas.clientHeight);
                    renderWaveforms();
                }
            });
        }
    });
    
    if (mainSidebar) wavetraceState.resizeObserver.observe(mainSidebar);
    if (wtSidebar) wavetraceState.resizeObserver.observe(wtSidebar);
}

function setupSidebarResize() {
    const sidebar = document.getElementById('wtSidebar');
    const resizer = sidebar?.querySelector('.wt-sidebar-resizer');
    
    if (!resizer) return;
    
    let startX, startWidth;
    
    resizer.addEventListener('mousedown', (e) => {
        wavetraceState.isResizingSidebar = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        
        document.body.style.cursor = 'col-resize';
        sidebar.classList.add('resizing');
        
        const handleMouseMove = (e) => {
            if (!wavetraceState.isResizingSidebar) return;
            
            const delta = e.clientX - startX;
            const newWidth = Math.max(200, Math.min(600, startWidth + delta));
            
            sidebar.style.width = `${newWidth}px`;
            wavetraceState.sidebarWidth = newWidth;
            
            if (wavetraceState.app) {
                const canvas = document.getElementById('waveformCanvas');
                if (canvas) {
                    wavetraceState.app.renderer.resize(canvas.clientWidth, canvas.clientHeight);
                    renderWaveforms();
                }
            }
        };
        
        const handleMouseUp = () => {
            wavetraceState.isResizingSidebar = false;
            document.body.style.cursor = '';
            sidebar.classList.remove('resizing');
            
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });
}

function setupWavetraceControls() {
    document.getElementById('wtClose')?.addEventListener('click', closeWavetraceViewer);
    
    document.getElementById('wtZoomIn')?.addEventListener('click', () => {
        zoomAtCenter(1.4);
    });
    
    document.getElementById('wtZoomOut')?.addEventListener('click', () => {
        zoomAtCenter(0.714);
    });

    document.getElementById('wtVerticalExpand')?.addEventListener('click', () => {
        wavetraceState.signalHeight = Math.min(200, wavetraceState.signalHeight + 20);
        updateScrollLimits();
        renderWaveforms();
    });

    document.getElementById('wtVerticalShrink')?.addEventListener('click', () => {
        wavetraceState.signalHeight = Math.max(40, wavetraceState.signalHeight - 20);
        updateScrollLimits();
        renderWaveforms();
    });
    
    document.getElementById('wtFitAll')?.addEventListener('click', () => {
        fitAllWaveforms();
    });
    
    document.getElementById('signalSearch')?.addEventListener('input', (e) => {
        filterSignals(e.target.value);
    });

    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        const sidebar = document.getElementById('wtSidebar');
        const toggle = document.getElementById('sidebarToggle');
        const icon = toggle?.querySelector('.material-symbols-outlined');
        
        wavetraceState.sidebarCollapsed = !wavetraceState.sidebarCollapsed;
        
        if (wavetraceState.sidebarCollapsed) {
            sidebar?.classList.add('collapsed');
            toggle?.classList.add('collapsed');
            if (icon) icon.textContent = 'chevron_right';
        } else {
            sidebar?.classList.remove('collapsed');
            toggle?.classList.remove('collapsed');
            if (icon) icon.textContent = 'chevron_left';
        }
        
        setTimeout(() => {
            if (wavetraceState.app) {
                const canvas = document.getElementById('waveformCanvas');
                if (canvas) {
                    wavetraceState.app.renderer.resize(canvas.clientWidth, canvas.clientHeight);
                    renderWaveforms();
                }
            }
        }, 300);
    });

    const canvasWrapper = document.getElementById('canvasWrapper');
    canvasWrapper?.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        if (e.ctrlKey) {
            return;
        }
        
        const maxScroll = getMaxScrollY();
        wavetraceState.canvasScrollY = Math.max(0, Math.min(maxScroll, wavetraceState.canvasScrollY + e.deltaY));
        renderWaveforms();
    }, { passive: false });
}

function getMaxScrollY() {
    if (!wavetraceState.app) return 0;
    const totalHeight = wavetraceState.displayedSignals.length * wavetraceState.signalHeight + wavetraceState.headerHeight;
    const viewHeight = wavetraceState.app.view.height;
    return Math.max(0, totalHeight - viewHeight);
}

function updateScrollLimits() {
    const maxScroll = getMaxScrollY();
    wavetraceState.canvasScrollY = Math.min(wavetraceState.canvasScrollY, maxScroll);
}

function zoomAtCenter(factor) {
    const canvas = wavetraceState.app?.view;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerTime = wavetraceState.timeOffset + (centerX / wavetraceState.timeScale);
    
    wavetraceState.timeScale *= factor;
    wavetraceState.timeOffset = centerTime - (centerX / wavetraceState.timeScale);
    
    constrainTimeOffset();
    renderWaveforms();
}

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (!wavetraceState.active || wavetraceState.cursorPosition === null) return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            navigateCursorToEdge(e.key === 'ArrowRight');
        }
    });
}

function navigateCursorToEdge(forward) {
    const selectedSignal = wavetraceState.displayedSignals.find(s => s.id === wavetraceState.selectedSignalId);
    
    if (selectedSignal) {
        const edges = selectedSignal.values.map(v => v.time).sort((a, b) => a - b);
        const currentTime = wavetraceState.cursorPosition;

        let targetTime;
        if (forward) {
            targetTime = edges.find(t => t > currentTime);
            if (!targetTime) targetTime = edges[edges.length - 1];
        } else {
            const reversed = [...edges].reverse();
            targetTime = reversed.find(t => t < currentTime);
            if (!targetTime) targetTime = edges[0];
        }

        if (targetTime !== undefined) {
            wavetraceState.cursorPosition = targetTime;
            
            const canvas = wavetraceState.app?.view;
            if (canvas) {
                const cursorX = (targetTime - wavetraceState.timeOffset) * wavetraceState.timeScale;
                
                if (cursorX < 0 || cursorX > canvas.width) {
                    wavetraceState.timeOffset = targetTime - (canvas.width / 2) / wavetraceState.timeScale;
                    constrainTimeOffset();
                }
            }
            
            renderWaveforms();
            updateCursorInfo();
        }
    } else {
        if (wavetraceState.displayedSignals.length === 0) return;

        let edges = new Set();
        wavetraceState.displayedSignals.forEach(signal => {
            signal.values.forEach(v => edges.add(v.time));
        });

        const sortedEdges = Array.from(edges).sort((a, b) => a - b);
        const currentTime = wavetraceState.cursorPosition;

        let targetTime;
        if (forward) {
            targetTime = sortedEdges.find(t => t > currentTime);
            if (!targetTime) targetTime = sortedEdges[sortedEdges.length - 1];
        } else {
            const reversed = [...sortedEdges].reverse();
            targetTime = reversed.find(t => t < currentTime);
            if (!targetTime) targetTime = sortedEdges[0];
        }

        if (targetTime !== undefined) {
            wavetraceState.cursorPosition = targetTime;
            
            const canvas = wavetraceState.app?.view;
            if (canvas) {
                const cursorX = (targetTime - wavetraceState.timeOffset) * wavetraceState.timeScale;
                
                if (cursorX < 0 || cursorX > canvas.width) {
                    wavetraceState.timeOffset = targetTime - (canvas.width / 2) / wavetraceState.timeScale;
                    constrainTimeOffset();
                }
            }
            
            renderWaveforms();
            updateCursorInfo();
        }
    }
}

function renderSignalTree() {
    const treeContainer = document.getElementById('signalTree');
    if (!treeContainer) return;

    const hierarchy = buildSignalHierarchy(wavetraceState.signals);
    
    treeContainer.innerHTML = '';
    renderHierarchyNode(hierarchy, treeContainer, 0);
}

function buildSignalHierarchy(signals) {
    const root = { name: 'root', children: new Map(), signals: [] };
    
    signals.forEach(signal => {
        const parts = signal.path.split('.');
        let current = root;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current.children.has(part)) {
                current.children.set(part, { name: part, children: new Map(), signals: [] });
            }
            current = current.children.get(part);
        }
        
        current.signals.push(signal);
    });
    
    return root;
}

function escapeId(id) {
    return id.replace(/"/g, '\\"').replace(/'/g, "\\'");
}

function renderHierarchyNode(node, container, level) {
    node.children.forEach((child, name) => {
        const scopeDiv = document.createElement('div');
        scopeDiv.className = 'wt-scope';
        
        scopeDiv.innerHTML = `
            <div class="wt-scope-header" style="padding-left: ${level * 16 + 12}px">
                <span class="material-symbols-outlined wt-expand-icon">chevron_right</span>
                <span class="material-symbols-outlined">folder</span>
                <span class="wt-scope-name">${name}</span>
            </div>
        `;
        
        const childContainer = document.createElement('div');
        childContainer.className = 'wt-scope-children';
        childContainer.style.display = 'none';
        
        scopeDiv.querySelector('.wt-scope-header').addEventListener('click', () => {
            const icon = scopeDiv.querySelector('.wt-expand-icon');
            if (childContainer.style.display === 'none') {
                childContainer.style.display = 'block';
                icon.textContent = 'expand_more';
            } else {
                childContainer.style.display = 'none';
                icon.textContent = 'chevron_right';
            }
        });
        
        container.appendChild(scopeDiv);
        container.appendChild(childContainer);
        
        renderHierarchyNode(child, childContainer, level + 1);
    });
    
    node.signals.forEach(signal => {
        const signalDiv = document.createElement('div');
        signalDiv.className = 'wt-signal';
        signalDiv.style.paddingLeft = `${level * 16 + 32}px`;
        signalDiv.dataset.signalId = signal.id;
        signalDiv.draggable = false;
        
        const isDisplayed = wavetraceState.displayedSignals.some(s => s.id === signal.id);
        const signalColor = wavetraceState.signalColors.get(signal.id);
        const isSelected = wavetraceState.selectedSignalId === signal.id;
        
        if (isSelected) signalDiv.classList.add('selected');
        
        signalDiv.innerHTML = `
            <div class="wt-signal-drag-handle">
                <span class="material-symbols-outlined">drag_indicator</span>
            </div>
            <div class="wt-signal-checkbox ${isDisplayed ? 'checked' : ''}">
                <span class="material-symbols-outlined">check</span>
            </div>
            <div class="wt-signal-color" style="background: #${signalColor.toString(16).padStart(6, '0')}"></div>
            <span class="wt-signal-name">${signal.name}</span>
            <span class="wt-signal-width">${signal.width > 1 ? `[${signal.width - 1}:0]` : ''}</span>
        `;
        
        signalDiv.addEventListener('click', (e) => {
            if (e.target.closest('.wt-signal-drag-handle')) return;
            if (e.target.closest('.wt-signal-color')) {
                e.stopPropagation();
                showColorPicker(e, signal, signalDiv);
                return;
            }
            
            wavetraceState.selectedSignalId = signal.id;
            
            document.querySelectorAll('.wt-signal').forEach(s => s.classList.remove('selected'));
            signalDiv.classList.add('selected');
            
            toggleSignal(signal);
            renderWaveforms();
        });
        
        signalDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showSignalContextMenu(e, signal);
        });

        const dragHandle = signalDiv.querySelector('.wt-signal-drag-handle');
        
        dragHandle.addEventListener('mousedown', (e) => {
            if (!isDisplayed) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const fromIndex = wavetraceState.displayedSignals.findIndex(s => s.id === signal.id);
            if (fromIndex === -1) return;
            
            signalDiv.classList.add('dragging');
            signalDiv.style.opacity = '0.5';
            
            const handleDragMove = (moveEvent) => {
                document.querySelectorAll('.wt-signal').forEach(el => el.classList.remove('drag-over'));
                
                const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
                const signalBelow = elementBelow?.closest('.wt-signal');
                
                if (signalBelow && signalBelow !== signalDiv && signalBelow.dataset.signalId) {
                    const belowIsDisplayed = wavetraceState.displayedSignals.some(s => s.id === signalBelow.dataset.signalId);
                    if (belowIsDisplayed) {
                        signalBelow.classList.add('drag-over');
                    }
                }
            };
            
            const handleDragEnd = (endEvent) => {
                signalDiv.classList.remove('dragging');
                signalDiv.style.opacity = '';
                
                const elementBelow = document.elementFromPoint(endEvent.clientX, endEvent.clientY);
                const signalBelow = elementBelow?.closest('.wt-signal');
                
                if (signalBelow && signalBelow !== signalDiv && signalBelow.dataset.signalId) {
                    const toId = signalBelow.dataset.signalId;
                    const toIndex = wavetraceState.displayedSignals.findIndex(s => s.id === toId);
                    
                    if (toIndex !== -1 && fromIndex !== toIndex) {
                        const [movedSignal] = wavetraceState.displayedSignals.splice(fromIndex, 1);
                        wavetraceState.displayedSignals.splice(toIndex, 0, movedSignal);
                        renderWaveforms();
                    }
                }
                
                document.querySelectorAll('.wt-signal').forEach(el => el.classList.remove('drag-over'));
                document.removeEventListener('mousemove', handleDragMove);
                document.removeEventListener('mouseup', handleDragEnd);
            };
            
            document.addEventListener('mousemove', handleDragMove);
            document.addEventListener('mouseup', handleDragEnd);
        });
        
        container.appendChild(signalDiv);
    });
}

function showColorPicker(event, signal, signalDiv) {
    const existingPicker = document.querySelector('.wt-color-picker-popup');
    if (existingPicker) existingPicker.remove();

    const popup = document.createElement('div');
    popup.className = 'wt-color-picker-popup';
    
    const currentColor = wavetraceState.signalColors.get(signal.id);
    
    popup.innerHTML = `
        <input type="color" value="#${currentColor.toString(16).padStart(6, '0')}" class="wt-color-input">
        <div class="wt-color-presets">
            ${wavetraceState.colorPalette.map(color => 
                `<div class="wt-color-preset" style="background: #${color.toString(16).padStart(6, '0')}" data-color="${color}"></div>`
            ).join('')}
        </div>
    `;
    
    const rect = signalDiv.getBoundingClientRect();
    popup.style.top = `${rect.top}px`;
    popup.style.left = `${rect.right + 10}px`;
    
    document.body.appendChild(popup);
    
    const colorInput = popup.querySelector('.wt-color-input');
    colorInput.addEventListener('change', (e) => {
        const newColor = parseInt(e.target.value.substring(1), 16);
        wavetraceState.signalColors.set(signal.id, newColor);
        const colorDiv = signalDiv.querySelector('.wt-signal-color');
        colorDiv.style.background = e.target.value;
        renderWaveforms();
    });
    
    popup.querySelectorAll('.wt-color-preset').forEach(preset => {
        preset.addEventListener('click', () => {
            const color = parseInt(preset.dataset.color);
            wavetraceState.signalColors.set(signal.id, color);
            const colorDiv = signalDiv.querySelector('.wt-signal-color');
            colorDiv.style.background = `#${color.toString(16).padStart(6, '0')}`;
            renderWaveforms();
            popup.remove();
        });
    });
    
    setTimeout(() => {
        document.addEventListener('click', function closePopup(e) {
            if (!popup.contains(e.target) && !signalDiv.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        });
    }, 0);
}

function toggleSignal(signal) {
    const isDisplayed = wavetraceState.displayedSignals.some(s => s.id === signal.id);
    
    const signalDiv = document.querySelector(`.wt-signal[data-signal-id="${escapeId(signal.id)}"]`);
    
    if (isDisplayed) {
        if (signalDiv) signalDiv.classList.add('fade-out');
        setTimeout(() => {
            removeSignalFromWaveform(signal);
            if (signalDiv) signalDiv.classList.remove('fade-out');
        }, 200);
    } else {
        addSignalToWaveform(signal);
    }
    
    if (signalDiv) {
        const checkbox = signalDiv.querySelector('.wt-signal-checkbox');
        if (checkbox) {
            checkbox.classList.toggle('checked', !isDisplayed);
        }
    }
}

function addSignalToWaveform(signal) {
    if (!wavetraceState.displayedSignals.some(s => s.id === signal.id)) {
        wavetraceState.displayedSignals.push(signal);
        updateScrollLimits();
        renderWaveforms();
    }
}

function removeSignalFromWaveform(signal) {
    wavetraceState.displayedSignals = wavetraceState.displayedSignals.filter(s => s.id !== signal.id);
    if (wavetraceState.selectedSignalId === signal.id) {
        wavetraceState.selectedSignalId = null;
    }
    updateScrollLimits();
    renderWaveforms();
}

function filterSignals(searchTerm) {
    const items = document.querySelectorAll('.wt-signal, .wt-scope');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = (text.includes(term) || searchTerm === '') ? '' : 'none';
    });
}

function showSignalContextMenu(event, signal) {
    hideContextMenu();
    
    const menu = document.createElement('div');
    menu.className = 'wt-context-menu';
    menu.id = 'signalContextMenu';
    
    const currentRadix = wavetraceState.signalRadix.get(signal.id) || 'hex';
    const currentMode = wavetraceState.signalRenderMode.get(signal.id) || (signal.width === 1 ? 'digital' : 'analog');
    
    menu.innerHTML = `
        <div class="wt-context-section">
            <div class="wt-context-label">Display Format</div>
            ${signal.width > 1 ? `
                <div class="wt-context-item ${currentRadix === 'hex' ? 'active' : ''}" data-action="radix-hex">
                    <span class="material-symbols-outlined">tag</span>
                    <span>Hexadecimal</span>
                </div>
                <div class="wt-context-item ${currentRadix === 'decimal' ? 'active' : ''}" data-action="radix-decimal">
                    <span class="material-symbols-outlined">numbers</span>
                    <span>Decimal</span>
                </div>
                <div class="wt-context-item ${currentRadix === 'binary' ? 'active' : ''}" data-action="radix-binary">
                    <span class="material-symbols-outlined">grid_on</span>
                    <span>Binary</span>
                </div>
            ` : ''}
        </div>
        <div class="wt-context-section">
            <div class="wt-context-label">Waveform Style</div>
            ${signal.width === 1 ? `
                <div class="wt-context-item ${currentMode === 'digital' ? 'active' : ''}" data-action="mode-digital">
                    <span class="material-symbols-outlined">show_chart</span>
                    <span>Digital</span>
                </div>
            ` : `
                <div class="wt-context-item ${currentMode === 'step' ? 'active' : ''}" data-action="mode-step">
                    <span class="material-symbols-outlined">square</span>
                    <span>Step (Blocks)</span>
                </div>
                <div class="wt-context-item ${currentMode === 'analog' ? 'active' : ''}" data-action="mode-analog">
                    <span class="material-symbols-outlined">stairs</span>
                    <span>Analog (Steps)</span>
                </div>
            `}
        </div>
    `;
    
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    
    menu.querySelectorAll('.wt-context-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.getAttribute('data-action');
            
            if (action.startsWith('radix-')) {
                wavetraceState.signalRadix.set(signal.id, action.replace('radix-', ''));
            } else if (action.startsWith('mode-')) {
                wavetraceState.signalRenderMode.set(signal.id, action.replace('mode-', ''));
            }
            
            renderWaveforms();
            hideContextMenu();
        });
    });
    
    document.body.appendChild(menu);
    
    setTimeout(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = `${event.clientX - rect.width}px`;
        if (rect.bottom > window.innerHeight) menu.style.top = `${event.clientY - rect.height}px`;
        
        document.addEventListener('click', hideContextMenu);
    }, 0);
}

function hideContextMenu() {
    const menu = document.getElementById('signalContextMenu');
    if (menu) {
        menu.remove();
        document.removeEventListener('click', hideContextMenu);
    }
}

// ===== PIXI RENDERER =====
function initPixiRenderer() {
    const canvasContainer = document.getElementById('waveformCanvas');
    if (!canvasContainer) return;

    const app = new PIXI.Application({
        width: canvasContainer.clientWidth,
        height: canvasContainer.clientHeight,
        backgroundColor: wavetraceState.colors.background,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
    });

    canvasContainer.appendChild(app.view);
    wavetraceState.app = app;
    wavetraceState.container = new PIXI.Container();
    app.stage.addChild(wavetraceState.container);

    app.view.addEventListener('mousedown', handleMouseDown);
    app.view.addEventListener('mousemove', handleCanvasMouseMove);
    app.view.addEventListener('wheel', handleWheel, { passive: false });
    app.view.style.cursor = 'crosshair';

    fitAllWaveforms();
    
    window.addEventListener('resize', () => {
        if (wavetraceState.active && wavetraceState.app) {
            const container = document.getElementById('waveformCanvas');
            if (container) {
                app.renderer.resize(container.clientWidth, container.clientHeight);
                renderWaveforms();
            }
        }
    });
}

function handleWheel(e) {
    e.preventDefault();
    
    if (e.ctrlKey) {
        const rect = e.target.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseTime = wavetraceState.timeOffset + (mouseX / wavetraceState.timeScale);
        
        const zoomFactor = e.deltaY > 0 ? 0.85 : 1.176;
        wavetraceState.timeScale *= zoomFactor;
        
        wavetraceState.timeOffset = mouseTime - (mouseX / wavetraceState.timeScale);
        constrainTimeOffset();
        renderWaveforms();
    } else if (e.shiftKey) {
        const panAmount = e.deltaY;
        wavetraceState.timeOffset += panAmount * 0.5 / wavetraceState.timeScale;
        constrainTimeOffset();
        renderWaveforms();
    } else {
        const maxScroll = getMaxScrollY();
        wavetraceState.canvasScrollY = Math.max(0, Math.min(maxScroll, wavetraceState.canvasScrollY + e.deltaY));
        renderWaveforms();
    }
}

function handleMouseDown(e) {
    if (e.button === 0) {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = wavetraceState.timeOffset + (x / wavetraceState.timeScale);
        
        wavetraceState.cursorPosition = snapToNearestEdge(time);
        wavetraceState.isDraggingCursor = true;
        
        renderWaveforms();
        updateCursorInfo(e.clientX, e.clientY);
        
        window.addEventListener('mousemove', handleCursorDrag);
        window.addEventListener('mouseup', handleCursorDragEnd);
    } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        wavetraceState.isPanning = true;
        wavetraceState.panStartOffset = wavetraceState.timeOffset;
        wavetraceState.dragStartX = e.clientX;
        e.target.style.cursor = 'grabbing';
        
        window.addEventListener('mousemove', handlePanDrag);
        window.addEventListener('mouseup', handlePanDragEnd);
    }
}

function handlePanDrag(e) {
    if (!wavetraceState.isPanning) return;
    
    const dx = wavetraceState.dragStartX - e.clientX;
    wavetraceState.timeOffset = wavetraceState.panStartOffset + (dx / wavetraceState.timeScale);
    constrainTimeOffset();
    renderWaveforms();
}

function handlePanDragEnd(e) {
    wavetraceState.isPanning = false;
    if (wavetraceState.app?.view) {
        wavetraceState.app.view.style.cursor = 'crosshair';
    }
    window.removeEventListener('mousemove', handlePanDrag);
    window.removeEventListener('mouseup', handlePanDragEnd);
}

function handleCursorDrag(e) {
    if (!wavetraceState.isDraggingCursor) return;
    
    const canvas = wavetraceState.app?.view;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = wavetraceState.timeOffset + (x / wavetraceState.timeScale);
    
    wavetraceState.cursorPosition = snapToNearestEdge(time);
    renderWaveforms();
    updateCursorInfo(e.clientX, e.clientY);
}

function handleCursorDragEnd() {
    wavetraceState.isDraggingCursor = false;
    window.removeEventListener('mousemove', handleCursorDrag);
    window.removeEventListener('mouseup', handleCursorDragEnd);
}

function handleCanvasMouseMove(e) {
    if (wavetraceState.isDraggingCursor) return;
    if (wavetraceState.isPanning) return;
    
    const canvas = wavetraceState.app?.view;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = wavetraceState.timeOffset + (x / wavetraceState.timeScale);
    const nearestTime = snapToNearestEdge(time);
    
    if (nearestTime !== time) {
        updateCursorInfo(e.clientX, e.clientY, nearestTime);
    } else {
        const cursorInfo = document.getElementById('cursorInfo');
        if (cursorInfo) cursorInfo.style.display = 'none';
    }
}

function snapToNearestEdge(time) {
    if (wavetraceState.displayedSignals.length === 0) return time;

    let edges = new Set();
    wavetraceState.displayedSignals.forEach(signal => {
        signal.values.forEach(v => edges.add(v.time));
    });

    const sortedEdges = Array.from(edges).sort((a, b) => a - b);
    let nearest = sortedEdges[0];
    let minDist = Math.abs(time - nearest);
    
    for (const edge of sortedEdges) {
        const dist = Math.abs(time - edge);
        if (dist < minDist) {
            minDist = dist;
            nearest = edge;
        }
    }
    
    const snapThreshold = 15 / wavetraceState.timeScale;
    return minDist < snapThreshold ? nearest : time;
}

function updateCursorInfo(mouseX, mouseY, time = null) {
    const cursorInfo = document.getElementById('cursorInfo');
    if (!cursorInfo) return;
    
    const targetTime = time !== null ? time : wavetraceState.cursorPosition;
    if (targetTime === null) {
        cursorInfo.style.display = 'none';
        return;
    }
    
    const timeStr = formatTimeWithUnit(targetTime);
    
    let html = `<div class="wt-cursor-time">${timeStr}</div>`;
    
    wavetraceState.displayedSignals.forEach(signal => {
        const value = getSignalValueAtTime(signal, targetTime);
        const color = wavetraceState.signalColors.get(signal.id);
        const displayValue = signal.width > 1 ? formatBusValue(value, signal) : value;
        
        html += `
            <div class="wt-cursor-signal">
                <div class="wt-cursor-dot" style="background: #${color.toString(16).padStart(6, '0')}"></div>
                <span class="wt-cursor-name">${signal.name}</span>
                <span class="wt-cursor-value">${displayValue}</span>
            </div>
        `;
    });
    
    cursorInfo.innerHTML = html;
    cursorInfo.style.display = 'block';
    
    const canvas = wavetraceState.app?.view;
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const left = mouseX + 15;
        const top = mouseY - 10;
        
        cursorInfo.style.left = `${left}px`;
        cursorInfo.style.top = `${top}px`;
        
        requestAnimationFrame(() => {
            const infoRect = cursorInfo.getBoundingClientRect();
            if (infoRect.right > window.innerWidth - 10) {
                cursorInfo.style.left = `${mouseX - infoRect.width - 15}px`;
            }
            if (infoRect.bottom > window.innerHeight - 10) {
                cursorInfo.style.top = `${mouseY - infoRect.height - 10}px`;
            }
        });
    }
}

function getSignalValueAtTime(signal, time) {
    if (signal.values.length === 0) return 'x';
    
    let lastValue = 'x';
    for (const change of signal.values) {
        if (change.time > time) break;
        lastValue = change.value;
    }
    
    return lastValue;
}

function formatTimeWithUnit(time) {
    const timescale = wavetraceState.vcdData.timescale.toLowerCase();
    
    let baseUnit = 'ns';
    if (timescale.includes('ps')) baseUnit = 'ps';
    else if (timescale.includes('us') || timescale.includes('μs')) baseUnit = 'μs';
    else if (timescale.includes('ms')) baseUnit = 'ms';
    
    const value = time;
    
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(2)} ms`;
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(2)} μs`;
    return `${value.toFixed(2)} ${baseUnit}`;
}

function constrainTimeOffset() {
    if (!wavetraceState.vcdData) return;
    
    const { start, end } = wavetraceState.vcdData.timeRange;
    const visibleTime = wavetraceState.app.view.width / wavetraceState.timeScale;
    
    const minOffset = start;
    const maxOffset = Math.max(start, end - visibleTime);
    
    wavetraceState.timeOffset = Math.max(minOffset, Math.min(maxOffset, wavetraceState.timeOffset));
}

function fitAllWaveforms() {
    if (!wavetraceState.vcdData) return;
    
    const { start, end } = wavetraceState.vcdData.timeRange;
    const timeRange = end - start;
    const canvasWidth = wavetraceState.app.view.width;
    
    wavetraceState.timeScale = canvasWidth / timeRange * 0.95;
    wavetraceState.timeOffset = start;
    
    renderWaveforms();
}

function renderWaveforms() {
    if (!wavetraceState.app || !wavetraceState.container) return;
    
    const container = wavetraceState.container;
    container.removeChildren();
    
    const canvasWidth = wavetraceState.app.view.width;
    const canvasHeight = wavetraceState.app.view.height;
    
    drawTimeGrid(container, canvasWidth, canvasHeight);
    
    let yOffset = wavetraceState.headerHeight - wavetraceState.canvasScrollY;
    
    wavetraceState.displayedSignals.forEach((signal, index) => {
        if (yOffset + wavetraceState.signalHeight > 0 && yOffset < canvasHeight) {
            drawSignalBackground(container, yOffset, canvasWidth, index, signal);
            drawSignal(container, signal, yOffset, canvasWidth);
        }
        yOffset += wavetraceState.signalHeight;
    });
    
    if (wavetraceState.cursorPosition !== null) {
        drawCursor(container, wavetraceState.cursorPosition, canvasHeight);
    }
}

function drawCursor(container, time, height) {
    const graphics = new PIXI.Graphics();
    const x = (time - wavetraceState.timeOffset) * wavetraceState.timeScale;
    
    if (x >= 0 && x <= wavetraceState.app.view.width) {
        graphics.lineStyle(2, wavetraceState.colors.cursor, 0.9);
        graphics.moveTo(x, 0);
        graphics.lineTo(x, height);
        
        const circle = new PIXI.Graphics();
        circle.beginFill(wavetraceState.colors.cursor);
        circle.drawCircle(x, 8, 5);
        circle.endFill();
        
        container.addChild(graphics);
        container.addChild(circle);
    }
}

function drawSignalBackground(container, yOffset, width, index, signal) {
    const graphics = new PIXI.Graphics();
    const isSelected = wavetraceState.selectedSignalId === signal.id;
    
    let bgColor = index % 2 === 0 ? wavetraceState.colors.signalBg : wavetraceState.colors.signalBgAlt;
    
    if (isSelected) {
        graphics.beginFill(wavetraceState.colors.highlight, 0.15);
        graphics.drawRect(0, yOffset, width, wavetraceState.signalHeight);
        graphics.endFill();
    }
    
    graphics.beginFill(bgColor);
    graphics.drawRect(0, yOffset, width, wavetraceState.signalHeight);
    graphics.endFill();
    
    graphics.lineStyle(1, wavetraceState.colors.grid, 0.2);
    graphics.moveTo(0, yOffset + wavetraceState.signalHeight);
    graphics.lineTo(width, yOffset + wavetraceState.signalHeight);
    
    if (isSelected) {
        graphics.lineStyle(2, wavetraceState.colors.highlight, 0.6);
        graphics.moveTo(0, yOffset);
        graphics.lineTo(width, yOffset);
        graphics.moveTo(0, yOffset + wavetraceState.signalHeight);
        graphics.lineTo(width, yOffset + wavetraceState.signalHeight);
    }
    
    container.addChild(graphics);
}

function drawTimeGrid(container, width, height) {
    const graphics = new PIXI.Graphics();
    const timeStep = calculateTimeStep();
    const { start, end } = wavetraceState.vcdData.timeRange;
    
    const startTime = Math.floor(start / timeStep) * timeStep;
    
    let gridIndex = 0;
    for (let t = startTime; t <= end + timeStep; t += timeStep) {
        const x = (t - wavetraceState.timeOffset) * wavetraceState.timeScale;
        
        if (x >= -50 && x <= width + 50) {
            const isMajor = gridIndex % 5 === 0;
            const lineWidth = isMajor ? 2 : 1;
            const opacity = isMajor ? 0.6 : 0.3;
            
            graphics.lineStyle(lineWidth, isMajor ? wavetraceState.colors.gridMajor : wavetraceState.colors.grid, opacity);
            graphics.moveTo(x, 0);
            graphics.lineTo(x, height);
            
            if (isMajor && x >= 0 && x <= width - 60) {
                const text = new PIXI.Text(formatTimeWithUnit(t), {
                    fontFamily: 'JetBrains Mono',
                    fontSize: 11,
                    fill: wavetraceState.colors.textMuted,
                    fontWeight: '600'
                });
                text.x = x + 6;
                text.y = 4;
                container.addChild(text);
            }
        }
        gridIndex++;
    }
    
    container.addChild(graphics);
}

function calculateTimeStep() {
    const visibleTime = wavetraceState.app.view.width / wavetraceState.timeScale;
    const targetSteps = 15;
    const rawStep = visibleTime / targetSteps;
    
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    
    let niceStep;
    if (normalized < 1.5) niceStep = 1;
    else if (normalized < 3) niceStep = 2;
    else if (normalized < 7.5) niceStep = 5;
    else niceStep = 10;
    
    return niceStep * magnitude;
}

function drawSignal(container, signal, yOffset, width) {
    const graphics = new PIXI.Graphics();
    const signalHeight = wavetraceState.signalHeight;
    const padding = 18;
    
    const nameText = new PIXI.Text(signal.name, {
        fontFamily: 'JetBrains Mono',
        fontSize: 11,
        fill: wavetraceState.colors.text,
        fontWeight: '600'
    });
    nameText.x = 10;
    nameText.y = yOffset + 6;
    container.addChild(nameText);
    
    if (signal.values.length === 0) {
        container.addChild(graphics);
        return;
    }
    
    const waveformY = yOffset + padding;
    const waveformHeight = signalHeight - 2 * padding;
    const signalColor = wavetraceState.signalColors.get(signal.id);
    const renderMode = wavetraceState.signalRenderMode.get(signal.id) || (signal.width === 1 ? 'digital' : 'analog');
    
    const gradientContainer = new PIXI.Graphics();
    
    let lastValue = 'x';
    let lastX = 0;
    
    signal.values.forEach((change, index) => {
        const x = (change.time - wavetraceState.timeOffset) * wavetraceState.timeScale;
        
        if (x > -100 || (index < signal.values.length - 1)) {
            drawWaveformSegment(graphics, gradientContainer, Math.max(-50, lastX), x, waveformY, waveformHeight, lastValue, signal.width, signalColor, signal, renderMode, change.value);
            
            if (x >= 0 && x <= width + 50 && lastValue !== change.value && renderMode !== 'analog') {
                graphics.lineStyle(2, signalColor, 0.8);
                graphics.moveTo(x, waveformY);
                graphics.lineTo(x, waveformY + waveformHeight);
            }
        }
        
        lastValue = change.value;
        lastX = x;
    });
    
    if (lastX < width + 50) {
        drawWaveformSegment(graphics, gradientContainer, Math.max(-50, lastX), width + 50, waveformY, waveformHeight, lastValue, signal.width, signalColor, signal, renderMode, null);
    }
    
    container.addChild(gradientContainer);
    container.addChild(graphics);
}

function drawWaveformSegment(graphics, gradientContainer, x1, x2, y, height, value, width, color, signal, renderMode, nextValue) {
    if (x2 <= -100 || x1 >= wavetraceState.app.view.width + 100) return;
    
    x1 = Math.max(-50, x1);
    x2 = Math.min(wavetraceState.app.view.width + 50, x2);
    
    if (renderMode === 'analog' && width > 1) {
        drawAnalogWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal, nextValue);
    } else if (width === 1 && renderMode === 'digital') {
        drawDigitalWaveform(graphics, gradientContainer, x1, x2, y, height, value, color);
    } else {
        drawBusWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal);
    }
}

function drawDigitalWaveform(graphics, gradientContainer, x1, x2, y, height, value, color) {
    graphics.lineStyle(2.5, color, 0.9);
    
    if (value === '1') {
        gradientContainer.beginFill(color, 0.12);
        gradientContainer.drawRect(x1, y, x2 - x1, height / 2);
        gradientContainer.endFill();
        
        graphics.moveTo(x1, y);
        graphics.lineTo(x2, y);
    } else if (value === '0') {
        gradientContainer.beginFill(color, 0.06);
        gradientContainer.drawRect(x1, y + height / 2, x2 - x1, height / 2);
        gradientContainer.endFill();
        
        graphics.moveTo(x1, y + height);
        graphics.lineTo(x2, y + height);
    } else {
        const midY = y + height / 2;
        graphics.lineStyle(2, color, 0.5);
        graphics.moveTo(x1, midY);
        graphics.lineTo(x2, midY);
    }
}

function drawBusWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal) {
    graphics.lineStyle(2.5, color, 0.9);
    
    const slant = 6;
    const points = [x1 + slant, y, x2, y, x2 - slant, y + height, x1, y + height];
    
    gradientContainer.beginFill(color, 0.12);
    gradientContainer.drawPolygon(points);
    gradientContainer.endFill();
    
    gradientContainer.beginFill(color, 0.05);
    gradientContainer.drawPolygon([x1 + slant, y + height * 0.4, x2, y + height * 0.4, x2 - slant, y + height, x1, y + height]);
    gradientContainer.endFill();
    
    graphics.moveTo(x1 + slant, y);
    graphics.lineTo(x2, y);
    graphics.lineTo(x2 - slant, y + height);
    graphics.lineTo(x1, y + height);
    graphics.lineTo(x1 + slant, y);
    
    if (x2 - x1 > 40) {
        const displayValue = formatBusValue(value, signal);
        const valueText = new PIXI.Text(displayValue, {
            fontFamily: 'JetBrains Mono',
            fontSize: 10,
            fill: wavetraceState.colors.text,
            fontWeight: '700'
        });
        valueText.x = (x1 + x2) / 2 - valueText.width / 2;
        valueText.y = y + height / 2 - 5;
        graphics.addChild(valueText);
    }
}

function drawAnalogWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal, nextValue) {
    if (value.includes('x') || value.includes('X') || value.includes('z') || value.includes('Z')) {
        const midY = y + height / 2;
        graphics.lineStyle(2, color, 0.4);
        graphics.moveTo(x1, midY);
        graphics.lineTo(x2, midY);
        return;
    }
    
    const numericValue = parseInt(value, 2);
    if (isNaN(numericValue)) return;
    
    const maxValue = Math.pow(2, signal.width) - 1;
    const normalizedValue = numericValue / maxValue;
    const levelY = y + height - (normalizedValue * height);
    
    graphics.lineStyle(2.5, color, 0.9);
    
    let nextLevelY = levelY;
    if (nextValue && !nextValue.includes('x') && !nextValue.includes('z')) {
        const nextNumeric = parseInt(nextValue, 2);
        if (!isNaN(nextNumeric)) {
            const nextNormalized = nextNumeric / maxValue;
            nextLevelY = y + height - (nextNormalized * height);
        }
    }
    
    const transitionWidth = Math.min(12, (x2 - x1) * 0.15);
    
    graphics.moveTo(x1, levelY);
    graphics.lineTo(x2 - transitionWidth, levelY);
    
    if (levelY !== nextLevelY) {
        for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const px = x2 - transitionWidth + (transitionWidth * t);
            const py = levelY + (nextLevelY - levelY) * eased;
            graphics.lineTo(px, py);
        }
    }
    
    const fillPoints = [x1, y + height, x1, levelY];
    
    const mainSteps = Math.max(2, Math.min(8, Math.floor((x2 - transitionWidth - x1) / 20)));
    for (let i = 1; i < mainSteps; i++) {
        const t = i / mainSteps;
        const px = x1 + (x2 - transitionWidth - x1) * t;
        fillPoints.push(px, levelY);
    }
    
    fillPoints.push(x2 - transitionWidth, levelY);
    
    if (levelY !== nextLevelY) {
        for (let i = 0; i <= 6; i++) {
            const t = i / 6;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const px = x2 - transitionWidth + (transitionWidth * t);
            const py = levelY + (nextLevelY - levelY) * eased;
            fillPoints.push(px, py);
        }
    } else {
        fillPoints.push(x2, levelY);
    }
    
    fillPoints.push(x2, y + height);
    
    gradientContainer.beginFill(color, 0.15);
    gradientContainer.drawPolygon(fillPoints);
    gradientContainer.endFill();
}

function formatBusValue(value, signal) {
    const radix = wavetraceState.signalRadix.get(signal.id) || 'hex';
    
    if (value.includes('x') || value.includes('X')) return 'X';
    if (value.includes('z') || value.includes('Z')) return 'Z';
    
    const decimal = parseInt(value, 2);
    if (isNaN(decimal)) return value;
    
    switch (radix) {
        case 'hex': return '0x' + decimal.toString(16).toUpperCase();
        case 'decimal': return decimal.toString(10);
        case 'binary': return '0b' + value;
        case 'octal': return '0o' + decimal.toString(8);
        default: return '0x' + decimal.toString(16).toUpperCase();
    }
}

// ===== CLOSE WAVETRACE =====
export function closeWavetraceViewer() {
    console.log('Closing Wavetrace viewer');
    
    window.removeEventListener('mousemove', handleCursorDrag);
    window.removeEventListener('mouseup', handleCursorDragEnd);
    window.removeEventListener('mousemove', handlePanDrag);
    window.removeEventListener('mouseup', handlePanDragEnd);
    
    if (wavetraceState.resizeObserver) {
        wavetraceState.resizeObserver.disconnect();
        wavetraceState.resizeObserver = null;
    }
    
    if (wavetraceState.mutationObserver) {
        wavetraceState.mutationObserver.disconnect();
        wavetraceState.mutationObserver = null;
    }
    
    if (wavetraceState.app) {
        wavetraceState.app.destroy(true, { children: true, texture: true, baseTexture: true });
        wavetraceState.app = null;
    }
    
    if (wavetraceState.container) {
        wavetraceState.container.destroy({ children: true, texture: true, baseTexture: true });
        wavetraceState.container = null;
    }
    
    const container = document.getElementById('wavetraceContainer');
    if (container) {
        container.classList.remove('active');
        container.innerHTML = '';
    }
    
    wavetraceState.active = false;
    wavetraceState.filePath = null;
    wavetraceState.fileName = null;
    wavetraceState.vcdData = null;
    wavetraceState.signals = [];
    wavetraceState.displayedSignals = [];
    wavetraceState.signalColors.clear();
    wavetraceState.signalRadix.clear();
    wavetraceState.signalRenderMode.clear();
    wavetraceState.cursorPosition = null;
    wavetraceState.selectedSignalId = null;
    wavetraceState.canvasScrollY = 0;
}

export { wavetraceState };