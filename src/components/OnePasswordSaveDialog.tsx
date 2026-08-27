import { KeyRound, Loader2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { OnePasswordSaveChange, OnePasswordSavePlan } from "../lib/onepassword";

interface OnePasswordSaveDialogProps {
  open: boolean;
  plan: OnePasswordSavePlan | null;
  isSaving?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

const CHANGE_LABEL: Record<OnePasswordSaveChange, string> = {
  add: "New",
  update: "Update",
  remove: "Remove",
};

export function OnePasswordSaveDialog({
  open,
  plan,
  isSaving = false,
  onConfirm,
  onOpenChange,
}: OnePasswordSaveDialogProps) {
  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md">
      <DialogContent>
        <DialogHeader>
          <div className="space-y-1">
            <DialogTitle>
              {plan.isUpdate ? "Update 1Password" : "Save to 1Password"}
            </DialogTitle>
            <DialogDescription>
              {plan.isUpdate ? "Updates" : "Creates"}{" "}
              <span className="font-medium text-foreground">{plan.title}</span> in{" "}
              <span className="font-medium text-foreground">{plan.vaultTitle}</span>.
              Secret file contents are written as they are on disk.
            </DialogDescription>
          </div>
        </DialogHeader>

        <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
          {plan.files.map((file) => (
            <li
              key={`${file.change}:${file.path}`}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="min-w-0 truncate font-mono text-sm" title={file.path}>
                {file.label}
              </span>
              <Badge
                variant={
                  file.change === "remove"
                    ? "destructive"
                    : file.change === "add"
                      ? "default"
                      : "outline"
                }
              >
                {CHANGE_LABEL[file.change]}
              </Badge>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-muted-foreground">
          Shift-click Save to skip this confirmation.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {isSaving
              ? "Saving…"
              : plan.isUpdate
                ? "Update 1Password"
                : "Save to 1Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
