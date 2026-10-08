import { describe, expect, test } from "bun:test";
import { parseEnvfileRules } from "./envfile";

describe("parseEnvfileRules", () => {
  test("lists env rules with their options", () => {
    const rules = parseEnvfileRules(
      [
        "# Envfile",
        "strict true",
        "",
        'env "PORT", type: "port", encrypted: false',
        'env "DATABASE_URL", type: "url"',
        'env "SENTRY_DSN"',
      ].join("\n"),
    );

    expect(rules).toEqual([
      { key: "PORT", value: 'type: "port", encrypted: false', isEncrypted: false },
      { key: "DATABASE_URL", value: 'type: "url"', isEncrypted: true },
      { key: "SENTRY_DSN", value: "required", isEncrypted: true },
    ]);
  });

  test("prefixes rules inside file and profile blocks", () => {
    const rules = parseEnvfileRules(
      [
        'file ".env.production" do',
        '  env "API_KEY", optional: true',
        "end",
        'profile "ci" do',
        '  env "CI_TOKEN" # injected by CI',
        "end",
      ].join("\r\n"),
    );

    expect(rules.map((rule) => [rule.key, rule.value])).toEqual([
      ["API_KEY", '[file .env.production] optional: true'],
      ["CI_TOKEN", "[profile ci] required"],
    ]);
  });
});
