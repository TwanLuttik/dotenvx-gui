import { describe, expect, test } from "bun:test";
import { EnvFile, Project } from "../types";
import {
  backupFileGroups,
  backupableEnvFiles,
  envFileBackupContent,
  togglePathSelection,
} from "./backup";

function file(
  path: string,
  name: string,
  type: EnvFile["type"] = "env",
): EnvFile {
  return {
    id: path,
    name,
    path,
    type,
    isEncrypted: false,
    variables: [{ key: "A", value: "1", isEncrypted: false }],
    lastModified: "2026-01-01T00:00:00.000Z",
  };
}

function project(): Project {
  return {
    id: "p1",
    name: "repo",
    path: "/repo",
    folders: [
      {
        path: "/repo",
        envFiles: [
          file("/repo/.env", ".env"),
          file("/repo/.env.example", ".env.example", "example"),
        ],
      },
      {
        path: "/repo/apps/api",
        envFiles: [
          file("/repo/apps/api/.env", ".env"),
          file("/repo/apps/api/.env.keys", ".env.keys", "keys"),
        ],
      },
    ],
    envFiles: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-01-01T00:00:00.000Z",
  };
}

describe("backupableEnvFiles", () => {
  test("skips example files and keeps env and keys", () => {
    expect(backupableEnvFiles(project()).map((item) => item.path)).toEqual([
      "/repo/.env",
      "/repo/apps/api/.env",
      "/repo/apps/api/.env.keys",
    ]);
  });
});

describe("backupFileGroups", () => {
  test("groups remaining files by folder", () => {
    const groups = backupFileGroups(project());
    expect(groups.map((group) => group.label)).toEqual([
      "Project root",
      "apps/api",
    ]);
    expect(groups[1].files.map((item) => item.name)).toEqual([
      ".env",
      ".env.keys",
    ]);
  });
});

describe("togglePathSelection", () => {
  test("deselects every path in a folder", () => {
    const next = togglePathSelection(
      new Set(["/repo/.env", "/repo/apps/api/.env"]),
      ["/repo/apps/api/.env"],
      false,
    );
    expect([...next]).toEqual(["/repo/.env"]);
  });
});

describe("envFileBackupContent", () => {
  test("writes KEY=value lines", () => {
    expect(envFileBackupContent(file("/repo/.env", ".env"))).toBe("A=1");
  });
});
