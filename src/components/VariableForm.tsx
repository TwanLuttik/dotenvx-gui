import React, { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Check, X } from "lucide-react";

interface VariableFormProps {
  initialKey?: string;
  keyLocked?: boolean;
  initialValue?: string;
  onSave: (key: string, value: string) => Promise<void>;
  onCancel: () => void;
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const VariableForm: React.FC<VariableFormProps> = ({
  initialKey = "",
  keyLocked = false,
  initialValue = "",
  onSave,
  onCancel,
}) => {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const valueInputRef = useRef<HTMLInputElement>(null);

  // When editing, focus the value with the caret at the start so long
  // values read from the beginning instead of scrolled to the end
  useEffect(() => {
    if (keyLocked && valueInputRef.current) {
      const el = valueInputRef.current;
      el.focus();
      el.setSelectionRange(0, 0);
      el.scrollLeft = 0;
    }
  }, [keyLocked]);

  const trimmedKey = key.trim();
  const keyValid = KEY_PATTERN.test(trimmedKey);

  const handleSave = async () => {
    if (!keyValid || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(trimmedKey, value);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 p-3 bg-muted/30 rounded-md ring-1 ring-inset ring-border">
      {/* Underline-style zero-padding inputs and three fixed button slots
          mirror the display row's geometry so nothing shifts while editing */}
      <input
        type="text"
        placeholder="KEY"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={keyLocked}
        autoFocus={!keyLocked}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className="font-mono text-sm font-medium bg-transparent border-0 border-b border-input p-0 w-48 outline-none focus:border-ring disabled:border-transparent"
      />
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          ref={valueInputRef}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          className="font-mono text-sm text-muted-foreground bg-transparent border-0 border-b border-input p-0 outline-none focus:border-ring"
          style={{ width: "300px" }}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          disabled={!keyValid || isSaving}
          className="h-6 w-6 p-0"
          title={keyValid ? "Save" : "Key must look like MY_VARIABLE"}
        >
          <Check className="h-4 w-4 text-green-600" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className="h-6 w-6 p-0"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </Button>
        <span className="h-6 w-6" />
      </div>
    </div>
  );
};
