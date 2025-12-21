import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { showStatus } from './main.js';
import { refreshFileTree } from './fileTree.js';
import { state } from './state.js';

export function initProjectModal() {
    console.log('📦 Initializing project modal...');

    const modal = document.getElementById('newProjectModal');
    const closeBtn = document.getElementById('closeProjectModalBtn');
    const cancelBtn = document.getElementById('cancelProjectBtn');
    const browseBtn = document.getElementById('browsePathBtn');
    const generateBtn = document.getElementById('generateProjectBtn');
    const projectNameInput = document.getElementById('projectName');
    const projectPathInput = document.getElementById('projectPath');
    const fullPathDisplay = document.getElementById('fullProjectPath');

    // Close modal
    [closeBtn, cancelBtn].forEach(btn => {
        btn?.addEventListener('click', closeProjectModal);
    });

    // Close on overlay click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProjectModal();
        }
    });

    // Browse for path
    browseBtn?.addEventListener('click', async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Select Project Location'
            });

            if (selected && typeof selected === 'string') {
                projectPathInput.value = selected;
                updateFullPath();
            }
        } catch (error) {
            console.error('Error selecting folder:', error);
        }
    });

    // Update full path preview
    [projectNameInput, projectPathInput].forEach(input => {
        input?.addEventListener('input', updateFullPath);
    });

    // Generate project
    generateBtn?.addEventListener('click', async () => {
        await generateProject();
    });

    function updateFullPath() {
        const name = projectNameInput?.value.trim();
        const path = projectPathInput?.value.trim();
        
        if (name && path) {
            const fullPath = `${path}\\${name}`;
            fullPathDisplay.textContent = `Project will be created at: ${fullPath}`;
            generateBtn.disabled = false;
        } else {
            fullPathDisplay.textContent = '';
            generateBtn.disabled = true;
        }
    }
}

function closeProjectModal() {
    const modal = document.getElementById('newProjectModal');
    modal?.classList.remove('active');
    
    // Reset form
    document.getElementById('projectName').value = '';
    document.getElementById('projectPath').value = '';
    document.getElementById('fullProjectPath').textContent = '';
    document.getElementById('generateProjectBtn').disabled = true;
}

async function generateProject() {
    const projectName = document.getElementById('projectName')?.value.trim();
    const projectPath = document.getElementById('projectPath')?.value.trim();

    if (!projectName || !projectPath) {
        showStatus('Please fill in all fields', 'warning');
        return;
    }

    try {
        const fullPath = `${projectPath}\\${projectName}`;
        
        // Create project structure
        const result = await invoke('create_project_structure', {
            projectPath: fullPath,
            projectName: projectName
        });

        showStatus(`Project created: ${projectName}`, 'success');
        closeProjectModal();

        // Refresh file tree if we're in the same workspace
        if (state.workspacePath && fullPath.startsWith(state.workspacePath)) {
            await refreshFileTree(state.workspacePath);
        }

        // Optionally open the created .spf file
        if (result.spfPath) {
            // TODO: Open the SPF file automatically
            console.log('SPF file created at:', result.spfPath);
        }
    } catch (error) {
        console.error('Error creating project:', error);
        showStatus(`Error creating project: ${error}`, 'error');
    }
}