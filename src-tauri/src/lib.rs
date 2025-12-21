mod commands;
mod file_system;
mod terminal;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Log plugin for debug builds
    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    // Register plugins
    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init());

    // Register commands
    builder = builder.invoke_handler(tauri::generate_handler![
        get_file_tree,
        read_file,
        save_file,
        create_project_structure,
        generate_processor,
        execute_command
    ]);

    // Run application
    builder
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}