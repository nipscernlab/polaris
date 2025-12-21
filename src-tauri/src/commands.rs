use crate::file_system;
use crate::terminal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Option<Vec<FileNode>>,
}

// === ADD THIS ATTRIBUTE BELOW ===
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")] 
pub struct ProcessorConfig {
    pub name: String,
    pub total_bits: u32,
    pub mantissa_bits: u32,
    pub exponent_bits: u32,
    pub data_stack_size: u32,
    pub instruction_stack_size: u32,
    pub input_ports: u32,
    pub output_ports: u32,
    pub gain: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectResult {
    pub spf_path: String,
}

/// Get the file tree for a specific path
#[tauri::command]
pub async fn get_file_tree(path: String) -> Result<FileNode, String> {
    let workspace_path = std::path::PathBuf::from(&path);
    
    file_system::build_file_tree(&workspace_path)
        .map_err(|e| format!("Failed to build file tree: {}", e))
}

/// Read file contents
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    file_system::read_file_content(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Save file contents
#[tauri::command]
pub async fn save_file(path: String, content: String) -> Result<(), String> {
    file_system::write_file_content(&path, &content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

/// Create a new project with SPF file and structure
#[tauri::command]
pub async fn create_project_structure(
    project_path: String,
    project_name: String,
) -> Result<ProjectResult, String> {
    file_system::create_project_with_spf(&project_path, &project_name)
        .map_err(|e| format!("Failed to create project: {}", e))
}

/// Generate processor structure
#[tauri::command]
pub async fn generate_processor(
    spf_path: String,
    config: ProcessorConfig,
) -> Result<String, String> {
    file_system::generate_processor_structure(&spf_path, &config)
        .map_err(|e| format!("Failed to generate processor: {}", e))
}

/// Execute terminal command
#[tauri::command]
pub async fn execute_command(command: String) -> Result<String, String> {
    terminal::execute_command(&command)
        .map_err(|e| format!("Failed to execute command: {}", e))
}