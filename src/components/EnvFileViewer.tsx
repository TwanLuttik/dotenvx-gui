import React, { useCallback, useState } from "react";
import { EnvFile, Project } from "../types";
import { invoke } from "@tauri-apps/api/core";
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
} from "lucide-react";
import { VariableValueDisplay } from "./VariableValueDisplay";
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

export const EnvFileViewer: React.FC<EnvFileViewerProps> = ({
  project,
  onProjectUpdate,
}) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [visibleVariables, setVisibleVariables] = useState<Set<string>>(
    new Set(),
  );
  const [showAllValues, setShowAllValues] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showBackupManager, setShowBackupManager] = useState(false);
  const [currentEnvFile, setCurrentEnvFile] = useState<EnvFile | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(
    project?.envFiles[0]?.id || null,
  );

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

  const toggleAllVisibility = useCallback(() => {
    if (showAllValues) {
      setVisibleVariables(new Set());
    } else {
      const allKeys = new Set<string>();
      project?.envFiles.forEach((file) => {
        file.variables.forEach((variable) => {
          allKeys.add(`${file.id}-${variable.key}`);
        });
      });
      setVisibleVariables(allKeys);
    }
    setShowAllValues(!showAllValues);
  }, [showAllValues, project]);

  const copyToClipboard = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const toggleVariableVisibility = useCallback((variableKey: string) => {
    setVisibleVariables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(variableKey)) {
        newSet.delete(variableKey);
      } else {
        newSet.add(variableKey);
      }
      return newSet;
    });
  }, []);

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

      {project.envFiles.length === 0 ? (
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
          defaultValue={project.envFiles[0]?.id}
          value={selectedFileId || project.envFiles[0]?.id}
          onValueChange={setSelectedFileId}
          className="w-full flex flex-col"
        >
          <div className="sticky top-4 z-10">
            <Card className="border-b p-0 py-1 px-1">
              <TabsList className="flex flex-1 flex-wrap gap-1 justify-start bg-transparent p-0 h-auto">
                {project.envFiles.map((envFile) => (
                  <TabsTrigger
                    key={envFile.id}
                    value={envFile.id}
                    className="flex items-center gap-1 whitespace-nowrap px-2 py-1 text-sm h-8 hover:bg-accent hover:text-accent-foreground transition-colors flex-shrink-0"
                  >
                    <span>{envFile.name}</span>
                    {envFile.environment && (
                      <Badge variant="outline" className="text-xs">
                        {envFile.environment}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Card>
          </div>
          <div className="pt-4">
            {project.envFiles.map((envFile) => (
              <TabsContent key={envFile.id} value={envFile.id} className="mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <FileText className="h-5 w-5 text-muted-foreground" />
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
                            envFile.isEncrypted ? "default" : "secondary"
                          }
                          className="gap-1"
                        >
                          {envFile.isEncrypted ? (
                            <>
                              <Lock className="h-3 w-3" /> Encrypted
                            </>
                          ) : (
                            <>
                              <Unlock className="h-3 w-3" /> Unencrypted
                            </>
                          )}
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
                        {envFile.type === "keys" && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-purple-600"
                          >
                            <Key className="h-3 w-3" /> Keys
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
                      {envFile.type === "keys" ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Key className="h-4 w-4 text-muted-foreground" />
                            <h4 className="font-medium">Key Rotation</h4>
                          </div>
                          <KeyRotationDisplay
                            keysFile={envFile}
                            onRotationComplete={() => {
                              // Reload the project to get updated keys
                              if (project) {
                                onProjectUpdate(project);
                              }
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-muted-foreground" />
                              <h4 className="font-medium">
                                Variables ({envFile.variables.length})
                              </h4>
                            </div>
                            {envFile.variables.length > 0 &&
                              envFile.variables.some((v) => v.value) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={toggleAllVisibility}
                                  className="h-8"
                                >
                                  {showAllValues ? (
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
                          {envFile.variables.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">
                              No variables found in this file.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {envFile.variables.map((variable, index) => {
                                const variableId = `${envFile.id}-${variable.key}`;
                                const isVisible =
                                  visibleVariables.has(variableId);
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
                                        value={variable.value}
                                        isVisible={isVisible}
                                      />
                                      {variable.value && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            toggleVariableVisibility(variableId)
                                          }
                                          className="h-6 w-6 p-0"
                                        >
                                          {isVisible ? (
                                            <EyeOff className="h-4 w-4" />
                                          ) : (
                                            <Eye className="h-4 w-4" />
                                          )}
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
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
    </div>
  );
};
