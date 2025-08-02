use std::process::Command;
use std::path::Path;
use std::fs;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct DirEntry {
    name: String,
    is_file: bool,
    is_dir: bool,
}

// Rust commands for file system operations
#[tauri::command]
async fn read_directory(path: String) -> Result<Vec<DirEntry>, String> {
    match fs::read_dir(&path) {
        Ok(entries) => {
            let mut result = Vec::new();
            for entry in entries {
                match entry {
                    Ok(entry) => {
                        let metadata = entry.metadata().map_err(|e| e.to_string())?;
                        if let Some(name) = entry.file_name().to_str() {
                            result.push(DirEntry {
                                name: name.to_string(),
                                is_file: metadata.is_file(),
                                is_dir: metadata.is_dir(),
                            });
                        }
                    }
                    Err(e) => return Err(e.to_string()),
                }
            }
            Ok(result)
        }
        Err(e) => Err(format!("Failed to read directory {}: {}", path, e)),
    }
}

#[tauri::command]
async fn read_text_file(path: String) -> Result<String, String> {
    match fs::read_to_string(&path) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file {}: {}", path, e)),
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn encrypt_env_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    // Check if dotenvx is installed
    let dotenvx_check = Command::new("dotenvx")
        .arg("--version")
        .output();

    if dotenvx_check.is_err() {
        return Err("dotenvx is not installed. Please install dotenvx first: npm install -g @dotenvx/dotenvx".to_string());
    }

    // Run dotenvx encrypt command
    let output = Command::new("dotenvx")
        .arg("encrypt")
        .arg("-f")
        .arg(&file_path)
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute dotenvx encrypt: {}", e))?;

    if output.status.success() {
        Ok("File encrypted successfully".to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx encrypt failed: {}", error_msg))
    }
}

#[tauri::command]
async fn decrypt_env_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    // Check if dotenvx is installed
    let dotenvx_check = Command::new("dotenvx")
        .arg("--version")
        .output();

    if dotenvx_check.is_err() {
        return Err("dotenvx is not installed. Please install dotenvx first: npm install -g @dotenvx/dotenvx".to_string());
    }

    // Run dotenvx decrypt command
    let output = Command::new("dotenvx")
        .arg("decrypt")
        .arg("-f")
        .arg(&file_path)
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute dotenvx decrypt: {}", e))?;

    if output.status.success() {
        Ok("File decrypted successfully".to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx decrypt failed: {}", error_msg))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_directory, read_text_file, encrypt_env_file, decrypt_env_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
