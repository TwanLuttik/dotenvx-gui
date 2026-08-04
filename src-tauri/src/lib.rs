use std::process::Command;
use std::path::{Path, PathBuf};
use std::fs;
use serde::{Deserialize, Serialize};
use tauri::Manager;

mod backup;
use backup::{BackupManager, Backup, BackupMetadata};

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

// Check whether a file is tracked by git (used to warn before writing plaintext to it)
#[tauri::command]
async fn is_file_git_tracked(file_path: String) -> Result<bool, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Ok(false);
    }

    let parent = path.parent().unwrap_or(Path::new("."));

    let output = Command::new("git")
        .arg("-C")
        .arg(parent)
        .arg("ls-files")
        .arg("--error-unmatch")
        .arg(&file_path)
        .output();

    match output {
        Ok(o) => Ok(o.status.success()),
        // git missing or not a repo - can't check, so don't warn
        Err(_) => Ok(false),
    }
}

// Check whether a file is covered by .gitignore. Returns true (= safe, no
// warning) when the file is ignored, and also when there is nothing to warn
// about: no git, not a repo, or the file doesn't exist.
#[tauri::command]
async fn is_file_git_ignored(file_path: String) -> Result<bool, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Ok(true);
    }

    let parent = path.parent().unwrap_or(Path::new("."));

    let output = Command::new("git")
        .arg("-C")
        .arg(parent)
        .arg("check-ignore")
        .arg("-q")
        .arg(&file_path)
        .output();

    match output {
        // check-ignore exits 0 = ignored, 1 = not ignored, 128 = not a repo
        Ok(o) => match o.status.code() {
            Some(1) => Ok(false),
            _ => Ok(true),
        },
        Err(_) => Ok(true),
    }
}

// Decrypt a single variable in memory via `dotenvx get` - never modifies the file
#[tauri::command]
async fn get_decrypted_value(file_path: String, key: String) -> Result<String, String> {
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

    // Run dotenvx get command - decrypts to stdout, file on disk is untouched
    let output = Command::new(&dotenvx_path)
        .arg("get")
        .arg(&key)
        .arg("-f")
        .arg(&file_path)
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute dotenvx get: {}", e))?;

    if output.status.success() {
        let value = String::from_utf8_lossy(&output.stdout);
        Ok(value.strip_suffix('\n').unwrap_or(&value).to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx get failed: {}", error_msg))
    }
}

// Decrypt every variable in memory via `dotenvx get --format json` - never modifies the file
#[tauri::command]
async fn get_decrypted_values(file_path: String) -> Result<String, String> {
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

    // Run dotenvx get command - decrypts all keys to stdout as JSON, file on disk is untouched
    let output = Command::new(&dotenvx_path)
        .arg("get")
        .arg("-f")
        .arg(&file_path)
        .arg("--format")
        .arg("json")
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute dotenvx get: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx get failed: {}", error_msg))
    }
}

// Encrypt a single variable in place via `dotenvx encrypt -k` - other
// variables in the file are left untouched
#[tauri::command]
async fn encrypt_env_key(file_path: String, key: String) -> Result<String, String> {
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

    // Run dotenvx encrypt for the single key
    let output = Command::new(&dotenvx_path)
        .arg("encrypt")
        .arg("-f")
        .arg(&file_path)
        .arg("-k")
        .arg(&key)
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute dotenvx encrypt: {}", e))?;

    if output.status.success() {
        Ok(format!("{} encrypted successfully", key))
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx encrypt failed: {}", error_msg))
    }
}

// Set (add or update) a variable via `dotenvx set` - the value is encrypted
// before it is written when the file has a public key, so plaintext never
// touches the disk for encrypted files
#[tauri::command]
async fn set_env_value(
    file_path: String,
    key: String,
    value: String,
    plain: bool,
) -> Result<String, String> {
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

    // Run dotenvx set command; --plain writes the value without encrypting
    let mut cmd = Command::new(&dotenvx_path);
    cmd.arg("set")
        .arg(&key)
        .arg(&value)
        .arg("-f")
        .arg(&file_path);
    if plain {
        cmd.arg("--plain");
    }
    let output = cmd
        .current_dir(path.parent().unwrap_or(Path::new(".")))
        .output()
        .map_err(|e| format!("Failed to execute dotenvx set: {}", e))?;

    if output.status.success() {
        Ok(format!("{} set successfully", key))
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("dotenvx set failed: {}", error_msg))
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

fn get_backup_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}

#[tauri::command]
async fn create_backup(
    app_handle: tauri::AppHandle,
    project_id: String,
    file_path: String,
    content: String,
    password: Option<String>,
) -> Result<Backup, String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .create_backup(project_id, file_path, content, password)
        .map_err(|e| format!("Failed to create backup: {}", e))
}

#[tauri::command]
async fn get_backup(
    app_handle: tauri::AppHandle,
    backup_id: String,
    password: Option<String>,
) -> Result<Option<Backup>, String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .get_backup(&backup_id, password)
        .map_err(|e| format!("Failed to get backup: {}", e))
}

#[tauri::command]
async fn list_backups(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<BackupMetadata>, String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .list_backups(&project_id)
        .map_err(|e| format!("Failed to list backups: {}", e))
}

#[tauri::command]
async fn delete_backup(
    app_handle: tauri::AppHandle,
    backup_id: String,
) -> Result<(), String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .delete_backup(&backup_id)
        .map_err(|e| format!("Failed to delete backup: {}", e))
}

#[tauri::command]
async fn delete_all_backups(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<(), String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .delete_all_backups(&project_id)
        .map_err(|e| format!("Failed to delete all backups: {}", e))
}

#[tauri::command]
async fn get_backup_count(app_handle: tauri::AppHandle) -> Result<i64, String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .get_backup_count()
        .map_err(|e| format!("Failed to get backup count: {}", e))
}

#[tauri::command]
async fn get_database_size(app_handle: tauri::AppHandle) -> Result<i64, String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .get_database_size()
        .map_err(|e| format!("Failed to get database size: {}", e))
}

#[tauri::command]
async fn reset_backup_database(app_handle: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_backup_db_path(&app_handle)?;
    let manager = BackupManager::new(db_path)
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .reset_database()
        .map_err(|e| format!("Failed to reset database: {}", e))
}

#[tauri::command]
async fn get_app_data_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
        .and_then(|path| {
            path.to_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "Failed to convert path to string".to_string())
        })
}

#[tauri::command]
async fn get_home_dir() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE directory".to_string())
    }
    
    #[cfg(target_os = "linux")]
    {
        std::env::var("HOME").map_err(|_| "Failed to get HOME directory".to_string())
    }
}

#[tauri::command]
async fn debug_get_all_backups(db_path: String) -> Result<Vec<BackupMetadata>, String> {
    let manager = BackupManager::new(PathBuf::from(&db_path))
        .map_err(|e| format!("Failed to initialize backup manager: {}", e))?;
    
    manager
        .get_all_backups()
        .map_err(|e| format!("Failed to get all backups: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_directory,
            read_text_file,
            open_folder,
            encrypt_env_file,
            decrypt_env_file,
            is_file_git_tracked,
            is_file_git_ignored,
            get_decrypted_value,
            get_decrypted_values,
            set_env_value,
            encrypt_env_key,
            rotate_key,
            create_backup,
            get_backup,
            list_backups,
            delete_backup,
            delete_all_backups,
            get_backup_count,
            get_database_size,
            reset_backup_database,
            get_app_data_dir,
            get_home_dir,
            debug_get_all_backups
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
