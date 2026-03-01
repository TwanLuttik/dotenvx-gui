export interface BackupMetadata {
  id: string;
  project_id: string;
  file_path: string;
  encrypted: boolean;
  created_at: string;
  size: number;
}

export interface Backup extends BackupMetadata {
  content: string;
}
