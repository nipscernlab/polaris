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
    signalDisplayName: new Map(),
    signalType: new Map(),
    opcodeMap: new Map(),  
    cmmMap: new Map(),     
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
        0x34d399, 0xfbbf24, 0xf97316, 0xa78bfa,
        0xe879f9, 0xaaaa00, 0x60a5fa, 
    ],
    colorsSignal: {
        base: 0x34ff99,
        io: 0xfbbf24,        
        vars: 0xf97316,      
        assembly: 0xa78bfa,  
        cmm: 0xe879f9,  
        flags: 0xaaaa00,     
        default: 0x60a5fa    
    },
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

        async parse(vcdContent, onProgress) {
        const lines = vcdContent.split('\n');
        const totalLines = lines.length;
        let inHeader = true;
        let currentTime = 0;
        let idToSignal = new Map();
        
        const chunkSize = Math.ceil(totalLines * 0.01);

        for (let i = 0; i < totalLines; i++) {
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
                    let width = parseInt(parts[2]);
                    const id = parts[3];
                    const name = parts[4];
                    if (type === 'string' || type === 'real') {
                        width = 8; 
                    }
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
                const firstChar = line[0].toLowerCase();
                
                if (firstChar === 'b') {
                    // Sinais binários de múltiplos bits
                    const parts = line.split(/\s+/);
                    value = parts[0].substring(1);
                    id = parts[1];
                } else if (firstChar === 'r') {
                    // Sinais do tipo Real (Decimal)
                    const parts = line.split(/\s+/);
                    value = parts[0].substring(1); // Ex: 3.1415
                    id = parts[1];
                } else if (firstChar === 's') {
                    // Sinais do tipo String (Texto)
                    // Usamos lastIndexOf porque a string pode conter espaços dentro dela!
                    const lastSpace = line.lastIndexOf(' ');
                    value = line.substring(1, lastSpace); // Ex: "str-0"
                    id = line.substring(lastSpace + 1);
                } else {
                    // Sinais digitais de 1 bit (0, 1, x, z)
                    value = line[0];
                    id = line.substring(1);
                }

                const signal = idToSignal.get(id);
                if (signal) {
                    signal.values.push({ time: currentTime, value });
                }
            }

            if (i % chunkSize === 0 && onProgress) {
                onProgress(i, totalLines);
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        if (onProgress) onProgress(totalLines, totalLines);

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

function parseTranslationFiles(opcodeText, cmmText) {
    wavetraceState.opcodeMap.clear();
    wavetraceState.cmmMap.clear();
    
    const fillMap = (text, map) => {
        if (!text) return;
        const lines = text.split('\n');
        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const match = trimmed.match(/^(-?\d+)\s+(.*)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                const translation = match[2].trim();
                map.set(num, translation);
            }
        }
    };

    fillMap(opcodeText, wavetraceState.opcodeMap);
    fillMap(cmmText, wavetraceState.cmmMap);
    console.log(`Dicionários carregados! Opcode: ${wavetraceState.opcodeMap.size} itens, CMM: ${wavetraceState.cmmMap.size} itens.`);
}

export async function openWavetraceViewer(filePath, fileName) {
    closeWavetraceViewer();
    console.log('Opening Wavetrace viewer for:', fileName);
    
    let loader = document.getElementById('wtFileLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'wtFileLoader';
        loader.innerHTML = `
            <h3 style="margin-bottom: 15px; font-weight: 500;">Processando arquivo VCD...</h3>
            <div style="width: 320px; height: 8px; background: #252538; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                <div id="wtProgressBar" style="width: 0%; height: 100%; background: #a78bfa; transition: width 0.05s ease-out;"></div>
            </div>
            <div id="wtProgressText" style="font-size: 13px; color: #a8a8c0;">Lendo dados...</div>
        `;
        document.body.appendChild(loader);
    } else {
        loader.style.display = 'flex';
    }

    const progressBar = document.getElementById('wtProgressBar');
    const progressText = document.getElementById('wtProgressText');

    try {
        progressText.textContent = "Lendo arquivo do disco...";
        if (progressBar) progressBar.style.width = "0%";

        let content;
        if (fileName.toLowerCase().endsWith('.fst')) {
            progressText.textContent = "Convertendo FST para VCD nativamente...";
            content = await invoke('read_fst_as_vcd', { path: filePath });
        } else {
            content = await invoke('read_file', { path: filePath });
        }
        
        const parser = new VCDParser();
        
        const vcdData = await parser.parse(content, (current, total) => {
            const percentage = ((current / total) * 100).toFixed(0);
            if (progressBar) progressBar.style.width = `${percentage}%`;
            if (progressText) {
                progressText.textContent = `${current.toLocaleString()} / ${total.toLocaleString()} linhas (${percentage}%)`;
            }
        });
        
        wavetraceState.filePath = filePath;
        wavetraceState.fileName = fileName;
        wavetraceState.vcdData = vcdData;
        wavetraceState.signals = vcdData.signals;
        wavetraceState.active = true;
        try {
            const lastSlash = filePath.lastIndexOf('/');
            const lastBackslash = filePath.lastIndexOf('\\');
            const slashIdx = Math.max(lastSlash, lastBackslash);
            const dirPath = slashIdx !== -1 ? filePath.substring(0, slashIdx + 1) : '';

            const opcodePath = dirPath + 'trad_opcode.txt';
            const cmmPath = dirPath + 'trad_cmm.txt';

            progressText.textContent = "Carregando arquivos de tradução...";

            const opcodeContent = await invoke('read_file', { path: opcodePath });
            const cmmContent = await invoke('read_file', { path: cmmPath });

            parseTranslationFiles(opcodeContent, cmmContent);
        } catch (errTxt) {
            console.warn("Aviso: Arquivos trad_opcode.txt ou trad_cmm.txt não encontrados na mesma pasta do VCD.", errTxt);
        }

        const container = document.getElementById('wavetraceContainer');
        if (container) {
            container.classList.add('active');
        }

        assignSignalColors();
        assignSignalFormats();
        initWavetraceUI();
        
        console.log(`Loaded ${vcdData.signals.length} signals from VCD file`);
    } catch (error) {
        console.error('Error opening VCD file:', error);
        alert(`Failed to open VCD file: ${error}`);
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

function assignSignalColors() {
    wavetraceState.signals.forEach((signal) => {
        const name = signal.name;
        const parts = name.split('_');
        const baseName = parts.slice(0, -1).join('_');

        let assignedColor = wavetraceState.colorsSignal.default;

        if (name === "valr2") {
            assignedColor = wavetraceState.colorsSignal.assembly;
        } 
        else if (name === "linetabs") {
            assignedColor = wavetraceState.colorsSignal.cmm;
        }
        else if (["req_in_sim", "in_sim", "out_en_sim", "out_sig"].includes(baseName)) {
            assignedColor = wavetraceState.colorsSignal.io;
        }
        else if (parts[0] === "me1" || parts[0] === "me2" || parts[0] === "arr" || parts[0] === "comp") {
            assignedColor = wavetraceState.colorsSignal.vars;
        }
        else if (name === "clk" || name === "rst") { 
            assignedColor = wavetraceState.colorsSignal.base;
        }
        else if (signal.path.includes("core")) { 
            assignedColor = wavetraceState.colorsSignal.flags;
        }

        wavetraceState.signalColors.set(signal.id, assignedColor);
    });
}

function assignSignalFormats() {
    wavetraceState.signals.forEach((signal) => {
        const name = signal.name;
        const parts = name.split('_');
        
        let displayName = name; 
        let radix = signal.type === 'integer' ? 'decimal' : (signal.width > 1 ? 'hex' : 'binary');
        let renderMode = signal.width === 1 ? 'digital' : 'bus';
        let type = "Default";
        
        if (name.includes("req_in_sim")) {
            displayName = "req_in " + parts[parts.length - 1];
            radix = "binary";
            type = "I/O";
        } 
        else if (name.includes("in_sim") && !name.includes("req_in")) {
            displayName = "input " + parts[parts.length - 1];
            radix = "decimal"; 
            type = "I/O";
        } 
        else if (name.includes("out_en_sim")) {
            displayName = "out_en " + parts[parts.length - 1];
            radix = "binary";
            type = "I/O";
        } 
        else if (name.includes("out_sig")) {
            displayName = "output " + parts[parts.length - 1];
            radix = "decimal";
            type = "I/O";
        }
        
        else if (name.includes("valr2")) {
            displayName = "Assembly";
            radix = "decimal";
            type = "Instructions";
        } 
        else if (name.includes("linetabs")) {
            displayName = "C+-";
            radix = "decimal";
            type = "Instructions";
        }
        
        else if (name.startsWith("me1")) {
            const varName = parts.slice(4, -2).join('_');
            displayName = `int ${varName} in ${parts[2]}`;
            radix = "decimal";
            type = "Variables";
        } 
        else if (name.startsWith("me2")) {
            const varName = parts.slice(4, -2).join('_');
            displayName = `float ${varName} in ${parts[2]}`;
            radix = "hex"; 
            type = "Variables";
        } 
        else if (name.startsWith("comp")) {
            const varName = parts.slice(4, -2).join('_');
            displayName = `complex ${varName} in ${parts[2]}`;
            radix = "complex";
            type = "Variables";
        }
        
        else if (name.includes("pointeri")) {
            if (signal.path.includes("isp")) {
                displayName = "Inst Stack Pointer";
            } else {
                displayName = "Data Stack Pointer";
            }
            renderMode = "analog";
            type = "Flags";
        }
        else if (name.includes("delta_int")) {
            displayName = "Rounding Error (int)";
            radix = "decimal";
            type = "Flags";
        }
        else if (signal.path.includes(".core.")) {
            type = "Flags";
        }

        wavetraceState.signalDisplayName.set(signal.id, displayName);
        wavetraceState.signalRadix.set(signal.id, radix);
        wavetraceState.signalRenderMode.set(signal.id, renderMode);
        wavetraceState.signalType.set(signal.id, type);
    });
}

function getCustomHierarchyPath(signal) {
    const type = wavetraceState.signalType.get(signal.id) || "Default";
    const originalParts = signal.path.split('.');
    const signalName = originalParts[originalParts.length - 1];
    const tbName = originalParts[0] || "Root"; 
    
    let procFolder = "proc";

    let procInstance = null;
    for (let i = 1; i < originalParts.length - 1; i++) {
        if (originalParts[i].toLowerCase().includes('proc')) {
            procInstance = originalParts[i];
            break;
        }
    }

    if (procInstance) {
        procFolder = `proc.${procInstance}`;
    } else if (originalParts.length > 2) {
        procFolder = originalParts[1];
    }

    if (signal.name.includes('clk') || signal.name.includes('rst')) {
        return `${tbName}.${signalName}`; 
    }

    if (type === "Flags") {
        
        if (signal.path.includes('.core.')) {
            if (signal.path.includes('sp')) {
                return signal.path.replace('.p_ProcDTW', '').replace('.core.', '.Flags.').replace('.sp.', '.STACK.');
            } else if (signal.path.includes('ula')) {
                return signal.path.replace('.p_ProcDTW', '').replace('.core.', '.Flags.').replace('.ula.', '.ULA.');
            }
        } 
        else {
            return `${tbName}.${procFolder}.Flags.${signalName}`;
        }
    }

    if (type === "I/O" || type === "Instructions" || type === "Variables") {
        return `${tbName}.${procFolder}.${type}.${signalName}`;
    }

    return `${tbName}.${procFolder}.Others.${signalName}`;
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
                    
                    <div class="wt-scroll-container">
                        <input type="range" id="wtHorizontalScroll" min="0" max="1000" value="0">
                    </div>
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

function updateHorizontalSlider() {
    const slider = document.getElementById('wtHorizontalScroll');
    if (!slider || !wavetraceState.vcdData) return;

    const { start, end } = wavetraceState.vcdData.timeRange;
    const totalTime = end - start;
    const canvasWidth = wavetraceState.app.view.width;
    const maxTimeOffset = end - (canvasWidth / wavetraceState.timeScale);

    if (maxTimeOffset <= start) {
        slider.disabled = true;
        slider.value = 0;
        return;
    }

    slider.disabled = false;
    
    const percentage = ((wavetraceState.timeOffset - start) / (maxTimeOffset - start)) * 1000;
    slider.value = Math.max(0, Math.min(1000, percentage));
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

    const slider = document.getElementById('wtHorizontalScroll');
    if (slider) {
        slider.addEventListener('input', (e) => {
            if (!wavetraceState.vcdData) return;

            const { start, end } = wavetraceState.vcdData.timeRange;
            const canvasWidth = wavetraceState.app.view.width;
            const maxTimeOffset = end - (canvasWidth / wavetraceState.timeScale);

            if (maxTimeOffset > start) {
                const percentage = parseInt(e.target.value, 10) / 1000;
                wavetraceState.timeOffset = start + (percentage * (maxTimeOffset - start));
                
                renderWaveforms(); 
            }
        });
    }
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
        const customPath = getCustomHierarchyPath(signal);
        const parts = customPath.split('.');
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
                <div class="wt-scope-info">
                    <span class="material-symbols-outlined wt-expand-icon">chevron_right</span>
                    <span class="material-symbols-outlined">folder</span>
                    <span class="wt-scope-name">${name}</span>
                </div>
                <div class="wt-master-checkbox-custom">
                    <span class="material-symbols-outlined">check</span>
                </div>
            </div>
        `;

        const masterCb = scopeDiv.querySelector('.wt-master-checkbox-custom');
        masterCb.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const isChecked = masterCb.classList.toggle('checked');
            
            function getAllSignalsInFolder(folderNode) {
                let sigs = [...folderNode.signals];
                folderNode.children.forEach(subFolder => {
                    sigs.push(...getAllSignalsInFolder(subFolder));
                });
                return sigs;
            }
            
            const folderSignals = getAllSignalsInFolder(child);
            
            folderSignals.forEach(sig => {
                const isDisplayed = wavetraceState.displayedSignals.some(s => s.id === sig.id);
                
                if (isChecked && !isDisplayed) {
                    wavetraceState.displayedSignals.push(sig);
                } else if (!isChecked && isDisplayed) {
                    wavetraceState.displayedSignals = wavetraceState.displayedSignals.filter(s => s.id !== sig.id);
                }
                
                const sigCheckboxDiv = document.querySelector(`.wt-signal[data-signal-id="${sig.id}"] .wt-signal-checkbox`);
                if (sigCheckboxDiv) {
                    if (isChecked) {
                        sigCheckboxDiv.classList.add('checked');
                    } else {
                        sigCheckboxDiv.classList.remove('checked');
                    }
                }
            });
            
            if (typeof renderWaveforms === 'function') {
                renderWaveforms();
            }
        });

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
        
        const nameDisplay = wavetraceState.signalDisplayName.get(signal.id) || signal.name;

        signalDiv.innerHTML = `
            <div class="wt-signal-drag-handle">
                <span class="material-symbols-outlined">drag_indicator</span>
            </div>
            <div class="wt-signal-checkbox ${isDisplayed ? 'checked' : ''}">
                <span class="material-symbols-outlined">check</span>
            </div>
            <div class="wt-signal-color" style="background: #${signalColor.toString(16).padStart(6, '0')}"></div>
            <span class="wt-signal-name">${nameDisplay}</span>
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
    let window = document.getElementById('colorSelectorWindow');
    if (window) {
        window.remove();
    }
    window = document.createElement('div');
    window.id = 'colorSelectorWindow';
    window.className = 'wt-color-selector-window';
    window.style.display = 'flex';
    window.style.flexDirection = 'column';
    window.style.gap = '10px';
    document.body.appendChild(window);

    const presetGrid = document.createElement('div');
    presetGrid.className = 'wt-color-preset-grid';
    presetGrid.style.display = 'grid';
    presetGrid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    presetGrid.style.gap = '8px';
    window.appendChild(presetGrid);

    wavetraceState.colorPalette.forEach(colorHexNumber => {
        const hexStr = '#' + colorHexNumber.toString(16).padStart(6, '0');
        const option = document.createElement('div');
        option.className = 'wt-color-option';
        option.style.background = hexStr;
        
        option.addEventListener('click', () => {
            wavetraceState.signalColors.set(signal.id, colorHexNumber);
            
            const colorDot = signalDiv.querySelector('.wt-signal-color');
            if (colorDot) colorDot.style.background = hexStr;
            
            if (typeof renderWaveforms === 'function') renderWaveforms();
            
            window.remove();
        });
        presetGrid.appendChild(option);
    });

    const hueSlider = document.createElement('input');
    hueSlider.type = 'range';
    hueSlider.className = 'wt-color-hue-slider';
    hueSlider.min = '0';
    hueSlider.max = '360';
    hueSlider.step = '1';
    hueSlider.value = '0';
    hueSlider.style.width = '100%';
    window.appendChild(hueSlider);

    hueSlider.addEventListener('input', (e) => {
        const hue = Number(e.target.value);
        
        const hexNumber = hslToHexNumber(hue, 100, 50);
        
        const hexStr = '#' + hexNumber.toString(16).padStart(6, '0');
        
        wavetraceState.signalColors.set(signal.id, hexNumber);
        
        const colorDot = signalDiv.querySelector('.wt-signal-color');
        if (colorDot) colorDot.style.background = hexStr;
        
        if (typeof renderWaveforms === 'function') renderWaveforms();
    });

    const rect = signalDiv.getBoundingClientRect();
    window.style.left = `${rect.right + 10}px`;
    window.style.top = `${rect.top - 20}px`;

    function handleClickOutside(e) {
        if (!window.contains(e.target) && !signalDiv.contains(e.target)) {
            window.remove();
            document.removeEventListener('click', handleClickOutside);
        }
    }
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 0);
}

function hslToHexNumber(h, s, l) {
    h = Number(h);
    if (h >= 360) h = 359;
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s,
        x = c * (1 - Math.abs((h / 60) % 2 - 1)),
        m = l - c / 2,
        r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return (r * 65536) + (g * 256) + b;
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
        
        const nameDisplay = wavetraceState.signalDisplayName.get(signal.id) || signal.name;

        html += `
            <div class="wt-cursor-signal">
                <div class="wt-cursor-dot" style="background: #${color.toString(16).padStart(6, '0')}"></div>
                <span class="wt-cursor-name">${nameDisplay}</span>
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

    updateHorizontalSlider();
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

function formatComplexValue(binValue) {
    const valLow = String(binValue).toLowerCase();
    if (valLow.includes('x') || valLow.includes('z') || valLow.includes('u') || valLow.includes('w')) {
        return binValue;
    }

    if (binValue.length < 16) return binValue;

    const nbm = parseInt(binValue.substring(0, 8), 2);
    const nbe = parseInt(binValue.substring(8, 16), 2);
    const nbits = 1 + nbm + nbe;

    if (binValue.length < 16 + 2 * nbits) return binValue;

    const reStr = binValue.substring(16, 16 + nbits);
    const imStr = binValue.substring(16 + nbits, 16 + 2 * nbits);

    function b2mf(binStr, num_m, num_e) {
        const s = binStr[0] === '1';
        let exb = binStr.substring(1, 1 + num_e);
        
        const es = exb[0] === '1';
        if (es) {
            exb = exb.split('').map(b => b === '1' ? '0' : '1').join('');
        }
        
        let e = parseInt(exb, 2);
        if (es) e = -(e + 1);

        const mab = binStr.substring(1 + num_e, 1 + num_e + num_m);
        const m = parseInt(mab, 2);

        let f = m * Math.pow(2, e);
        if (s) f = -f;
        return f;
    }

    const fre = b2mf(reStr, nbm, nbe);
    const fim = b2mf(imStr, nbm, nbe);

    return `${fre.toFixed(2)} + j ${fim.toFixed(2)}`;
}

function drawSignal(container, signal, yOffset, width) {
    const graphics = new PIXI.Graphics();
    const signalHeight = wavetraceState.signalHeight;
    const padding = 18;
    
    const displayName = wavetraceState.signalDisplayName.get(signal.id) || signal.name;

    const nameText = new PIXI.Text(displayName, {
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

function drawTextBusWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal) {
    graphics.lineStyle(2, color, 0.95);

    const slant = 4; 

    const points = [
        x1 + slant, y,
        x2 - slant, y,
        x2, y + height,
        x1, y + height
    ];

    gradientContainer.beginFill(color, 0.16);
    gradientContainer.drawPolygon(points);
    gradientContainer.endFill();

    graphics.moveTo(x1 + slant, y);
    graphics.lineTo(x2 - slant, y);
    graphics.lineTo(x2, y + height);
    graphics.lineTo(x1, y + height);
    graphics.lineTo(x1 + slant, y);

    if (x2 - x1 > 25) {
        const displayValue = formatBusValue(value, signal);
        
        const valueText = new PIXI.Text(displayValue, {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10.5,
            fill: wavetraceState.colors?.text || 0xffffff,
            fontWeight: '700'
        });

        valueText.x = (x1 + x2) / 2 - valueText.width / 2;
        valueText.y = y + height / 2 - valueText.height / 2;

        if (valueText.width < (x2 - x1 - 8)) {
            graphics.addChild(valueText);
        }
    }
}

function drawWaveformSegment(graphics, gradientContainer, x1, x2, y, height, value, width, color, signal, renderMode, nextValue) {
    if (x2 <= -100 || x1 >= wavetraceState.app.view.width + 100) return;
    
    x1 = Math.max(-50, x1);
    x2 = Math.min(wavetraceState.app.view.width + 50, x2);

    const valStr = String(value).toLowerCase();
    let renderColor = color;
    let displayValue = value;

    const isTextual = signal.type === 'string' || signal.type === 'real';

    if (!isTextual) {
        if (valStr.includes('x')) {
            renderColor = 0xFF3333; 
        } else if (valStr.includes('u')) {
            renderColor = 0xAA0000; 
            displayValue = String(value).toUpperCase();
        } else if (valStr.includes('z')) {
            renderColor = 0xFFB000;
        } else if (valStr.includes('-')) {
            renderColor = 0xFFD700; 
            displayValue = String(value).toUpperCase();
        } else if (valStr === 'h' || valStr === 'l' || valStr.includes('w')) {
            renderColor = 0x55AA55;
        }
    }

    const signalName = (signal.name || '').toLowerCase();
    if (signalName.includes('valr2') || signalName.includes('linetabs')) {
        drawTextBusWaveform(graphics, gradientContainer, x1, x2, y, height, displayValue, renderColor, signal);
        return;
    }
    
    const forceBusSize = valStr.length > 1 || valStr === 'u' || valStr === 'w' || valStr === '-';
    
    if (renderMode === 'analog' && width > 1 && !forceBusSize) {
        drawAnalogWaveform(graphics, gradientContainer, x1, x2, y, height, displayValue, renderColor, signal, nextValue);
    } else if (width === 1 && renderMode === 'digital' && !forceBusSize) {
        drawDigitalWaveform(graphics, gradientContainer, x1, x2, y, height, displayValue, renderColor);
    } else {
        drawBusWaveform(graphics, gradientContainer, x1, x2, y, height, displayValue, renderColor, signal);
    }
}

function drawDigitalWaveform(graphics, gradientContainer, x1, x2, y, height, value, color) {
    const valStr = String(value).toLowerCase();

    if (valStr === 'z') {
        graphics.lineStyle(2, color, 0.9);
        graphics.moveTo(x1, y + height / 2);
        graphics.lineTo(x2, y + height / 2);
        return;
    }

    if (valStr === 'x') {
        gradientContainer.beginFill(color, 0.4); 
        gradientContainer.drawRect(x1, y, x2 - x1, height);
        gradientContainer.endFill();
        
        graphics.lineStyle(1.5, color, 0.9);
        graphics.moveTo(x1, y);
        graphics.lineTo(x2, y);
        graphics.moveTo(x1, y + height);
        graphics.lineTo(x2, y + height);
        return;
    }

    const isHigh = (valStr === '1' || valStr === 'h');
    const yPos = isHigh ? y : y + height;
    
    graphics.lineStyle(2, color, 0.9);
    graphics.moveTo(x1, yPos);
    graphics.lineTo(x2, yPos);
}

function drawBusWaveform(graphics, gradientContainer, x1, x2, y, height, value, color, signal) {
    graphics.lineStyle(2.5, color, 0.9);
    
    const slant = 6;
    const points = [x1 + slant, y, x2, y, x2 - slant, y + height, x1, y + height];
    
    const valStr = String(value).toLowerCase();
    const isSpecialState = valStr === 'u' || valStr === 'w' || valStr === '-';
    const bgOpacity = isSpecialState ? 0.24 : 0.12; 
    
    gradientContainer.beginFill(color, bgOpacity);
    gradientContainer.drawPolygon(points);
    gradientContainer.endFill();
    
    if (!isSpecialState) {
        gradientContainer.beginFill(color, 0.05);
        gradientContainer.drawPolygon([x1 + slant, y + height * 0.4, x2, y + height * 0.4, x2 - slant, y + height, x1, y + height]);
        gradientContainer.endFill();
    }
    
    graphics.moveTo(x1 + slant, y);
    graphics.lineTo(x2, y);
    graphics.lineTo(x2 - slant, y + height);
    graphics.lineTo(x1, y + height);
    graphics.lineTo(x1 + slant, y);
    
    if (x2 - x1 > 35) {
        const displayValue = isSpecialState ? value : formatBusValue(value, signal);
        
        
        const textColor = isSpecialState ? 0xBBBBBB : (wavetraceState.colors?.text || 0xffffff);

        const valueText = new PIXI.Text(displayValue, {
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            fill: textColor,
            fontWeight: '900'
        });
        
        valueText.x = (x1 + x2) / 2 - valueText.width / 2;
        valueText.y = y + height / 2 - valueText.height / 2; 
        
        if (valueText.width < (x2 - x1 - 10)) {
            graphics.addChild(valueText);
        }
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
    if (signal.type === 'string' || signal.type === 'real') {
        return value; 
    }

    const sigName = (signal.name || '').toLowerCase();
    if (sigName.includes('complex') || sigName.includes('comp_')) {
        const paddedValue = value.padStart(signal.width, '0');
        
        return formatComplexValue(paddedValue);
    }

    if (value.includes('x') || value.includes('X')) return 'X';
    if (value.includes('z') || value.includes('Z')) return 'Z';

    let radix = wavetraceState.signalRadix.get(signal.id);
    if (!radix) {
        radix = (signal.type === 'integer') ? 'decimal' : 'hex';
    }

    let decimalValue;
    try {
        decimalValue = BigInt('0b' + value);
    } catch (e) {
        return value; 
    }

    switch (radix) {
        case 'hex': {
            let hexStr = decimalValue.toString(16).toUpperCase();
            let targetLen = Math.ceil(signal.width / 4);
            return hexStr.padStart(targetLen, '0');
        }
        case 'decimal': {
            return decimalValue.toString(10);
        }
        case 'binary': {
            return '0b' + value.padStart(signal.width, '0');
        }
        default:
            return value;
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