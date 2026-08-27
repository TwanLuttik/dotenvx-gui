import { describe, expect, test } from "bun:test";
import { Project } from "../types";
import {
  fileWasLastSynced,
  formatOnePasswordError,
  isOnePasswordConfigured,
  markProjectSynced,
  onePasswordSavePlan,
} from "./onepassword";

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
    expect(synced.onePasswordVaultId).toBeUndefined();
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

  test("stores the vault the item was saved to", () => {
    const synced = markProjectSynced(
      project(),
      "item-1",
      ["/repo/.env"],
      "2026-08-20T12:00:00.000Z",
      "vault-1",
    );
    expect(synced.onePasswordVaultId).toBe("vault-1");
  });
});

describe("formatOnePasswordError", () => {
  test("maps a missing Node or Bun runtime", () => {
    expect(
      formatOnePasswordError(
        "Node.js or Bun is required to talk to the 1Password SDK. Install Node or Bun, or open Dotenvx from a terminal where `node` is on PATH.",
      ),
    ).toBe("Install Node.js or Bun, then try again.");
  });

  test("maps a missing bridge script", () => {
    expect(
      formatOnePasswordError("Could not find the 1Password bridge script."),
    ).toBe(
      "Couldn't find the 1Password helper. Reinstall Dotenvx and try again.",
    );
  });

  test("maps a desktop app or integration problem", () => {
    expect(
      formatOnePasswordError(
        "1Password bridge returned no output. Is the 1Password desktop app running with SDK integration enabled?",
      ),
    ).toBe(
      "Open the 1Password app and enable Settings → Developer → Integrate with other apps.",
    );
  });

  test("maps a bad account name before generic account text", () => {
    expect(
      formatOnePasswordError("1Password account name is required"),
    ).toBe(
      "Check the account name in Settings. It should match the 1Password sidebar.",
    );
    expect(
      formatOnePasswordError(
        "Connect 1Password in Settings first: account name and a vault.",
      ),
    ).toBe("Connect 1Password in Settings, then save again.");
  });

  test("maps a missing vault", () => {
    expect(formatOnePasswordError("Vault not found")).toBe(
      "The saved vault is missing. Pick a vault in Settings.",
    );
  });

  test("keeps the no-secret-files message", () => {
    expect(
      formatOnePasswordError(
        "No secret env files to save. Example files are skipped.",
      ),
    ).toBe("No secret env files to save. Example files are skipped.");
  });

  test("strips an Error prefix from unknown messages", () => {
    expect(formatOnePasswordError(new Error("something else went wrong"))).toBe(
      "something else went wrong",
    );
  });
});

describe("onePasswordSavePlan", () => {
  test("lists every secret file as new on the first save", () => {
    const plan = onePasswordSavePlan(
      {
        ...project(),
        folders: [
          {
            path: "/repo",
            envFiles: [
              {
                id: "1",
                name: ".env",
                path: "/repo/.env",
                type: "env",
                isEncrypted: false,
                variables: [],
                lastModified: "2026-01-01T00:00:00.000Z",
              },
              {
                id: "2",
                name: ".env.example",
                path: "/repo/.env.example",
                type: "example",
                isEncrypted: false,
                variables: [],
                lastModified: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
        envFiles: [],
      },
      { accountName: "ada", vaultId: "v1", vaultTitle: "Dotenvx" },
    );

    expect(plan.isUpdate).toBe(false);
    expect(plan.title).toBe("Dotenvx / repo");
    expect(plan.vaultTitle).toBe("Dotenvx");
    expect(plan.files).toEqual([
      { path: "/repo/.env", label: ".env", change: "add" },
    ]);
  });

  test("marks added, updated, and removed files on a later save", () => {
    const plan = onePasswordSavePlan(
      {
        ...project(),
        onePasswordItemId: "item-1",
        onePasswordLastSyncedFilePaths: ["/repo/.env", "/repo/.env.staging"],
        folders: [
          {
            path: "/repo",
            envFiles: [
              {
                id: "1",
                name: ".env",
                path: "/repo/.env",
                type: "env",
                isEncrypted: false,
                variables: [],
                lastModified: "2026-01-01T00:00:00.000Z",
              },
              {
                id: "2",
                name: ".env.production",
                path: "/repo/.env.production",
                type: "env",
                isEncrypted: false,
                variables: [],
                lastModified: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
        envFiles: [],
      },
      { accountName: "ada", vaultId: "v1", vaultTitle: "Private" },
    );

    expect(plan.isUpdate).toBe(true);
    expect(plan.files).toEqual([
      { path: "/repo/.env", label: ".env", change: "update" },
      { path: "/repo/.env.production", label: ".env.production", change: "add" },
      { path: "/repo/.env.staging", label: ".env.staging", change: "remove" },
    ]);
  });
});

describe("isOnePasswordConfigured", () => {
  test("is false when settings are missing", () => {
    expect(isOnePasswordConfigured(null)).toBe(false);
  });

  test("is true when an account and vault are stored", () => {
    expect(
      isOnePasswordConfigured({
        accountName: "wendyappleseed",
        vaultId: "vault-1",
        vaultTitle: "Dotenvx",
      }),
    ).toBe(true);
  });
});
