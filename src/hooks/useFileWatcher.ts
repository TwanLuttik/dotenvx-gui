import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileScanner } from "../utils/fileScanner";
import { EnvFile } from "../types";

interface FileWatcherOptions {
  projectPath: string;
  // Files to poll for changes - typically the selected tab and .env.keys
  watchPaths?: (string | undefined)[];
  onFilesChanged: (envFiles: EnvFile[]) => void;
  pollInterval?: number;
}

// NUL never appears in file paths, unlike spaces
const PATH_SEPARATOR = "\u0000";

export const useFileWatcher = ({
  projectPath,
  watchPaths,
  onFilesChanged,
  pollInterval = 5000,
}: FileWatcherOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hashesRef = useRef<Map<string, number>>(new Map());
  const lastScannedRef = useRef<number>(0);

  // Join to a string so an inline array prop doesn't reset the interval
  // on every render
  const pathsKey = (watchPaths ?? []).filter(Boolean).join(PATH_SEPARATOR);

  const checkForChanges = useCallback(async () => {
    const paths = pathsKey ? pathsKey.split(PATH_SEPARATOR) : [];
    if (!projectPath || paths.length === 0) {
      return;
    }

    const newHashes = new Map<string, number>();
    let changed = false;
    for (const path of paths) {
      let contentHash: number;
      try {
        // Use content length as a simple change detector
        const content = await invoke<string>("read_text_file", { path });
        contentHash = content.length;
      } catch {
        // Unreadable (e.g. deleted) counts as a distinct state, so a
        // deleted .env.keys still triggers a rescan once
        contentHash = -1;
      }
      newHashes.set(path, contentHash);
      if (hashesRef.current.get(path) !== contentHash) {
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    // Rescan every 10 seconds max; leave hashes uncommitted when
    // throttled so the change is retried on the next poll
    const now = Date.now();
    if (now - lastScannedRef.current > 10000) {
      try {
        hashesRef.current = newHashes;
        const envFiles = await FileScanner.scanProjectFolder(projectPath);
        onFilesChanged(envFiles);
        lastScannedRef.current = now;
      } catch (error) {
        console.error("Error checking for file changes:", error);
      }
    }
  }, [projectPath, pathsKey, onFilesChanged]);

  useEffect(() => {
    // Initial check
    checkForChanges();

    // Set up polling
    intervalRef.current = setInterval(checkForChanges, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkForChanges, pollInterval]);
};
