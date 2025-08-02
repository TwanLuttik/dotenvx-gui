import "./App.css";

import { useState, useEffect } from "react";
import { Project } from "./types";
import { StorageManager } from "./storage";
import { ProjectSelector } from "./components/ProjectSelector";
import { EnvFileViewer } from "./components/EnvFileViewer";
import { ThemeToggle } from "./components/ThemeToggle";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const state = await StorageManager.loadState();
      setProjects(state.projects);

      if (state.selectedProjectId) {
        const selectedProj = state.projects.find(
          (p) => p.id === state.selectedProjectId
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
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
    setSelectedProject(updatedProject);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground">
        <h1 className="text-3xl font-bold mb-4">DotenvX GUI</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-10 bg-background border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Dotenvx GUI</h1>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-16">
        {/* Sidebar */}
        <aside className="w-80 border-r bg-sidebar">
          <ProjectSelector
            projects={projects}
            selectedProjectId={selectedProject?.id || null}
            onProjectSelect={handleProjectSelect}
            onProjectsUpdate={setProjects}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <EnvFileViewer
            project={selectedProject}
            onProjectUpdate={handleProjectUpdate}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
