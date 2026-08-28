use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::Manager;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct OnePasswordVault {
    pub id: String,
    pub title: String,
    #[serde(rename = "vaultType", default)]
    pub vault_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BridgeResponse {
    ok: bool,
    error: Option<String>,
    vaults: Option<Vec<OnePasswordVault>>,
    vault: Option<OnePasswordVault>,
    #[serde(rename = "itemId")]
    item_id: Option<String>,
    #[serde(rename = "vaultId")]
    vault_id: Option<String>,
    title: Option<String>,
}

#[derive(Debug, Serialize)]
struct BridgeFile {
    name: String,
    #[serde(rename = "relativePath")]
    relative_path: String,
    content: String,
}

fn relative_file_path(project_path: &str, file_path: &str) -> String {
    let root = project_path.replace('\\', "/").trim_end_matches('/').to_string();
    let file = file_path.replace('\\', "/");
    if !root.is_empty() && (file == root || file.starts_with(&format!("{root}/"))) {
        let relative = file[root.len().min(file.len())..].trim_start_matches('/');
        if !relative.is_empty() {
            return relative.to_string();
        }
    }
    Path::new(file_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(file_path)
        .to_string()
}

#[derive(Debug, Serialize, Clone)]
pub struct OnePasswordSaveResult {
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "vaultId")]
    pub vault_id: String,
    pub title: String,
}

fn find_js_runtime() -> Result<PathBuf, String> {
    let mut candidates = vec![
        PathBuf::from("/opt/homebrew/bin/bun"),
        PathBuf::from("/usr/local/bin/bun"),
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
    ];

    if let Ok(home) = std::env::var("HOME") {
        candidates.insert(0, PathBuf::from(home).join(".bun/bin/bun"));
    }

    for path in candidates {
        if path.exists() {
            return Ok(path);
        }
    }

    for name in ["bun", "node"] {
        if let Ok(output) = Command::new("/usr/bin/which").arg(name).output() {
            if output.status.success() {
                let found = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !found.is_empty() {
                    return Ok(PathBuf::from(found));
                }
            }
        }
    }

    Err("Node.js or Bun is required to talk to the 1Password SDK. Install Node or Bun, or open Dotenvx from a terminal where `node` is on PATH.".to_string())
}

fn bridge_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_script = manifest_dir.join("../scripts/onepassword-bridge.cjs");
    let dev_modules = manifest_dir.join("../node_modules");

    if dev_script.exists() && dev_modules.exists() {
        return Ok((
            dev_script.canonicalize().unwrap_or(dev_script),
            dev_modules.canonicalize().unwrap_or(dev_modules),
        ));
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to resolve resource directory: {e}"))?;

    resolve_production_bridge_paths(&resource_dir)
        .ok_or_else(|| "Could not find the 1Password bridge script.".to_string())
}

fn production_bridge_candidates(resource_dir: &Path) -> Vec<(PathBuf, PathBuf)> {
    vec![
        (
            resource_dir.join("onepassword-bridge.cjs"),
            resource_dir.join("node_modules"),
        ),
        // Array-style bundle.resources rewrite `../` to `_up_`.
        (
            resource_dir
                .join("_up_")
                .join("scripts")
                .join("onepassword-bridge.cjs"),
            resource_dir.join("_up_").join("node_modules"),
        ),
    ]
}

fn resolve_production_bridge_paths(resource_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    production_bridge_candidates(resource_dir)
        .into_iter()
        .find(|(script, _)| script.is_file())
}

fn run_bridge(
    app: &tauri::AppHandle,
    payload: serde_json::Value,
) -> Result<BridgeResponse, String> {
    let runtime = find_js_runtime()?;
    let (script, node_modules) = bridge_paths(app)?;

    let mut command = Command::new(&runtime);
    command
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("NODE_PATH", &node_modules);

    if let Some(parent) = node_modules.parent() {
        command.current_dir(parent);
    }

    let mut child = command.spawn().map_err(|e| {
        format!(
            "Failed to start 1Password bridge with {}: {e}",
            runtime.display()
        )
    })?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.to_string().as_bytes())
            .map_err(|e| format!("Failed to send request to 1Password bridge: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("1Password bridge failed: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if stdout.is_empty() {
        return Err(if stderr.is_empty() {
            "1Password bridge returned no output. Is the 1Password desktop app running with SDK integration enabled?".to_string()
        } else {
            stderr
        });
    }

    let response: BridgeResponse = serde_json::from_str(&stdout).map_err(|e| {
        format!(
            "Invalid 1Password bridge response: {e}. {}",
            if stderr.is_empty() {
                stdout.clone()
            } else {
                stderr.clone()
            }
        )
    })?;

    if !response.ok {
        return Err(response.error.unwrap_or_else(|| {
            if stderr.is_empty() {
                "1Password request failed".to_string()
            } else {
                stderr.clone()
            }
        }));
    }

    Ok(response)
}

fn read_secret_files(
    project_path: &str,
    file_paths: &[String],
) -> Result<Vec<BridgeFile>, String> {
    let mut files = Vec::new();
    for path in file_paths {
        let path_obj = Path::new(path);
        let name = path_obj
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("Invalid file path: {path}"))?
            .to_string();

        if name == ".env.example" {
            continue;
        }

        let content = std::fs::read_to_string(path_obj)
            .map_err(|e| format!("Failed to read {name} from disk: {e}"))?;
        let relative_path = relative_file_path(project_path, path);
        files.push(BridgeFile {
            name: relative_path.clone(),
            relative_path,
            content,
        });
    }

    if files.is_empty() {
        return Err("No secret env files to save. Add a .env or .env.keys file first.".to_string());
    }

    Ok(files)
}

#[tauri::command]
pub async fn onepassword_list_vaults(
    app_handle: tauri::AppHandle,
    account_name: String,
) -> Result<Vec<OnePasswordVault>, String> {
    let response = run_bridge(
        &app_handle,
        serde_json::json!({
            "action": "listVaults",
            "accountName": account_name,
        }),
    )?;
    Ok(response.vaults.unwrap_or_default())
}

#[tauri::command]
pub async fn onepassword_create_vault(
    app_handle: tauri::AppHandle,
    account_name: String,
    title: Option<String>,
) -> Result<OnePasswordVault, String> {
    let response = run_bridge(
        &app_handle,
        serde_json::json!({
            "action": "createVault",
            "accountName": account_name,
            "title": title.unwrap_or_else(|| "Dotenvx".to_string()),
            "description": "Environment files saved from Dotenvx",
        }),
    )?;
    response
        .vault
        .ok_or_else(|| "1Password did not return the new vault".to_string())
}

#[tauri::command]
pub async fn onepassword_save_project(
    app_handle: tauri::AppHandle,
    account_name: String,
    vault_id: String,
    item_id: Option<String>,
    project_name: String,
    project_path: String,
    file_paths: Vec<String>,
) -> Result<OnePasswordSaveResult, String> {
    let files = read_secret_files(&project_path, &file_paths)?;
    let saved_at = chrono::Utc::now().to_rfc3339();
    let title = format!("Dotenvx / {project_name}");
    let notes = format!(
        "Saved from Dotenvx\nProject: {project_path}\nLast saved: {saved_at}\nFiles: {}",
        files
            .iter()
            .map(|file| file.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let response = run_bridge(
        &app_handle,
        serde_json::json!({
            "action": "saveProject",
            "accountName": account_name,
            "vaultId": vault_id,
            "itemId": item_id,
            "title": title,
            "projectPath": project_path,
            "notes": notes,
            "files": files,
        }),
    )?;

    Ok(OnePasswordSaveResult {
        item_id: response
            .item_id
            .ok_or_else(|| "1Password did not return an item id".to_string())?,
        vault_id: response.vault_id.unwrap_or(vault_id),
        title: response.title.unwrap_or(title),
    })
}

#[cfg(test)]
mod tests {
    use super::{relative_file_path, resolve_production_bridge_paths};
    use std::fs;
    use std::path::Path;

    #[test]
    fn uses_path_under_the_project_root() {
        assert_eq!(
            relative_file_path("/repo", "/repo/apps/api/.env"),
            "apps/api/.env"
        );
        assert_eq!(relative_file_path("/repo", "/repo/.env"), ".env");
    }

    #[test]
    fn falls_back_to_the_basename_outside_the_project() {
        assert_eq!(
            relative_file_path("/repo", "/other/apps/api/.env"),
            ".env"
        );
    }

    fn with_temp_dir(test: impl FnOnce(&Path)) {
        let dir = std::env::temp_dir().join(format!("dotenvx-op-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        test(&dir);
        let _ = fs::remove_dir_all(&dir);
    }

    fn touch(path: &Path) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, "").unwrap();
    }

    #[test]
    fn finds_the_bridge_in_tauri_parent_resource_layout() {
        with_temp_dir(|resource_dir| {
            let script = resource_dir
                .join("_up_")
                .join("scripts")
                .join("onepassword-bridge.cjs");
            let modules = resource_dir.join("_up_").join("node_modules");
            touch(&script);
            fs::create_dir_all(&modules).unwrap();

            assert_eq!(
                resolve_production_bridge_paths(resource_dir),
                Some((script, modules))
            );
        });
    }

    #[test]
    fn finds_the_bridge_when_resources_are_mapped_to_the_bundle_root() {
        with_temp_dir(|resource_dir| {
            let script = resource_dir.join("onepassword-bridge.cjs");
            let modules = resource_dir.join("node_modules");
            touch(&script);
            fs::create_dir_all(&modules).unwrap();

            assert_eq!(
                resolve_production_bridge_paths(resource_dir),
                Some((script, modules))
            );
        });
    }

    #[test]
    fn prefers_mapped_bundle_root_over_parent_resource_layout() {
        with_temp_dir(|resource_dir| {
            let mapped_script = resource_dir.join("onepassword-bridge.cjs");
            let mapped_modules = resource_dir.join("node_modules");
            touch(&mapped_script);
            fs::create_dir_all(&mapped_modules).unwrap();
            touch(
                &resource_dir
                    .join("_up_")
                    .join("scripts")
                    .join("onepassword-bridge.cjs"),
            );

            assert_eq!(
                resolve_production_bridge_paths(resource_dir),
                Some((mapped_script, mapped_modules))
            );
        });
    }

    #[test]
    fn returns_none_when_the_bridge_is_not_bundled() {
        with_temp_dir(|resource_dir| {
            assert_eq!(resolve_production_bridge_paths(resource_dir), None);
        });
    }
}
