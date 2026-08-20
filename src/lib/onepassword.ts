import { invoke } from "@tauri-apps/api/core";
import { EnvFile, OnePasswordSaveResult, OnePasswordVault, Project } from "../types";
import { StorageManager } from "../storage";
import { allEnvFiles } from "./project";

export function isSecretEnvFile(file: EnvFile): boolean {
  return file.type !== "example" && file.name !== ".env.example";
}

export function secretFilePaths(project: Project): string[] {
  return allEnvFiles(project).filter(isSecretEnvFile).map((file) => file.path);
}

export function loadOnePasswordSettings() {
  return StorageManager.loadOnePasswordSettings();
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
): Project {
  return {
    ...project,
    onePasswordItemId: itemId,
    onePasswordLastSyncedAt: syncedAt,
    onePasswordLastSyncedFilePaths: filePaths,
    lastModified: syncedAt,
  };
}

export function fileWasLastSynced(project: Project, filePath: string): boolean {
  return project.onePasswordLastSyncedFilePaths?.includes(filePath) ?? false;
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
    vaultId: settings.vaultId,
    itemId: project.onePasswordItemId ?? null,
    projectName: project.name,
    projectPath: project.path,
    filePaths,
  });
}
