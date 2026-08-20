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
import { FolderPlus, RefreshCw, Search, Trash2 } from "lucide-react";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onProjectSelect: (project: Project | null) => void;
  onProjectsUpdate: (projects: Project[]) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  selectedProjectId,
  onProjectSelect,
  onProjectsUpdate,
}) => {
  const { success, error } = useToast();
  const [isScanning, setIsScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(term) ||
        project.path.toLowerCase().includes(term),
    );
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

        const projectName = selected.split("/").pop() || "Unknown Project";
        const envFiles = await FileScanner.scanProjectFolder(selected);

        const newProject: Project = {
          id: `project-${Date.now()}`,
          name: projectName,
          path: selected,
          envFiles,
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        };

        await StorageManager.saveProject(newProject);
        const updatedState = await StorageManager.loadState();
        onProjectsUpdate(updatedState.projects);
        onProjectSelect(newProject);
        success(
          `Imported ${projectName} · ${envFiles.length} env file${
            envFiles.length === 1 ? "" : "s"
          }`,
        );
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
      const envFiles = await FileScanner.scanProjectFolder(project.path);
      const updatedProject = {
        ...project,
        envFiles,
        lastModified: new Date().toISOString(),
      };

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
              Import a folder to scan for `.env` files and manage encryption.
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
              return (
                <div
                  key={project.id}
                  className={`group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                    isSelected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/60"
                  }`}
                  onClick={() => onProjectSelect(project)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p
                      className="truncate font-mono text-[11px] text-muted-foreground"
                      title={project.path}
                    >
                      {shortenPath(project.path)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {project.envFiles.length} file
                      {project.envFiles.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
