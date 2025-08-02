import React, { useState } from "react";
import { EnvFile, Project } from "../types";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Lock, Unlock, FileText, Key, AlertTriangle, Info } from "lucide-react";

interface EnvFileViewerProps {
  project: Project | null;
  onProjectUpdate: (project: Project) => void;
}

export const EnvFileViewer: React.FC<EnvFileViewerProps> = ({
  project,
  onProjectUpdate,
}) => {
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  const handleEncrypt = async (envFile: EnvFile) => {
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

      // Update the file's encryption status
      const updatedProject: Project = {
        ...project,
        envFiles: project.envFiles.map((file) =>
          file.id === envFile.id ? { ...file, isEncrypted: true } : file
        ),
        lastModified: new Date().toISOString(),
      };

      onProjectUpdate(updatedProject);
    } catch (error) {
      console.error("Failed to encrypt file:", error);
      alert(`Failed to encrypt ${envFile.name}: ${error}`);
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDecrypt = async (envFile: EnvFile) => {
    if (!project) return;

    if (!envFile.isEncrypted) {
      alert("This file is not encrypted");
      return;
    }

    setIsProcessing(envFile.id);
    try {
      console.log("Decrypting file:", envFile.path);
      console.log("Decrypting file:", envFile.path);
      const result = await invoke<string>("decrypt_env_file", {
        filePath: envFile.path,
      });
      console.log("Decrypt result:", result);

      // Update the file's encryption status
      const updatedProject: Project = {
        ...project,
        envFiles: project.envFiles.map((file) =>
          file.id === envFile.id ? { ...file, isEncrypted: false } : file
        ),
        lastModified: new Date().toISOString(),
      };

      onProjectUpdate(updatedProject);
    } catch (error) {
      console.error("Failed to decrypt file:", error);
      alert(`Failed to decrypt ${envFile.name}: ${error}`);
    } finally {
      setIsProcessing(null);
    }
  };

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
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">{project.name}</h2>
        <p className="text-sm text-muted-foreground font-mono">
          {project.path}
        </p>
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
        <Tabs defaultValue={project.envFiles[0]?.id} className="w-full">
          <TabsList
            className="grid w-full"
            style={{
              gridTemplateColumns: `repeat(${project.envFiles.length}, minmax(0, 1fr))`,
            }}
          >
            {project.envFiles.map((envFile) => (
              <TabsTrigger
                key={envFile.id}
                value={envFile.id}
                className="flex items-center gap-2"
              >
                <span className="truncate">{envFile.name}</span>
                {envFile.environment && (
                  <Badge variant="outline" className="text-xs ml-1">
                    {envFile.environment}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {project.envFiles.map((envFile) => (
            <TabsContent key={envFile.id} value={envFile.id} className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-wrap">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-lg">{envFile.name}</CardTitle>

                      {/* Environment Badge */}
                      {envFile.environment && (
                        <Badge variant="outline" className="text-xs">
                          {envFile.environment}
                        </Badge>
                      )}

                      {/* Encryption Status Badge */}
                      <Badge
                        variant={envFile.isEncrypted ? "default" : "secondary"}
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
                        envFile.type !== "keys" &&
                        (envFile.isEncrypted ? (
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
                        ))}
                    </div>
                  </div>
                </CardHeader>

                {/* Validation Alerts */}
                {(envFile.missingKeys || envFile.extraKeys) && (
                  <div className="px-6 space-y-2">
                    {envFile.missingKeys && envFile.missingKeys.length > 0 && (
                      <Alert variant="warning">
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

                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <h4 className="font-medium">
                        Variables ({envFile.variables.length})
                      </h4>
                    </div>
                    {envFile.variables.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        No variables found in this file.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {envFile.variables.map((variable, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-muted/30 rounded-md"
                          >
                            <span className="font-mono text-sm font-medium">
                              {variable.key}
                            </span>
                            <span className="text-sm text-muted-foreground font-mono">
                              {variable.value ? "••••••••" : "(empty)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};
