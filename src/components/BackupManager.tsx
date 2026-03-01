import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, CheckCircle, Trash2, Lock, Unlock } from "lucide-react";
import { Button } from "./ui/button";

interface BackupMetadata {
  id: string;
  project_id: string;
  file_path: string;
  encrypted: boolean;
  created_at: string;
  size: number;
}

interface Alert {
  type: "success" | "error" | "info";
  message: string;
  id: string;
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
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEncryptionPassword, setShowEncryptionPassword] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState("");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expandedBackupId, setExpandedBackupId] = useState<string | null>(null);
  const [viewPassword, setViewPassword] = useState("");
  const [showViewPassword, setShowViewPassword] = useState<string | null>(null);
  const [backupContent, setBackupContent] = useState<string>("");

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
    } catch (error) {
      addAlert("error", `Failed to load backups: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addAlert = (type: "success" | "error" | "info", message: string) => {
    const id = Date.now().toString();
    setAlerts((prev) => [...prev, { type, message, id }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 4000);
  };

  const handleCreateBackup = async () => {
    try {
      setIsLoading(true);
      console.log("Creating backup with:", {
        projectId,
        filePath,
        contentLength: content.length,
        encrypted: showEncryptionPassword,
      });

      const result = await invoke("create_backup", {
        projectId,
        filePath,
        content,
        password: showEncryptionPassword ? encryptionPassword : null,
      });

      console.log("Backup created:", result);

      addAlert(
        "success",
        `Backup created ${showEncryptionPassword ? "(encrypted)" : "(unencrypted)"}`,
      );
      setEncryptionPassword("");
      setShowEncryptionPassword(false);
      await loadBackups();
      onBackupCreated?.();
    } catch (error) {
      console.error("Backup creation error:", error);
      addAlert("error", `Failed to create backup: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm("Are you sure you want to delete this backup?")) return;

    try {
      setIsLoading(true);
      await invoke("delete_backup", {
        backupId,
      });
      addAlert("success", "Backup deleted successfully");
      await loadBackups();
    } catch (error) {
      addAlert("error", `Failed to delete backup: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllBackups = async () => {
    if (
      !confirm("Are you sure you want to delete all backups for this project?")
    )
      return;

    try {
      setIsLoading(true);
      await invoke("delete_all_backups", {
        projectId,
      });
      addAlert("success", "All backups deleted successfully");
      await loadBackups();
    } catch (error) {
      addAlert("error", `Failed to delete all backups: ${error}`);
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
      const backupData = await invoke<any>("get_backup", {
        backupId: backup.id,
        password: backup.encrypted ? viewPassword : undefined,
      });

      if (backupData) {
        setBackupContent(backupData.content);
        setExpandedBackupId(backup.id);
        setViewPassword("");
        setShowViewPassword(null);
      } else {
        addAlert("error", "Invalid password or backup not found");
      }
    } catch (error) {
      addAlert("error", `Failed to view backup: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", { timeZone: "UTC" });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      {/* Alerts */}
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-center gap-2 p-3 rounded-md text-sm ${
              alert.type === "success"
                ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                : alert.type === "error"
                  ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                  : "bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
            }`}
          >
            {alert.type === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span>{alert.message}</span>
          </div>
        ))}
      </div>

      {/* Create Backup Section */}
      <div className="space-y-3 p-3 bg-muted rounded-md">
        <h3 className="font-semibold text-sm">Create New Backup</h3>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="encrypt-backup"
            checked={showEncryptionPassword}
            onChange={(e) => setShowEncryptionPassword(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <label htmlFor="encrypt-backup" className="text-sm cursor-pointer">
            Encrypt backup with password
          </label>
        </div>

        {showEncryptionPassword && (
          <input
            type="password"
            placeholder="Enter encryption password"
            value={encryptionPassword}
            onChange={(e) => setEncryptionPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm bg-background"
          />
        )}

        <Button
          onClick={handleCreateBackup}
          disabled={
            isLoading || (showEncryptionPassword && !encryptionPassword)
          }
          className="w-full"
        >
          {isLoading ? "Creating..." : "Create Backup"}
        </Button>
      </div>

      {/* Backups List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Backups ({backups.length})</h3>
          {backups.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAllBackups}
              disabled={isLoading}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete All
            </Button>
          )}
        </div>

        {isLoading && backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading backups...</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No backups yet</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="border rounded-md p-3 space-y-2 bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    {backup.encrypted ? (
                      <Lock className="w-4 h-4 text-yellow-600" />
                    ) : (
                      <Unlock className="w-4 h-4 text-green-600" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {backup.file_path.split("/").pop()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(backup.created_at)} •{" "}
                        {formatSize(backup.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
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
                      size="sm"
                      onClick={() => handleDeleteBackup(backup.id)}
                      disabled={isLoading}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {showViewPassword === backup.id && backup.encrypted && (
                  <div className="flex gap-2 pt-2">
                    <input
                      type="password"
                      placeholder="Enter password to view"
                      value={viewPassword}
                      onChange={(e) => setViewPassword(e.target.value)}
                      className="flex-1 px-3 py-2 border rounded-md text-sm bg-background"
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
                  <div className="pt-2 space-y-2">
                    <div className="bg-background rounded p-2 max-h-48 overflow-y-auto border">
                      <pre className="text-xs whitespace-pre-wrap break-words font-mono">
                        {backupContent}
                      </pre>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedBackupId(null)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
