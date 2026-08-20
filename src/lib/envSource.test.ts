import { describe, expect, test } from "bun:test";
import { formatEnvSource } from "./envSource";

const variables = [
  { key: "API_URL", value: "https://api.example.com", isEncrypted: false },
  { key: "SECRET", value: "encrypted:abc", isEncrypted: true },
  { key: "EMPTY", value: "", isEncrypted: false },
];

describe("formatEnvSource", () => {
  test("masks values until they are revealed", () => {
    expect(formatEnvSource(variables)).toBe(
      ["API_URL=••••••••••••", "SECRET=••••••••••••", "EMPTY="].join("\n"),
    );
  });

  test("writes KEY=value lines when values are revealed", () => {
    expect(formatEnvSource(variables, { revealValues: true })).toBe(
      [
        "API_URL=https://api.example.com",
        "SECRET=encrypted:abc",
        "EMPTY=",
      ].join("\n"),
    );
  });

  test("filters lines by the search query", () => {
    expect(
      formatEnvSource(variables, { revealValues: true, query: "api" }),
    ).toBe("API_URL=https://api.example.com");
  });
});
