import { Project, AppState } from './types';

// Storage abstraction layer - easily switchable to SQLite later
export class StorageManager {
  private static readonly STORAGE_KEY = 'dotenvx-projects';

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
      return JSON.parse(stored);
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
}
