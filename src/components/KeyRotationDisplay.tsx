import React, { useState } from "react";
import { EnvFile, EnvVariable } from "../types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { RotateCw, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface KeyRotationDisplayProps {
  keysFile: EnvFile;
  onRotationComplete: () => void;
}

export const KeyRotationDisplay: React.FC<KeyRotationDisplayProps> = ({
  keysFile,
  onRotationComplete,
}) => {
  const [isRotating, setIsRotating] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleRotateKey = async (variable: EnvVariable) => {
    setIsRotating(variable.key);
    try {
      const result = await invoke<string>("rotate_key", {
        keysFilePath: keysFile.path,
        keyName: variable.key,
      });
      console.log("Rotation result:", result);
      onRotationComplete();
    } catch (error) {
      console.error("Failed to rotate key:", error);
      alert(`Failed to rotate key: ${error}`);
    } finally {
      setIsRotating(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {keysFile.variables.map((variable, index) => {
          const isPrivateKey = variable.key.includes("DOTENV_PRIVATE_KEY");
          if (!isPrivateKey) return null;

          return (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-muted/30 rounded-md"
            >
              <div className="flex items-center gap-2 flex-1">
                <span className="font-mono text-sm font-medium">
                  {variable.key}
                </span>
                <Badge
                  variant={variable.value ? "default" : "secondary"}
                  className="text-xs"
                >
                  {variable.value ? "Present" : "Missing"}
                </Badge>
                {!variable.value && (
                  <span className="text-xs text-muted-foreground italic">
                    (No key present - will be created on rotation)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {variable.value && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(variable.value, variable.key)
                    }
                    className="h-6 w-6 p-0"
                    title="Copy key"
                  >
                    {copiedKey === variable.key ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRotateKey(variable)}
                  disabled={isRotating === variable.key}
                  className="gap-1"
                >
                  <RotateCw
                    className={`h-4 w-4 ${
                      isRotating === variable.key ? "animate-spin" : ""
                    }`}
                  />
                  {isRotating === variable.key ? "Rotating..." : "Rotate"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
