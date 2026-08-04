import React, { useEffect, useRef, useState } from "react";
import { EnvFile, EnvVariable } from "../types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { RotateCw, Copy, Check, Eye, EyeOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

interface KeyRotationDisplayProps {
  keysFile: EnvFile;
  onRotationComplete: () => void;
}

// Match EnvFileViewer's re-mask delay so revealed secrets never linger
const REMASK_DELAY_MS = 60_000;

export const KeyRotationDisplay: React.FC<KeyRotationDisplayProps> = ({
  keysFile,
  onRotationComplete,
}) => {
  const [isRotating, setIsRotating] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const remaskTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    const timers = remaskTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const toggleKeyVisibility = (key: string) => {
    const timer = remaskTimers.current.get(key);
    if (timer) {
      clearTimeout(timer);
      remaskTimers.current.delete(key);
    }
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        remaskTimers.current.set(
          key,
          setTimeout(() => {
            remaskTimers.current.delete(key);
            setVisibleKeys((p) => {
              const n = new Set(p);
              n.delete(key);
              return n;
            });
          }, REMASK_DELAY_MS),
        );
      }
      return next;
    });
  };

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

          const isVisible = visibleKeys.has(variable.key);

          return (
            <div
              key={index}
              className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-md"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">
                    {variable.key}
                  </span>
                  {!variable.value && (
                    <>
                      <Badge variant="secondary" className="text-xs">
                        Missing
                      </Badge>
                      <span className="text-xs text-muted-foreground italic">
                        (No key present - will be created on rotation)
                      </span>
                    </>
                  )}
                </div>
                {variable.value && (
                  <div className="font-mono text-xs text-muted-foreground break-all">
                    {/* Fixed-width mask so the dots don't leak key length */}
                    {isVisible ? variable.value : "•".repeat(24)}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {variable.value && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleKeyVisibility(variable.key)}
                      className="h-6 w-6 p-0"
                      title={
                        isVisible
                          ? "Hide key"
                          : "Reveal key (re-masks after 60s)"
                      }
                    >
                      {isVisible ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
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
                  </>
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
