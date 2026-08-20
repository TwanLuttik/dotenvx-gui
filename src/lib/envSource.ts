import { EnvVariable } from "../types";

export function formatEnvSource(
  variables: EnvVariable[],
  options?: { revealValues?: boolean; query?: string },
): string {
  const term = options?.query?.trim().toLowerCase() ?? "";
  const revealValues = options?.revealValues ?? false;

  return variables
    .filter((variable) => {
      if (!term) return true;
      return (
        variable.key.toLowerCase().includes(term) ||
        variable.value.toLowerCase().includes(term)
      );
    })
    .map((variable) => {
      const value = revealValues || !variable.value ? variable.value : "••••••••••••";
      return `${variable.key}=${value}`;
    })
    .join("\n");
}
