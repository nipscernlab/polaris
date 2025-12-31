use std::process::{Command, Stdio};
use std::io::{self};

/// Execute a terminal command and return the output
pub fn execute_command(command: &str) -> io::Result<String> {
    // Parse the command into parts
    let parts: Vec<&str> = command.split_whitespace().collect();
    
    if parts.is_empty() {
        return Ok(String::new());
    }

    // Handle built-in commands
    match parts[0] {
        "help" => {
            return Ok(get_help_text());
        }
        "clear" => {
            return Ok(String::from("\x1b[2J\x1b[H"));
        }
        "echo" => {
            return Ok(parts[1..].join(" "));
        }
        _ => {}
    }

    // Execute system command
    execute_system_command(&parts)
}

fn execute_system_command(parts: &[&str]) -> io::Result<String> {
    let program = parts[0];
    let args = &parts[1..];

    // Determine the shell based on the OS
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(&["/C", &parts.join(" ")]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(&["-c", &parts.join(" ")]);
        c
    };

    // Execute the command
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?
        .wait_with_output()?;

    // Convert output to string
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).to_string();
        if error.is_empty() {
            Err(io::Error::new(
                io::ErrorKind::Other,
                "Command failed with no output",
            ))
        } else {
            Err(io::Error::new(io::ErrorKind::Other, error))
        }
    }
}

fn get_help_text() -> String {
    String::from(
        r#"POLARIS Terminal - Available Commands:

Built-in Commands:
  help        Show this help message
  clear       Clear the terminal
  echo        Echo text to terminal

You can also run any system command available in your PATH.

Examples:
  ls          List directory contents (Unix)
  dir         List directory contents (Windows)
  pwd         Print working directory (Unix)
  cd          Change directory
  cargo       Rust package manager commands
  npm         Node package manager commands

Press Ctrl+` to toggle terminal visibility.
"#,
    )
}