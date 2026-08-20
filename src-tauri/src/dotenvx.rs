use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DotenvxStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

pub fn find_dotenvx() -> PathBuf {
    let homebrew_paths = [
        "/opt/homebrew/bin/dotenvx",
        "/usr/local/bin/dotenvx",
        "/usr/local/opt/dotenvx/bin/dotenvx",
    ];

    for path in homebrew_paths {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return candidate;
        }
    }

    PathBuf::from("dotenvx")
}

pub fn parse_dotenvx_version(output: &str) -> Option<String> {
    let first_line = output.lines().find(|line| !line.trim().is_empty())?;
    let mut version = first_line.trim();
    if let Some(rest) = version.strip_prefix("dotenvx") {
        version = rest.trim();
    }
    version = version.trim_start_matches('v').trim();
    if version.is_empty() || version.contains(' ') {
        return None;
    }
    Some(version.to_string())
}

fn resolve_dotenvx_path() -> Option<PathBuf> {
    let candidate = find_dotenvx();
    if candidate.exists() {
        return Some(candidate);
    }

    let output = Command::new("which").arg("dotenvx").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(PathBuf::from(path))
    }
}

#[tauri::command]
pub async fn get_dotenvx_status() -> DotenvxStatus {
    let Some(path) = resolve_dotenvx_path() else {
        return DotenvxStatus {
            installed: false,
            version: None,
            path: None,
        };
    };

    let output = Command::new(&path).arg("--version").output();
    match output {
        Ok(result) if result.status.success() => {
            let combined = format!(
                "{}{}",
                String::from_utf8_lossy(&result.stdout),
                String::from_utf8_lossy(&result.stderr)
            );
            DotenvxStatus {
                installed: true,
                version: parse_dotenvx_version(&combined),
                path: Some(path.to_string_lossy().to_string()),
            }
        }
        _ => DotenvxStatus {
            installed: path.exists(),
            version: None,
            path: Some(path.to_string_lossy().to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_semver() {
        assert_eq!(
            parse_dotenvx_version("1.51.4\n"),
            Some("1.51.4".to_string())
        );
    }

    #[test]
    fn parses_prefixed_version() {
        assert_eq!(
            parse_dotenvx_version("dotenvx v1.51.4"),
            Some("1.51.4".to_string())
        );
    }

    #[test]
    fn rejects_help_text() {
        assert_eq!(parse_dotenvx_version("Usage: dotenvx run -- yourcommand"), None);
    }
}
