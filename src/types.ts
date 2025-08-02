export interface Project {
  id: string;
  name: string;
  path: string;
  envFiles: EnvFile[];
  createdAt: string;
  lastModified: string;
}

export interface EnvFile {
  id: string;
  name: string;
  path: string;
  type: 'env' | 'keys' | 'example';
  environment?: string; // e.g., 'development', 'production', 'staging'
  isEncrypted: boolean;
  variables: EnvVariable[];
  lastModified: string;
  missingKeys?: string[]; // Keys that exist in .env.example but missing in this file
  extraKeys?: string[]; // Keys that exist in this file but not in .env.example
}

export interface EnvVariable {
  key: string;
  value: string;
  isEncrypted: boolean;
}

export interface AppState {
  projects: Project[];
  selectedProjectId: string | null;
}
