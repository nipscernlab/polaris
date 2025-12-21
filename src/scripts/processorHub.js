import { invoke } from '@tauri-apps/api/core';
import { state } from './state.js';
import { showStatus } from './main.js';
import { refreshFileTree } from './fileTree.js';

export function initProcessorHub() {
    console.log('🔧 Initializing Processor Hub...');

    const modal = document.getElementById('processorHubModal');
    const openBtn = document.getElementById('processorHubBtn');
    const closeBtn = document.getElementById('closeProcessorModalBtn');
    const cancelBtn = document.getElementById('cancelProcessorBtn');
    const generateBtn = document.getElementById('generateProcessorBtn');

    // Open modal
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            if (state.currentSpfPath) {
                openProcessorHub();
            }
        });
    }

    // Close modal
    [closeBtn, cancelBtn].forEach(btn => {
        btn?.addEventListener('click', closeProcessorHub);
    });

    // Close on overlay click
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProcessorHub();
        }
    });

    // Generate processor
    if (generateBtn) {
        generateBtn.addEventListener('click', generateProcessor);
    }

    // Validate processor name input
    const processorNameInput = document.getElementById('processorName');
    if (processorNameInput) {
        processorNameInput.addEventListener('input', (e) => {
            validateProcessorName(e.target.value);
        });
    }

    // Validate numeric inputs
    const numericInputs = [
        'totalBits', 'mantissaBits', 'exponentBits',
        'dataStackSize', 'instructionStackSize',
        'inputPorts', 'outputPorts'
    ];

    numericInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', (e) => {
                validateNumericInput(e.target);
            });
        }
    });
}

function openProcessorHub() {
    const modal = document.getElementById('processorHubModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('processorName')?.focus();
        hideValidationError();
    }
}

function closeProcessorHub() {
    const modal = document.getElementById('processorHubModal');
    if (modal) {
        modal.classList.remove('active');
        hideValidationError();
    }
}

function validateProcessorName(name) {
    const validPattern = /^[a-zA-Z0-9_]+$/;
    const input = document.getElementById('processorName');
    
    if (!name) {
        showValidationError('Processor name is required');
        return false;
    }

    if (!validPattern.test(name)) {
        showValidationError('Processor name can only contain letters, numbers, and underscores');
        if (input) input.classList.add('invalid');
        return false;
    }

    if (input) input.classList.remove('invalid');
    hideValidationError();
    return true;
}

function validateNumericInput(input) {
    const value = parseInt(input.value);
    const min = parseInt(input.min || '0');
    
    if (isNaN(value) || value < min) {
        input.value = min;
    }
    
    // Ensure integer
    input.value = Math.floor(parseFloat(input.value || min));
}

function showValidationError(message) {
    const errorDiv = document.getElementById('processorValidationError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function hideValidationError() {
    const errorDiv = document.getElementById('processorValidationError');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

async function generateProcessor() {
    // Gather form data
    const processorName = document.getElementById('processorName')?.value.trim();
    const totalBits = parseInt(document.getElementById('totalBits')?.value);
    const mantissaBits = parseInt(document.getElementById('mantissaBits')?.value);
    const exponentBits = parseInt(document.getElementById('exponentBits')?.value);
    const dataStackSize = parseInt(document.getElementById('dataStackSize')?.value);
    const instructionStackSize = parseInt(document.getElementById('instructionStackSize')?.value);
    const inputPorts = parseInt(document.getElementById('inputPorts')?.value);
    const outputPorts = parseInt(document.getElementById('outputPorts')?.value);
    const gain = parseInt(document.getElementById('gain')?.value);

    // Validate processor name
    if (!validateProcessorName(processorName)) {
        return;
    }

    // Validate that we have an SPF project
    if (!state.currentSpfPath) {
        showValidationError('No .spf project is currently open');
        return;
    }

    // Validate numeric values
    if (isNaN(totalBits) || isNaN(mantissaBits) || isNaN(exponentBits) ||
        isNaN(dataStackSize) || isNaN(instructionStackSize) ||
        isNaN(inputPorts) || isNaN(outputPorts) || isNaN(gain)) {
        showValidationError('All numeric fields must be valid positive integers');
        return;
    }

    // Additional validation: mantissa + exponent should not exceed total bits
    if (mantissaBits + exponentBits > totalBits) {
        showValidationError(`Mantissa bits (${mantissaBits}) + Exponent bits (${exponentBits}) cannot exceed Total bits (${totalBits})`);
        return;
    }

    try {
        const processorConfig = {
            name: processorName,
            totalBits,
            mantissaBits,
            exponentBits,
            dataStackSize,
            instructionStackSize,
            inputPorts,
            outputPorts,
            gain
        };

        // Call Rust backend to generate processor structure
        const result = await invoke('generate_processor', {
            spfPath: state.currentSpfPath,
            config: processorConfig
        });

        showStatus(`Processor "${processorName}" generated successfully`, 'success');
        closeProcessorHub();

        // Refresh file tree
        if (state.workspacePath) {
            await refreshFileTree(state.workspacePath);
        }

        console.log('Processor generated:', result);
    } catch (error) {
        console.error('Error generating processor:', error);
        showValidationError(`Error generating processor: ${error}`);
    }
}

export function openProcessorHubExternal() {
    if (state.currentSpfPath) {
        openProcessorHub();
    } else {
        showStatus('Please open a .spf project first', 'warning');
    }
}