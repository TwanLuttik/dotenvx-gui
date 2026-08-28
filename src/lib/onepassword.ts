import { invoke } from "@tauri-apps/api/core";
import {
  EnvFile,
  OnePasswordSaveResult,
  OnePasswordSettings,
  OnePasswordVault,
  OnePasswordVaultItem,
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

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function vaultItemTime(item: OnePasswordVaultItem): number {
  const time = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
  return Number.isFinite(time) ? time : 0;
}

export function matchVaultItemForProject(
  items: OnePasswordVaultItem[],
  project: Pick<Project, "name" | "path">,
): OnePasswordVaultItem | null {
  const projectPath = normalizeProjectPath(project.path);
  const title = onePasswordItemTitle(project.name);

  const byPath = items.filter(
    (item) =>
      item.projectPath &&
      normalizeProjectPath(item.projectPath) === projectPath,
  );
  if (byPath.length === 1) return byPath[0];
  if (byPath.length > 1) {
    const titled = byPath.filter((item) => item.title === title);
    return [...(titled.length ? titled : byPath)].sort(
      (left, right) => vaultItemTime(right) - vaultItemTime(left),
    )[0];
  }

  const byTitle = items.filter((item) => item.title === title);
  if (byTitle.length === 1) return byTitle[0];
  if (byTitle.length > 1) {
    return [...byTitle].sort(
      (left, right) => vaultItemTime(right) - vaultItemTime(left),
    )[0];
  }
  return null;
}

export function vaultFilePath(projectPath: string, fileName: string): string {
  const root = normalizeProjectPath(projectPath);
  const name = fileName.replace(/\\/g, "/").replace(/^\/+/, "");
  return `${root}/${name}`;
}

export function applyVaultItemToProject(
  project: Project,
  item: OnePasswordVaultItem,
): Project {
  if (project.onePasswordItemId) return project;

  const filePaths = (item.fileNames ?? []).map((name) =>
    vaultFilePath(project.path, name),
  );

  return {
    ...project,
    onePasswordItemId: item.itemId,
    onePasswordVaultId: item.vaultId,
    onePasswordLastSyncedAt:
      project.onePasswordLastSyncedAt ?? item.updatedAt ?? undefined,
    onePasswordLastSyncedFilePaths:
      project.onePasswordLastSyncedFilePaths ?? filePaths,
  };
}

export function reconcileProjectsWithVaultItems(
  projects: Project[],
  items: OnePasswordVaultItem[],
): Project[] {
  return projects.map((project) => {
    if (project.onePasswordItemId) return project;
    const item = matchVaultItemForProject(items, project);
    return item ? applyVaultItemToProject(project, item) : project;
  });
}

export async function listOnePasswordProjectItems(
  accountName: string,
  vaultId: string,
): Promise<OnePasswordVaultItem[]> {
  return invoke<OnePasswordVaultItem[]>("onepassword_list_project_items", {
    accountName: accountName.trim(),
    vaultId,
  });
}

export async function findOnePasswordProject(
  accountName: string,
  vaultId: string,
  projectName: string,
  projectPath: string,
): Promise<OnePasswordVaultItem | null> {
  return invoke<OnePasswordVaultItem | null>("onepassword_find_project", {
    accountName: accountName.trim(),
    vaultId,
    projectName,
    projectPath,
  });
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

export async function linkExistingOnePasswordItem(
  project: Project,
): Promise<Project> {
  if (project.onePasswordItemId) return project;
  const settings = loadOnePasswordSettings();
  if (!settings) return project;

  const item = await findOnePasswordProject(
    settings.accountName,
    project.onePasswordVaultId ?? settings.vaultId,
    project.name,
    project.path,
  );
  return item ? applyVaultItemToProject(project, item) : project;
}

export async function reconcileLocalProjects(
  projects: Project[],
): Promise<Project[]> {
  const settings = loadOnePasswordSettings();
  if (!settings || projects.length === 0) return projects;

  const items = await listOnePasswordProjectItems(
    settings.accountName,
    settings.vaultId,
  );
  return reconcileProjectsWithVaultItems(projects, items);
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
