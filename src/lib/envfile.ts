import { EnvVariable } from "../types";

const ENV_RULE = /^env\s+"([^"]+)"\s*(?:,\s*(.*))?$/;
const BLOCK_START = /^(file|profile)\s+"([^"]+)"\s+do$/;

/**
 * Lists the `env "NAME", ...` declarations of an Envfile schema as variables whose value is
 * the rule's options. Rules inside `file "..." do` / `profile "..." do` blocks are prefixed
 * with their scope. Values are secret by default in dotenvx, so a rule counts as encrypted
 * unless it says `encrypted: false`.
 */
export function parseEnvfileRules(content: string): EnvVariable[] {
  const rules: EnvVariable[] = [];
  const scopes: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;

    const block = line.match(BLOCK_START);
    if (block) {
      scopes.push(`${block[1]} ${block[2]}`);
      continue;
    }
    if (line === "end") {
      scopes.pop();
      continue;
    }

    const rule = line.match(ENV_RULE);
    if (!rule) continue;

    const options = rule[2]?.trim() ?? "";
    const scope = scopes.length ? `[${scopes.join(" / ")}] ` : "";
    rules.push({
      key: rule[1],
      value: `${scope}${options || "required"}`,
      isEncrypted: !/encrypted:\s*false/.test(options),
    });
  }

  return rules;
}
