import { describe, expect, test } from "bun:test";
import {
  fieldIdForFile,
  relativeFilePath,
  withUniqueFileIds,
} from "./onepassword-file-ids.cjs";

describe("1Password file ids", () => {
  test("uses the path under the project root", () => {
    expect(
      relativeFilePath("/repo", "/repo/apps/api/.env"),
    ).toBe("apps/api/.env");
  });

  test("gives distinct field ids to the same filename in different folders", () => {
    const files = withUniqueFileIds([
      { name: ".env", relativePath: "apps/api/.env", content: "A=1" },
      { name: ".env", relativePath: "apps/next/.env", content: "B=1" },
    ]);

    expect(files.map((file) => file.fieldId)).toEqual([
      "file-apps-api-env",
      "file-apps-next-env",
    ]);
    expect(new Set(files.map((file) => file.fieldId)).size).toBe(2);
    expect(files.map((file) => file.name)).toEqual([
      "apps/api/.env",
      "apps/next/.env",
    ]);
  });

  test("keeps a root env file unique from nested copies", () => {
    expect(fieldIdForFile(".env")).toBe("file-env");
    expect(fieldIdForFile("apps/api/.env")).toBe("file-apps-api-env");
  });
});
