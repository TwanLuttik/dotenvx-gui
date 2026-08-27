import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { ConfirmDialog } from "./ConfirmDialog";
import { OnePasswordSettings } from "./OnePasswordSettings";
import { useToast } from "../contexts/ToastContext";
import { formatBytes } from "../lib/utils";
import { AppPreferences } from "../types";
import {
  Database,
  AlertTriangle,
  CheckCircle,
  HardDrive,
  RefreshCw,
  Terminal,
  Code2,
} from "lucide-react";

interface DotenvxStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
}

interface DatabaseStats {
  backupCount: number;
  databaseSize: number;
  databasePath: string;
}

interface SettingsProps {
  preferences: AppPreferences;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onOnePasswordConfiguredChange?: (configured: boolean) => void;
}

export function Settings({
  preferences,
  onPreferencesChange,
  onOnePasswordConfiguredChange,
}: SettingsProps) {
  const { success, error } = useToast();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [dotenvx, setDotenvx] = useState<DotenvxStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    loadDatabaseStats();
    loadDotenvxStatus();
  }, []);

  const loadDotenvxStatus = async () => {
    try {
      const status = await invoke<DotenvxStatus>("get_dotenvx_status");
      setDotenvx(status);
    } catch (err) {
      error(`Failed to detect dotenvx: ${String(err)}`);
      setDotenvx({ installed: false, version: null, path: null });
    }
  };

  const loadDatabaseStats = async () => {
    try {
      setIsLoading(true);
      const [backupCount, databaseSize, appDataDir] = await Promise.all([
        invoke<number>("get_backup_count").catch(() => 0),
        invoke<number>("get_database_size").catch(() => 0),
        invoke<string>("get_app_data_dir"),
      ]);

      setStats({
        backupCount,
        databaseSize,
        databasePath: `${appDataDir}/backups.db`,
      });
    } catch (err) {
      error(`Failed to determine database path: ${String(err)}`);
      setStats({
        backupCount: 0,
        databaseSize: 0,
        databasePath: "Unable to determine database path",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDatabase = async () => {
    try {
      setIsResetting(true);
      await invoke("reset_backup_database");
      success("Backup database reset");
      await loadDatabaseStats();
    } catch (err) {
      error(`Failed to reset database: ${String(err)}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="size-4" />
            dotenvx CLI
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadDotenvxStatus()}
          >
            <RefreshCw className="size-3.5" />
            Recheck
          </Button>
        </div>

        {dotenvx === null ? (
          <p className="text-sm text-muted-foreground">Detecting dotenvx…</p>
        ) : dotenvx.installed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle className="size-4" />
              {dotenvx.version
                ? `Installed · v${dotenvx.version}`
                : "Installed · version unknown"}
            </div>
            {dotenvx.path && (
              <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed break-all">
                {dotenvx.path}
              </p>
            )}
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              dotenvx was not found on this machine. Install it with
              `brew install dotenvx`, then recheck.
            </AlertDescription>
          </Alert>
        )}
      </section>

      <div className="border-t" />

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Code2 className="size-4" />
          Appearance
        </div>
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border px-3 py-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Code editor view</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Show environment files as `KEY=value` source instead of a table.
            </p>
          </div>
          <input
            type="checkbox"
            checked={preferences.envFileView === "editor"}
            onChange={(event) =>
              onPreferencesChange({
                ...preferences,
                envFileView: event.target.checked ? "editor" : "table",
              })
            }
            className="mt-1 size-4 shrink-0 rounded border-input"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Open Settings anytime with ⌘,
        </p>
      </section>

      <div className="border-t" />

      <OnePasswordSettings onConfiguredChange={onOnePasswordConfiguredChange} />

      <div className="border-t" />

      <p className="text-sm text-muted-foreground">
        Local backup storage for environment files. Nothing leaves this machine
        except an explicit Save to 1Password.
      </p>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="size-4" />
          Backup database
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading database info…</p>
        ) : stats ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Location
              </p>
              <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed break-all">
                {stats.databasePath}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Backups</p>
                <div className="mt-1 flex items-center gap-2">
                  <HardDrive className="size-4 text-primary" />
                  <span className="text-xl font-semibold tabular-nums">
                    {stats.backupCount}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground">Stored size</p>
                <div className="mt-1 flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <span className="text-xl font-semibold tabular-nums">
                    {formatBytes(stats.databaseSize)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle className="size-4" />
              Database is healthy
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Unable to load database information
          </p>
        )}
      </section>

      <section className="space-y-3">
        <p className="text-sm font-medium">Danger zone</p>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Resetting the database permanently deletes every stored backup.
            Environment files on disk are not affected.
          </AlertDescription>
        </Alert>
        <Button
          onClick={() => setConfirmReset(true)}
          disabled={isResetting || isLoading}
          variant="destructive"
          className="w-full"
        >
          <RefreshCw className="size-4" />
          {isResetting ? "Resetting…" : "Reset backup database"}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset backup database?"
        description="All stored backups will be deleted. This cannot be undone. Your environment files on disk will not be changed."
        confirmLabel="Reset database"
        variant="destructive"
        onConfirm={handleResetDatabase}
      />
    </div>
  );
}
