mod commands;
mod file_system;
mod terminal;

use commands::*;
use tauri::Manager;
use std::time::Duration;

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
        create_file,
        create_folder,
        rename_item,
        delete_item,
        move_item,
        create_project_structure,
        generate_processor,
        execute_command
    ]);

    // Setup handler for splash screen
    builder = builder.setup(|app| {
        let splashscreen_window = app.get_webview_window("splashscreen");
        let main_window = app.get_webview_window("main");

        if let (Some(splash), Some(main)) = (splashscreen_window, main_window) {
            // Clone for thread
            let main_clone = main.clone();
            let splash_clone = splash.clone();

            // Show splash screen and wait
            tauri::async_runtime::spawn(async move {
                // SPLASH SCREEN DURATION: Change this value to adjust timing (in milliseconds)
                // 10000ms = 10 seconds (matches SVG animation time of 9.6s)
                tokio::time::sleep(Duration::from_millis(10000)).await;

                // Show main window maximized (not fullscreen)
                let _ = main_clone.show();
                let _ = main_clone.maximize();
                let _ = main_clone.set_focus();

                // Small delay to ensure main window is visible
                tokio::time::sleep(Duration::from_millis(100)).await;

                // Then close splash screen
                let _ = splash_clone.close();
            });
        }

        Ok(())
    });

    // Run application
    builder
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}