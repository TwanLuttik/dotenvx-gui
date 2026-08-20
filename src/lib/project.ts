import { EnvFile, Project, ProjectFolder } from "../types";

export function allEnvFiles(project: Pick<Project, "folders" | "envFiles">): EnvFile[] {
  if (project.folders?.length) {
    return project.folders.flatMap((folder) => folder.envFiles);
  }
  return project.envFiles ?? [];
}

export function projectFolders(project: Pick<Project, "path" | "folders" | "envFiles">): ProjectFolder[] {
  if (project.folders?.length) {
    return project.folders;
  }
  if (project.envFiles?.length) {
    return [{ path: project.path, envFiles: project.envFiles }];
  }
  return [];
}

export function withScannedFolders(
  project: Project,
  folders: ProjectFolder[],
): Project {
  const envFiles = folders.flatMap((folder) => folder.envFiles);
  return {
    ...project,
    folders,
    envFiles,
    lastModified: new Date().toISOString(),
  };
}

export function normalizeProject(project: Project): Project {
  const folders = projectFolders(project);
  return {
    ...project,
    folders,
    envFiles: folders.flatMap((folder) => folder.envFiles),
  };
}

export function relativeFolderPath(projectPath: string, folderPath: string): string {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  const root = normalize(projectPath);
  const folder = normalize(folderPath);
  if (folder === root) return ".";
  if (folder.startsWith(`${root}/`)) return folder.slice(root.length + 1);
  const parts = folder.split("/").filter(Boolean);
  return parts[parts.length - 1] || folder;
}

export function envFileTabLabel(
  projectPath: string,
  file: Pick<EnvFile, "name" | "path">,
  folderCount: number,
): string {
  if (folderCount <= 1) return file.name;
  const directory = file.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
  const folder = relativeFolderPath(projectPath, directory);
  return folder === "." ? file.name : `${folder}/${file.name}`;
}

export function folderDisplayName(projectPath: string, folderPath: string): string {
  const relative = relativeFolderPath(projectPath, folderPath);
  return relative === "." ? "Project root" : relative;
}

export function filesInFolder(
  project: Pick<Project, "path" | "folders" | "envFiles">,
  folderPath: string | null,
): EnvFile[] {
  if (!folderPath) return allEnvFiles(project);
  const folder = projectFolders(project).find((item) => item.path === folderPath);
  return folder?.envFiles ?? [];
}

export function defaultFolderPath(
  project: Pick<Project, "path" | "folders" | "envFiles">,
): string | null {
  const folders = projectFolders(project);
  return folders.length > 1 ? folders[0].path : null;
}
