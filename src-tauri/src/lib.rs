mod commands;
mod file_system;
mod terminal;

use commands::*;
use terminal::TerminalManager; // Importante para o novo sistema de terminal
use tauri::Manager;
use std::time::Duration;

use std::io::Write;
use std::collections::{HashMap, HashSet};
use wellen::{ScopeRef, VarRef};

// Função para gerar IDs padrão VCD (exatamente iguais ao do GTKWave: '!', '"', '#', etc)
fn index_to_vcd_id(mut index: usize) -> String {
    let mut id = String::new();
    loop {
        id.push(((index % 94) as u8 + 33) as char);
        index /= 94;
        if index == 0 { break; }
    }
    id
}

// Função recursiva usando os iteradores diretos de pasta
fn write_scope(
    hierarchy: &wellen::Hierarchy,
    scope_ref: ScopeRef,
    vcd_output: &mut Vec<u8>,
    all_vars: &mut Vec<VarRef>
) {
    let scope = &hierarchy[scope_ref];
    let name = scope.name(hierarchy);
    
    writeln!(vcd_output, "$scope module {} $end", name).unwrap();
    
    for var in scope.vars(hierarchy) {
        let var_ref = var.clone();
        let var_obj = &hierarchy[var_ref];
        let mut var_name = var_obj.name(hierarchy).replace(" ", "_");
        if var_name.is_empty() { var_name = format!("unnamed_{}", var_ref.index()); }
        
        let size = var_obj.length(hierarchy).unwrap_or(1);
        let sig_ref = var_obj.signal_ref();
        let id_str = index_to_vcd_id(sig_ref.index()); 
        
        writeln!(vcd_output, "$var wire {} {} {} $end", size, id_str, var_name).unwrap();
        all_vars.push(var_ref);
    }
    
    for child in scope.scopes(hierarchy) {
        write_scope(hierarchy, child.clone(), vcd_output, all_vars);
    }
    
    writeln!(vcd_output, "$upscope $end").unwrap();
}

#[tauri::command]
async fn read_fst_as_vcd(path: String) -> Result<String, String> {
    // 1. Carrega o arquivo (Tornamos a wave mutável para poder descompactar os dados depois)
    let mut wave = wellen::simple::read(&path)
        .map_err(|e| format!("Falha ao ler o arquivo binário: {:?}", e))?;

    let mut vcd_output = Vec::new();

    writeln!(vcd_output, "$date\n   Polaris Session\n$end").unwrap();
    writeln!(vcd_output, "$version\n   Polaris Native Wellen Converter\n$end").unwrap();
    
    let mut all_vars = Vec::new();
    
    // =========================================================================
    // BLOCO 1: LER A HIERARQUIA (Escopo de empréstimo)
    // =========================================================================
    {
        let hierarchy = wave.hierarchy();
        
        let timescale_unit = match hierarchy.timescale() {
            Some(ts) => format!("{}{:?}", ts.factor, ts.unit).to_lowercase(),
            None => "1ns".to_string(),
        };
        writeln!(vcd_output, "$timescale\n\t{}\n$end", timescale_unit).unwrap();
        
        // Raiz
        for var in hierarchy.vars() {
            let var_ref = var.clone();
            let var_obj = &hierarchy[var_ref];
            let mut var_name = var_obj.name(hierarchy).replace(" ", "_");
            if var_name.is_empty() { var_name = format!("unnamed_{}", var_ref.index()); }
            
            let size = var_obj.length(hierarchy).unwrap_or(1);
            let sig_ref = var_obj.signal_ref();
            let id_str = index_to_vcd_id(sig_ref.index());
            
            writeln!(vcd_output, "$var wire {} {} {} $end", size, id_str, var_name).unwrap();
            all_vars.push(var_ref);
        }
        
        // Pastas Principais
        for scope_ref in hierarchy.scopes() {
            write_scope(&hierarchy, scope_ref, &mut vcd_output, &mut all_vars);
        }
        
        writeln!(vcd_output, "$enddefinitions $end").unwrap();
    } // Aqui a `hierarchy` é liberada da memória temporariamente.

    // =========================================================================
    // BLOCO 2: O SEGREDO DO FST (Descompactar os sinais reais para a RAM)
    // =========================================================================
    let all_sigs: Vec<wellen::SignalRef> = {
        let hierarchy = wave.hierarchy();
        let mut set = HashSet::new();
        // Coletamos IDs únicos dos sinais físicos para não carregar duplicatas (aliases)
        for v in &all_vars {
            set.insert(hierarchy[*v].signal_ref());
        }
        set.into_iter().collect()
    };
    
    // ESTA É A LINHA MÁGICA: Extrai os bits dos blocos zipados!
    wave.load_signals(&all_sigs);

    // =========================================================================
    // BLOCO 3: PREENCHER A LINHA DO TEMPO (Agora com dados de verdade)
    // =========================================================================
    let hierarchy = wave.hierarchy();
    let time_table = wave.time_table();
    let mut last_state: HashMap<usize, String> = HashMap::new();
    
    writeln!(vcd_output, "#{}", time_table.first().unwrap_or(&0)).unwrap();
    writeln!(vcd_output, "$dumpvars").unwrap();
    
    let mut dumped_in_this_step = HashSet::new();
    
    for var_ref in &all_vars {
        let var = &hierarchy[*var_ref];
        let sig_ref = var.signal_ref();
        
        if !dumped_in_this_step.insert(sig_ref.index()) { continue; }
        
        let size = var.length(&hierarchy).unwrap_or(1);
        let id_str = index_to_vcd_id(sig_ref.index());
        let mut current_value = "x".repeat(size as usize);
        
        if let Some(signal) = wave.get_signal(sig_ref) {
            if let Some(offset) = signal.get_offset(0) {
                let value_ref = signal.get_value_at(&offset, 0);
                current_value = value_ref.to_bit_string().unwrap_or(current_value);
            }
        }
        
        if size == 1 {
            writeln!(vcd_output, "{}{}", current_value, id_str).unwrap();
        } else {
            writeln!(vcd_output, "b{} {}", current_value, id_str).unwrap();
        }
        last_state.insert(sig_ref.index(), current_value);
    }
    writeln!(vcd_output, "$end").unwrap();

    for (time_index, &time_value) in time_table.iter().enumerate() {
        if time_index == 0 { continue; }
        
        let mut dumped_in_this_step = HashSet::new();
        let mut step_changes = Vec::new(); 
        
        for var_ref in &all_vars {
            let var = &hierarchy[*var_ref];
            let sig_ref = var.signal_ref();
            
            if !dumped_in_this_step.insert(sig_ref.index()) { continue; }
            
            let size = var.length(&hierarchy).unwrap_or(1);
            let id_str = index_to_vcd_id(sig_ref.index());
            
            if let Some(signal) = wave.get_signal(sig_ref) {
                if let Some(offset) = signal.get_offset(time_index as u32) {
                    let value_ref = signal.get_value_at(&offset, 0);
                    let val = value_ref.to_bit_string().unwrap_or_else(|| "x".repeat(size as usize));
                    
                    let changed = last_state.get(&sig_ref.index()) != Some(&val);
                    if changed {
                        if size == 1 {
                            writeln!(step_changes, "{}{}", val, id_str).unwrap();
                        } else {
                            writeln!(step_changes, "b{} {}", val, id_str).unwrap();
                        }
                        last_state.insert(sig_ref.index(), val);
                    }
                }
            }
        }
        
        if !step_changes.is_empty() {
            writeln!(vcd_output, "#{}", time_value).unwrap();
            vcd_output.write_all(&step_changes).unwrap();
        }
    }

    let vcd_string = String::from_utf8(vcd_output)
        .map_err(|e| format!("Erro na formatação de saída de texto do VCD: {}", e))?;

    Ok(vcd_string)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // --- 1. Configuração de Plugins ---
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

    // --- 2. Gerenciamento de Estado ---
    builder = builder.manage(TerminalManager::new());

    // --- 3. Registro de Comandos ---
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
        execute_command, 
        read_fst_as_vcd,
        terminal::get_platform,
        terminal::get_shell_path,
        terminal::get_current_directory,
        terminal::create_pty,
        terminal::start_pty_stream,
        terminal::write_pty,
        terminal::resize_pty,
        terminal::kill_pty,
    ]);

    // --- 4. Setup e Splash Screen ---
    builder = builder.setup(|app| {
        let splashscreen_window = app.get_webview_window("splashscreen");
        let main_window = app.get_webview_window("main");

        if let (Some(splash), Some(main)) = (splashscreen_window, main_window) {
            let main_clone = main.clone();
            let splash_clone = splash.clone();

            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(10000)).await;

                let _ = main_clone.show();
                let _ = main_clone.maximize();
                let _ = main_clone.set_focus();

                tokio::time::sleep(Duration::from_millis(100)).await;

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