import React, { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Project } from "../types";
import { StorageManager } from "../storage";
import { FileScanner } from "../utils/fileScanner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "../contexts/ToastContext";
import { shortenPath } from "../lib/utils";
import { OnePasswordSyncStatus } from "./OnePasswordSyncStatus";
import {
  folderDisplayName,
  projectFolders,
  withScannedFolders,
} from "../lib/project";
import { Folder, FolderPlus, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  selectedFolderPath: string | null;
  onePasswordConfigured?: boolean;
  onProjectSelect: (project: Project | null, folderPath?: string | null) => void;
  onProjectsUpdate: (projects: Project[]) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  selectedProjectId,
  selectedFolderPath,
  onePasswordConfigured = false,
  onProjectSelect,
  onProjectsUpdate,
}) => {
  const { success, error } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => {
      if (
        project.name.toLowerCase().includes(term) ||
        project.path.toLowerCase().includes(term)
      ) {
        return true;
      }
      return projectFolders(project).some((folder) =>
        folderDisplayName(project.path, folder.path)
          .toLowerCase()
          .includes(term),
      );
    });
  }, [projects, query]);

  const pendingDelete = projects.find((project) => project.id === pendingDeleteId);

  const handleImportProject = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });

      if (selected && typeof selected === "string") {
        setIsScanning(true);

        const folders = await FileScanner.scanProjectFolders(selected);
        const existing = projects.find((project) => project.path === selected);
        const projectName =
          existing?.name || selected.split("/").pop() || "Untitled project";
        const fileCount = folders.reduce(
          (total, folder) => total + folder.envFiles.length,
          0,
        );

        const nextProject = withScannedFolders(
          existing ?? {
            id: `project-${Date.now()}`,
            name: projectName,
            path: selected,
            folders: [],
            envFiles: [],
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
          },
          folders,
        );

        await StorageManager.saveProject(nextProject);
        const updatedState = await StorageManager.loadState();
        onProjectsUpdate(updatedState.projects);
        onProjectSelect(nextProject);

        if (fileCount === 0) {
          success(`Imported ${projectName} · no .env files found`);
        } else {
          success(
            `Imported ${projectName} · ${folders.length} folder${
              folders.length === 1 ? "" : "s"
            } · ${fileCount} file${fileCount === 1 ? "" : "s"}`,
          );
        }
      }
    } catch (err) {
      console.error("Failed to import project:", err);
      error(`Failed to import project: ${String(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!pendingDeleteId) return;

    await StorageManager.deleteProject(pendingDeleteId);
    const updatedState = await StorageManager.loadState();
    onProjectsUpdate(updatedState.projects);

    if (selectedProjectId === pendingDeleteId) {
      onProjectSelect(updatedState.projects[0] || null);
    }
    success("Project removed");
  };

  const handleRefreshProject = async (
    project: Project,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    setIsScanning(true);

    try {
      const folders = await FileScanner.scanProjectFolders(project.path);
      const updatedProject = withScannedFolders(project, folders);

      await StorageManager.saveProject(updatedProject);
      const updatedState = await StorageManager.loadState();
      onProjectsUpdate(updatedState.projects);
      if (selectedProjectId === project.id) {
        onProjectSelect(updatedProject);
      }
      success(`Refreshed ${project.name}`);
    } catch (err) {
      console.error("Failed to refresh project:", err);
      error(`Failed to refresh ${project.name}`);
    } finally {
      setIsScanning(false);
    }
  };

  const startRename = (project: Project, event: React.MouseEvent) => {
    event.stopPropagation();
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const commitRename = async (project: Project) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === project.name) return;

    const updatedProject: Project = {
      ...project,
      name,
      lastModified: new Date().toISOString(),
    };
    await StorageManager.saveProject(updatedProject);
    const updatedState = await StorageManager.loadState();
    onProjectsUpdate(updatedState.projects);
    if (selectedProjectId === project.id) {
      onProjectSelect(updatedProject);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 px-3 py-3">
        <Button
          onClick={handleImportProject}
          disabled={isScanning}
          size="sm"
          className="w-full justify-center"
        >
          <FolderPlus className="size-4" />
          {isScanning ? "Scanning…" : "Import project"}
        </Button>
        {projects.length > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="h-8 bg-background/70 pl-8"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {projects.length === 0 ? (
          <div className="mx-1 rounded-lg border border-dashed px-3 py-8 text-center">
            <p className="text-sm font-medium">No projects yet</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Import a folder. Nested dotenvx apps such as `api` and `next`
              are grouped under that project.
            </p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No projects match “{query}”.
          </p>
        ) : (
          <div className="space-y-0.5">
            {filteredProjects.map((project) => {
              const isSelected = selectedProjectId === project.id;
              const folders = projectFolders(project);
              return (
                <div key={project.id} className="space-y-0.5">
                  <div
                    className={`group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                      isSelected && !selectedFolderPath
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : isSelected
                          ? "bg-sidebar-accent/50"
                          : "hover:bg-sidebar-accent/60"
                    }`}
                    onClick={() => onProjectSelect(project, null)}
                  >
                    <div className="min-w-0 flex-1">
                      {renamingId === project.id ? (
                        <Input
                          value={renameValue}
                          autoFocus
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setRenameValue(event.target.value)}
                          onBlur={() => {
                            void commitRename(project);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void commitRename(project);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setRenamingId(null);
                            }
                          }}
                          className="h-7 px-2 text-sm"
                        />
                      ) : (
                        <p className="truncate text-sm font-medium">{project.name}</p>
                      )}
                      <p
                        className="truncate font-mono text-[11px] text-muted-foreground"
                        title={project.path}
                      >
                        {shortenPath(project.path)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {folders.length > 0
                          ? `${folders.length} folder${
                              folders.length === 1 ? "" : "s"
                            } · `
                          : ""}
                        {project.envFiles.length} file
                        {project.envFiles.length === 1 ? "" : "s"}
                      </p>
                      {onePasswordConfigured && (
                        <OnePasswordSyncStatus
                          syncedAt={project.onePasswordLastSyncedAt}
                          compact
                          className="mt-0.5 truncate"
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(event) => startRename(project, event)}
                        title="Rename project"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(event) => handleRefreshProject(project, event)}
                        disabled={isScanning}
                        title="Rescan env files"
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDeleteId(project.id);
                        }}
                        className="text-destructive hover:text-destructive"
                        title="Remove project"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {folders.length > 0 && (
                    <div className="mb-1 ml-2 space-y-0.5 border-l border-sidebar-border pl-2">
                      {folders.map((folder) => {
                        const isFolderSelected =
                          isSelected && selectedFolderPath === folder.path;
                        return (
                          <button
                            key={folder.path}
                            type="button"
                            onClick={() => onProjectSelect(project, folder.path)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                              isFolderSelected
                                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                            }`}
                            title={folder.path}
                          >
                            <Folder className="size-3.5 shrink-0" />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                              {folderDisplayName(project.path, folder.path)}
                            </span>
                            <span className="shrink-0 text-[10px] tabular-nums">
                              {folder.envFiles.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-sidebar-border px-4 py-3 text-center text-[11px] text-muted-foreground">
        Made by{" "}
        <a
          href="https://x.com/TwanLuttik"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          TwanLuttik
        </a>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Remove project?"
        description={
          pendingDelete
            ? `${pendingDelete.name} will be removed from the sidebar. Your files on disk are not deleted.`
            : "This project will be removed from the sidebar. Your files on disk are not deleted."
        }
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleDeleteProject}
      />
    </div>
  );
};
