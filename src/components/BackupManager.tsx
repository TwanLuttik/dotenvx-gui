import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lock, Unlock, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "../contexts/ToastContext";
import { formatBytes, formatDateTime } from "../lib/utils";

interface BackupMetadata {
  id: string;
  project_id: string;
  file_path: string;
  encrypted: boolean;
  created_at: string;
  size: number;
}

interface BackupManagerProps {
  projectId: string;
  filePath: string;
  content: string;
  onBackupCreated?: () => void;
}

export function BackupManager({
  projectId,
  filePath,
  content,
  onBackupCreated,
}: BackupManagerProps) {
  const { success, error } = useToast();
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [encryptBackup, setEncryptBackup] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [expandedBackupId, setExpandedBackupId] = useState<string | null>(null);
  const [viewPassword, setViewPassword] = useState("");
  const [showViewPassword, setShowViewPassword] = useState<string | null>(null);
  const [backupContent, setBackupContent] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  useEffect(() => {
    loadBackups();
  }, [projectId]);

  const loadBackups = async () => {
    try {
      setIsLoading(true);
      const backupList = await invoke<BackupMetadata[]>("list_backups", {
        projectId,
      });
      setBackups(backupList);
    } catch (err) {
      error(`Failed to load backups: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setIsLoading(true);
      await invoke("create_backup", {
        projectId,
        filePath,
        content,
        password: encryptBackup ? encryptionPassword : null,
      });

      success(
        encryptBackup ? "Encrypted backup created" : "Backup created",
      );
      setEncryptionPassword("");
      setEncryptBackup(false);
      await loadBackups();
      onBackupCreated?.();
    } catch (err) {
      error(`Failed to create backup: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = async () => {
    if (!pendingDeleteId) return;

    try {
      setIsLoading(true);
      await invoke("delete_backup", { backupId: pendingDeleteId });
      success("Backup deleted");
      if (expandedBackupId === pendingDeleteId) {
        setExpandedBackupId(null);
        setBackupContent("");
      }
      await loadBackups();
    } catch (err) {
      error(`Failed to delete backup: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllBackups = async () => {
    try {
      setIsLoading(true);
      await invoke("delete_all_backups", { projectId });
      success("All backups deleted");
      setExpandedBackupId(null);
      setBackupContent("");
      await loadBackups();
    } catch (err) {
      error(`Failed to delete backups: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewBackup = async (backup: BackupMetadata) => {
    if (backup.encrypted && !viewPassword) {
      setShowViewPassword(backup.id);
      return;
    }

    try {
      setIsLoading(true);
      const backupData = await invoke<{ content: string } | null>("get_backup", {
        backupId: backup.id,
        password: backup.encrypted ? viewPassword : undefined,
      });

      if (backupData) {
        setBackupContent(backupData.content);
        setExpandedBackupId(backup.id);
        setViewPassword("");
        setShowViewPassword(null);
      } else {
        error("Invalid password or backup not found");
      }
    } catch (err) {
      error(`Failed to view backup: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <p className="text-sm font-medium">Create backup</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={encryptBackup}
            onChange={(event) => setEncryptBackup(event.target.checked)}
            className="size-4 rounded border-input"
          />
          Encrypt with a password
        </label>
        {encryptBackup && (
          <Input
            type="password"
            placeholder="Encryption password"
            value={encryptionPassword}
            onChange={(event) => setEncryptionPassword(event.target.value)}
          />
        )}
        <Button
          onClick={handleCreateBackup}
          disabled={isLoading || (encryptBackup && !encryptionPassword)}
          className="w-full"
        >
          {isLoading ? "Working…" : "Create backup"}
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">History ({backups.length})</p>
          {backups.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDeleteAll(true)}
              disabled={isLoading}
              className="text-destructive hover:text-destructive"
            >
              Delete all
            </Button>
          )}
        </div>

        {isLoading && backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading backups…</p>
        ) : backups.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No backups yet for this project
          </p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="space-y-2 rounded-lg border bg-card p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {backup.encrypted ? (
                      <Lock className="size-4 shrink-0 text-primary" />
                    ) : (
                      <Unlock className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {backup.file_path.split("/").pop()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(backup.created_at)} ·{" "}
                        {formatBytes(backup.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewBackup(backup)}
                      disabled={isLoading}
                    >
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => setPendingDeleteId(backup.id)}
                      disabled={isLoading}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                {showViewPassword === backup.id && backup.encrypted && (
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="Password to view"
                      value={viewPassword}
                      onChange={(event) => setViewPassword(event.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleViewBackup(backup)}
                      disabled={!viewPassword || isLoading}
                    >
                      Unlock
                    </Button>
                  </div>
                )}

                {expandedBackupId === backup.id && (
                  <div className="space-y-2">
                    <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-words">
                      {backupContent}
                    </pre>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedBackupId(null)}
                    >
                      Hide
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Delete this backup?"
        description="This snapshot will be permanently removed from the local database."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteBackup}
      />
      <ConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        title="Delete all backups?"
        description="Every backup stored for this project will be permanently removed."
        confirmLabel="Delete all"
        variant="destructive"
        onConfirm={handleDeleteAllBackups}
      />
    </div>
  );
}
