import React from "react";
import { cn } from "@/lib/utils";

interface VariableValueDisplayProps {
  value: string;
  isVisible: boolean;
  className?: string;
}

export const VariableValueDisplay: React.FC<VariableValueDisplayProps> = ({
  value,
  isVisible,
  className,
}) => {
  const empty = !value;
  const displayValue = empty ? "empty" : isVisible ? value : "••••••••••••";

  return (
    <span
      title={isVisible && value ? value : undefined}
      className={cn(
        "block max-w-full truncate font-mono text-[13px]",
        empty
          ? "italic text-muted-foreground/70"
          : "text-muted-foreground",
        className,
      )}
    >
      {displayValue}
    </span>
  );
};
