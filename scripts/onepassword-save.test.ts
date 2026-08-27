import { describe, expect, test } from "bun:test";
import {
  applyProjectMetadata,
  isMissingItemError,
} from "./onepassword-save.cjs";

describe("isMissingItemError", () => {
  test("matches the 1Password desktop wording", () => {
    expect(isMissingItemError("item couldn't be found")).toBe(true);
    expect(isMissingItemError("The item could not be found")).toBe(true);
    expect(isMissingItemError("unknown item")).toBe(true);
    expect(isMissingItemError("Vault not found")).toBe(true);
  });

  test("does not treat other failures as a missing item", () => {
    expect(isMissingItemError("permission denied")).toBe(false);
    expect(isMissingItemError("1Password app is not running")).toBe(false);
  });
});

describe("applyProjectMetadata", () => {
  test("keeps files and version so an update can put the live item", () => {
    const updated = applyProjectMetadata(
      {
        id: "item-1",
        vaultId: "vault-1",
        version: 3,
        files: [
          { fieldId: "file-env", sectionId: "dotenvx-files", attributes: {} },
        ],
        tags: ["existing"],
        sections: [{ id: "other", title: "Other" }],
        fields: [{ id: "notes", title: "Notes", value: "keep" }],
      },
      {
        title: "Dotenvx / repo",
        notes: "Saved from Dotenvx",
        projectPath: "/repo",
      },
      "Text",
    );

    expect(updated.id).toBe("item-1");
    expect(updated.version).toBe(3);
    expect(updated.files).toEqual([
      { fieldId: "file-env", sectionId: "dotenvx-files", attributes: {} },
    ]);
    expect(updated.tags).toEqual(["existing", "dotenvx"]);
    expect(updated.sections.map((section: { id: string }) => section.id)).toEqual(
      ["other", "dotenvx-meta", "dotenvx-files"],
    );
    expect(updated.fields).toEqual([
      { id: "notes", title: "Notes", value: "keep" },
      {
        id: "project_path",
        title: "Project path",
        fieldType: "Text",
        sectionId: "dotenvx-meta",
        value: "/repo",
      },
    ]);
  });
});
