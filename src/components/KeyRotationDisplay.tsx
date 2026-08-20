import React, { useState } from "react";
import { EnvFile, EnvVariable } from "../types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { RotateCw, Copy, Check } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "../contexts/ToastContext";

interface KeyRotationDisplayProps {
  keysFile: EnvFile;
  onRotationComplete: () => void;
}

export const KeyRotationDisplay: React.FC<KeyRotationDisplayProps> = ({
  keysFile,
  onRotationComplete,
}) => {
  const { success, error } = useToast();
  const [isRotating, setIsRotating] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const privateKeys = keysFile.variables.filter((variable) =>
    variable.key.includes("DOTENV_PRIVATE_KEY"),
  );

  const handleRotateKey = async (variable: EnvVariable) => {
    setIsRotating(variable.key);
    try {
      await invoke<string>("rotate_key", {
        keysFilePath: keysFile.path,
        keyName: variable.key,
      });
      success(`Rotated ${variable.key}`);
      onRotationComplete();
    } catch (err) {
      error(`Failed to rotate key: ${String(err)}`);
    } finally {
      setIsRotating(null);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch (err) {
      error(`Failed to copy: ${String(err)}`);
    }
  };

  if (privateKeys.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        No `DOTENV_PRIVATE_KEY` entries found in this file.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {privateKeys.map((variable) => (
        <div
          key={variable.key}
          className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-mono text-[13px] font-medium">
                {variable.key}
              </span>
              <Badge variant={variable.value ? "default" : "secondary"}>
                {variable.value ? "Present" : "Missing"}
              </Badge>
            </div>
            {!variable.value && (
              <p className="text-xs text-muted-foreground">
                No key present — rotation will create one.
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {variable.value && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copyToClipboard(variable.value, variable.key)}
                title="Copy key"
              >
                {copiedKey === variable.key ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleRotateKey(variable)}
              disabled={isRotating === variable.key}
            >
              <RotateCw
                className={isRotating === variable.key ? "animate-spin" : ""}
              />
              {isRotating === variable.key ? "Rotating…" : "Rotate"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};
