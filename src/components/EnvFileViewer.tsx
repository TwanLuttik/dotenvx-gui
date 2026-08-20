import React, { useCallback, useEffect, useMemo, useState } from "react";
import { EnvFile, Project } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Input } from "./ui/input";
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
  Search,
  FolderPlus,
} from "lucide-react";
import { VariableValueDisplay } from "./VariableValueDisplay";
import { KeyRotationDisplay } from "./KeyRotationDisplay";
import { BackupManager } from "./BackupManager";
import { FileTabScroller } from "./FileTabScroller";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
import { useFileWatcher } from "../hooks/useFileWatcher";
import { FileScanner } from "../utils/fileScanner";
import { useToast } from "../contexts/ToastContext";
import { fileWasLastSynced } from "../lib/onepassword";
import { formatDateTime } from "../lib/utils";
import {
  envFileTabLabel,
  filesInFolder,
  projectFolders,
  withScannedFolders,
} from "../lib/project";

interface EnvFileViewerProps {
  project: Project | null;
  selectedFolderPath: string | null;
  onProjectUpdate: (project: Project) => void;
}

export const EnvFileViewer: React.FC<EnvFileViewerProps> = ({
  project,
  selectedFolderPath,
  onProjectUpdate,
}) => {
  const { success, error, info } = useToast();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [visibleVariables, setVisibleVariables] = useState<Set<string>>(
    new Set(),
  );
  const [showAllValues, setShowAllValues] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [currentEnvFile, setCurrentEnvFile] = useState<EnvFile | null>(null);
  const folders = project ? projectFolders(project) : [];
  const envFiles = project ? filesInFolder(project, selectedFolderPath) : [];
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    envFiles[0]?.id || null,
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!project) {
      setSelectedFileId(null);
      setQuery("");
      setShowAllValues(false);
      setVisibleVariables(new Set());
      return;
    }

    const files = filesInFolder(project, selectedFolderPath);
    const stillExists = files.some((file) => file.id === selectedFileId);
    if (!stillExists) {
      setSelectedFileId(files[0]?.id ?? null);
    }
  }, [project, selectedFileId, selectedFolderPath]);

  const selectedEnvFile = envFiles.find((file) => file.id === selectedFileId);

  useFileWatcher({
    projectPath: project?.path || "",
    selectedFilePath: selectedEnvFile?.path,
    onFoldersChanged: (updatedFolders) => {
      if (project) {
        onProjectUpdate(withScannedFolders(project, updatedFolders));
      }
    },
    pollInterval: 5000,
  });

  const filteredVariables = useMemo(() => {
    const variables = selectedEnvFile?.variables ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return variables;
    return variables.filter((variable) =>
      variable.key.toLowerCase().includes(term),
    );
  }, [query, selectedEnvFile]);

  const toggleAllVisibility = useCallback(() => {
    if (!selectedEnvFile) return;

    if (showAllValues) {
      setVisibleVariables(new Set());
    } else {
      setVisibleVariables(
        new Set(
          selectedEnvFile.variables.map(
            (variable) => `${selectedEnvFile.id}-${variable.key}`,
          ),
        ),
      );
    }
    setShowAllValues((prev) => !prev);
  }, [selectedEnvFile, showAllValues]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch (err) {
      error(`Failed to copy: ${String(err)}`);
    }
  }, [error]);

  const toggleVariableVisibility = useCallback((variableKey: string) => {
    setVisibleVariables((prev) => {
      const next = new Set(prev);
      if (next.has(variableKey)) {
        next.delete(variableKey);
      } else {
        next.add(variableKey);
      }
      return next;
    });
  }, []);

  const reloadProject = useCallback(async () => {
    if (!project) return;
    const updatedFolders = await FileScanner.scanProjectFolders(project.path);
    onProjectUpdate(withScannedFolders(project, updatedFolders));
  }, [project, onProjectUpdate]);

  const handleOpenFolder = useCallback(async () => {
    if (!project) return;
    const folderPath =
      selectedFolderPath ||
      selectedEnvFile?.path.replace(/[/\\][^/\\]+$/, "") ||
      project.path;
    try {
      await invoke("open_folder", { path: folderPath });
    } catch (err) {
      error(`Failed to open folder: ${String(err)}`);
    }
  }, [project, selectedFolderPath, selectedEnvFile, error]);

  const handleEncrypt = useCallback(
    async (envFile: EnvFile) => {
      if (!project) return;

      if (envFile.isEncrypted) {
        info("This file is already encrypted");
        return;
      }

      setIsProcessing(envFile.id);
      try {
        await invoke<string>("encrypt_env_file", {
          filePath: envFile.path,
        });
        await reloadProject();
        success(`Encrypted ${envFile.name}`);
      } catch (err) {
        error(`Failed to encrypt ${envFile.name}: ${String(err)}`);
      } finally {
        setIsProcessing(null);
      }
    },
    [project, reloadProject, success, error, info],
  );

  const handleDecrypt = useCallback(
    async (envFile: EnvFile) => {
      if (!project) return;

      if (!envFile.isEncrypted) {
        info("This file is not encrypted");
        return;
      }

      setIsProcessing(envFile.id);
      try {
        await invoke<string>("decrypt_env_file", {
          filePath: envFile.path,
        });
        await reloadProject();
        success(`Decrypted ${envFile.name}`);
      } catch (err) {
        error(`Failed to decrypt ${envFile.name}: ${String(err)}`);
      } finally {
        setIsProcessing(null);
      }
    },
    [project, reloadProject, success, error, info],
  );

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border bg-muted/40">
          <FolderPlus className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          Select a project
        </h2>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Import a folder from the sidebar to inspect, encrypt, and back up its
          environment files.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {envFiles.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <FileText className="mb-3 size-10 text-muted-foreground/60" />
          <p className="text-sm font-medium">No environment files found</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {selectedFolderPath
              ? "This folder has no `.env` files. Pick another folder in the sidebar."
              : "Add a `.env` file under this project, then refresh from the sidebar."}
          </p>
        </div>
      ) : (
        <Tabs
          value={selectedFileId || envFiles[0]?.id}
          onValueChange={(value) => {
            setSelectedFileId(value);
            setQuery("");
            setShowAllValues(false);
            setVisibleVariables(new Set());
          }}
          className="flex h-full min-h-0 flex-col gap-0"
        >
          <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
            <FileTabScroller activeId={selectedFileId || envFiles[0]?.id || null}>
              <TabsList
                variant="line"
                className="h-9 w-max flex-nowrap justify-start gap-0 bg-transparent p-0"
              >
                {envFiles.map((envFile) => (
                  <TabsTrigger
                    key={envFile.id}
                    value={envFile.id}
                    className="h-8 flex-none gap-1.5 px-2.5 text-xs"
                  >
                    <span className="font-mono">
                      {selectedFolderPath
                        ? envFile.name
                        : envFileTabLabel(
                            project.path,
                            envFile,
                            folders.length,
                          )}
                    </span>
                    {envFile.isEncrypted && (
                      <Lock className="size-3 text-primary" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </FileTabScroller>
            <Button
              onClick={handleOpenFolder}
              variant="outline"
              size="sm"
              className="shrink-0"
            >
              <FolderOpen className="size-4" />
              Open folder
            </Button>
          </div>

          {envFiles.map((envFile) => (
            <TabsContent
              key={envFile.id}
              value={envFile.id}
              className="min-h-0 flex-1 overflow-auto"
            >
              <div className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-mono text-base font-semibold">
                        {envFile.name}
                      </h3>
                      {envFile.environment && (
                        <Badge variant="outline">{envFile.environment}</Badge>
                      )}
                      <Badge
                        variant={envFile.isEncrypted ? "default" : "secondary"}
                      >
                        {envFile.isEncrypted ? (
                          <>
                            <Lock className="size-3" /> Encrypted
                          </>
                        ) : (
                          <>
                            <Unlock className="size-3" /> Plaintext
                          </>
                        )}
                      </Badge>
                      {envFile.type === "example" && (
                        <Badge variant="outline">
                          <Info className="size-3" /> Example
                        </Badge>
                      )}
                      {envFile.type === "keys" && (
                        <Badge variant="outline">
                          <Key className="size-3" /> Keys
                        </Badge>
                      )}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {envFile.path}
                    </p>
                    {project.onePasswordLastSyncedAt &&
                      fileWasLastSynced(project, envFile.path) && (
                        <p className="text-[11px] text-muted-foreground">
                          Last synced to 1Password{" "}
                          {formatDateTime(project.onePasswordLastSyncedAt)}
                        </p>
                      )}
                  </div>

                  {envFile.type !== "example" && envFile.type !== "keys" && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setShowBackupManager(true);
                          setCurrentEnvFile(envFile);
                        }}
                        variant="outline"
                        size="sm"
                      >
                        <HardDrive className="size-4" />
                        Backups
                      </Button>
                      {envFile.isEncrypted ? (
                        <Button
                          onClick={() => handleDecrypt(envFile)}
                          disabled={isProcessing !== null}
                          variant="outline"
                          size="sm"
                        >
                          <Unlock className="size-4" />
                          {isProcessing === envFile.id
                            ? "Decrypting…"
                            : "Decrypt"}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleEncrypt(envFile)}
                          disabled={isProcessing !== null}
                          size="sm"
                        >
                          <Lock className="size-4" />
                          {isProcessing === envFile.id
                            ? "Encrypting…"
                            : "Encrypt"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {(envFile.missingKeys?.length || envFile.extraKeys?.length) && (
                  <div className="space-y-2">
                    {envFile.missingKeys && envFile.missingKeys.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTriangle />
                        <AlertDescription>
                          <span className="font-medium text-foreground">
                            Missing keys
                          </span>
                          {" · "}
                          {envFile.missingKeys.join(", ")}
                          <span className="mt-1 block text-xs">
                            Present in `.env.example` but not in this file.
                          </span>
                        </AlertDescription>
                      </Alert>
                    )}
                    {envFile.extraKeys && envFile.extraKeys.length > 0 && (
                      <Alert>
                        <Info />
                        <AlertDescription>
                          <span className="font-medium text-foreground">
                            Extra keys
                          </span>
                          {" · "}
                          {envFile.extraKeys.join(", ")}
                          <span className="mt-1 block text-xs">
                            Present here but not in `.env.example`.
                          </span>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {envFile.type === "keys" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Key className="size-4 text-muted-foreground" />
                      <h4 className="text-sm font-medium">Private keys</h4>
                    </div>
                    <KeyRotationDisplay
                      keysFile={envFile}
                      onRotationComplete={reloadProject}
                    />
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                      <div className="relative min-w-[12rem] flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Search variables"
                          className="h-8 bg-background pl-8"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {filteredVariables.length}
                          {query ? ` / ${envFile.variables.length}` : ""}{" "}
                          variables
                        </span>
                        {envFile.variables.some((variable) => variable.value) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleAllVisibility}
                          >
                            {showAllValues ? (
                              <>
                                <EyeOff className="size-4" />
                                Hide values
                              </>
                            ) : (
                              <>
                                <Eye className="size-4" />
                                Reveal values
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {envFile.variables.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                        No variables found in this file.
                      </p>
                    ) : filteredVariables.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No variables match “{query}”.
                      </p>
                    ) : (
                      <div className="divide-y">
                        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-3 px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          <span>Key</span>
                          <span>Value</span>
                          <span className="w-20 text-right">Actions</span>
                        </div>
                        {filteredVariables.map((variable) => {
                          const variableId = `${envFile.id}-${variable.key}`;
                          const isVisible = visibleVariables.has(variableId);
                          return (
                            <div
                              key={variableId}
                              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] items-center gap-3 px-3 py-2 hover:bg-muted/40"
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-mono text-[13px] font-medium">
                                  {variable.key}
                                </span>
                                {variable.isEncrypted && (
                                  <Lock className="size-3 shrink-0 text-primary" />
                                )}
                              </div>
                              <VariableValueDisplay
                                value={variable.value}
                                isVisible={isVisible}
                              />
                              <div className="flex w-20 items-center justify-end gap-0.5">
                                {variable.value && (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() =>
                                      toggleVariableVisibility(variableId)
                                    }
                                    title={
                                      isVisible ? "Hide value" : "Reveal value"
                                    }
                                  >
                                    {isVisible ? (
                                      <EyeOff className="size-3.5" />
                                    ) : (
                                      <Eye className="size-3.5" />
                                    )}
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() =>
                                    copyToClipboard(
                                      variable.value || variable.key,
                                      variableId,
                                    )
                                  }
                                  title={
                                    variable.value
                                      ? "Copy value"
                                      : "Copy key"
                                  }
                                >
                                  {copiedKey === variableId ? (
                                    <Check className="size-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="size-3.5" />
                                  )}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog
        open={showBackupManager}
        onOpenChange={setShowBackupManager}
        size="lg"
      >
        <DialogContent>
          <DialogHeader>
            <div>
              <DialogTitle>Backups</DialogTitle>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {currentEnvFile?.name}
              </p>
            </div>
            <DialogClose onClick={() => setShowBackupManager(false)} />
          </DialogHeader>
          {currentEnvFile && (
            <BackupManager
              projectId={project.id}
              filePath={currentEnvFile.path}
              content={currentEnvFile.variables
                .map((variable) => `${variable.key}=${variable.value || ""}`)
                .join("\n")}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
