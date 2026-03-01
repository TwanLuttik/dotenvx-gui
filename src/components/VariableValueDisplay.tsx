import React, { useState } from "react";

interface VariableValueDisplayProps {
  value: string;
  isVisible: boolean;
}

export const VariableValueDisplay: React.FC<VariableValueDisplayProps> = ({
  value,
  isVisible,
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const displayValue = isVisible
    ? value || "(empty)"
    : value
    ? "••••••••"
    : "(empty)";
  const shouldScroll = isHovering && isVisible && value && value.length > 20;

  return (
    <div
      className="relative overflow-hidden"
      style={{ width: "300px" }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <span
        className={`text-sm text-muted-foreground font-mono block ${
          shouldScroll ? "animate-scroll" : ""
        }`}
        style={
          shouldScroll
            ? {
                animation: "scroll 8s linear infinite",
                whiteSpace: "nowrap",
              }
            : {
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                textAlign: !isVisible ? "right" : "left",
              }
        }
      >
        {displayValue}
      </span>

      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
      `}</style>
    </div>
  );
};
