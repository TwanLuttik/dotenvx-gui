import { Project, AppState, AppPreferences, OnePasswordSettings } from './types';
import { normalizeProject } from './lib/project';

const DEFAULT_PREFERENCES: AppPreferences = {
  envFileView: "table",
};

// Storage abstraction layer - easily switchable to SQLite later
export class StorageManager {
  private static readonly STORAGE_KEY = 'dotenvx-projects';
  private static readonly ONEPASSWORD_KEY = 'dotenvx-onepassword';
  private static readonly PREFERENCES_KEY = 'dotenvx-preferences';

  static async saveState(state: AppState): Promise<void> {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save state:', error);
      throw new Error('Failed to save projects');
    }
  }

  static async loadState(): Promise<AppState> {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return { projects: [], selectedProjectId: null };
      }
      const parsed = JSON.parse(stored) as AppState;
      return {
        ...parsed,
        projects: (parsed.projects ?? []).map((project) =>
          normalizeProject(project),
        ),
      };
    } catch (error) {
      console.error('Failed to load state:', error);
      return { projects: [], selectedProjectId: null };
    }
  }

  static async saveProject(project: Project): Promise<void> {
    const state = await this.loadState();
    const existingIndex = state.projects.findIndex(p => p.id === project.id);
    
    if (existingIndex >= 0) {
      state.projects[existingIndex] = project;
    } else {
      state.projects.push(project);
    }
    
    await this.saveState(state);
  }

  static async deleteProject(projectId: string): Promise<void> {
    const state = await this.loadState();
    state.projects = state.projects.filter(p => p.id !== projectId);
    if (state.selectedProjectId === projectId) {
      state.selectedProjectId = null;
    }
    await this.saveState(state);
  }

  static async setSelectedProject(projectId: string | null): Promise<void> {
    const state = await this.loadState();
    state.selectedProjectId = projectId;
    await this.saveState(state);
  }

  static loadOnePasswordSettings(): OnePasswordSettings | null {
    try {
      const stored = localStorage.getItem(this.ONEPASSWORD_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as OnePasswordSettings;
      if (!parsed.accountName || !parsed.vaultId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  static saveOnePasswordSettings(settings: OnePasswordSettings): void {
    localStorage.setItem(this.ONEPASSWORD_KEY, JSON.stringify(settings));
  }

  static clearOnePasswordSettings(): void {
    localStorage.removeItem(this.ONEPASSWORD_KEY);
  }

  static loadPreferences(): AppPreferences {
    try {
      const stored = localStorage.getItem(this.PREFERENCES_KEY);
      if (!stored) return { ...DEFAULT_PREFERENCES };
      const parsed = JSON.parse(stored) as Partial<AppPreferences>;
      return {
        envFileView: parsed.envFileView === "editor" ? "editor" : "table",
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  static savePreferences(preferences: AppPreferences): void {
    localStorage.setItem(this.PREFERENCES_KEY, JSON.stringify(preferences));
  }
}
