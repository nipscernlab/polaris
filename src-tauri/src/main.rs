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
            get_file_tree,
            read_file,
            save_file,
            execute_command,
            create_project_structure, 
            generate_processor
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}