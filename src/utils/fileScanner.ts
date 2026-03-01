import { invoke } from "@tauri-apps/api/core";
import { EnvFile, EnvVariable } from "../types";

interface DirEntry {
  name: string;
  is_file: boolean;
  is_dir: boolean;
}

export class FileScanner {
  static async scanProjectFolder(projectPath: string): Promise<EnvFile[]> {
    try {
      const entries: DirEntry[] = await invoke("read_directory", {
        path: projectPath,
      });
      let envFiles: EnvFile[] = [];

      for (const entry of entries) {
        if (entry.is_file && entry.name) {
          const fileName = entry.name;
          const filePath = `${projectPath}/${fileName}`;

          // Check for .env files (including .env.local, .env.production, etc.)
          if (fileName.startsWith(".env")) {
            const envFile: EnvFile = {
              id: `${projectPath}-${entry.name}`,
              name: entry.name,
              path: filePath,
              type: this.getFileType(entry.name),
              environment: this.getEnvironment(entry.name),
              isEncrypted: await this.checkIfEncrypted(filePath),
              variables: await this.parseEnvFile(filePath),
              lastModified: new Date().toISOString(),
            };
            envFiles.push(envFile);
          }
        }
      }

      // Validate keys against .env.example if it exists
      const exampleFile = envFiles.find((file) => file.name === ".env.example");
      if (exampleFile) {
        envFiles = this.validateKeysAgainstExample(envFiles, exampleFile);
      }

      return envFiles;
    } catch (error) {
      console.error("Failed to scan project folder:", error);
      return [];
    }
  }

  private static getFileType(fileName: string): "env" | "keys" | "example" {
    if (fileName.includes(".keys")) {
      return "keys";
    }
    if (fileName === ".env.example") {
      return "example";
    }
    return "env";
  }

  private static getEnvironment(fileName: string): string | undefined {
    if (fileName === ".env") {
      return "default";
    }
    if (fileName === ".env.example") {
      return "example";
    }

    // Extract environment from filename (e.g., .env.development -> development)
    const match = fileName.match(/\.env\.(.+)$/);
    if (match && match[1] && !match[1].includes(".")) {
      return match[1];
    }

    return undefined;
  }

  private static async checkIfEncrypted(filePath: string): Promise<boolean> {
    try {
      const content: string = await invoke("read_text_file", {
        path: filePath,
      });
      return this.detectEncryption(content);
    } catch (error) {
      console.error(`Failed to check encryption for ${filePath}:`, error);
      return false;
    }
  }

  private static async parseEnvFile(filePath: string): Promise<EnvVariable[]> {
    try {
      const content: string = await invoke("read_text_file", {
        path: filePath,
      });
      return this.parseEnvContent(content);
    } catch (error) {
      console.error(`Failed to parse env file ${filePath}:`, error);
      return [];
    }
  }

  private static validateKeysAgainstExample(
    envFiles: EnvFile[],
    exampleFile: EnvFile
  ): EnvFile[] {
    const exampleKeys = new Set(exampleFile.variables.map((v) => v.key));

    return envFiles.map((file) => {
      if (file.type === "example" || file.type === "keys") {
        return file; // Skip validation for example and keys files
      }

      const fileKeys = new Set(file.variables.map((v) => v.key));
      const missingKeys = Array.from(exampleKeys).filter(
        (key) => !fileKeys.has(key)
      );
      const extraKeys = Array.from(fileKeys).filter(
        (key) => !exampleKeys.has(key)
      );

      return {
        ...file,
        missingKeys: missingKeys.length > 0 ? missingKeys : undefined,
        extraKeys: extraKeys.length > 0 ? extraKeys : undefined,
      };
    });
  }

  private static parseEnvContent(content: string): EnvVariable[] {
    const variables: EnvVariable[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalIndex = trimmed.indexOf("=");
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();

        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, "");
        const isEncrypted = this.isValueEncrypted(cleanValue);

        variables.push({
          key,
          value: cleanValue,
          isEncrypted,
        });
      }
    }
    return variables;
  }

  private static detectEncryption(content: string): boolean {
    // Check if any line contains the 'encrypted:' prefix
    // This is the standard way dotenvx marks encrypted values
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalIndex = trimmed.indexOf("=");
      if (equalIndex > 0) {
        const value = trimmed.substring(equalIndex + 1).trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, "");

        // Check if value starts with 'encrypted:'
        if (cleanValue.startsWith("encrypted:")) {
          return true;
        }
      }
    }

    return false;
  }

  private static isValueEncrypted(value: string): boolean {
    // Check if the value starts with 'encrypted:' prefix
    // This is the standard way dotenvx marks encrypted values
    return value.startsWith("encrypted:");
  }
}
