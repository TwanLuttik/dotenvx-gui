use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use chrono::Utc;
use rand::Rng;
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub content: String,
    pub encrypted: bool,
    pub created_at: String,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub encrypted: bool,
    pub created_at: String,
    pub size: i64,
}

pub struct BackupManager {
    db_path: PathBuf,
}

fn cantopen(message: String) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
        Some(message),
    )
}

/// Older builds wrote the SQLite file at the app-data path itself. Current
/// builds store `backups.db` inside that directory, so a leftover file blocks
/// opening `/.../com.dotenvx-gui.app/backups.db`.
fn prepare_database_path(db_path: &Path) -> SqliteResult<()> {
    let Some(parent) = db_path.parent() else {
        return Ok(());
    };
    if parent.as_os_str().is_empty() {
        return Ok(());
    }

    if parent.is_file() {
        migrate_legacy_parent_database(parent, db_path)?;
    }

    if !parent.is_dir() {
        std::fs::create_dir_all(parent).map_err(|error| {
            cantopen(format!(
                "unable to create database directory {}: {}",
                parent.display(),
                error
            ))
        })?;
    }

    Ok(())
}

fn legacy_staging_path(parent: &Path) -> PathBuf {
    let staging_name = format!(
        "{}.legacy-db",
        parent
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("backups")
    );
    parent.parent().unwrap_or(parent).join(staging_name)
}

fn migrate_legacy_parent_database(parent: &Path, db_path: &Path) -> SqliteResult<()> {
    let staging_path = legacy_staging_path(parent);

    match std::fs::rename(parent, &staging_path) {
        Ok(()) => {}
        Err(_) if parent.is_dir() || db_path.exists() => return Ok(()),
        Err(error) if !staging_path.exists() => {
            return Err(cantopen(format!(
                "unable to move legacy database {}: {}",
                parent.display(),
                error
            )));
        }
        Err(_) => {}
    }

    if let Err(error) = std::fs::create_dir_all(parent) {
        if !parent.is_dir() {
            let _ = std::fs::rename(&staging_path, parent);
            return Err(cantopen(format!(
                "unable to create database directory {}: {}",
                parent.display(),
                error
            )));
        }
    }

    if db_path.exists() {
        return Ok(());
    }

    match std::fs::rename(&staging_path, db_path) {
        Ok(()) => Ok(()),
        Err(_) if db_path.exists() => Ok(()),
        Err(error) => Err(cantopen(format!(
            "unable to place backup database at {}: {} (legacy data is at {})",
            db_path.display(),
            error,
            staging_path.display()
        ))),
    }
}

impl BackupManager {
    pub fn new(db_path: PathBuf) -> SqliteResult<Self> {
        prepare_database_path(&db_path)?;
        let manager = BackupManager { db_path };
        manager.init_db()?;
        Ok(manager)
    }

    fn get_connection(&self) -> SqliteResult<Connection> {
        Connection::open(&self.db_path)
    }

    fn init_db(&self) -> SqliteResult<()> {
        let conn = self.get_connection()?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS backups (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content BLOB NOT NULL,
                encrypted INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                size INTEGER NOT NULL
            )",
            [],
        )?;
        Ok(())
    }

    pub fn create_backup(
        &self,
        project_id: String,
        file_path: String,
        content: String,
        password: Option<String>,
    ) -> SqliteResult<Backup> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = Utc::now().to_rfc3339();
        let size = content.len() as i64;

        let (encrypted_content, is_encrypted) = if let Some(pwd) = password {
            (self.encrypt_content(&content, &pwd)?, true)
        } else {
            (content.clone(), false)
        };

        let conn = self.get_connection()?;

        conn.execute(
            "INSERT INTO backups (id, project_id, file_path, content, encrypted, created_at, size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                &id,
                &project_id,
                &file_path,
                encrypted_content.as_bytes(),
                is_encrypted as i32,
                &created_at,
                size
            ],
        )?;

        Ok(Backup {
            id,
            project_id,
            file_path,
            content,
            encrypted: is_encrypted,
            created_at,
            size,
        })
    }

    pub fn get_backup(
        &self,
        backup_id: &str,
        password: Option<String>,
    ) -> SqliteResult<Option<Backup>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, project_id, file_path, content, encrypted, created_at, size
             FROM backups WHERE id = ?1",
        )?;

        let backup = stmt.query_row([backup_id], |row| {
            let encrypted: i32 = row.get(4)?;
            let content_bytes: Vec<u8> = row.get(3)?;
            let content_str = String::from_utf8(content_bytes).unwrap_or_default();

            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                content_str,
                encrypted != 0,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)?,
            ))
        });

        match backup {
            Ok((id, project_id, file_path, content, encrypted, created_at, size)) => {
                let decrypted_content = if encrypted {
                    if let Some(pwd) = password {
                        self.decrypt_content(&content, &pwd)?
                    } else {
                        return Ok(None);
                    }
                } else {
                    content
                };

                Ok(Some(Backup {
                    id,
                    project_id,
                    file_path,
                    content: decrypted_content,
                    encrypted,
                    created_at,
                    size,
                }))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn list_backups(&self, project_id: &str) -> SqliteResult<Vec<BackupMetadata>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, project_id, file_path, encrypted, created_at, size
             FROM backups WHERE project_id = ?1 ORDER BY created_at DESC",
        )?;

        let backups = stmt.query_map([project_id], |row| {
            let encrypted: i32 = row.get(3)?;
            Ok(BackupMetadata {
                id: row.get(0)?,
                project_id: row.get(1)?,
                file_path: row.get(2)?,
                encrypted: encrypted != 0,
                created_at: row.get(4)?,
                size: row.get(5)?,
            })
        })?;

        let mut result = Vec::new();
        for backup in backups {
            result.push(backup?);
        }
        Ok(result)
    }

    pub fn delete_backup(&self, backup_id: &str) -> SqliteResult<()> {
        let conn = self.get_connection()?;
        conn.execute("DELETE FROM backups WHERE id = ?1", [backup_id])?;
        Ok(())
    }

    pub fn delete_all_backups(&self, project_id: &str) -> SqliteResult<()> {
        let conn = self.get_connection()?;
        conn.execute("DELETE FROM backups WHERE project_id = ?1", [project_id])?;
        Ok(())
    }

    fn encrypt_content(&self, content: &str, password: &str) -> SqliteResult<String> {
        let key = self.derive_key(password);
        let mut rng = rand::thread_rng();
        let nonce_bytes: [u8; 12] = rng.gen();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let cipher = Aes256Gcm::new(&key);
        let ciphertext = cipher
            .encrypt(nonce, Payload::from(content.as_bytes()))
            .map_err(|_| rusqlite::Error::InvalidQuery)?;

        let mut encrypted = Vec::new();
        encrypted.extend_from_slice(&nonce_bytes);
        encrypted.extend_from_slice(&ciphertext);

        Ok(hex::encode(encrypted))
    }

    fn decrypt_content(&self, encrypted_hex: &str, password: &str) -> SqliteResult<String> {
        let key = self.derive_key(password);
        let encrypted = hex::decode(encrypted_hex)
            .map_err(|_| rusqlite::Error::InvalidQuery)?;

        if encrypted.len() < 12 {
            return Err(rusqlite::Error::InvalidQuery);
        }

        let (nonce_bytes, ciphertext) = encrypted.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let cipher = Aes256Gcm::new(&key);
        let plaintext = cipher
            .decrypt(nonce, Payload::from(ciphertext))
            .map_err(|_| rusqlite::Error::InvalidQuery)?;

        String::from_utf8(plaintext).map_err(|_| rusqlite::Error::InvalidQuery)
    }

    fn derive_key(&self, password: &str) -> aes_gcm::Key<Aes256Gcm> {
        let mut hasher = Sha256::new();
        hasher.update(password.as_bytes());
        let hash = hasher.finalize();
        aes_gcm::Key::<Aes256Gcm>::from_slice(&hash[..]).clone()
    }

    pub fn get_backup_count(&self) -> SqliteResult<i64> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM backups")?;
        stmt.query_row([], |row| row.get(0))
    }

    pub fn get_database_size(&self) -> SqliteResult<i64> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare("SELECT SUM(size) FROM backups")?;
        let total_size: Option<i64> = stmt.query_row([], |row| row.get(0))?;
        Ok(total_size.unwrap_or(0))
    }

    pub fn reset_database(&self) -> SqliteResult<()> {
        let conn = self.get_connection()?;
        conn.execute("DELETE FROM backups", [])?;
        Ok(())
    }

    pub fn get_all_backups(&self) -> SqliteResult<Vec<BackupMetadata>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, project_id, file_path, encrypted, created_at, size FROM backups ORDER BY created_at DESC",
        )?;

        let backups = stmt.query_map([], |row| {
            let encrypted: i32 = row.get(3)?;
            Ok(BackupMetadata {
                id: row.get(0)?,
                project_id: row.get(1)?,
                file_path: row.get(2)?,
                encrypted: encrypted != 0,
                created_at: row.get(4)?,
                size: row.get(5)?,
            })
        })?;

        let mut result = Vec::new();
        for backup in backups {
            result.push(backup?);
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_workspace() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dotenvx-backup-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_legacy_db(path: &std::path::Path, project_id: &str) {
        let conn = Connection::open(path).unwrap();
        conn.execute(
            "CREATE TABLE backups (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                file_path TEXT NOT NULL,
                content BLOB NOT NULL,
                encrypted INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                size INTEGER NOT NULL
            )",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO backups (id, project_id, file_path, content, encrypted, created_at, size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "legacy-id",
                project_id,
                "/tmp/.env",
                b"FOO=bar".as_slice(),
                0,
                "2026-01-01T00:00:00Z",
                7
            ],
        )
        .unwrap();
    }

    #[test]
    fn migrates_legacy_database_file_at_parent_path() {
        let workspace = temp_workspace();
        let app_data_dir = workspace.join("com.dotenvx-gui.app");
        write_legacy_db(&app_data_dir, "proj-1");
        assert!(app_data_dir.is_file());

        let manager = BackupManager::new(app_data_dir.join("backups.db"))
            .expect("should open after migrating the legacy database file");

        assert!(app_data_dir.is_dir(), "app data path should become a directory");
        assert!(
            app_data_dir.join("backups.db").is_file(),
            "legacy database should be moved to backups.db"
        );

        let backups = manager.list_backups("proj-1").unwrap();
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].id, "legacy-id");

        let manager_again = BackupManager::new(app_data_dir.join("backups.db"))
            .expect("opening an already-migrated database should stay successful");
        assert_eq!(manager_again.list_backups("proj-1").unwrap().len(), 1);

        let _ = fs::remove_dir_all(workspace);
    }

    #[test]
    fn creates_database_when_parent_is_missing() {
        let workspace = temp_workspace();
        let app_data_dir = workspace.join("missing-app-data");
        let db_path = app_data_dir.join("backups.db");

        let manager = BackupManager::new(db_path).expect("should create parent directory");
        assert_eq!(manager.list_backups("proj-1").unwrap().len(), 0);

        let _ = fs::remove_dir_all(workspace);
    }
}
