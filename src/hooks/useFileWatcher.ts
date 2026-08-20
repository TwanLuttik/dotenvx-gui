import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileScanner } from "../utils/fileScanner";
import { ProjectFolder } from "../types";

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash;
}

interface FileWatcherOptions {
  projectPath: string;
  selectedFilePath?: string;
  onFoldersChanged: (folders: ProjectFolder[]) => void;
  pollInterval?: number;
}

export const useFileWatcher = ({
  projectPath,
  selectedFilePath,
  onFoldersChanged,
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

      const contentHash = hashString(content);
      const previousHash = lastModifiedRef.current;

      if (previousHash !== contentHash) {
        lastModifiedRef.current = contentHash;

        // Only rescan the project if the selected file changed
        // This reduces the number of full scans
        const now = Date.now();
        if (now - lastScannedRef.current > 10000) {
          // Rescan every 10 seconds max
          const folders = await FileScanner.scanProjectFolders(projectPath);
          onFoldersChanged(folders);
          lastScannedRef.current = now;
        }
      }
    } catch (error) {
      console.error("Error checking for file changes:", error);
    }
  }, [projectPath, selectedFilePath, onFoldersChanged]);

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
