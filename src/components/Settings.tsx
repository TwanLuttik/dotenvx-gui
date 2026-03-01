import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Database,
  AlertTriangle,
  CheckCircle,
  HardDrive,
  RefreshCw,
} from "lucide-react";

interface DatabaseStats {
  backupCount: number;
  databaseSize: number;
  databasePath: string;
}

interface AlertItem {
  type: "success" | "error" | "warning";
  message: string;
  id: string;
}

export function Settings() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    loadDatabaseStats();
  }, []);

  const loadDatabaseStats = async () => {
    try {
      setIsLoading(true);

      try {
        const backupCount = await invoke<number>("get_backup_count");

        const databaseSize = await invoke<number>("get_database_size");

        const appDataDir = await invoke<string>("get_app_data_dir");
        const dbPath = `${appDataDir}/backups.db`;

        setStats({
          backupCount,
          databaseSize,
          databasePath: dbPath,
        });
      } catch (dbError) {
        // Database doesn't exist yet or is empty - this is normal
        const appDataDir = await invoke<string>("get_app_data_dir");
        const dbPath = `${appDataDir}/backups.db`;

        setStats({
          backupCount: 0,
          databaseSize: 0,
          databasePath: dbPath,
        });
      }
    } catch (error) {
      addAlert("error", `Failed to determine database path: ${String(error)}`);
      setStats({
        backupCount: 0,
        databaseSize: 0,
        databasePath: "Unable to determine database path",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addAlert = (type: "success" | "error" | "warning", message: string) => {
    const id = Date.now().toString();
    setAlerts((prev) => [...prev, { type, message, id }]);
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, 4000);
  };

  const handleResetDatabase = async () => {
    if (
      !confirm(
        "Are you sure you want to reset the backup database? This will delete all backups. This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      setIsResetting(true);
      await invoke("reset_backup_database");
      addAlert("success", "Backup database reset successfully");
      await loadDatabaseStats();
    } catch (error) {
      addAlert("error", `Failed to reset database: ${error}`);
    } finally {
      setIsResetting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your backup database and view statistics
        </p>
      </div>

      {/* Alerts */}
      <div className="space-y-2 mb-6">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-center gap-2 p-3 rounded-md text-sm ${
              alert.type === "success"
                ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                : alert.type === "error"
                  ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
                  : "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400"
            }`}
          >
            {alert.type === "success" ? (
              <CheckCircle className="w-4 h-4" />
            ) : alert.type === "error" ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            <span>{alert.message}</span>
          </div>
        ))}
      </div>

      {/* Database Information Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            <CardTitle>SQLite Database Information</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground">
              Loading database information...
            </p>
          ) : stats ? (
            <>
              {/* Database Path */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Database Location
                </label>
                <div className="p-3 bg-muted rounded-md break-all font-mono text-xs space-y-1">
                  <div>{stats.databasePath}</div>
                  {import.meta.env.DEV && (
                    <div className="text-muted-foreground text-xs pt-2 border-t">
                      <p className="font-semibold mb-1">Dev Mode Info:</p>
                      <p>
                        App Data Dir:{" "}
                        {stats.databasePath.split("/backups.db")[0]}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Backup Count */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Total Backups
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <HardDrive className="w-5 h-5 text-blue-600" />
                    <span className="text-2xl font-bold">
                      {stats.backupCount}
                    </span>
                  </div>
                </div>

                {/* Database Size */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Database Size
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <Database className="w-5 h-5 text-purple-600" />
                    <span className="text-2xl font-bold">
                      {formatBytes(stats.databaseSize)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Database Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Status
                </label>
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800 dark:text-green-400">
                    Database is healthy and operational
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Unable to load database information
            </p>
          )}
        </CardContent>
      </Card>

      {/* Database Management Card */}
      <Card>
        <CardHeader>
          <CardTitle>Database Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Resetting the database will permanently delete all backups. This
              action cannot be undone.
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleResetDatabase}
            disabled={isResetting || isLoading}
            variant="destructive"
            className="w-full gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {isResetting ? "Resetting..." : "Reset Database"}
          </Button>

          <p className="text-xs text-muted-foreground">
            This will delete all backups from the SQLite database but will not
            affect your environment files.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
