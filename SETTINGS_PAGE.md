# Settings Page Documentation

## Overview

A settings page has been created to display SQLite database information, backup statistics, and provide database management capabilities including a reset function.

## Features

### Database Information Display
- **Database Location**: Shows the full path to the SQLite backup database
- **Total Backups**: Displays the count of all backups in the database
- **Database Size**: Shows the total size of all backups in human-readable format (Bytes, KB, MB, GB)
- **Status**: Displays the health status of the database

### Database Management
- **Reset Database**: Permanently delete all backups with confirmation dialog
- **Destructive Action Warning**: Clear alert about the consequences of reset
- **Real-time Feedback**: Success/error alerts for all operations

## Architecture

### Backend (Rust/Tauri)

#### New Functions in `src-tauri/src/backup.rs`
- `get_backup_count()` - Returns total number of backups
- `get_database_size()` - Returns total size of all backups in bytes
- `reset_database()` - Deletes all backups from the database

#### New Tauri Commands in `src-tauri/src/lib.rs`
- `get_backup_count(db_path)` - Get backup count for a database
- `get_database_size(db_path)` - Get total database size
- `reset_backup_database(db_path)` - Reset all backups
- `get_home_dir()` - Get the user's home directory (cross-platform)
- `get_app_data_dir(app_handle)` - Get the app data directory

### Frontend (React/TypeScript)

#### Settings Component (`src/components/Settings.tsx`)
- Displays database statistics and information
- Loads stats on component mount
- Handles database reset with confirmation
- Shows real-time alerts for operations
- Responsive grid layout for statistics
- Cross-platform home directory detection

#### App Integration (`src/App.tsx`)
- Added Settings button in header
- Toggle between Settings and EnvFileViewer
- Settings button highlights when active
- Integrated with existing navigation

## Database Path

The SQLite database is stored at:
```
{HOME_DIR}/.dotenvx-gui/.env-backups.db
```

Where `{HOME_DIR}` is:
- macOS/Linux: `$HOME`
- Windows: `%USERPROFILE%`

## Usage

1. **Access Settings**:
   - Click the "Settings" button in the header
   - Settings page displays database information

2. **View Database Stats**:
   - Database location is displayed in a code block
   - Total backup count shown with icon
   - Database size shown in human-readable format
   - Status indicator shows database health

3. **Reset Database**:
   - Click "Reset Database" button
   - Confirm the destructive action
   - Database is cleared of all backups
   - Success alert confirms completion

## UI Components

### Database Information Card
- Title with database icon
- Database location (monospace, scrollable)
- Two-column grid for backup count and size
- Status indicator with health check

### Database Management Card
- Destructive action warning alert
- Reset button with refresh icon
- Explanatory text about the operation

### Alerts
- Success alerts (green) for completed operations
- Error alerts (red) for failures
- Warning alerts (yellow) for destructive actions
- Auto-dismiss after 4 seconds

## Error Handling

- Graceful fallback if database doesn't exist
- Error messages displayed in alerts
- Database stats default to 0 if retrieval fails
- Path determination includes fallback options

## Security Considerations

1. **Confirmation Required**: Reset operation requires user confirmation
2. **Clear Warnings**: Destructive action clearly marked with alert
3. **No Accidental Deletion**: Double confirmation prevents accidents
4. **Local Storage**: Database remains local to user's machine

## Cross-Platform Support

The implementation supports:
- **macOS**: Uses `$HOME` environment variable
- **Windows**: Uses `%USERPROFILE%` environment variable
- **Linux**: Uses `$HOME` environment variable

## File Size Formatting

Sizes are displayed in appropriate units:
- Bytes (B)
- Kilobytes (KB)
- Megabytes (MB)
- Gigabytes (GB)

## Integration Points

1. **App.tsx**: Settings button and navigation
2. **backup.rs**: Database statistics and reset functions
3. **lib.rs**: Tauri command handlers
4. **UI Components**: Card, Button, Alert from existing component library

## Future Enhancements

- Per-project database statistics
- Backup export functionality
- Database optimization/vacuum
- Backup retention policies
- Database backup/restore
- Advanced filtering and search
- Database migration tools
