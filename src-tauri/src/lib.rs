mod commands;
mod file_system;
mod terminal;

use commands::*;
use terminal::TerminalManager; // Importante para o novo sistema de terminal
use tauri::Manager;
use std::time::Duration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // --- 1. Configuração de Plugins (Mantendo lógica segura do código antigo) ---
    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init());

    // --- 2. Gerenciamento de Estado (Do código novo - Essencial) ---
    builder = builder.manage(TerminalManager::new());

    // --- 3. Registro de Comandos (Fusão das duas listas) ---
    builder = builder.invoke_handler(tauri::generate_handler![
        // Comandos de Arquivo e Projeto (Vêm do mod commands / código antigo)
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
        execute_command, 

        // Comandos do Terminal PTY (Vêm do mod terminal / código novo)
        terminal::get_platform,
        terminal::get_shell_path,
        terminal::get_current_directory,
        terminal::create_pty,
        terminal::start_pty_stream,
        terminal::write_pty,
        terminal::resize_pty,
        terminal::kill_pty,
    ]);

    // --- 4. Setup e Splash Screen (Mantendo a lógica de 10s do código antigo) ---
    builder = builder.setup(|app| {
        let splashscreen_window = app.get_webview_window("splashscreen");
        let main_window = app.get_webview_window("main");

        if let (Some(splash), Some(main)) = (splashscreen_window, main_window) {
            // Clone for thread
            let main_clone = main.clone();
            let splash_clone = splash.clone();

            // Show splash screen and wait
            tauri::async_runtime::spawn(async move {
                // SPLASH SCREEN DURATION: 10000ms = 10 seconds (matches SVG animation)
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

    // --- 5. Executar aplicação ---
    builder
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}