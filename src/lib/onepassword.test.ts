import { describe, expect, test } from "bun:test";
import { Project } from "../types";
import { fileWasLastSynced, markProjectSynced } from "./onepassword";

function project(): Project {
  return {
    id: "p1",
    name: "repo",
    path: "/repo",
    folders: [],
    envFiles: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-01-01T00:00:00.000Z",
  };
}

describe("1Password last sync", () => {
  test("stores the item id, time, and file paths", () => {
    const synced = markProjectSynced(
      project(),
      "item-1",
      ["/repo/.env", "/repo/.env.production"],
      "2026-08-20T12:00:00.000Z",
    );

    expect(synced.onePasswordItemId).toBe("item-1");
    expect(synced.onePasswordLastSyncedAt).toBe("2026-08-20T12:00:00.000Z");
    expect(synced.onePasswordLastSyncedFilePaths).toEqual([
      "/repo/.env",
      "/repo/.env.production",
    ]);
    expect(fileWasLastSynced(synced, "/repo/.env")).toBe(true);
    expect(fileWasLastSynced(synced, "/repo/.env.example")).toBe(false);
  });

  test("treats a never-synced project as unsynced", () => {
    expect(fileWasLastSynced(project(), "/repo/.env")).toBe(false);
  });
});
