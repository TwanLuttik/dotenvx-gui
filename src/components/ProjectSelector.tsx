import React, { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Project } from "../types";
import { StorageManager } from "../storage";
import { FileScanner } from "../utils/fileScanner";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { RefreshCw, Trash2, Plus } from "lucide-react";

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onProjectSelect: (project: Project) => void;
  onProjectsUpdate: (projects: Project[]) => void;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  projects,
  selectedProjectId,
  onProjectSelect,
  onProjectsUpdate,
}) => {
  const [isScanning, setIsScanning] = useState(false);

  const handleImportProject = async () => {
    try {
      console.log("Opening file dialog...");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Folder",
      });
      console.log("Dialog result:", selected);

      if (selected && typeof selected === "string") {
        setIsScanning(true);

        // Extract project name from path
        const projectName = selected.split("/").pop() || "Unknown Project";

        // Scan for env files
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

        setIsScanning(false);
      }
    } catch (error) {
      console.error("Failed to import project:", error);
      setIsScanning(false);
    }
  };

  const handleDeleteProject = async (
    projectId: string,
    event: React.MouseEvent
  ) => {
    event.stopPropagation();
    if (confirm("Are you sure you want to remove this project?")) {
      await StorageManager.deleteProject(projectId);
      const updatedState = await StorageManager.loadState();
      onProjectsUpdate(updatedState.projects);

      if (selectedProjectId === projectId) {
        onProjectSelect(updatedState.projects[0] || null);
      }
    }
  };

  const handleRefreshProject = async (
    project: Project,
    event: React.MouseEvent
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
    } catch (error) {
      console.error("Failed to refresh project:", error);
    }

    setIsScanning(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-sidebar-foreground">
          Projects
        </h2>
        <Button
          onClick={handleImportProject}
          disabled={isScanning}
          size="sm"
          className="gap-2"
          variant="ghost"
        >
          <Plus className="h-4 w-4" />
          {isScanning ? "Scanning..." : "Import Project"}
        </Button>
      </div>

      <div className="space-y-3">
        {projects.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                <p className="mb-2">No projects imported yet.</p>
                <p className="text-sm">
                  Click "Import Project" to get started.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          projects.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedProjectId === project.id
                  ? "ring-2 ring-primary bg-accent/50"
                  : "hover:bg-accent/20"
              }`}
              onClick={() => onProjectSelect(project)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">
                      {project.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                      {project.path}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {project.envFiles.length} env file
                        {project.envFiles.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleRefreshProject(project, e)}
                      disabled={isScanning}
                      className="h-8 w-8"
                      title="Refresh env files"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title="Remove project"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
