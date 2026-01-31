// lib.rs - POLARIS Editor Library (OPTIMIZED)

mod terminal;

use tauri::Manager;
use terminal::TerminalManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(TerminalManager::new())
        .invoke_handler(tauri::generate_handler![
            // Terminal commands
            terminal::get_platform,
            terminal::get_shell_path,
            terminal::get_current_directory,
            terminal::create_pty,
            terminal::start_pty_stream,
            terminal::write_pty,
            terminal::resize_pty,
            terminal::kill_pty,
        ])
        .setup(|app| {
            // Show splashscreen first
            let splashscreen_window = app.get_webview_window("splashscreen").unwrap();
            let main_window = app.get_webview_window("main").unwrap();
            
            // Show splashscreen
            splashscreen_window.show().unwrap();
            
            // Close splashscreen and show main window after delay
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                splashscreen_window.close().unwrap();
                main_window.show().unwrap();
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}