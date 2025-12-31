// ===== SIDEBAR RESIZER =====

let isResizing = false;
let startX = 0;
let startWidth = 0;

export function initSidebarResizer() {
    console.log('📏 Initializing sidebar resizer...');
    
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) {
        console.error('Sidebar not found');
        return;
    }

    // Create invisible resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.style.position = 'absolute';
    resizeHandle.style.top = '0';
    resizeHandle.style.right = '0';
    resizeHandle.style.width = '8px';
    resizeHandle.style.height = '100%';
    resizeHandle.style.cursor = 'col-resize';
    resizeHandle.style.zIndex = '100';
    sidebar.appendChild(resizeHandle);

    resizeHandle.addEventListener('mousedown', startResize);

    function startResize(e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        
        sidebar.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }

    function doResize(e) {
        if (!isResizing) return;

        const delta = e.clientX - startX;
        const newWidth = startWidth + delta;

        // Apply min and max constraints
        const minWidth = 200;
        const maxWidth = 600;
        
        if (newWidth >= minWidth && newWidth <= maxWidth) {
            sidebar.style.width = `${newWidth}px`;
        }
    }

    function stopResize() {
        if (!isResizing) return;

        isResizing = false;
        sidebar.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);

        // Save sidebar width to localStorage
        try {
            localStorage.setItem('polaris_sidebar_width', sidebar.offsetWidth);
        } catch (error) {
            console.error('Error saving sidebar width:', error);
        }
    }

    // Load saved sidebar width
    loadSidebarWidth();

    console.log('✅ Sidebar resizer initialized');
}

function loadSidebarWidth() {
    try {
        const savedWidth = localStorage.getItem('polaris_sidebar_width');
        if (savedWidth) {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                const width = parseInt(savedWidth);
                if (width >= 200 && width <= 600) {
                    sidebar.style.width = `${width}px`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading sidebar width:', error);
    }
}