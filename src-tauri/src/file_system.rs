use crate::commands::{FileNode, ProcessorConfig, ProjectResult};
use serde_json::json;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

/// Build a file tree structure from a directory
pub fn build_file_tree(path: &Path) -> io::Result<FileNode> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("root")
        .to_string();

    let path_str = path.to_string_lossy().to_string();

    if path.is_file() {
        return Ok(FileNode {
            name,
            path: path_str,
            node_type: "file".to_string(),
            children: None,
        });
    }

    // It's a directory
    let mut children = Vec::new();

    // Read directory entries
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            
            // Skip hidden files and common ignore patterns
            if let Some(file_name) = entry_path.file_name() {
                let name_str = file_name.to_string_lossy();
                if name_str.starts_with('.') 
                    || name_str == "node_modules" 
                    || name_str == "target" 
                    || name_str == ".git" {
                    continue;
                }
            }

            if let Ok(child) = build_file_tree(&entry_path) {
                children.push(child);
            }
        }
    }

    // Sort: directories first, then files
    children.sort_by(|a, b| {
        let a_is_dir = a.node_type == "dir";
        let b_is_dir = b.node_type == "dir";
        
        if a_is_dir && !b_is_dir {
            std::cmp::Ordering::Less
        } else if !a_is_dir && b_is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(FileNode {
        name,
        path: path_str,
        node_type: "dir".to_string(),
        children: Some(children),
    })
}

/// Read file content as string
pub fn read_file_content(path: &str) -> io::Result<String> {
    fs::read_to_string(path)
}

/// Write content to file
pub fn write_file_content(path: &str, content: &str) -> io::Result<()> {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)
}

/// Create a new empty file
pub fn create_file(path: &str) -> io::Result<()> {
    let path_obj = Path::new(path);
    
    // Ensure parent directory exists
    if let Some(parent) = path_obj.parent() {
        fs::create_dir_all(parent)?;
    }
    
    // Create empty file if it doesn't exist
    if !path_obj.exists() {
        fs::File::create(path)?;
    }
    
    Ok(())
}

/// Create a new folder
pub fn create_folder(path: &str) -> io::Result<()> {
    fs::create_dir_all(path)
}

/// Rename/move a file or folder
pub fn rename_item(old_path: &str, new_path: &str) -> io::Result<()> {
    let old_path_obj = Path::new(old_path);
    let new_path_obj = Path::new(new_path);
    
    // Check if source exists
    if !old_path_obj.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "Source path not found"
        ));
    }
    
    // Ensure parent directory of new path exists
    if let Some(parent) = new_path_obj.parent() {
        fs::create_dir_all(parent)?;
    }
    
    // Check if target already exists
    if new_path_obj.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "Target path already exists"
        ));
    }
    
    fs::rename(old_path, new_path)
}

/// Delete a file or folder
pub fn delete_item(path: &str) -> io::Result<()> {
    let path_obj = Path::new(path);
    
    if !path_obj.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "Path not found"
        ));
    }
    
    if path_obj.is_file() {
        fs::remove_file(path)
    } else if path_obj.is_dir() {
        fs::remove_dir_all(path)
    } else {
        Err(io::Error::new(
            io::ErrorKind::Other,
            "Unknown file type"
        ))
    }
}

/// Move a file or folder to a new location
pub fn move_item(source_path: &str, target_path: &str) -> io::Result<()> {
    let source = Path::new(source_path);
    let target = Path::new(target_path);
    
    // Check if source exists
    if !source.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "Source path not found"
        ));
    }
    
    // Ensure target parent directory exists
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    
    // Check if target already exists
    if target.exists() {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "Target path already exists"
        ));
    }
    
    // Move the item
    fs::rename(source, target)
}

/// Create a new project structure with SPF file
pub fn create_project_with_spf(project_path: &str, project_name: &str) -> io::Result<ProjectResult> {
    let path = Path::new(project_path);
    
    // Create directory if it doesn't exist
    if !path.exists() {
        fs::create_dir_all(path)?;
    }

    // Create main SPF file
    let spf_filename = format!("{}.spf", project_name);
    let spf_path = path.join(&spf_filename);

    let spf_content = json!({
        "projectName": project_name,
        "version": "1.0.0",
        "created": chrono::Utc::now().to_rfc3339(),
        "processors": [],
        "settings": {
            "defaultProcessor": null
        }
    });

    let mut file = fs::File::create(&spf_path)?;
    file.write_all(serde_json::to_string_pretty(&spf_content)?.as_bytes())?;

    Ok(ProjectResult {
        spf_path: spf_path.to_string_lossy().to_string()
    })
}

/// Generate processor structure and update SPF
pub fn generate_processor_structure(spf_path: &str, config: &ProcessorConfig) -> io::Result<String> {
    // 1. Locate project root based on SPF file
    let path = Path::new(spf_path);
    let project_root = path.parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Project directory not found"))?;

    // 2. Define processor folder path
    let processor_path = project_root.join(&config.name);

    // 3. Create physical folder structure
    if !processor_path.exists() {
        fs::create_dir_all(&processor_path)?;
    }

    // Create required subfolders
    fs::create_dir_all(processor_path.join("Hardware"))?;
    fs::create_dir_all(processor_path.join("Software"))?;
    fs::create_dir_all(processor_path.join("Simulation"))?;

    // 4. Update SPF file with new processor data
    
    // Read current SPF content
    let mut content = String::new();
    let mut file = fs::File::open(spf_path)?;
    file.read_to_string(&mut content)?;
    
    // Parse JSON
    let mut spf_data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;

    // Create processor object
    let processor_info = json!({
        "name": config.name,
        "totalBits": config.total_bits,
        "mantissaBits": config.mantissa_bits,
        "exponentBits": config.exponent_bits,
        "dataStackSize": config.data_stack_size,
        "instructionStackSize": config.instruction_stack_size,
        "inputPorts": config.input_ports,
        "outputPorts": config.output_ports,
        "gain": config.gain,
        "relativePath": config.name,
        "created": chrono::Utc::now().to_rfc3339()
    });

    // Add to "processors" array
    if let Some(processors) = spf_data.get_mut("processors") {
        if let Some(arr) = processors.as_array_mut() {
            arr.push(processor_info);
        }
    } else {
        spf_data["processors"] = json!([processor_info]);
    }

    // Set as default if first processor
    if let Some(settings) = spf_data.get_mut("settings") {
        if let Some(obj) = settings.as_object_mut() {
            let current_default = obj.get("defaultProcessor").and_then(|v| v.as_str());
            if current_default.is_none() {
                obj.insert("defaultProcessor".to_string(), json!(config.name));
            }
        }
    }

    // Save updated file
    let new_content = serde_json::to_string_pretty(&spf_data)
        .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        
    let mut file = fs::File::create(spf_path)?;
    file.write_all(new_content.as_bytes())?;

    Ok(format!("Processor {} structure created successfully", config.name))
}