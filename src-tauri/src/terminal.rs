use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[cfg(unix)]
use portable_pty::{CommandBuilder, PtyPair, PtySize as PtyDimensions, native_pty_system};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PtyOutputEvent {
    pub data: String,
}

pub struct PtyProcess {
    #[cfg(unix)]
    pair: Arc<Mutex<PtyPair>>,
    
    #[cfg(windows)]
    child: Arc<Mutex<std::process::Child>>,
    #[cfg(windows)]
    stdin: Arc<Mutex<std::process::ChildStdin>>,
    #[cfg(windows)]
    stdout: Arc<Mutex<std::process::ChildStdout>>,
    
    stop_signal: Arc<Mutex<bool>>,
}

pub struct TerminalManager {
    pub processes: Arc<Mutex<HashMap<u32, PtyProcess>>>,
    pub next_id: Arc<Mutex<u32>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1)),
        }
    }
}

#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    #[cfg(target_os = "linux")]
    return "linux".to_string();
    #[cfg(target_os = "macos")]
    return "macos".to_string();
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    return "unknown".to_string();
}

#[tauri::command]
pub fn get_shell_path() -> String {
    #[cfg(target_os = "windows")]
    {
        if std::path::Path::new("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe").exists() {
            return "powershell.exe".to_string();
        }
        return "cmd.exe".to_string();
    }
    
    #[cfg(unix)]
    {
        if let Ok(shell) = std::env::var("SHELL") {
            return shell;
        }
        
        #[cfg(target_os = "linux")]
        return "/bin/bash".to_string();
        
        #[cfg(target_os = "macos")]
        return "/bin/zsh".to_string();
        
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        return "/bin/sh".to_string();
    }
}

#[tauri::command]
pub fn get_current_directory() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[cfg(unix)]
#[tauri::command]
pub fn create_pty(
    shell: String,
    cwd: String,
    state: State<TerminalManager>,
) -> Result<u32, String> {
    use portable_pty::PtySystem;
    
    let pty_system = native_pty_system();
    
    let pair = pty_system
        .openpty(PtyDimensions {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    
    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(&cwd);
    
    pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    
    let mut next_id = state.next_id.lock().unwrap();
    let id = *next_id;
    *next_id += 1;
    
    let pty_process = PtyProcess {
        pair: Arc::new(Mutex::new(pair)),
        stop_signal: Arc::new(Mutex::new(false)),
    };
    
    state.processes.lock().unwrap().insert(id, pty_process);
    
    Ok(id)
}

#[cfg(windows)]
#[tauri::command]
pub fn create_pty(
    shell: String,
    cwd: String,
    state: State<TerminalManager>,
) -> Result<u32, String> {
    use std::process::{Command, Stdio};
    
    let mut cmd = Command::new(&shell);
    cmd.current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    
    let mut next_id = state.next_id.lock().unwrap();
    let id = *next_id;
    *next_id += 1;
    
    let pty_process = PtyProcess {
        child: Arc::new(Mutex::new(child)),
        stdin: Arc::new(Mutex::new(stdin)),
        stdout: Arc::new(Mutex::new(stdout)),
        stop_signal: Arc::new(Mutex::new(false)),
    };
    
    state.processes.lock().unwrap().insert(id, pty_process);
    
    Ok(id)
}

#[cfg(unix)]
#[tauri::command]
pub async fn start_pty_stream(
    pty_id: u32,
    app: AppHandle,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    let processes = state.processes.lock().unwrap();
    let pty = processes.get(&pty_id).ok_or("PTY not found")?.clone();
    drop(processes);
    
    let pair = pty.pair.clone();
    let stop_signal = pty.stop_signal.clone();
    let event_name = format!("pty-output-{}", pty_id);
    
    tauri::async_runtime::spawn(async move {
        let mut reader = {
            let pair_lock = pair.lock().unwrap();
            pair_lock.master.try_clone_reader().unwrap()
        };
        
        loop {
            if *stop_signal.lock().unwrap() {
                break;
            }
            
            let read_result = tokio::task::spawn_blocking({
                let mut reader_clone = reader.try_clone().unwrap();
                move || {
                    let mut buf = [0u8; 8192];
                    match reader_clone.read(&mut buf) {
                        Ok(n) => Ok((buf, n)),
                        Err(e) => Err(e),
                    }
                }
            }).await;
            
            match read_result {
                Ok(Ok((buf, n))) if n > 0 => {
                    // Convert bytes to UTF-8, preserving control characters
                    // Using lossy conversion to handle any invalid UTF-8
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    
                    let _ = app.emit(&event_name, PtyOutputEvent { data: output });
                }
                Ok(Ok(_)) => {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Ok(Err(_)) => {
                    if *stop_signal.lock().unwrap() {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(_) => {
                    break;
                }
            }
        }
    });
    
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub async fn start_pty_stream(
    pty_id: u32,
    app: AppHandle,
    state: State<'_, TerminalManager>,
) -> Result<(), String> {
    let processes = state.processes.lock().unwrap();
    let pty = processes.get(&pty_id).ok_or("PTY not found")?.clone();
    drop(processes);
    
    let stdout_mutex = pty.stdout.clone();
    let stop_signal = pty.stop_signal.clone();
    let event_name = format!("pty-output-{}", pty_id);
    
    tauri::async_runtime::spawn(async move {
        loop {
            if *stop_signal.lock().unwrap() {
                break;
            }
            
            let read_result = tokio::task::spawn_blocking({
                let stdout_mutex = stdout_mutex.clone();
                move || {
                    let mut stdout = stdout_mutex.lock().unwrap();
                    let mut buf = [0u8; 8192];
                    match stdout.read(&mut buf) {
                        Ok(n) => Ok((buf, n)),
                        Err(e) => Err(e),
                    }
                }
            }).await;
            
            match read_result {
                Ok(Ok((buf, n))) if n > 0 => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    
                    let _ = app.emit(&event_name, PtyOutputEvent { data: output });
                }
                Ok(Ok(_)) => {
                    break;
                }
                Ok(Err(_)) => {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(_) => {
                    break;
                }
            }
        }
    });
    
    Ok(())
}

#[cfg(unix)]
#[tauri::command]
pub fn write_pty(pty_id: u32, data: String, state: State<TerminalManager>) -> Result<(), String> {
    let processes = state.processes.lock().unwrap();
    
    if let Some(pty) = processes.get(&pty_id) {
        let pair = pty.pair.lock().unwrap();
        let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        
        // Write raw bytes - this includes backspace (\x7F or \x08) and all control chars
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err("PTY not found".to_string())
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn write_pty(pty_id: u32, data: String, state: State<TerminalManager>) -> Result<(), String> {
    let processes = state.processes.lock().unwrap();
    
    if let Some(pty) = processes.get(&pty_id) {
        let mut stdin = pty.stdin.lock().unwrap();
        
        // Write raw bytes to stdin
        stdin.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err("PTY not found".to_string())
    }
}

#[cfg(unix)]
#[tauri::command]
pub fn resize_pty(
    pty_id: u32,
    cols: u16,
    rows: u16,
    state: State<TerminalManager>,
) -> Result<(), String> {
    let processes = state.processes.lock().unwrap();
    
    if let Some(pty) = processes.get(&pty_id) {
        let pair = pty.pair.lock().unwrap();
        
        pair.master
            .resize(PtyDimensions {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err("PTY not found".to_string())
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn resize_pty(
    _pty_id: u32,
    _cols: u16,
    _rows: u16,
    _state: State<TerminalManager>,
) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn kill_pty(pty_id: u32, state: State<TerminalManager>) -> Result<(), String> {
    let mut processes = state.processes.lock().unwrap();
    
    if let Some(pty) = processes.remove(&pty_id) {
        *pty.stop_signal.lock().unwrap() = true;
        
        #[cfg(windows)]
        {
            let mut child = pty.child.lock().unwrap();
            let _ = child.kill();
        }
        
        Ok(())
    } else {
        Err("PTY not found".to_string())
    }
}

impl Clone for PtyProcess {
    fn clone(&self) -> Self {
        Self {
            #[cfg(unix)]
            pair: self.pair.clone(),
            
            #[cfg(windows)]
            child: self.child.clone(),
            #[cfg(windows)]
            stdin: self.stdin.clone(),
            #[cfg(windows)]
            stdout: self.stdout.clone(),
            
            stop_signal: self.stop_signal.clone(),
        }
    }
}