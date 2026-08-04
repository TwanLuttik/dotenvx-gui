import React from "react";

interface VariableValueDisplayProps {
  value: string;
  isVisible: boolean;
}

export const VariableValueDisplay: React.FC<VariableValueDisplayProps> = ({
  value,
  isVisible,
}) => {
  const displayValue = isVisible
    ? value || "(empty)"
    : value
    ? "••••••••"
    : "(empty)";

  return (
    <input
      type="text"
      // Controlled with a fixed value instead of readOnly: WebKit suppresses
      // the caret and cursor-key handling in readonly inputs, so this keeps
      // normal textbox behavior while React discards any typed changes
      value={displayValue}
      onChange={() => {}}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      className="text-sm text-muted-foreground font-mono bg-transparent border-none outline-none p-0 cursor-text"
      style={{
        width: "300px",
        textAlign: isVisible ? "left" : "right",
      }}
    />
  );
};
