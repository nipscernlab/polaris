// ===== LAYOUT MANAGEMENT USING SPLIT.JS =====

let horizontalSplit = null;
let verticalSplit = null;

export function initLayout() {
    console.log('Initializing layout system...');

    // Initialize horizontal split (sidebar | editor+terminal)
    const mainSplitElements = document.querySelectorAll('#mainSplit > *');
    if (mainSplitElements.length >= 2) {
        horizontalSplit = Split(Array.from(mainSplitElements), {
            sizes: [20, 80],
            minSize: [200, 400],
            gutterSize: 4,
            cursor: 'col-resize',
            direction: 'horizontal',
            onDragEnd: (sizes) => {
                console.log('Horizontal split resized:', sizes);
                saveLayoutState();
            }
        });
    }

    // Initialize vertical split (editor | terminal)
    const editorSplitElements = document.querySelectorAll('#editorSplit > *');
    if (editorSplitElements.length >= 2) {
        verticalSplit = Split(Array.from(editorSplitElements), {
            sizes: [70, 30],
            minSize: [300, 100],
            gutterSize: 4,
            cursor: 'row-resize',
            direction: 'vertical',
            onDragEnd: (sizes) => {
                console.log('Vertical split resized:', sizes);
                saveLayoutState();
            }
        });
    }

    // Load saved layout state
    loadLayoutState();

    console.log('Layout system initialized');
}

function saveLayoutState() {
    const layoutState = {
        horizontal: horizontalSplit ? horizontalSplit.getSizes() : null,
        vertical: verticalSplit ? verticalSplit.getSizes() : null
    };
    localStorage.setItem('polaris_layout', JSON.stringify(layoutState));
}

function loadLayoutState() {
    const saved = localStorage.getItem('polaris_layout');
    if (saved) {
        try {
            const layoutState = JSON.parse(saved);
            
            if (layoutState.horizontal && horizontalSplit) {
                horizontalSplit.setSizes(layoutState.horizontal);
            }
            
            if (layoutState.vertical && verticalSplit) {
                verticalSplit.setSizes(layoutState.vertical);
            }
            
            console.log('Layout state loaded:', layoutState);
        } catch (error) {
            console.error('Error loading layout state:', error);
        }
    }
}

export function resetLayout() {
    if (horizontalSplit) {
        horizontalSplit.setSizes([20, 80]);
    }
    if (verticalSplit) {
        verticalSplit.setSizes([70, 30]);
    }
    saveLayoutState();
    console.log('Layout reset to defaults');
}

export function getLayoutState() {
    return {
        horizontal: horizontalSplit ? horizontalSplit.getSizes() : null,
        vertical: verticalSplit ? verticalSplit.getSizes() : null
    };
}