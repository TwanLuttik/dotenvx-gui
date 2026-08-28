import "./App.css";

import { useState, useEffect } from "react";
import { AppPreferences, Project } from "./types";
import { StorageManager } from "./storage";
import { defaultFolderPath, folderDisplayName, projectFolders } from "./lib/project";
import { ProjectSelector } from "./components/ProjectSelector";
import { EnvFileViewer } from "./components/EnvFileViewer";
import { ThemeToggle } from "./components/ThemeToggle";
import { Settings } from "./components/Settings";
import { HardDrive, KeyRound, Loader2, Settings as SettingsIcon } from "lucide-react";
import { BackupManager } from "./components/BackupManager";
import { Button } from "./components/ui/button";
import { useToast } from "./contexts/ToastContext";
import {
  formatOnePasswordError,
  isOnePasswordConfigured,
  linkExistingOnePasswordItem,
  loadOnePasswordSettings,
  markProjectSynced,
  onePasswordSavePlan,
  reconcileLocalProjects,
  saveProjectToOnePassword,
  secretFilePaths,
} from "./lib/onepassword";
import { OnePasswordSaveDialog } from "./components/OnePasswordSaveDialog";
import { OnePasswordSyncStatus } from "./components/OnePasswordSyncStatus";
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
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isSavingToOnePassword, setIsSavingToOnePassword] = useState(false);
  const [showOnePasswordSave, setShowOnePasswordSave] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [onePasswordConfigured, setOnePasswordConfigured] = useState(() =>
    isOnePasswordConfigured(),
  );
  const [preferences, setPreferences] = useState<AppPreferences>(() =>
    StorageManager.loadPreferences(),
  );
  const { success, error } = useToast();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== ",") return;
      event.preventDefault();
      setShowSettings((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handlePreferencesChange = (next: AppPreferences) => {
    StorageManager.savePreferences(next);
    setPreferences(next);
  };

  const loadInitialData = async () => {
    try {
      const state = await StorageManager.loadState();
      setProjects(state.projects);

      if (state.selectedProjectId) {
        const selectedProj = state.projects.find(
          (p) => p.id === state.selectedProjectId,
        );
        setSelectedProject(selectedProj || null);
        setSelectedFolderPath(
          selectedProj ? defaultFolderPath(selectedProj) : null,
        );
      }
    } catch (error) {
      console.error("Failed to load initial data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectSelect = async (
    project: Project | null,
    folderPath?: string | null,
  ) => {
    setSelectedProject(project);
    if (!project) {
      setSelectedFolderPath(null);
    } else if (folderPath !== undefined) {
      setSelectedFolderPath(folderPath);
    } else {
      const folders = projectFolders(project);
      const stillValid =
        selectedFolderPath &&
        folders.some((folder) => folder.path === selectedFolderPath);
      setSelectedFolderPath(
        stillValid ? selectedFolderPath : defaultFolderPath(project),
      );
    }
    await StorageManager.setSelectedProject(project?.id || null);
  };

  const persistReconciledProjects = async (
    next: Project[],
    previous: Project[],
  ) => {
    const changed = next.filter((project, index) => project !== previous[index]);
    if (changed.length === 0) return previous;

    for (const project of changed) {
      await StorageManager.saveProject(project);
    }
    setProjects(next);
    setSelectedProject((current) =>
      current
        ? (next.find((project) => project.id === current.id) ?? current)
        : current,
    );
    return next;
  };

  const handleOnePasswordConfiguredChange = async (configured: boolean) => {
    setOnePasswordConfigured(configured);
    if (!configured) return;

    try {
      const next = await reconcileLocalProjects(projects);
      await persistReconciledProjects(next, projects);
    } catch (err) {
      error(formatOnePasswordError(err));
    }
  };

  const handleSaveToOnePassword = async (event?: { shiftKey?: boolean }) => {
    if (!selectedProject) return;

    if (!loadOnePasswordSettings()) {
      setShowSettings(true);
      error(formatOnePasswordError("Connect 1Password in Settings, then save again."));
      return;
    }

    if (secretFilePaths(selectedProject).length === 0) {
      error(
        formatOnePasswordError(
          "No secret env files to save. Example files are skipped.",
        ),
      );
      return;
    }

    let project = selectedProject;
    if (!project.onePasswordItemId) {
      try {
        const linked = await linkExistingOnePasswordItem(project);
        if (linked !== project) {
          await handleProjectUpdate(linked);
          project = linked;
        }
      } catch {
        // The save path looks up the vault item again.
      }
    }

    if (event?.shiftKey) {
      void confirmSaveToOnePassword(project);
      return;
    }

    setShowOnePasswordSave(true);
  };

  const confirmSaveToOnePassword = async (project = selectedProject) => {
    if (!project) return;

    try {
      setIsSavingToOnePassword(true);
      const result = await saveProjectToOnePassword(project);
      const updatedProject = markProjectSynced(
        project,
        result.itemId,
        secretFilePaths(project),
        undefined,
        result.vaultId,
      );
      await handleProjectUpdate(updatedProject);
      setShowOnePasswordSave(false);
      success(`Saved to 1Password as ${result.title}`);
    } catch (err) {
      error(formatOnePasswordError(err));
    } finally {
      setIsSavingToOnePassword(false);
    }
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
      <aside className="flex w-80 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
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
          selectedFolderPath={selectedFolderPath}
          onePasswordConfigured={onePasswordConfigured}
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
                  {selectedFolderPath
                    ? folderDisplayName(
                        selectedProject.path,
                        selectedFolderPath,
                      )
                    : selectedProject.path}
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
            {selectedProject && onePasswordConfigured && (
              <>
                <OnePasswordSyncStatus
                  syncedAt={selectedProject.onePasswordLastSyncedAt}
                  compact
                  className="hidden pr-1 text-right sm:block"
                />
                <Button
                  variant="outline"
                  size="sm"
                  title="Save to 1Password. Shift-click to skip confirmation."
                  onClick={handleSaveToOnePassword}
                  disabled={isSavingToOnePassword}
                >
                  {isSavingToOnePassword ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  {selectedProject.onePasswordItemId ? "Update" : "Save"}
                </Button>
              </>
            )}
            {selectedProject && (
              <Button
                variant="outline"
                size="sm"
                title="Project backups"
                onClick={() => setShowBackups(true)}
              >
                <HardDrive className="size-4" />
                Backups
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              title="Settings (⌘,)"
              className="h-8 w-8"
            >
              <SettingsIcon className="size-4" />
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <EnvFileViewer
            project={selectedProject}
            selectedFolderPath={selectedFolderPath}
            envFileView={preferences.envFileView}
            onePasswordConfigured={onePasswordConfigured}
            onProjectUpdate={handleProjectUpdate}
          />
        </main>
      </div>

      <OnePasswordSaveDialog
        open={showOnePasswordSave}
        plan={
          selectedProject
            ? onePasswordSavePlan(selectedProject, loadOnePasswordSettings())
            : null
        }
        isSaving={isSavingToOnePassword}
        onConfirm={() => void confirmSaveToOnePassword()}
        onOpenChange={(open) => {
          if (!isSavingToOnePassword) setShowOnePasswordSave(open);
        }}
      />

      <Dialog open={showBackups} onOpenChange={setShowBackups} size="lg">
        <DialogContent>
          <DialogHeader>
            <div>
              <DialogTitle>Backups</DialogTitle>
              {selectedProject && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedProject.name}
                </p>
              )}
            </div>
            <DialogClose onClick={() => setShowBackups(false)} />
          </DialogHeader>
          {selectedProject && <BackupManager project={selectedProject} />}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSettings}
        onOpenChange={setShowSettings}
        size="lg"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogClose onClick={() => setShowSettings(false)} />
          </DialogHeader>
          <Settings
            preferences={preferences}
            onPreferencesChange={handlePreferencesChange}
            onOnePasswordConfiguredChange={(configured) => {
              void handleOnePasswordConfiguredChange(configured);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
