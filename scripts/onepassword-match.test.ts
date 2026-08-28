import { describe, expect, test } from "bun:test";
import {
  isDotenvxItem,
  itemFileNames,
  itemProjectPath,
  matchExistingItem,
  normalizeProjectPath,
  summarizeItem,
} from "./onepassword-match.cjs";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    vaultId: "vault-1",
    title: "Dotenvx / repo",
    tags: ["dotenvx"],
    fields: [{ id: "project_path", value: "/repo" }],
    files: [{ attributes: { name: ".env" } }],
    updatedAt: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeProjectPath", () => {
  test("strips trailing slashes and backslashes", () => {
    expect(normalizeProjectPath("/repo/")).toBe("/repo");
    expect(normalizeProjectPath("C:\\repo\\")).toBe("C:/repo");
  });
});

describe("isDotenvxItem", () => {
  test("accepts the dotenvx tag or title prefix", () => {
    expect(isDotenvxItem(item())).toBe(true);
    expect(isDotenvxItem(item({ tags: [], title: "Dotenvx / other" }))).toBe(
      true,
    );
    expect(isDotenvxItem(item({ tags: [], title: "Random note" }))).toBe(false);
  });
});

describe("matchExistingItem", () => {
  test("prefers an exact project path over title", () => {
    const pathHit = item({
      id: "by-path",
      title: "Dotenvx / renamed",
      fields: [{ id: "project_path", value: "/repo/" }],
    });
    const titleHit = item({
      id: "by-title",
      title: "Dotenvx / repo",
      fields: [{ id: "project_path", value: "/other" }],
    });

    expect(
      matchExistingItem([titleHit, pathHit], {
        projectPath: "/repo",
        title: "Dotenvx / repo",
      })?.id,
    ).toBe("by-path");
  });

  test("falls back to the item title when no path matches", () => {
    expect(
      matchExistingItem(
        [item({ id: "t1", fields: [{ id: "project_path", value: "/other" }] })],
        { projectPath: "/repo", title: "Dotenvx / repo" },
      )?.id,
    ).toBe("t1");
  });

  test("picks the newest item when several share a path", () => {
    const older = item({
      id: "old",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = item({
      id: "new",
      updatedAt: "2026-08-20T12:00:00.000Z",
    });

    expect(
      matchExistingItem([older, newer], {
        projectPath: "/repo",
        title: "Dotenvx / repo",
      })?.id,
    ).toBe("new");
  });

  test("ignores unrelated vault notes", () => {
    expect(
      matchExistingItem(
        [item({ tags: [], title: "API keys", fields: [] })],
        { projectPath: "/repo", title: "Dotenvx / repo" },
      ),
    ).toBeNull();
  });
});

describe("summarizeItem", () => {
  test("exposes the path and attached file names", () => {
    expect(itemProjectPath(item({ fields: [{ id: "project_path", value: "/repo/" }] }))).toBe(
      "/repo",
    );
    expect(itemFileNames(item())).toEqual([".env"]);
    expect(summarizeItem(item())).toEqual({
      itemId: "item-1",
      vaultId: "vault-1",
      title: "Dotenvx / repo",
      projectPath: "/repo",
      fileNames: [".env"],
      updatedAt: "2026-08-20T12:00:00.000Z",
    });
  });
});
