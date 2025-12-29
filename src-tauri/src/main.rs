// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod file_system;
mod terminal;

use commands::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // File tree operations
            get_file_tree,
            
            // File operations
            read_file,
            save_file,
            create_file,
            create_folder,
            rename_item,
            delete_item,
            move_item,
            
            // Project operations
            create_project_structure, 
            generate_processor,
            
            // Terminal operations
            execute_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}