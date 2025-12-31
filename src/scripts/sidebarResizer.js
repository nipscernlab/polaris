let isResizing = false;
let startX = 0;
let startWidth = 0;
let animationFrameId = null;
let lastExpandedWidth = 250;
let isCollapsed = false;

export function initSidebarResizer() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('toggleSidebarBtn');

    if (!sidebar) return;

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'sidebar-resizer';
    
    Object.assign(resizeHandle.style, {
        position: 'absolute',
        top: '0',
        right: '-5px',
        width: '10px', /* Aumentei a área de clique para facilitar (era 4px) */
        height: '100%',
        cursor: 'col-resize',
        zIndex: '100',
        userSelect: 'none'
    });

    sidebar.appendChild(resizeHandle);

    if (getComputedStyle(sidebar).position === 'static') {
        sidebar.style.position = 'relative';
    }

    resizeHandle.addEventListener('mousedown', startResize);

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => toggleSidebar(sidebar, toggleBtn));
    }

    loadSidebarState(sidebar, toggleBtn);

    function startResize(e) {
        if (e.button !== 0) return;
        
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.getBoundingClientRect().width;
        
        // Adiciona classe para controle via CSS (importante para o fix de texto)
        sidebar.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        sidebar.style.transition = 'none'; // Remove transição para ficar responsivo

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', stopResize);
    }

    function onMouseMove(e) {
        if (!isResizing) return;

        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        animationFrameId = requestAnimationFrame(() => {
            const currentX = e.clientX;
            const delta = currentX - startX;
            let newWidth = startWidth + delta;

            // Limites ajustados: 2px a 1200px
            const minWidth = 2;
            const maxWidth = 1200;
            
            if (newWidth < minWidth) newWidth = minWidth;
            if (newWidth > maxWidth) newWidth = maxWidth;

            sidebar.style.width = `${newWidth}px`;

            // Lógica de estado colapsado (mantendo threshold de 50px para UX)
            if (newWidth > 50) {
                lastExpandedWidth = newWidth;
                if (isCollapsed) {
                    isCollapsed = false;
                    updateUIState(sidebar, toggleBtn);
                }
            } else {
                 if (!isCollapsed && newWidth <= 50) {
                    isCollapsed = true;
                    updateUIState(sidebar, toggleBtn);
                 }
            }
        });
    }

    function stopResize() {
        if (!isResizing) return;

        isResizing = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);

        sidebar.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        sidebar.style.transition = ''; 

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', stopResize);

        const finalWidth = sidebar.getBoundingClientRect().width;
        
        if (finalWidth > 50) {
            localStorage.setItem('polaris_sidebar_width', finalWidth);
            localStorage.setItem('polaris_sidebar_collapsed', 'false');
        } else {
            localStorage.setItem('polaris_sidebar_collapsed', 'true');
        }
    }
}

function toggleSidebar(sidebar, btn) {
    sidebar.style.transition = 'width 0.2s ease-in-out';
    
    if (isCollapsed) {
        isCollapsed = false;
        // Recupera largura anterior
        const targetWidth = lastExpandedWidth < 50 ? 250 : lastExpandedWidth;
        sidebar.style.width = `${targetWidth}px`;
        localStorage.setItem('polaris_sidebar_collapsed', 'false');
    } else {
        // Salva largura atual antes de fechar
        const currentWidth = sidebar.getBoundingClientRect().width;
        if (currentWidth > 50) {
            lastExpandedWidth = currentWidth;
            localStorage.setItem('polaris_sidebar_width', lastExpandedWidth);
        }
        isCollapsed = true;
        // Colapsa para 2px
        sidebar.style.width = '2px';
        localStorage.setItem('polaris_sidebar_collapsed', 'true');
    }

    updateUIState(sidebar, btn);

    // Limpa a transição após a animação para não atrapalhar o resize manual depois
    setTimeout(() => {
        sidebar.style.transition = '';
    }, 200);
}

function updateUIState(sidebar, btn) {
    const icon = btn ? btn.querySelector('span') : null;
    
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        // Usamos opacity em vez de display none para manter a barra visível (2px)
        sidebar.style.overflow = 'hidden'; 
        // Ícone opcional, remova se estiver usando a Activity Bar fixa
        if (icon) icon.textContent = 'last_page';
    } else {
        sidebar.classList.remove('collapsed');
        sidebar.style.overflow = '';
        if (icon) icon.textContent = 'first_page';
    }
}

function loadSidebarState(sidebar, btn) {
    try {
        const savedWidth = localStorage.getItem('polaris_sidebar_width');
        const savedCollapsed = localStorage.getItem('polaris_sidebar_collapsed');

        if (savedWidth) {
            lastExpandedWidth = parseFloat(savedWidth);
        }

        if (savedCollapsed === 'true') {
            isCollapsed = true;
            sidebar.style.width = '2px'; // Carrega com 2px se estava fechado
        } else {
            isCollapsed = false;
            // Validação ajustada para aceitar >= 2
            if (lastExpandedWidth >= 2 && lastExpandedWidth <= 1200) {
                sidebar.style.width = `${lastExpandedWidth}px`;
            } else {
                sidebar.style.width = '250px';
            }
        }
        updateUIState(sidebar, btn);
    } catch (error) {
        console.error(error);
    }
}