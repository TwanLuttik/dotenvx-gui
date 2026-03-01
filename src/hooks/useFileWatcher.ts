import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileScanner } from "../utils/fileScanner";
import { EnvFile } from "../types";

interface FileWatcherOptions {
  projectPath: string;
  selectedFilePath?: string;
  onFilesChanged: (envFiles: EnvFile[]) => void;
  pollInterval?: number;
}

export const useFileWatcher = ({
  projectPath,
  selectedFilePath,
  onFilesChanged,
  pollInterval = 5000,
}: FileWatcherOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastModifiedRef = useRef<number | null>(null);
  const lastScannedRef = useRef<number>(0);

  const checkForChanges = useCallback(async () => {
    if (!projectPath || !selectedFilePath) {
      return;
    }

    try {
      // Only read the selected file to check for changes
      const content = await invoke<string>("read_text_file", {
        path: selectedFilePath,
      });

      // Use content hash as a simple change detector
      const contentHash = content.length;
      const previousHash = lastModifiedRef.current;

      if (previousHash !== contentHash) {
        lastModifiedRef.current = contentHash;

        // Only rescan the project if the selected file changed
        // This reduces the number of full scans
        const now = Date.now();
        if (now - lastScannedRef.current > 10000) {
          // Rescan every 10 seconds max
          const envFiles = await FileScanner.scanProjectFolder(projectPath);
          onFilesChanged(envFiles);
          lastScannedRef.current = now;
        }
      }
    } catch (error) {
      console.error("Error checking for file changes:", error);
    }
  }, [projectPath, selectedFilePath, onFilesChanged]);

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
