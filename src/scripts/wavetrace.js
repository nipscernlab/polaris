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
    timeScale: 1,
    timeOffset: 0,
    cursorPosition: null,
    cursorPosition2: null,
    selectedSignal: null,
    signalHeight: 50,
    headerHeight: 70,
    sidebarWidth: 350,
    isDragging: false,
    dragStartX: 0,
    colorPalette: [
        0x00f5ff, // Cyan neon
        0xff00ff, // Magenta neon
        0x00ff41, // Green neon
        0xffd700, // Gold neon
        0xff1493, // Pink neon
        0x00ffff, // Aqua neon
        0xff4500, // Orange red neon
        0x7fff00, // Chartreuse neon
        0xff69b4, // Hot pink neon
        0x1e90ff, // Dodger blue neon
        0xadff2f, // Yellow green neon
        0xff6347, // Tomato neon
    ],
    colors: {
        background: 0x0a0a0f,
        grid: 0x2a2a38,
        gridMajor: 0x3a3a4c,
        text: 0xe8e8f0,
        textMuted: 0x8a8aa0,
        cursor: 0xa78bfa,
        cursor2: 0x3b82f6,
        selectedBg: 0x2a2a3c,
        hover: 0x3a3a4c,
        signalBg: 0x13131a,
        signalBgAlt: 0x0f0f14
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

        const editorContainer = document.getElementById('editorContainer');
        if (editorContainer) {
            editorContainer.style.display = 'none';
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
    });
}

function initWavetraceUI() {
    const container = document.getElementById('wavetraceContainer');
    if (!container) return;

    container.innerHTML = '';

    container.innerHTML = `
        <div class="wavetrace-header">
            <div class="wavetrace-title">
                <span class="material-symbols-outlined">show_chart</span>
                <span class="title-text">${wavetraceState.fileName}</span>
                <span class="timescale">${wavetraceState.vcdData.timescale}</span>
            </div>
            <div class="wavetrace-controls">
                <button class="wt-btn" id="wtZoomIn" title="Zoom In">
                    <span class="material-symbols-outlined">zoom_in</span>
                </button>
                <button class="wt-btn" id="wtZoomOut" title="Zoom Out">
                    <span class="material-symbols-outlined">zoom_out</span>
                </button>
                <button class="wt-btn" id="wtFitAll" title="Fit All">
                    <span class="material-symbols-outlined">fit_screen</span>
                </button>
                <button class="wt-btn wt-close" id="wtClose" title="Close">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
        
        <div class="wavetrace-main">
            <div class="wavetrace-sidebar">
                <div class="sidebar-header">
                    <input type="text" id="signalSearch" class="signal-search" placeholder="Search signals...">
                </div>
                <div class="signal-tree" id="signalTree"></div>
            </div>
            
            <div class="wavetrace-viewer">
                <div class="waveform-canvas" id="waveformCanvas"></div>
                <div class="cursor-info" id="cursorInfo"></div>
            </div>
        </div>
    `;

    setupWavetraceControls();
    renderSignalTree();
    initPixiRenderer();
}

function setupWavetraceControls() {
    document.getElementById('wtClose')?.addEventListener('click', closeWavetraceViewer);
    
    document.getElementById('wtZoomIn')?.addEventListener('click', () => {
        wavetraceState.timeScale *= 1.5;
        renderWaveforms();
    });
    
    document.getElementById('wtZoomOut')?.addEventListener('click', () => {
        wavetraceState.timeScale /= 1.5;
        renderWaveforms();
    });
    
    document.getElementById('wtFitAll')?.addEventListener('click', () => {
        fitAllWaveforms();
    });
    
    document.getElementById('signalSearch')?.addEventListener('input', (e) => {
        filterSignals(e.target.value);
    });
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

function renderHierarchyNode(node, container, level) {
    node.children.forEach((child, name) => {
        const scopeDiv = document.createElement('div');
        scopeDiv.className = 'signal-scope';
        scopeDiv.style.paddingLeft = `${level * 16}px`;
        
        scopeDiv.innerHTML = `
            <div class="scope-header">
                <span class="material-symbols-outlined expand-icon">chevron_right</span>
                <span class="material-symbols-outlined">folder</span>
                <span class="scope-name">${name}</span>
            </div>
        `;
        
        const childContainer = document.createElement('div');
        childContainer.className = 'scope-children';
        childContainer.style.display = 'none';
        
        scopeDiv.querySelector('.scope-header').addEventListener('click', () => {
            const icon = scopeDiv.querySelector('.expand-icon');
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
        signalDiv.className = 'signal-item';
        signalDiv.style.paddingLeft = `${level * 16 + 20}px`;
        signalDiv.setAttribute('data-signal-id', signal.id);
        
        const isDisplayed = wavetraceState.displayedSignals.some(s => s.id === signal.id);
        const signalColor = wavetraceState.signalColors.get(signal.id);
        
        signalDiv.innerHTML = `
            <div class="signal-check ${isDisplayed ? 'checked' : ''}" data-signal-id="${signal.id}">
                <span class="material-symbols-outlined">check</span>
            </div>
            <div class="signal-color-bar" style="background-color: #${signalColor.toString(16).padStart(6, '0')};"></div>
            <span class="signal-name">${signal.name}</span>
            <span class="signal-width">${signal.width > 1 ? `[${signal.width - 1}:0]` : ''}</span>
        `;
        
        const clickHandler = (e) => {
            if (!e.target.closest('.signal-check')) {
                return;
            }
            e.stopPropagation();
            toggleSignal(signal);
        };
        
        signalDiv.addEventListener('click', clickHandler);
        
        signalDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (signal.width > 1) {
                showRadixMenu(e, signal);
            }
        });
        
        container.appendChild(signalDiv);
    });
}

function toggleSignal(signal) {
    const isDisplayed = wavetraceState.displayedSignals.some(s => s.id === signal.id);
    
    if (isDisplayed) {
        removeSignalFromWaveform(signal);
    } else {
        addSignalToWaveform(signal);
    }
    
    const signalItem = document.querySelector(`.signal-item[data-signal-id="${signal.id}"]`);
    if (signalItem) {
        const checkBox = signalItem.querySelector('.signal-check');
        if (checkBox) {
            if (isDisplayed) {
                checkBox.classList.remove('checked');
            } else {
                checkBox.classList.add('checked');
            }
        }
    }
}

function addSignalToWaveform(signal) {
    if (!wavetraceState.displayedSignals.some(s => s.id === signal.id)) {
        wavetraceState.displayedSignals.push(signal);
        renderWaveforms();
    }
}

function removeSignalFromWaveform(signal) {
    wavetraceState.displayedSignals = wavetraceState.displayedSignals.filter(s => s.id !== signal.id);
    renderWaveforms();
}

function filterSignals(searchTerm) {
    const items = document.querySelectorAll('.signal-item, .signal-scope');
    const term = searchTerm.toLowerCase();
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(term) || searchTerm === '') {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

function showRadixMenu(event, signal) {
    hideRadixMenu();
    
    const menu = document.createElement('div');
    menu.className = 'radix-menu';
    menu.id = 'radixMenu';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    
    const currentRadix = wavetraceState.signalRadix.get(signal.id) || 'hex';
    
    const radixes = [
        { label: 'Hexadecimal', value: 'hex', icon: 'tag' },
        { label: 'Decimal', value: 'decimal', icon: 'numbers' },
        { label: 'Binary', value: 'binary', icon: 'grid_on' },
        { label: 'Octal', value: 'octal', icon: 'filter_8' }
    ];
    
    radixes.forEach(radix => {
        const item = document.createElement('div');
        item.className = 'radix-item';
        if (currentRadix === radix.value) {
            item.classList.add('active');
        }
        
        item.innerHTML = `
            <span class="material-symbols-outlined">${radix.icon}</span>
            <span>${radix.label}</span>
            ${currentRadix === radix.value ? '<span class="material-symbols-outlined check">check</span>' : ''}
        `;
        
        item.addEventListener('click', () => {
            wavetraceState.signalRadix.set(signal.id, radix.value);
            renderWaveforms();
            hideRadixMenu();
        });
        
        menu.appendChild(item);
    });
    
    document.body.appendChild(menu);
    
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${event.clientX - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${event.clientY - rect.height}px`;
    }
    
    setTimeout(() => {
        document.addEventListener('click', hideRadixMenu);
    }, 0);
}

function hideRadixMenu() {
    const menu = document.getElementById('radixMenu');
    if (menu) {
        menu.remove();
        document.removeEventListener('click', hideRadixMenu);
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
    app.view.addEventListener('wheel', handleWheel, { passive: false });

    fitAllWaveforms();
    
    window.addEventListener('resize', () => {
        if (wavetraceState.active) {
            app.renderer.resize(canvasContainer.clientWidth, canvasContainer.clientHeight);
            renderWaveforms();
        }
    });
}

function handleWheel(e) {
    e.preventDefault();
    
    if (e.ctrlKey) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        wavetraceState.timeScale *= zoomFactor;
    } else {
        const panAmount = e.deltaX || e.deltaY;
        wavetraceState.timeOffset += panAmount * 0.5 / wavetraceState.timeScale;
        constrainTimeOffset();
    }
    
    renderWaveforms();
}

function handleMouseDown(e) {
    if (e.button === 0) {
        wavetraceState.isDragging = true;
        wavetraceState.dragStartX = e.clientX;
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        
        e.target.style.cursor = 'grabbing';
    }
}

function handleMouseMove(e) {
    if (wavetraceState.isDragging) {
        const deltaX = e.clientX - wavetraceState.dragStartX;
        wavetraceState.timeOffset -= deltaX / wavetraceState.timeScale;
        wavetraceState.dragStartX = e.clientX;
        
        constrainTimeOffset();
        renderWaveforms();
    }
    
    updateCursorPosition(e);
}

function handleMouseUp(e) {
    wavetraceState.isDragging = false;
    
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    
    const canvas = wavetraceState.app?.view;
    if (canvas) {
        canvas.style.cursor = 'grab';
    }
}

function constrainTimeOffset() {
    if (!wavetraceState.vcdData) return;
    
    const { start, end } = wavetraceState.vcdData.timeRange;
    const visibleTime = wavetraceState.app.view.width / wavetraceState.timeScale;
    
    const minOffset = start;
    const maxOffset = Math.max(start, end - visibleTime);
    
    wavetraceState.timeOffset = Math.max(minOffset, Math.min(maxOffset, wavetraceState.timeOffset));
}

function updateCursorPosition(e) {
    const canvas = wavetraceState.app?.view;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    if (x < 0) return;
    
    const time = wavetraceState.timeOffset + (x / wavetraceState.timeScale);
    
    const cursorInfo = document.getElementById('cursorInfo');
    if (cursorInfo && time >= 0) {
        cursorInfo.textContent = `Time: ${formatTime(time)} ${wavetraceState.vcdData.timescale}`;
        cursorInfo.style.display = 'block';
    }
}

function formatTime(time) {
    return time.toFixed(2);
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
    
    let yOffset = wavetraceState.headerHeight;
    
    wavetraceState.displayedSignals.forEach((signal, index) => {
        drawSignalBackground(container, yOffset, canvasWidth, index);
        drawSignal(container, signal, yOffset, canvasWidth);
        yOffset += wavetraceState.signalHeight;
    });
}

function drawSignalBackground(container, yOffset, width, index) {
    const graphics = new PIXI.Graphics();
    const bgColor = index % 2 === 0 ? wavetraceState.colors.signalBg : wavetraceState.colors.signalBgAlt;
    
    graphics.beginFill(bgColor);
    graphics.drawRect(0, yOffset, width, wavetraceState.signalHeight);
    graphics.endFill();
    
    container.addChild(graphics);
}

function drawTimeGrid(container, width, height) {
    const graphics = new PIXI.Graphics();
    
    const timeStep = calculateTimeStep();
    const { start, end } = wavetraceState.vcdData.timeRange;
    
    let gridIndex = 0;
    for (let t = start; t <= end; t += timeStep) {
        const x = (t - wavetraceState.timeOffset) * wavetraceState.timeScale;
        
        if (x >= 0 && x <= width) {
            const isMajor = gridIndex % 5 === 0;
            graphics.lineStyle(1, isMajor ? wavetraceState.colors.gridMajor : wavetraceState.colors.grid, isMajor ? 0.4 : 0.2);
            graphics.moveTo(x, 0);
            graphics.lineTo(x, height);
            
            if (isMajor) {
                const text = new PIXI.Text(formatTime(t), {
                    fontFamily: 'JetBrains Mono',
                    fontSize: 11,
                    fill: wavetraceState.colors.textMuted
                });
                text.x = x + 4;
                text.y = 4;
                container.addChild(text);
            }
        }
        gridIndex++;
    }
    
    container.addChild(graphics);
}

function calculateTimeStep() {
    const { start, end } = wavetraceState.vcdData.timeRange;
    const visibleTime = wavetraceState.app.view.width / wavetraceState.timeScale;
    
    const idealSteps = 10;
    const step = visibleTime / idealSteps;
    
    const magnitude = Math.pow(10, Math.floor(Math.log10(step)));
    const normalized = step / magnitude;
    
    let niceStep;
    if (normalized < 1.5) niceStep = 1;
    else if (normalized < 3) niceStep = 2;
    else if (normalized < 7) niceStep = 5;
    else niceStep = 10;
    
    return niceStep * magnitude;
}

function drawSignal(container, signal, yOffset, width) {
    const graphics = new PIXI.Graphics();
    const signalHeight = wavetraceState.signalHeight;
    const padding = 10;
    
    const nameText = new PIXI.Text(signal.name, {
        fontFamily: 'Inter',
        fontSize: 12,
        fill: wavetraceState.colors.text,
        fontWeight: '500'
    });
    nameText.x = 12;
    nameText.y = yOffset + signalHeight / 2 - 6;
    container.addChild(nameText);
    
    graphics.lineStyle(1, wavetraceState.colors.grid, 0.3);
    graphics.moveTo(0, yOffset + signalHeight);
    graphics.lineTo(width, yOffset + signalHeight);
    
    if (signal.values.length === 0) {
        container.addChild(graphics);
        return;
    }
    
    const waveformY = yOffset + padding;
    const waveformHeight = signalHeight - 2 * padding;
    const signalColor = wavetraceState.signalColors.get(signal.id);
    
    let lastValue = 'x';
    let lastX = 0;
    let lastTime = wavetraceState.vcdData.timeRange.start;
    
    signal.values.forEach((change, index) => {
        const x = (change.time - wavetraceState.timeOffset) * wavetraceState.timeScale;
        
        if (x > 0 || (index < signal.values.length - 1 && (signal.values[index + 1].time - wavetraceState.timeOffset) * wavetraceState.timeScale > 0)) {
            drawWaveformSegment(graphics, Math.max(0, lastX), x, waveformY, waveformHeight, lastValue, signal.width, signalColor, signal);
            
            if (x >= 0 && x <= width && lastValue !== change.value) {
                graphics.lineStyle(2, signalColor, 1);
                graphics.moveTo(x, waveformY);
                graphics.lineTo(x, waveformY + waveformHeight);
            }
        }
        
        lastValue = change.value;
        lastX = x;
        lastTime = change.time;
    });
    
    if (lastX < width) {
        drawWaveformSegment(graphics, Math.max(0, lastX), width, waveformY, waveformHeight, lastValue, signal.width, signalColor, signal);
    }
    
    container.addChild(graphics);
}

function drawWaveformSegment(graphics, x1, x2, y, height, value, width, color, signal) {
    if (x2 <= 0 || x1 >= wavetraceState.app.view.width) return;
    
    x1 = Math.max(0, x1);
    x2 = Math.min(wavetraceState.app.view.width, x2);
    
    if (width === 1) {
        graphics.lineStyle(2.5, color, 1);
        
        if (value === '1') {
            graphics.moveTo(x1, y);
            graphics.lineTo(x2, y);
        } else if (value === '0') {
            graphics.moveTo(x1, y + height);
            graphics.lineTo(x2, y + height);
        } else if (value === 'x' || value === 'X') {
            const midY = y + height / 2;
            graphics.lineStyle(2.5, color, 0.6);
            graphics.moveTo(x1, midY);
            graphics.lineTo(x2, midY);
        } else if (value === 'z' || value === 'Z') {
            const midY = y + height / 2;
            graphics.lineStyle(2.5, color, 0.4);
            graphics.moveTo(x1, midY);
            graphics.lineTo(x2, midY);
        }
    } else {
        graphics.lineStyle(2.5, color, 1);
        
        const slant = 8;
        graphics.moveTo(x1 + slant, y);
        graphics.lineTo(x2, y);
        graphics.lineTo(x2 - slant, y + height);
        graphics.lineTo(x1, y + height);
        graphics.lineTo(x1 + slant, y);
        
        if (x2 - x1 > 50) {
            const displayValue = formatBusValue(value, signal);
            const valueText = new PIXI.Text(displayValue, {
                fontFamily: 'JetBrains Mono',
                fontSize: 11,
                fill: wavetraceState.colors.text,
                fontWeight: '600'
            });
            valueText.x = (x1 + x2) / 2 - valueText.width / 2;
            valueText.y = y + height / 2 - 6;
            graphics.addChild(valueText);
        }
    }
}

function formatBusValue(value, signal) {
    const radix = wavetraceState.signalRadix.get(signal.id) || 'hex';
    
    if (value.includes('x') || value.includes('X')) return 'X';
    if (value.includes('z') || value.includes('Z')) return 'Z';
    
    const decimal = parseInt(value, 2);
    if (isNaN(decimal)) return value;
    
    switch (radix) {
        case 'hex':
            return '0x' + decimal.toString(16).toUpperCase();
        case 'decimal':
            return decimal.toString(10);
        case 'binary':
            return '0b' + value;
        case 'octal':
            return '0o' + decimal.toString(8);
        default:
            return '0x' + decimal.toString(16).toUpperCase();
    }
}

// ===== CLOSE WAVETRACE =====
export function closeWavetraceViewer() {
    console.log('Closing Wavetrace viewer');
    
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    
    if (wavetraceState.app) {
        wavetraceState.app.destroy(true, { children: true, texture: true });
        wavetraceState.app = null;
    }
    
    const container = document.getElementById('wavetraceContainer');
    if (container) {
        container.classList.remove('active');
        container.innerHTML = '';
    }
    
    const editorContainer = document.getElementById('editorContainer');
    if (editorContainer) {
        editorContainer.style.display = '';
    }
    
    wavetraceState.active = false;
    wavetraceState.filePath = null;
    wavetraceState.fileName = null;
    wavetraceState.vcdData = null;
    wavetraceState.signals = [];
    wavetraceState.displayedSignals = [];
    wavetraceState.signalColors.clear();
    wavetraceState.signalRadix.clear();
}

export { wavetraceState };