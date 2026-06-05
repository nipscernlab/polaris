mod commands;
mod file_system;
mod terminal;

use commands::*;
use terminal::TerminalManager; // Importante para o novo sistema de terminal
use tauri::Manager;
use std::time::Duration;

#[tauri::command]
async fn read_fst_as_vcd(path: String) -> Result<String, String> {
    use std::io::Write;

    // 1. Carrega o arquivo usando a API universal da biblioteca wellen
    let wave = wellen::simple::read(&path)
        .map_err(|e| format!("Falha ao ler o arquivo binário: {:?}", e))?;

    // Buffer em memória para construir a string VCD de texto
    let mut vcd_output = Vec::new();

    // --- ESCRITA DO CABEÇALHO VCD ---
    writeln!(vcd_output, "$date\n   Polaris Session\n$end").unwrap();
    writeln!(vcd_output, "$version\n   Polaris Native Wellen Converter\n$end").unwrap();
    
    let hierarchy = wave.hierarchy();
    
    // Extrai a escala de tempo
    let timescale_unit = match hierarchy.timescale() {
        Some(ts) => format!("{} {:?}", ts.factor, ts.unit),
        None => "1 ps".to_string(),
    };
    writeln!(vcd_output, "$timescale\n   {}\n$end", timescale_unit).unwrap();

    // --- DECLARAÇÃO DA HIERARQUIA DE SINAIS ---
    writeln!(vcd_output, "$scope module top $end").unwrap();
    
    for var_ref in hierarchy.vars() {
        let var = &hierarchy[var_ref];
        
        let name = var.name(&hierarchy); 
        let size = var.length(&hierarchy).unwrap_or(1);
        let id_str = var.signal_ref().index().to_string(); 
        
        writeln!(vcd_output, "$var wire {} {} {} $end", size, id_str, name).unwrap();
    }
    
    writeln!(vcd_output, "$upscope $end").unwrap();
    writeln!(vcd_output, "$enddefinitions $end").unwrap();

    // --- TRANSLADO DA LINHA DO TEMPO (TIMELINE) ---
    let time_table = wave.time_table();
    
    for (time_index, &time_value) in time_table.iter().enumerate() {
        writeln!(vcd_output, "#{}", time_value).unwrap();

        for var_ref in hierarchy.vars() {
            let var = &hierarchy[var_ref];
            let sig_ref = var.signal_ref();
            
            let size = var.length(&hierarchy).unwrap_or(1);
            let id_str = sig_ref.index().to_string();
            
            if let Some(signal) = wave.get_signal(sig_ref) {
                if let Some(offset) = signal.get_offset(time_index as u32) {
                    
                    // CORREÇÃO FINAL: Usamos get_value_at passando a referência do offset e o elemento 0
                    let value_str = signal.get_value_at(&offset, 0).to_string();
                    
                    if size == 1 {
                        writeln!(vcd_output, "{}{}", value_str, id_str).unwrap();
                    } else {
                        writeln!(vcd_output, "b{} {}", value_str, id_str).unwrap();
                    }
                }
            }
        }
    }

    // 3. Converte a sequência de bytes gerada em formato de texto plano UTF-8
    let vcd_string = String::from_utf8(vcd_output)
        .map_err(|e| format!("Erro na formatação de saída de texto do VCD: {}", e))?;

    Ok(vcd_string)
}

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
        read_fst_as_vcd,

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