# Backup Feature Documentation

## Overview

The backup feature allows users to create encrypted or unencrypted backups of their environment files (.env files) with a SQLite database backend. Backups can be managed, viewed, and deleted through an intuitive UI.

## Features

- **Create Backups**: Backup environment files with optional password encryption
- **Encrypted Storage**: Uses AES-256-GCM encryption for sensitive backups
- **View Backups**: Browse and view previously created backups
- **Delete Backups**: Remove individual backups or all backups for a project
- **Alerts**: Real-time feedback on backup operations (success/error)
- **Metadata**: Track backup creation time and file size

## Architecture

### Backend (Rust/Tauri)

**File**: `src-tauri/src/backup.rs`

The backup manager handles:
- SQLite database initialization and management
- AES-256-GCM encryption/decryption
- CRUD operations for backups
- Key derivation using SHA-256

**Tauri Commands** (in `src-tauri/src/lib.rs`):
- `create_backup`: Create a new backup with optional encryption
- `get_backup`: Retrieve a backup (with password if encrypted)
- `list_backups`: List all backups for a project
- `delete_backup`: Delete a specific backup
- `delete_all_backups`: Delete all backups for a project

### Frontend (React/TypeScript)

**Component**: `src/components/BackupManager.tsx`

Features:
- Create backup form with encryption toggle
- Password input for encryption
- Backup list with metadata (date, size, encryption status)
- View/unlock encrypted backups
- Delete individual or all backups
- Alert notifications for user feedback

**Integration**: `src/components/EnvFileViewer.tsx`

The backup manager is integrated into the EnvFileViewer component with:
- "Backups" button to toggle backup manager visibility
- Backup manager appears below the variables section
- Automatic database path management

## Database Schema

```sql
CREATE TABLE backups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content BLOB NOT NULL,
    encrypted INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    size INTEGER NOT NULL
)
```

## Encryption Details

- **Algorithm**: AES-256-GCM
- **Key Derivation**: SHA-256 hash of password
- **Nonce**: 12-byte random nonce (included in encrypted data)
- **Format**: Hex-encoded (nonce + ciphertext)

## Usage

1. **Create a Backup**:
   - Click the "Backups" button on an environment file
   - Optionally enable "Encrypt backup with password"
   - Enter a password if encryption is enabled
   - Click "Create Backup"

2. **View a Backup**:
   - Click "View" on a backup in the list
   - If encrypted, enter the password and click "Unlock"
   - The backup content will be displayed

3. **Delete a Backup**:
   - Click the trash icon on a backup to delete it
   - Confirm the deletion

4. **Delete All Backups**:
   - Click "Delete All" in the backups section
   - Confirm the deletion

## Database Location

Backups are stored in a SQLite database at:
```
{project_path}/.env-backups.db
```

This keeps backups organized per project.

## Dependencies

### Rust Crates
- `rusqlite`: SQLite database management
- `aes-gcm`: AES-256-GCM encryption
- `sha2`: SHA-256 key derivation
- `rand`: Random nonce generation
- `hex`: Hex encoding/decoding
- `chrono`: Timestamp handling
- `uuid`: Unique backup IDs

### React
- `@tauri-apps/api`: Tauri command invocation
- `lucide-react`: Icons
- Custom UI components (Button, Card, etc.)

## Error Handling

The feature includes comprehensive error handling:
- Database initialization errors
- Encryption/decryption failures
- Invalid passwords
- File system errors
- User-friendly error messages via alerts

## Security Considerations

1. **Password Encryption**: Uses industry-standard AES-256-GCM
2. **Key Derivation**: SHA-256 ensures strong key derivation
3. **Random Nonces**: Prevents replay attacks
4. **No Plain Text Storage**: Encrypted backups are hex-encoded
5. **Local Storage**: All backups stored locally in the project directory

## Future Enhancements

- Backup versioning and history
- Automatic backup scheduling
- Backup compression
- Cloud backup integration
- Backup restoration with merge options
- Backup search and filtering
