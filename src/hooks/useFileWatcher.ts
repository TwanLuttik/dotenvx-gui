import { useEffect, useRef, useCallback } from "react";
import { FileScanner } from "../utils/fileScanner";
import { EnvFile } from "../types";

interface FileWatcherOptions {
  projectPath: string;
  onFilesChanged: (envFiles: EnvFile[]) => void;
  pollInterval?: number;
}

export const useFileWatcher = ({
  projectPath,
  onFilesChanged,
  pollInterval = 2000,
}: FileWatcherOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastModifiedRef = useRef<Map<string, number>>(new Map());

  const checkForChanges = useCallback(async () => {
    if (!projectPath) {
      return;
    }

    try {
      const envFiles = await FileScanner.scanProjectFolder(projectPath);

      let hasChanges = false;

      for (const file of envFiles) {
        const lastModified = new Date(file.lastModified).getTime();
        const previousModified = lastModifiedRef.current.get(file.path);

        if (previousModified !== lastModified) {
          hasChanges = true;
          lastModifiedRef.current.set(file.path, lastModified);
        }
      }

      // Check for deleted files
      const currentPaths = new Set(envFiles.map((f) => f.path));
      for (const path of lastModifiedRef.current.keys()) {
        if (!currentPaths.has(path)) {
          hasChanges = true;
          lastModifiedRef.current.delete(path);
        }
      }

      if (hasChanges) {
        onFilesChanged(envFiles);
      }
    } catch (error) {
      console.error("Error checking for file changes:", error);
    }
  }, [projectPath, onFilesChanged]);

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
