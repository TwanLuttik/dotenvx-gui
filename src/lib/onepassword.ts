import { invoke } from "@tauri-apps/api/core";
import {
  EnvFile,
  OnePasswordSaveResult,
  OnePasswordSettings,
  OnePasswordVault,
  Project,
} from "../types";
import { StorageManager } from "../storage";
import { allEnvFiles } from "./project";

export type OnePasswordSaveChange = "add" | "update" | "remove";

export interface OnePasswordSaveFile {
  path: string;
  label: string;
  change: OnePasswordSaveChange;
}

export interface OnePasswordSavePlan {
  isUpdate: boolean;
  title: string;
  vaultTitle: string;
  files: OnePasswordSaveFile[];
}

export function isSecretEnvFile(file: EnvFile): boolean {
  return file.type !== "example" && file.name !== ".env.example";
}

export function secretFilePaths(project: Project): string[] {
  return allEnvFiles(project).filter(isSecretEnvFile).map((file) => file.path);
}

export function loadOnePasswordSettings() {
  return StorageManager.loadOnePasswordSettings();
}

export function isOnePasswordConfigured(
  settings = loadOnePasswordSettings(),
): boolean {
  return settings !== null;
}

export function clearOnePasswordSettings() {
  StorageManager.clearOnePasswordSettings();
}

export function formatOnePasswordError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "");
  const message = raw.replace(/^Error:\s*/i, "").trim();

  if (/node\.?js|bun is required|node is on PATH/i.test(message)) {
    return "Install Node.js or Bun, then try again.";
  }
  if (/bridge script/i.test(message)) {
    return "Couldn't find the 1Password helper. Reinstall Dotenvx and try again.";
  }
  if (
    /desktop app|sdk integration|no output|not running|isn't running|integrate with other apps/i.test(
      message,
    )
  ) {
    return "Open the 1Password app and enable Settings → Developer → Integrate with other apps.";
  }
  if (/connect 1password in settings/i.test(message)) {
    return "Connect 1Password in Settings, then save again.";
  }
  if (
    /account name|unauthoriz|unauthentic|unknown account|invalid account/i.test(
      message,
    )
  ) {
    return "Check the account name in Settings. It should match the 1Password sidebar.";
  }
  if (/vault/i.test(message) && /not found|missing|unknown/i.test(message)) {
    return "The saved vault is missing. Pick a vault in Settings.";
  }
  if (/no secret env files/i.test(message)) {
    return "No secret env files to save. Example files are skipped.";
  }

  return message || "Couldn't reach 1Password.";
}

export function saveOnePasswordSettings(
  accountName: string,
  vault: Pick<OnePasswordVault, "id" | "title">,
) {
  StorageManager.saveOnePasswordSettings({
    accountName: accountName.trim(),
    vaultId: vault.id,
    vaultTitle: vault.title,
  });
}

export async function listOnePasswordVaults(
  accountName: string,
): Promise<OnePasswordVault[]> {
  return invoke<OnePasswordVault[]>("onepassword_list_vaults", {
    accountName: accountName.trim(),
  });
}

export async function createOnePasswordVault(
  accountName: string,
  title = "Dotenvx",
): Promise<OnePasswordVault> {
  return invoke<OnePasswordVault>("onepassword_create_vault", {
    accountName: accountName.trim(),
    title,
  });
}

export function markProjectSynced(
  project: Project,
  itemId: string,
  filePaths: string[],
  syncedAt = new Date().toISOString(),
  vaultId?: string,
): Project {
  return {
    ...project,
    onePasswordItemId: itemId,
    onePasswordLastSyncedAt: syncedAt,
    onePasswordLastSyncedFilePaths: filePaths,
    lastModified: syncedAt,
    ...(vaultId ? { onePasswordVaultId: vaultId } : {}),
  };
}

export function fileWasLastSynced(project: Project, filePath: string): boolean {
  return project.onePasswordLastSyncedFilePaths?.includes(filePath) ?? false;
}

export function onePasswordItemTitle(projectName: string): string {
  return `Dotenvx / ${projectName}`;
}

export function relativeSecretPath(projectPath: string, filePath: string): string {
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "");
  const root = normalize(projectPath);
  const file = normalize(filePath);
  if (root && (file === root || file.startsWith(`${root}/`))) {
    return file.slice(root.length).replace(/^\//, "") || file.split("/").pop() || file;
  }
  return file.split("/").pop() || file;
}

export function onePasswordSavePlan(
  project: Project,
  settings: Pick<OnePasswordSettings, "vaultTitle"> | null,
): OnePasswordSavePlan {
  const current = secretFilePaths(project);
  const previous = project.onePasswordLastSyncedFilePaths ?? [];
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const isUpdate = Boolean(project.onePasswordItemId);

  const files: OnePasswordSaveFile[] = [
    ...current.map((path) => ({
      path,
      label: relativeSecretPath(project.path, path),
      change: (isUpdate && previousSet.has(path) ? "update" : "add") as OnePasswordSaveChange,
    })),
    ...previous
      .filter((path) => !currentSet.has(path))
      .map((path) => ({
        path,
        label: relativeSecretPath(project.path, path),
        change: "remove" as const,
      })),
  ];

  return {
    isUpdate,
    title: onePasswordItemTitle(project.name),
    vaultTitle: settings?.vaultTitle || "1Password",
    files,
  };
}

export function saveProjectToOnePassword(
  project: Project,
): Promise<OnePasswordSaveResult> {
  const settings = loadOnePasswordSettings();
  if (!settings) {
    throw new Error(
      "Connect 1Password in Settings first: account name and a vault.",
    );
  }

  const filePaths = secretFilePaths(project);
  if (filePaths.length === 0) {
    throw new Error(
      "No secret env files to save. Example files are skipped.",
    );
  }

  return invoke<OnePasswordSaveResult>("onepassword_save_project", {
    accountName: settings.accountName,
    vaultId: project.onePasswordVaultId ?? settings.vaultId,
    itemId: project.onePasswordItemId ?? null,
    projectName: project.name,
    projectPath: project.path,
    filePaths,
  });
}
