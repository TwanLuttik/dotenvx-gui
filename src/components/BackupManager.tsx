import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lock, Unlock, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "../contexts/ToastContext";
import { formatBytes, formatDateTime } from "../lib/utils";
import { Project } from "../types";
import {
  backupFileGroups,
  backupableEnvFiles,
  envFileBackupContent,
  togglePathSelection,
} from "../lib/backup";
import { relativeSecretPath } from "../lib/onepassword";

interface BackupMetadata {
  id: string;
  project_id: string;
  file_path: string;
  encrypted: boolean;
  created_at: string;
  size: number;
}

interface BackupManagerProps {
  project: Project;
  onBackupCreated?: () => void;
}

export function BackupManager({
  project,
  onBackupCreated,
}: BackupManagerProps) {
  const { success, error } = useToast();
  const groups = useMemo(() => backupFileGroups(project), [project]);
  const allPaths = useMemo(
    () => backupableEnvFiles(project).map((file) => file.path),
    [project],
  );
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(allPaths),
  );
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

  const pathKey = allPaths.join("\0");
  useEffect(() => {
    setSelectedPaths(new Set(pathKey ? pathKey.split("\0") : []));
  }, [project.id, pathKey]);

  useEffect(() => {
    loadBackups();
  }, [project.id]);

  const loadBackups = async () => {
    try {
      setIsLoading(true);
      const backupList = await invoke<BackupMetadata[]>("list_backups", {
        projectId: project.id,
      });
      setBackups(backupList);
    } catch (err) {
      error(`Failed to load backups: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    const files = backupableEnvFiles(project).filter((file) =>
      selectedPaths.has(file.path),
    );
    if (files.length === 0) {
      error("Select at least one file to back up.");
      return;
    }

    try {
      setIsLoading(true);
      for (const file of files) {
        await invoke("create_backup", {
          projectId: project.id,
          filePath: file.path,
          content: envFileBackupContent(file),
          password: encryptBackup ? encryptionPassword : null,
        });
      }

      success(
        encryptBackup
          ? `Encrypted backup created for ${files.length} file${files.length === 1 ? "" : "s"}`
          : `Backup created for ${files.length} file${files.length === 1 ? "" : "s"}`,
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
      await invoke("delete_all_backups", { projectId: project.id });
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

  const selectedCount = selectedPaths.size;

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Create backup</p>
          <p className="text-xs text-muted-foreground">
            {selectedCount} of {allPaths.length} selected
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Uncheck folders or files you do not want in this snapshot.
        </p>

        {groups.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            No environment files to back up
          </p>
        ) : (
          <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border bg-background p-2">
            {groups.map((group) => {
              const groupPaths = group.files.map((file) => file.path);
              const selectedInGroup = groupPaths.filter((path) =>
                selectedPaths.has(path),
              ).length;
              const allSelected = selectedInGroup === groupPaths.length;
              const someSelected = selectedInGroup > 0 && !allSelected;

              return (
                <div key={group.folderPath} className="space-y-1">
                  <label className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = someSelected;
                      }}
                      onChange={() =>
                        setSelectedPaths((current) =>
                          togglePathSelection(current, groupPaths, !allSelected),
                        )
                      }
                      className="size-4 rounded border-input"
                    />
                    {group.label}
                  </label>
                  <div className="space-y-0.5 pl-6">
                    {group.files.map((file) => (
                      <label
                        key={file.path}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-muted-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPaths.has(file.path)}
                          onChange={() =>
                            setSelectedPaths((current) =>
                              togglePathSelection(
                                current,
                                [file.path],
                                !current.has(file.path),
                              ),
                            )
                          }
                          className="size-4 rounded border-input"
                        />
                        <span className="truncate font-mono text-xs text-foreground">
                          {file.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
          disabled={
            isLoading ||
            selectedCount === 0 ||
            (encryptBackup && !encryptionPassword)
          }
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
                      <p className="truncate text-sm font-medium" title={backup.file_path}>
                        {relativeSecretPath(project.path, backup.file_path)}
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
