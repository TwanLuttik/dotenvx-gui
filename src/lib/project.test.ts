import { describe, expect, test } from "bun:test";
import { EnvFile, Project } from "../types";
import {
  allEnvFiles,
  defaultFolderPath,
  envFileTabLabel,
  filesInFolder,
  folderDisplayName,
  normalizeProject,
  relativeFolderPath,
  withScannedFolders,
} from "./project";

function file(path: string, name: string): EnvFile {
  return {
    id: path,
    name,
    path,
    type: "env",
    isEncrypted: false,
    variables: [],
    lastModified: "2026-01-01T00:00:00.000Z",
  };
}

describe("relativeFolderPath", () => {
  test("returns . for the project root", () => {
    expect(relativeFolderPath("/repo", "/repo")).toBe(".");
  });

  test("returns the path under the project root", () => {
    expect(relativeFolderPath("/repo", "/repo/apps/api")).toBe("apps/api");
  });
});

describe("envFileTabLabel", () => {
  test("uses the file name when there is a single folder", () => {
    expect(
      envFileTabLabel("/repo", file("/repo/apps/api/.env", ".env"), 1),
    ).toBe(".env");
  });

  test("prefixes the relative folder when there are multiple folders", () => {
    expect(
      envFileTabLabel("/repo", file("/repo/apps/api/.env", ".env"), 2),
    ).toBe("apps/api/.env");
  });
});

describe("normalizeProject", () => {
  test("migrates a legacy project without folders", () => {
    const envFiles = [file("/repo/.env", ".env")];
    const project = normalizeProject({
      id: "p1",
      name: "repo",
      path: "/repo",
      envFiles,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastModified: "2026-01-01T00:00:00.000Z",
    } as Project);

    expect(project.folders).toEqual([{ path: "/repo", envFiles }]);
    expect(allEnvFiles(project)).toEqual(envFiles);
  });

  test("keeps folders as the source of truth", () => {
    const api = file("/repo/apps/api/.env", ".env");
    const web = file("/repo/apps/web/.env", ".env");
    const project = withScannedFolders(
      {
        id: "p1",
        name: "repo",
        path: "/repo",
        folders: [],
        envFiles: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModified: "2026-01-01T00:00:00.000Z",
      },
      [
        { path: "/repo/apps/api", envFiles: [api] },
        { path: "/repo/apps/web", envFiles: [web] },
      ],
    );

    expect(allEnvFiles(project)).toEqual([api, web]);
    expect(project.envFiles).toEqual([api, web]);
  });
});

describe("folder navigation", () => {
  test("labels the imported root as Project root", () => {
    expect(folderDisplayName("/repo", "/repo")).toBe("Project root");
    expect(folderDisplayName("/repo", "/repo/apps/api")).toBe("apps/api");
  });

  test("filters files to the selected folder", () => {
    const api = file("/repo/apps/api/.env", ".env");
    const web = file("/repo/apps/web/.env", ".env");
    const project = withScannedFolders(
      {
        id: "p1",
        name: "repo",
        path: "/repo",
        folders: [],
        envFiles: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModified: "2026-01-01T00:00:00.000Z",
      },
      [
        { path: "/repo/apps/api", envFiles: [api] },
        { path: "/repo/apps/web", envFiles: [web] },
      ],
    );

    expect(filesInFolder(project, "/repo/apps/api")).toEqual([api]);
    expect(filesInFolder(project, null)).toEqual([api, web]);
    expect(defaultFolderPath(project)).toBe("/repo/apps/api");
  });

  test("does not preselect a folder when there is only one", () => {
    const root = file("/repo/.env", ".env");
    const project = withScannedFolders(
      {
        id: "p1",
        name: "repo",
        path: "/repo",
        folders: [],
        envFiles: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModified: "2026-01-01T00:00:00.000Z",
      },
      [{ path: "/repo", envFiles: [root] }],
    );

    expect(defaultFolderPath(project)).toBeNull();
  });
});
