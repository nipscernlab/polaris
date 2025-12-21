// ===== CODE EDITOR COMPONENT =====

let editorInstance = null;
let currentContent = '';

export function initEditor() {
    console.log('✏️ Initializing code editor...');

    const editorElement = document.getElementById('editor');
    
    if (!editorElement) {
        console.error('Editor element not found');
        return;
    }

    // Add event listeners for editor
    setupEditorListeners();

    console.log('✅ Code editor initialized');
}

function setupEditorListeners() {
    const editorElement = document.getElementById('editor');
    
    if (editorElement && editorElement.tagName === 'TEXTAREA') {
        // Track changes
        editorElement.addEventListener('input', (e) => {
            currentContent = e.target.value;
            updateEditorStatus();
        });

        // Handle tab key
        editorElement.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editorElement.selectionStart;
                const end = editorElement.selectionEnd;
                const spaces = '    '; // 4 spaces
                
                editorElement.value = 
                    editorElement.value.substring(0, start) +
                    spaces +
                    editorElement.value.substring(end);
                
                editorElement.selectionStart = editorElement.selectionEnd = start + spaces.length;
            }
        });

        // Track cursor position
        editorElement.addEventListener('click', updateEditorStatus);
        editorElement.addEventListener('keyup', updateEditorStatus);
    }
}

function updateEditorStatus() {
    const editorElement = document.getElementById('editor');
    if (!editorElement || editorElement.tagName !== 'TEXTAREA') return;

    const text = editorElement.value;
    const position = editorElement.selectionStart;
    
    // Calculate line and column
    const textBeforeCursor = text.substring(0, position);
    const lines = textBeforeCursor.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;

    // Update status bar
    const statusBar = document.querySelector('.status-right .status-item:last-child');
    if (statusBar) {
        statusBar.textContent = `Ln ${line}, Col ${col}`;
    }
}

export function getEditorContent() {
    const editorElement = document.getElementById('editor');
    if (editorElement && editorElement.tagName === 'TEXTAREA') {
        return editorElement.value;
    }
    return '';
}

export function setEditorContent(content) {
    const editorElement = document.getElementById('editor');
    if (editorElement && editorElement.tagName === 'TEXTAREA') {
        editorElement.value = content;
        currentContent = content;
        updateEditorStatus();
    }
}

export function clearEditor() {
    setEditorContent('');
}

export function insertAtCursor(text) {
    const editorElement = document.getElementById('editor');
    if (!editorElement || editorElement.tagName !== 'TEXTAREA') return;

    const start = editorElement.selectionStart;
    const end = editorElement.selectionEnd;
    const current = editorElement.value;

    editorElement.value = current.substring(0, start) + text + current.substring(end);
    editorElement.selectionStart = editorElement.selectionEnd = start + text.length;
    editorElement.focus();
    
    currentContent = editorElement.value;
    updateEditorStatus();
}

export function getSelectedText() {
    const editorElement = document.getElementById('editor');
    if (!editorElement || editorElement.tagName !== 'TEXTAREA') return '';

    const start = editorElement.selectionStart;
    const end = editorElement.selectionEnd;
    return editorElement.value.substring(start, end);
}

export function replaceSelection(text) {
    const editorElement = document.getElementById('editor');
    if (!editorElement || editorElement.tagName !== 'TEXTAREA') return;

    const start = editorElement.selectionStart;
    const end = editorElement.selectionEnd;
    const current = editorElement.value;

    editorElement.value = current.substring(0, start) + text + current.substring(end);
    editorElement.selectionStart = editorElement.selectionEnd = start + text.length;
    editorElement.focus();
    
    currentContent = editorElement.value;
    updateEditorStatus();
}

export function focusEditor() {
    const editorElement = document.getElementById('editor');
    if (editorElement && editorElement.tagName === 'TEXTAREA') {
        editorElement.focus();
    }
}