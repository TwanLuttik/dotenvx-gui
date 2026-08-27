import { EnvFile, Project } from "../types";
import { allEnvFiles, folderDisplayName, projectFolders } from "./project";

export function isBackupableEnvFile(file: EnvFile): boolean {
  return file.type !== "example" && file.name !== ".env.example";
}

export function backupableEnvFiles(project: Project): EnvFile[] {
  return allEnvFiles(project).filter(isBackupableEnvFile);
}

export interface BackupFileGroup {
  folderPath: string;
  label: string;
  files: EnvFile[];
}

export function backupFileGroups(project: Project): BackupFileGroup[] {
  const allowed = new Set(backupableEnvFiles(project).map((file) => file.path));
  return projectFolders(project)
    .map((folder) => ({
      folderPath: folder.path,
      label: folderDisplayName(project.path, folder.path),
      files: folder.envFiles.filter((file) => allowed.has(file.path)),
    }))
    .filter((group) => group.files.length > 0);
}

export function envFileBackupContent(file: EnvFile): string {
  return file.variables
    .map((variable) => `${variable.key}=${variable.value || ""}`)
    .join("\n");
}

export function togglePathSelection(
  selected: Set<string>,
  paths: string[],
  nextSelected: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const path of paths) {
    if (nextSelected) next.add(path);
    else next.delete(path);
  }
  return next;
}
