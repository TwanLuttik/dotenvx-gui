import { formatDateTime, formatShortDate } from "../lib/utils";
import { cn } from "../lib/utils";

interface OnePasswordSyncStatusProps {
  syncedAt?: string | null;
  compact?: boolean;
  className?: string;
}

export function OnePasswordSyncStatus({
  syncedAt,
  compact = false,
  className,
}: OnePasswordSyncStatusProps) {
  if (syncedAt) {
    return (
      <p
        className={cn(
          "text-[11px] font-medium text-emerald-700 dark:text-emerald-300",
          className,
        )}
      >
        {compact
          ? `Synced ${formatShortDate(syncedAt)}`
          : `Synced ${formatDateTime(syncedAt)}`}
      </p>
    );
  }

  return (
    <p
      className={cn(
        "text-[11px] font-medium text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {compact ? "Not synced" : "Not synced to 1Password"}
    </p>
  );
}
