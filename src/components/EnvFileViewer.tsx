import React, { useCallback, useEffect, useRef, useState } from "react";
import { EnvFile, EnvVariable, Project } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  Lock,
  Unlock,
  FileText,
  Key,
  AlertTriangle,
  Info,
  Eye,
  EyeOff,
  Copy,
  Check,
  FolderOpen,
  HardDrive,
  Plus,
  Pencil,
  ArrowDownAZ,
  List,
  Loader2,
} from "lucide-react";
import { VariableValueDisplay } from "./VariableValueDisplay";
import { VariableForm } from "./VariableForm";
import { KeyRotationDisplay } from "./KeyRotationDisplay";
import { BackupManager } from "./BackupManager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import { useFileWatcher } from "../hooks/useFileWatcher";

interface EnvFileViewerProps {
  project: Project | null;
  onProjectUpdate: (project: Project) => void;
}

// DOTENV_PUBLIC_KEY* is dotenvx encryption metadata, not an app variable -
// it is shown as a metadata row on the file card, not in the variables list
const isDotenvxMetadata = (key: string) => key.startsWith("DOTENV_PUBLIC_KEY");

export const EnvFileViewer: React.FC<EnvFileViewerProps> = ({
  project,
  onProjectUpdate,
}) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [visibleVariables, setVisibleVariables] = useState<Set<string>>(
    new Set(),
  );
  // Plaintext values decrypted in memory via `dotenvx get` - never written to disk
  const [decryptedValues, setDecryptedValues] = useState<Map<string, string>>(
    new Map(),
  );
  // Revealed values re-mask automatically so secrets don't linger on screen
  const REMASK_DELAY_MS = 60_000;
  const remaskTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const hideVariable = useCallback((variableId: string) => {
    setVisibleVariables((prev) => {
      const newSet = new Set(prev);
      newSet.delete(variableId);
      return newSet;
    });
    setDecryptedValues((prev) => {
      const newMap = new Map(prev);
      newMap.delete(variableId);
      return newMap;
    });
  }, []);

  const cancelRemask = useCallback((variableId: string) => {
    const timer = remaskTimers.current.get(variableId);
    if (timer) {
      clearTimeout(timer);
      remaskTimers.current.delete(variableId);
    }
  }, []);

  const scheduleRemask = useCallback(
    (variableId: string) => {
      cancelRemask(variableId);
      remaskTimers.current.set(
        variableId,
        setTimeout(() => {
          remaskTimers.current.delete(variableId);
          hideVariable(variableId);
        }, REMASK_DELAY_MS),
      );
    },
    [cancelRemask, hideVariable],
  );

  useEffect(() => {
    const timers = remaskTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);
  const [showAllValues, setShowAllValues] = useState(false);
  // Display-only sort - the file on disk keeps its original line order
  const [sortAlphabetically, setSortAlphabetically] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [addingToFileId, setAddingToFileId] = useState<string | null>(null);
  const [editingVariableId, setEditingVariableId] = useState<string | null>(
    null,
  );
  const [editInitialValue, setEditInitialValue] = useState("");
  // Pencil click shells out to dotenvx to prefill the plaintext - show a
  // spinner on the clicked pencil while that runs
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  // Same deal for the eye: first reveal of an encrypted value shells out too
  const [revealLoadingId, setRevealLoadingId] = useState<string | null>(null);
  // And for copy-to-clipboard on an encrypted value, and Show All
  const [copyLoadingId, setCopyLoadingId] = useState<string | null>(null);
  const [showAllLoading, setShowAllLoading] = useState(false);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [showKeysManager, setShowKeysManager] = useState(false);
  const [currentEnvFile, setCurrentEnvFile] = useState<EnvFile | null>(null);

  // .env.keys holds private decryption keys - it gets its own dialog off the
  // project header instead of masquerading as an environment file tab
  const tabFiles = project?.envFiles.filter((f) => f.type !== "keys") ?? [];
  const keysFile = project?.envFiles.find((f) => f.type === "keys");

  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    project?.envFiles.find((f) => f.type !== "keys")?.id || null,
  );

  // A git-tracked .env.keys means private keys could be committed - the
  // single worst failure mode of the dotenvx model, so check and warn loudly
  const [keysFileTracked, setKeysFileTracked] = useState(false);
  // Untracked but not gitignored is the highest-risk moment: dotenvx just
  // created the keys file and one `git add .` commits it
  const [keysFileIgnored, setKeysFileIgnored] = useState(true);
  const keysFilePath = keysFile?.path;
  useEffect(() => {
    if (!keysFilePath) {
      setKeysFileTracked(false);
      setKeysFileIgnored(true);
      return;
    }
    invoke<boolean>("is_file_git_tracked", { filePath: keysFilePath })
      .then(setKeysFileTracked)
      .catch(() => setKeysFileTracked(false));
    invoke<boolean>("is_file_git_ignored", { filePath: keysFilePath })
      .then(setKeysFileIgnored)
      .catch(() => setKeysFileIgnored(true));
  }, [keysFilePath]);

  const keysFileAtRisk = !keysFileTracked && !keysFileIgnored;

  // Watch for file changes - only watch the selected file
  const selectedEnvFile = project?.envFiles.find(
    (f) => f.id === selectedFileId,
  );

  useFileWatcher({
    projectPath: project?.path || "",
    selectedFilePath: selectedEnvFile?.path,
    onFilesChanged: (updatedEnvFiles) => {
      if (project) {
        onProjectUpdate({
          ...project,
          envFiles: updatedEnvFiles,
          lastModified: new Date().toISOString(),
        });
      }
    },
    pollInterval: 5000,
  });

  const toggleAllVisibility = useCallback(async () => {
    if (showAllValues) {
      remaskTimers.current.forEach(clearTimeout);
      remaskTimers.current.clear();
      setVisibleVariables(new Set());
      setDecryptedValues(new Map());
      setShowAllValues(false);
      return;
    }

    // Decrypt encrypted files in memory via `dotenvx get --format json`
    // so "Show All" reveals plaintext without touching the files on disk
    const newDecrypted = new Map<string, string>();
    setShowAllLoading(true);
    try {
      for (const file of project?.envFiles || []) {
        if (file.type === "keys") continue;
        if (!file.variables.some((v) => v.isEncrypted)) continue;
        try {
          const json = await invoke<string>("get_decrypted_values", {
            filePath: file.path,
          });
          const values: Record<string, string> = JSON.parse(json);
          for (const [key, value] of Object.entries(values)) {
            if (isDotenvxMetadata(key)) continue;
            newDecrypted.set(`${file.id}-${key}`, value);
          }
        } catch (error) {
          console.error(`Failed to decrypt ${file.name} in memory:`, error);
        }
      }
    } finally {
      setShowAllLoading(false);
    }

    const allKeys = new Set<string>();
    project?.envFiles.forEach((file) => {
      if (file.type === "keys") return;
      file.variables.forEach((variable) => {
        if (isDotenvxMetadata(variable.key)) return;
        allKeys.add(`${file.id}-${variable.key}`);
      });
    });
    setDecryptedValues(newDecrypted);
    setVisibleVariables(allKeys);
    setShowAllValues(true);
    allKeys.forEach(scheduleRemask);
  }, [showAllValues, project, scheduleRemask]);

  // When every revealed value has re-masked, flip the button back to Show All
  useEffect(() => {
    if (showAllValues && visibleVariables.size === 0) {
      setShowAllValues(false);
    }
  }, [showAllValues, visibleVariables]);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const copyDecryptedValue = useCallback(
    async (envFile: EnvFile, variable: EnvVariable) => {
      const variableId = `${envFile.id}-${variable.key}`;
      let plaintext = decryptedValues.get(variableId) ?? variable.value;

      // Decrypt in memory if needed - the value is copied without being shown
      if (variable.isEncrypted && !decryptedValues.has(variableId)) {
        setCopyLoadingId(variableId);
        try {
          plaintext = await invoke<string>("get_decrypted_value", {
            filePath: envFile.path,
            key: variable.key,
          });
        } catch (error) {
          console.error("Failed to decrypt variable:", error);
          alert(`Failed to decrypt ${variable.key}: ${error}`);
          return;
        } finally {
          setCopyLoadingId(null);
        }
      }

      await navigator.clipboard.writeText(plaintext);
      setCopiedKey(`value-${variableId}`);
      setTimeout(() => setCopiedKey(null), 2000);

      // Clear the clipboard after 30s, but only if it still holds this secret
      const copied = plaintext;
      setTimeout(async () => {
        try {
          if ((await navigator.clipboard.readText()) === copied) {
            await navigator.clipboard.writeText("");
          }
        } catch {
          // clipboard not readable - leave it alone
        }
      }, 30_000);
    },
    [decryptedValues],
  );

  const toggleVariableVisibility = useCallback(
    async (envFile: EnvFile, variable: EnvVariable) => {
      const variableId = `${envFile.id}-${variable.key}`;

      if (visibleVariables.has(variableId)) {
        cancelRemask(variableId);
        hideVariable(variableId);
        return;
      }

      // Encrypted value: decrypt in memory so the eye shows plaintext,
      // without ever rewriting the file on disk
      if (variable.isEncrypted && !decryptedValues.has(variableId)) {
        setRevealLoadingId(variableId);
        try {
          const plaintext = await invoke<string>("get_decrypted_value", {
            filePath: envFile.path,
            key: variable.key,
          });
          setDecryptedValues((prev) => new Map(prev).set(variableId, plaintext));
        } catch (error) {
          console.error("Failed to decrypt variable:", error);
          alert(`Failed to decrypt ${variable.key}: ${error}`);
          return;
        } finally {
          setRevealLoadingId(null);
        }
      }

      setVisibleVariables((prev) => new Set(prev).add(variableId));
      scheduleRemask(variableId);
    },
    [visibleVariables, decryptedValues, cancelRemask, hideVariable, scheduleRemask],
  );

  const saveVariable = useCallback(
    async (
      envFile: EnvFile,
      key: string,
      value: string,
      plain: boolean,
    ): Promise<boolean> => {
      if (!project) return false;

      try {
        // dotenvx set encrypts the value in-flight when the file has a
        // public key, so plaintext never lands on disk for encrypted files;
        // --plain preserves deliberately unencrypted variables
        await invoke<string>("set_env_value", {
          filePath: envFile.path,
          key,
          value,
          plain,
        });

        // Reload the file from disk to get updated variables
        const { FileScanner } = await import("../utils/fileScanner");
        const updatedEnvFiles = await FileScanner.scanProjectFolder(
          project.path,
        );
        onProjectUpdate({
          ...project,
          envFiles: updatedEnvFiles,
          lastModified: new Date().toISOString(),
        });
        return true;
      } catch (error) {
        console.error("Failed to set variable:", error);
        alert(`Failed to save ${key}: ${error}`);
        return false;
      }
    },
    [project, onProjectUpdate],
  );

  const handleAddVariable = useCallback(
    async (envFile: EnvFile, key: string, value: string) => {
      const existing = envFile.variables.find((v) => v.key === key);
      if (existing) {
        const proceed = await confirm(
          `${key} already exists in ${envFile.name}. Overwrite its value?`,
          {
            title: "Overwrite variable?",
            kind: "warning",
            okLabel: "Overwrite",
            cancelLabel: "Cancel",
          },
        );
        if (!proceed) return;
      }

      // Example files stay plaintext; overwriting keeps the variable's
      // current encryption state; brand-new variables encrypt by default
      const plain =
        envFile.type === "example" ||
        (existing ? !existing.isEncrypted : false);

      if (await saveVariable(envFile, key, value, plain)) {
        setAddingToFileId(null);
      }
    },
    [saveVariable],
  );

  const handleEncryptVariable = useCallback(
    async (envFile: EnvFile, variable: EnvVariable) => {
      if (!project) return;

      // Encrypting the first value in a keyless file has side effects far
      // bigger than the icon suggests - confirm the bootstrap once
      const hasKeypair = envFile.variables.some((v) =>
        isDotenvxMetadata(v.key),
      );
      if (!hasKeypair) {
        const proceed = await confirm(
          `${envFile.name} is not set up for encryption yet. Encrypting ` +
            `${variable.key} will add DOTENV_PUBLIC_KEY to the file and ` +
            `create .env.keys with the private decryption key.`,
          {
            title: "Set up encryption?",
            kind: "info",
            okLabel: "Encrypt",
            cancelLabel: "Cancel",
          },
        );
        if (!proceed) return;
      }

      try {
        await invoke<string>("encrypt_env_key", {
          filePath: envFile.path,
          key: variable.key,
        });

        // Reload the file from disk to get updated variables
        const { FileScanner } = await import("../utils/fileScanner");
        const updatedEnvFiles = await FileScanner.scanProjectFolder(
          project.path,
        );
        onProjectUpdate({
          ...project,
          envFiles: updatedEnvFiles,
          lastModified: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Failed to encrypt variable:", error);
        alert(`Failed to encrypt ${variable.key}: ${error}`);
      }
    },
    [project, onProjectUpdate],
  );

  const startEditVariable = useCallback(
    async (envFile: EnvFile, variable: EnvVariable) => {
      const variableId = `${envFile.id}-${variable.key}`;
      let current = decryptedValues.get(variableId) ?? variable.value;

      setEditLoadingId(variableId);
      try {
        // Prefill the form with the plaintext, decrypting in memory if needed
        if (variable.isEncrypted && !decryptedValues.has(variableId)) {
          try {
            current = await invoke<string>("get_decrypted_value", {
              filePath: envFile.path,
              key: variable.key,
            });
          } catch (error) {
            console.error("Failed to decrypt variable for editing:", error);
            current = "";
          }
        }

        setEditInitialValue(current);
        setEditingVariableId(variableId);
      } finally {
        setEditLoadingId(null);
      }
    },
    [decryptedValues],
  );

  const handleEditVariable = useCallback(
    async (envFile: EnvFile, variable: EnvVariable, value: string) => {
      const variableId = `${envFile.id}-${variable.key}`;
      // Editing preserves the variable's encryption state - a plaintext
      // variable only becomes encrypted via the explicit lock action
      const plain = envFile.type === "example" || !variable.isEncrypted;
      if (await saveVariable(envFile, variable.key, value, plain)) {
        // Keep the in-memory plaintext cache in sync if this value was revealed
        setDecryptedValues((prev) =>
          prev.has(variableId) ? new Map(prev).set(variableId, value) : prev,
        );
        setEditingVariableId(null);
      }
    },
    [saveVariable],
  );

  const handleOpenFolder = useCallback(async () => {
    if (!project) return;
    try {
      await invoke("open_folder", { path: project.path });
    } catch (error) {
      console.error("Failed to open folder:", error);
    }
  }, [project]);

  const handleEncrypt = useCallback(
    async (envFile: EnvFile) => {
      if (!project) return;

      if (envFile.isEncrypted) {
        alert("This file is already encrypted");
        return;
      }

      setIsProcessing(envFile.id);
      try {
        console.log("Encrypting file:", envFile.path);
        const result = await invoke<string>("encrypt_env_file", {
          filePath: envFile.path,
        });
        console.log("Encrypt result:", result);

        // Reload the file from disk to get updated variables
        const { FileScanner } = await import("../utils/fileScanner");
        const updatedEnvFiles = await FileScanner.scanProjectFolder(project.path);

        // Update the project with the reloaded files
        const updatedProject: Project = {
          ...project,
          envFiles: updatedEnvFiles,
          lastModified: new Date().toISOString(),
        };

        onProjectUpdate(updatedProject);
      } catch (error) {
        console.error("Failed to encrypt file:", error);
        alert(`Failed to encrypt ${envFile.name}: ${error}`);
      } finally {
        setIsProcessing(null);
      }
    },
    [project, onProjectUpdate],
  );

  const handleDecrypt = useCallback(
    async (envFile: EnvFile) => {
      if (!project) return;

      if (!envFile.isEncrypted) {
        alert("This file is not encrypted");
        return;
      }

      // Decrypting rewrites the file with plaintext - warn if git could commit it
      try {
        const tracked = await invoke<boolean>("is_file_git_tracked", {
          filePath: envFile.path,
        });
        if (tracked) {
          // window.confirm is patched by the dialog plugin to return a
          // Promise, which is always truthy - await the plugin API instead
          const proceed = await confirm(
            `${envFile.name} is tracked by git.\n\n` +
              "Decrypting will write plaintext secrets to a file that could " +
              "be accidentally committed. To view values without modifying " +
              "the file, use the eye icon or Show All instead.",
            {
              title: "Decrypt file on disk?",
              kind: "warning",
              okLabel: "Decrypt Anyway",
              cancelLabel: "Cancel",
            },
          );
          if (!proceed) return;
        }
      } catch (error) {
        console.error("Failed to check git status:", error);
      }

      setIsProcessing(envFile.id);
      try {
        console.log("Decrypting file:", envFile.path);
        const result = await invoke<string>("decrypt_env_file", {
          filePath: envFile.path,
        });
        console.log("Decrypt result:", result);

        // Reload the file from disk to get updated variables
        const { FileScanner } = await import("../utils/fileScanner");
        const updatedEnvFiles = await FileScanner.scanProjectFolder(project.path);

        // Update the project with the reloaded files
        const updatedProject: Project = {
          ...project,
          envFiles: updatedEnvFiles,
          lastModified: new Date().toISOString(),
        };

        onProjectUpdate(updatedProject);
      } catch (error) {
        console.error("Failed to decrypt file:", error);
        alert(`Failed to decrypt ${envFile.name}: ${error}`);
      } finally {
        setIsProcessing(null);
      }
    },
    [project, onProjectUpdate],
  );

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Select a Project</h2>
        <p className="text-muted-foreground">
          Choose a project from the sidebar to view its environment files.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">{project.name}</h2>
          <p className="text-sm text-muted-foreground font-mono">
            {project.path}
          </p>
        </div>
        <div className="flex gap-2">
          {keysFile && (
            <Button
              onClick={() => setShowKeysManager(true)}
              variant="outline"
              size="sm"
              className="gap-2"
              title="View and rotate private decryption keys"
            >
              <Key className="h-4 w-4" />
              Keys
              {keysFileTracked ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : keysFileAtRisk ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : null}
            </Button>
          )}
          <Button
            onClick={handleOpenFolder}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Open folder in file explorer"
          >
            <FolderOpen className="h-4 w-4" />
            Open Folder
          </Button>
        </div>
      </div>

      {tabFiles.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2">
                No environment files found in this project.
              </p>
              <p className="text-sm">
                Make sure your .env files are in the project root directory.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Tabs
          defaultValue={tabFiles[0]?.id}
          value={selectedFileId || tabFiles[0]?.id}
          onValueChange={setSelectedFileId}
          className="w-full flex flex-col"
        >
          <div className="sticky top-0 z-10 bg-background py-2">
              <TabsList className="flex flex-wrap gap-1.5 justify-start h-auto w-fit bg-transparent p-0">
                {tabFiles.map((envFile) => (
                  <TabsTrigger
                    key={envFile.id}
                    value={envFile.id}
                    className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1 text-sm h-8 border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:border-blue-500/40 data-[state=active]:shadow-none"
                  >
                    {envFile.isEncrypted ? (
                      <Lock className="h-3 w-3 opacity-60" />
                    ) : (
                      <FileText className="h-3 w-3 opacity-60" />
                    )}
                    <span>{envFile.name}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
          </div>
          <div className="pt-2">
            {tabFiles.map((envFile) => {
              const regularVariables = envFile.variables.filter(
                (v) => !isDotenvxMetadata(v.key),
              );
              const displayVariables = sortAlphabetically
                ? [...regularVariables].sort((a, b) =>
                    a.key.localeCompare(b.key),
                  )
                : regularVariables;
              const publicKeyVar = envFile.variables.find((v) =>
                isDotenvxMetadata(v.key),
              );
              return (
              <TabsContent key={envFile.id} value={envFile.id} className="mt-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        {envFile.isEncrypted ? (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        )}
                        <CardTitle className="text-lg">
                          {envFile.name}
                        </CardTitle>

                        {/* Environment Badge */}
                        {envFile.environment && (
                          <Badge variant="outline" className="text-xs">
                            {envFile.environment}
                          </Badge>
                        )}

                        {/* Encryption Status Badge */}
                        <Badge
                          variant={
                            envFile.isEncrypted ? "default" : "outline"
                          }
                          className={
                            envFile.isEncrypted
                              ? ""
                              : "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }
                        >
                          {envFile.isEncrypted ? "Encrypted" : "Unencrypted"}
                        </Badge>

                        {/* File Type Badge */}
                        {envFile.type === "example" && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-blue-600"
                          >
                            <Info className="h-3 w-3" /> Example
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {envFile.type !== "example" &&
                          envFile.type !== "keys" && (
                            <>
                              <Button
                                onClick={() => {
                                  setShowBackupManager(true);
                                  setCurrentEnvFile(envFile);
                                }}
                                variant="outline"
                                size="sm"
                                className="gap-2"
                              >
                                <HardDrive className="h-4 w-4" />
                                Backups
                              </Button>
                              {envFile.isEncrypted ? (
                                <Button
                                  onClick={() => handleDecrypt(envFile)}
                                  disabled={isProcessing !== null}
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                >
                                  <Unlock className="h-4 w-4" />
                                  {isProcessing === envFile.id
                                    ? "Decrypting..."
                                    : "Decrypt"}
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => handleEncrypt(envFile)}
                                  disabled={isProcessing !== null}
                                  size="sm"
                                  className="gap-2"
                                >
                                  <Lock className="h-4 w-4" />
                                  {isProcessing === envFile.id
                                    ? "Encrypting..."
                                    : "Encrypt"}
                                </Button>
                              )}
                            </>
                          )}
                      </div>
                    </div>
                    {publicKeyVar && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground font-mono">
                        <Key className="h-3 w-3" />
                        <span>{publicKeyVar.key}:</span>
                        <span title={publicKeyVar.value}>
                          {publicKeyVar.value.length > 16
                            ? `${publicKeyVar.value.slice(0, 8)}…${publicKeyVar.value.slice(-6)}`
                            : publicKeyVar.value}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              publicKeyVar.value,
                              `pk-${envFile.id}`,
                            )
                          }
                          className="h-5 w-5 p-0"
                          title="Copy public key"
                        >
                          {copiedKey === `pk-${envFile.id}` ? (
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    )}
                  </CardHeader>

                  {/* Validation Alerts */}
                  {(envFile.missingKeys || envFile.extraKeys) && (
                    <div className="px-6 space-y-2">
                      {envFile.missingKeys &&
                        envFile.missingKeys.length > 0 && (
                          <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              <strong>Missing keys:</strong>{" "}
                              {envFile.missingKeys.join(", ")}
                              <br />
                              <span className="text-xs opacity-75">
                                These keys exist in .env.example but are missing
                                from this file.
                              </span>
                            </AlertDescription>
                          </Alert>
                        )}
                      {envFile.extraKeys && envFile.extraKeys.length > 0 && (
                        <Alert variant="default">
                          <Info className="h-4 w-4" />
                          <AlertDescription>
                            <strong>Extra keys:</strong>{" "}
                            {envFile.extraKeys.join(", ")}
                            <br />
                            <span className="text-xs opacity-75">
                              These keys exist in this file but not in
                              .env.example.
                            </span>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}

                  <CardContent className="mt-5">
                    <div className="space-y-3">
                      <>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-muted-foreground" />
                              <h4 className="font-medium">
                                Variables ({regularVariables.length})
                              </h4>
                            </div>
                            <div className="flex items-center gap-2">
                            {regularVariables.length > 1 && (
                              <Button
                                variant={
                                  sortAlphabetically ? "secondary" : "outline"
                                }
                                size="sm"
                                onClick={() =>
                                  setSortAlphabetically(!sortAlphabetically)
                                }
                                className="h-8"
                                title={
                                  sortAlphabetically
                                    ? "Show variables in file order"
                                    : "Sort A-Z (display only, file unchanged)"
                                }
                              >
                                {sortAlphabetically ? (
                                  <>
                                    <List className="h-4 w-4 mr-1" />
                                    Unsort
                                  </>
                                ) : (
                                  <>
                                    <ArrowDownAZ className="h-4 w-4 mr-1" />
                                    Sort A-Z
                                  </>
                                )}
                              </Button>
                            )}
                            {regularVariables.length > 0 &&
                              regularVariables.some((v) => v.isEncrypted) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={toggleAllVisibility}
                                  disabled={showAllLoading}
                                  className="h-8"
                                  title={
                                    showAllValues
                                      ? "Hide all values"
                                      : "Show all values (encrypted files are decrypted in memory, files untouched)"
                                  }
                                >
                                  {showAllLoading ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      Show All
                                    </>
                                  ) : showAllValues ? (
                                    <>
                                      <EyeOff className="h-4 w-4 mr-1" />
                                      Hide All
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="h-4 w-4 mr-1" />
                                      Show All
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                              {displayVariables.map((variable, index) => {
                                const variableId = `${envFile.id}-${variable.key}`;
                                // Plaintext values are already readable on disk -
                                // masking them here adds friction, not security
                                const isPlaintext = !variable.isEncrypted;
                                const isVisible =
                                  visibleVariables.has(variableId) ||
                                  isPlaintext;
                                if (editingVariableId === variableId) {
                                  return (
                                    <VariableForm
                                      key={index}
                                      initialKey={variable.key}
                                      keyLocked
                                      initialValue={editInitialValue}
                                      onSave={(_key, value) =>
                                        handleEditVariable(
                                          envFile,
                                          variable,
                                          value,
                                        )
                                      }
                                      onCancel={() =>
                                        setEditingVariableId(null)
                                      }
                                    />
                                  );
                                }
                                return (
                                  <div
                                    key={index}
                                    className="flex items-center justify-between p-3 bg-muted/30 rounded-md"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-sm font-medium">
                                        {variable.key}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          copyToClipboard(
                                            variable.key,
                                            `key-${variableId}`,
                                          )
                                        }
                                        className="h-5 w-5 p-0"
                                        title="Copy key"
                                      >
                                        {copiedKey === `key-${variableId}` ? (
                                          <Check className="h-3.5 w-3.5 text-green-600" />
                                        ) : (
                                          <Copy className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <VariableValueDisplay
                                        value={
                                          decryptedValues.get(variableId) ??
                                          variable.value
                                        }
                                        isVisible={isVisible}
                                      />
                                      {/* Fixed button slots keep the value column
                                          aligned across rows with different actions */}
                                      {variable.value ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            copyDecryptedValue(
                                              envFile,
                                              variable,
                                            )
                                          }
                                          disabled={copyLoadingId !== null}
                                          className="h-6 w-6 p-0"
                                          title="Copy value (decrypted in memory, clipboard clears after 30s)"
                                        >
                                          {copyLoadingId === variableId ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : copiedKey ===
                                            `value-${variableId}` ? (
                                            <Check className="h-4 w-4 text-green-600" />
                                          ) : (
                                            <Copy className="h-4 w-4" />
                                          )}
                                        </Button>
                                      ) : (
                                        <span className="h-6 w-6" />
                                      )}
                                      {variable.value && !isPlaintext ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            toggleVariableVisibility(
                                              envFile,
                                              variable,
                                            )
                                          }
                                          disabled={revealLoadingId !== null}
                                          className="h-6 w-6 p-0"
                                          title="Reveal (decrypts in memory, file untouched)"
                                        >
                                          {revealLoadingId === variableId ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : isVisible ? (
                                            <EyeOff className="h-4 w-4" />
                                          ) : (
                                            <Eye className="h-4 w-4" />
                                          )}
                                        </Button>
                                      ) : variable.value &&
                                        isPlaintext &&
                                        envFile.type !== "example" ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            handleEncryptVariable(
                                              envFile,
                                              variable,
                                            )
                                          }
                                          className="h-6 w-6 p-0"
                                          title="Encrypt this value"
                                        >
                                          <Lock className="h-4 w-4" />
                                        </Button>
                                      ) : (
                                        <span className="h-6 w-6" />
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          startEditVariable(envFile, variable)
                                        }
                                        disabled={editLoadingId !== null}
                                        className="h-6 w-6 p-0"
                                        title="Edit value"
                                      >
                                        {editLoadingId === variableId ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Pencil className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          {addingToFileId === envFile.id ? (
                            <VariableForm
                              onSave={(key, value) =>
                                handleAddVariable(envFile, key, value)
                              }
                              onCancel={() => setAddingToFileId(null)}
                            />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setAddingToFileId(envFile.id)}
                              className="gap-1 text-muted-foreground"
                            >
                              <Plus className="h-4 w-4" />
                              Add Variable
                            </Button>
                          )}
                        </>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              );
            })}
          </div>
        </Tabs>
      )}

      {/* Backup Manager Dialog */}
      <Dialog open={showBackupManager} onOpenChange={setShowBackupManager}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backups - {currentEnvFile?.name}</DialogTitle>
            <DialogClose onClick={() => setShowBackupManager(false)} />
          </DialogHeader>
          {currentEnvFile && (
            <BackupManager
              projectId={project?.id || ""}
              filePath={currentEnvFile.path}
              content={currentEnvFile.variables
                .map((v) => `${v.key}=${v.value || ""}`)
                .join("\n")}
              onBackupCreated={() => {
                // Optionally refresh project data
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Keys Dialog */}
      {keysFile && (
        <Dialog open={showKeysManager} onOpenChange={setShowKeysManager}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Private Keys - {keysFile.name}</DialogTitle>
              <DialogClose onClick={() => setShowKeysManager(false)} />
            </DialogHeader>
            {keysFileTracked && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{keysFile.name} is tracked by git!</strong> This
                  file contains private decryption keys and must never be
                  committed. Add it to .gitignore, then run{" "}
                  <code>git rm --cached {keysFile.name}</code> to untrack it.
                </AlertDescription>
              </Alert>
            )}
            {keysFileAtRisk && (
              <Alert className="border-amber-500/50 text-amber-600 dark:text-amber-400 [&>svg]:text-current">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-amber-600/90 dark:text-amber-400/90">
                  <strong>{keysFile.name} is not covered by .gitignore.</strong>{" "}
                  It contains private decryption keys and is one{" "}
                  <code>git add .</code> away from being committed. Add{" "}
                  <code>{keysFile.name}</code> to .gitignore.
                </AlertDescription>
              </Alert>
            )}
            <KeyRotationDisplay
              keysFile={keysFile}
              onRotationComplete={async () => {
                // Rotation re-encrypts the .env files - reload from disk
                const { FileScanner } = await import("../utils/fileScanner");
                const updatedEnvFiles = await FileScanner.scanProjectFolder(
                  project.path,
                );
                onProjectUpdate({
                  ...project,
                  envFiles: updatedEnvFiles,
                  lastModified: new Date().toISOString(),
                });
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
