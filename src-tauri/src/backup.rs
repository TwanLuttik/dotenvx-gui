use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use chrono::{DateTime, Utc};
use rand::Rng;
use rusqlite::{params, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

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

impl BackupManager {
    pub fn new(db_path: PathBuf) -> SqliteResult<Self> {
        // Create parent directories if they don't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
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
        
        eprintln!("Creating backup: id={}, project_id={}, file_path={}, encrypted={}, size={}", 
                  id, project_id, file_path, is_encrypted, size);
        
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

        eprintln!("Backup created successfully");

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
