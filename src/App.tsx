import "./App.css";

import { useState, useEffect } from "react";
import { Project } from "./types";
import { StorageManager } from "./storage";
import { ProjectSelector } from "./components/ProjectSelector";
import { EnvFileViewer } from "./components/EnvFileViewer";
import { ThemeToggle } from "./components/ThemeToggle";
import { Settings } from "./components/Settings";
import { KeyRound, Settings as SettingsIcon } from "lucide-react";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const state = await StorageManager.loadState();
      setProjects(state.projects);

      if (state.selectedProjectId) {
        const selectedProj = state.projects.find(
          (p) => p.id === state.selectedProjectId,
        );
        setSelectedProject(selectedProj || null);
      }
    } catch (error) {
      console.error("Failed to load initial data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectSelect = async (project: Project | null) => {
    setSelectedProject(project);
    await StorageManager.setSelectedProject(project?.id || null);
  };

  const handleProjectUpdate = async (updatedProject: Project) => {
    await StorageManager.saveProject(updatedProject);
    setSelectedProject((prev) =>
      prev?.id === updatedProject.id ? updatedProject : prev,
    );
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)),
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <KeyRound className="size-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Dotenvx</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Loading workspace…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <KeyRound className="size-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-tight">
              Dotenvx
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Environment manager
            </p>
          </div>
        </div>

        <ProjectSelector
          projects={projects}
          selectedProjectId={selectedProject?.id || null}
          onProjectSelect={handleProjectSelect}
          onProjectsUpdate={setProjects}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5">
          <div className="min-w-0">
            {selectedProject ? (
              <>
                <p className="truncate text-sm font-semibold">
                  {selectedProject.name}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {selectedProject.path}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">No project selected</p>
                <p className="text-[11px] text-muted-foreground">
                  Import a folder to inspect its environment files
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(true)}
              className="gap-1.5"
            >
              <SettingsIcon className="size-4" />
              Settings
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <EnvFileViewer
            project={selectedProject}
            onProjectUpdate={handleProjectUpdate}
          />
        </main>
      </div>

      <Dialog
        open={showSettings}
        onOpenChange={setShowSettings}
        size="md"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogClose onClick={() => setShowSettings(false)} />
          </DialogHeader>
          <Settings />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
