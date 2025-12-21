// ===== DYNAMIC TOOLTIP SYSTEM =====

let tooltipElement = null;
let tooltipTimeout = null;
const TOOLTIP_DELAY = 500; // ms

export function initTooltip() {
    console.log('💬 Initializing tooltip system...');

    tooltipElement = document.getElementById('tooltip');
    
    if (!tooltipElement) {
        console.error('Tooltip element not found');
        return;
    }

    // Find all elements with data-tooltip attribute
    setupTooltips();

    // Use MutationObserver to handle dynamically added elements
    const observer = new MutationObserver(() => {
        setupTooltips();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    console.log('✅ Tooltip system initialized');
}

function setupTooltips() {
    const elementsWithTooltip = document.querySelectorAll('[data-tooltip]');
    
    elementsWithTooltip.forEach(element => {
        // Remove existing listeners to avoid duplicates
        element.removeEventListener('mouseenter', handleMouseEnter);
        element.removeEventListener('mouseleave', handleMouseLeave);
        element.removeEventListener('mousemove', handleMouseMove);
        
        // Add listeners
        element.addEventListener('mouseenter', handleMouseEnter);
        element.addEventListener('mouseleave', handleMouseLeave);
        element.addEventListener('mousemove', handleMouseMove);
    });
}

function handleMouseEnter(e) {
    const tooltipText = e.currentTarget.getAttribute('data-tooltip');
    
    if (!tooltipText || !tooltipElement) return;

    // Clear any existing timeout
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
    }

    // Show tooltip after delay
    tooltipTimeout = setTimeout(() => {
        showTooltip(tooltipText, e.clientX, e.clientY);
    }, TOOLTIP_DELAY);
}

function handleMouseLeave() {
    // Clear timeout
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
        tooltipTimeout = null;
    }

    // Hide tooltip
    hideTooltip();
}

function handleMouseMove(e) {
    // Update tooltip position if it's visible
    if (tooltipElement && tooltipElement.classList.contains('visible')) {
        updateTooltipPosition(e.clientX, e.clientY);
    }
}

function showTooltip(text, x, y) {
    if (!tooltipElement) return;

    tooltipElement.textContent = text;
    tooltipElement.classList.add('visible');
    
    updateTooltipPosition(x, y);
}

function hideTooltip() {
    if (!tooltipElement) return;

    tooltipElement.classList.remove('visible');
}

function updateTooltipPosition(x, y) {
    if (!tooltipElement) return;

    // Get tooltip dimensions
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;

    // Calculate position (offset from cursor)
    let left = x + 10;
    let top = y + 10;

    // Adjust if tooltip would go off-screen
    if (left + tooltipWidth > window.innerWidth) {
        left = x - tooltipWidth - 10;
    }

    if (top + tooltipHeight > window.innerHeight) {
        top = y - tooltipHeight - 10;
    }

    // Ensure tooltip doesn't go off the left or top edge
    if (left < 0) left = 10;
    if (top < 0) top = 10;

    tooltipElement.style.left = `${left}px`;
    tooltipElement.style.top = `${top}px`;
}

// ===== PROGRAMMATIC TOOLTIP CONTROL =====

export function showCustomTooltip(text, element) {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.bottom;

    showTooltip(text, x, y);
}

export function hideCustomTooltip() {
    hideTooltip();
}

// ===== ADD TOOLTIP TO ELEMENT =====

export function addTooltip(element, text) {
    if (element) {
        element.setAttribute('data-tooltip', text);
        setupTooltips();
    }
}

export function removeTooltip(element) {
    if (element) {
        element.removeAttribute('data-tooltip');
        element.removeEventListener('mouseenter', handleMouseEnter);
        element.removeEventListener('mouseleave', handleMouseLeave);
        element.removeEventListener('mousemove', handleMouseMove);
    }
}