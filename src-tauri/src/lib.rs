use std::process::Command;
use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct DirEntry {
    name: String,
    is_file: bool,
    is_dir: bool,
}

// Helper function to find dotenvx binary
fn find_dotenvx() -> PathBuf {
    // Common Homebrew installation paths
    let homebrew_paths = vec![
        "/opt/homebrew/bin/dotenvx",      // Apple Silicon Macs
        "/usr/local/bin/dotenvx",         // Intel Macs
        "/usr/local/opt/dotenvx/bin/dotenvx",
    ];

    // Check Homebrew paths first
    for path in homebrew_paths {
        let pb = PathBuf::from(path);
        if pb.exists() {
            return pb;
        }
    }

    // Fall back to system PATH
    PathBuf::from("dotenvx")
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

// Open a folder using the system's native open command
#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    let path_obj = Path::new(&path);
    
    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .output()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .output()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .output()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
async fn encrypt_env_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let dotenvx_path = find_dotenvx();

    // Check if dotenvx is installed
    let dotenvx_check = Command::new(&dotenvx_path)
        .arg("--version")
        .output();

    if dotenvx_check.is_err() {
        return Err("dotenvx is not installed. Please install dotenvx first: brew install dotenvx".to_string());
    }

    // Run dotenvx encrypt command
    let output = Command::new(&dotenvx_path)
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

    let dotenvx_path = find_dotenvx();

    // Check if dotenvx is installed
    let dotenvx_check = Command::new(&dotenvx_path)
        .arg("--version")
        .output();

    if dotenvx_check.is_err() {
        return Err("dotenvx is not installed. Please install dotenvx first: brew install dotenvx".to_string());
    }

    // Run dotenvx decrypt command
    let output = Command::new(&dotenvx_path)
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

// Helper function to derive .env file path from key name
fn get_env_file_from_key(key_name: &str, keys_dir: &Path) -> PathBuf {
    // DOTENV_PRIVATE_KEY -> .env
    // DOTENV_PRIVATE_KEY_PRODUCTION -> .env.production
    // DOTENV_PRIVATE_KEY_STAGING -> .env.staging
    
    if key_name == "DOTENV_PRIVATE_KEY" {
        keys_dir.join(".env")
    } else {
        // Remove DOTENV_PRIVATE_KEY_ prefix and convert to lowercase with dots
        let suffix = key_name.strip_prefix("DOTENV_PRIVATE_KEY_").unwrap_or("");
        let env_name = suffix.to_lowercase().replace('_', ".");
        keys_dir.join(format!(".env.{}", env_name))
    }
}

#[tauri::command]
async fn rotate_key(keys_file_path: String, key_name: String) -> Result<String, String> {
    let keys_path = Path::new(&keys_file_path);
    
    if !keys_path.exists() {
        return Err(format!("Keys file does not exist: {}", keys_file_path));
    }

    let keys_dir = keys_path.parent().unwrap_or(Path::new("."));
    let env_file_path = get_env_file_from_key(&key_name, keys_dir);

    let dotenvx_path = find_dotenvx();

    // Check if dotenvx is installed
    let dotenvx_check = Command::new(&dotenvx_path)
        .arg("--version")
        .output();

    if dotenvx_check.is_err() {
        return Err("dotenvx is not installed. Please install dotenvx first: brew install dotenvx".to_string());
    }

    // Run dotenvx rotate command
    let output = Command::new(&dotenvx_path)
        .arg("rotate")
        .arg("-f")
        .arg(&env_file_path)
        .current_dir(keys_dir)
        .output()
        .map_err(|e| format!("Failed to execute dotenvx rotate: {}", e))?;

    if output.status.success() {
        Ok("Key rotated successfully".to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx rotate failed: {}", error_msg))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_directory, read_text_file, open_folder, encrypt_env_file, decrypt_env_file, rotate_key])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
