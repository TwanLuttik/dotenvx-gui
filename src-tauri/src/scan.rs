use serde::Serialize;
use std::fs;
use std::path::Path;

const MAX_DEPTH: usize = 12;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct EnvFileHit {
    pub directory: String,
    pub name: String,
    pub path: String,
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".git"
            | "dist"
            | "build"
            | ".next"
            | "target"
            | "vendor"
            | "coverage"
            | ".turbo"
            | ".cache"
            | "out"
            | "tmp"
            | "temp"
            | ".vercel"
            | ".output"
            | ".nuxt"
            | "Pods"
    ) || (name.starts_with('.') && name != ".")
}

fn is_env_filename(name: &str) -> bool {
    name.starts_with(".env") && !name.ends_with(".db")
}

pub fn collect_env_files(root: &Path) -> Result<Vec<EnvFileHit>, String> {
    if !root.exists() {
        return Err(format!("Path does not exist: {}", root.display()));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", root.display()));
    }

    let mut hits = Vec::new();
    walk(root, 0, &mut hits)?;
    hits.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(hits)
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<EnvFileHit>) -> Result<(), String> {
    if depth > MAX_DEPTH {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .map_err(|error| format!("Failed to read directory {}: {}", dir.display(), error))?;

    for entry in entries {
        let entry = entry.map_err(|error| {
            format!("Failed to read entry in {}: {}", dir.display(), error)
        })?;
        let file_type = entry.file_type().map_err(|error| {
            format!("Failed to read type of {}: {}", entry.path().display(), error)
        })?;
        if file_type.is_symlink() {
            continue;
        }

        let name = match entry.file_name().to_str() {
            Some(name) => name.to_string(),
            None => continue,
        };
        let path = entry.path();

        if file_type.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            walk(&path, depth + 1, out)?;
            continue;
        }

        if file_type.is_file() && is_env_filename(&name) {
            out.push(EnvFileHit {
                directory: dir.to_string_lossy().to_string(),
                name,
                path: path.to_string_lossy().to_string(),
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn find_env_files(path: String) -> Result<Vec<EnvFileHit>, String> {
    collect_env_files(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::io::Write;

    fn temp_workspace() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dotenvx-scan-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_file(path: &Path, contents: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let mut file = fs::File::create(path).unwrap();
        file.write_all(contents.as_bytes()).unwrap();
    }

    #[test]
    fn finds_env_files_in_nested_packages() {
        let root = temp_workspace();
        write_file(&root.join("apps/api/.env"), "A=1\n");
        write_file(&root.join("apps/api/.env.production"), "A=2\n");
        write_file(&root.join("apps/next/.env"), "B=1\n");
        write_file(&root.join("README.md"), "nope\n");
        write_file(&root.join("node_modules/pkg/.env"), "SKIP=1\n");
        write_file(&root.join(".git/ignored.env"), "SKIP=1\n");

        let hits = collect_env_files(&root).unwrap();
        let names: Vec<_> = hits
            .iter()
            .map(|hit| {
                hit.path
                    .trim_start_matches(&format!("{}/", root.display()))
                    .to_string()
            })
            .collect();

        assert_eq!(
            names,
            vec![
                "apps/api/.env".to_string(),
                "apps/api/.env.production".to_string(),
                "apps/next/.env".to_string(),
            ]
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn includes_root_env_files_and_skips_db() {
        let root = temp_workspace();
        write_file(&root.join(".env"), "ROOT=1\n");
        write_file(&root.join(".env-backups.db"), "not-an-env");
        write_file(&root.join("apps/web/.env.local"), "WEB=1\n");

        let hits = collect_env_files(&root).unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits.iter().any(|hit| hit.name == ".env" && hit.directory == root.to_string_lossy()));
        assert!(hits.iter().any(|hit| hit.name == ".env.local"));
        assert!(!hits.iter().any(|hit| hit.name.ends_with(".db")));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn errors_when_root_is_missing() {
        let missing = std::env::temp_dir().join(format!("dotenvx-missing-{}", uuid::Uuid::new_v4()));
        let error = collect_env_files(&missing).unwrap_err();
        assert!(error.contains("does not exist"));
    }
}
