import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "../contexts/ToastContext";
import {
  createOnePasswordVault,
  listOnePasswordVaults,
  loadOnePasswordSettings,
  saveOnePasswordSettings,
} from "../lib/onepassword";
import { OnePasswordVault } from "../types";
import { CheckCircle, KeyRound, Loader2 } from "lucide-react";

export function OnePasswordSettings() {
  const { success, error } = useToast();
  const stored = useMemo(() => loadOnePasswordSettings(), []);
  const [accountName, setAccountName] = useState(stored?.accountName ?? "");
  const [vaults, setVaults] = useState<OnePasswordVault[]>(
    stored
      ? [{ id: stored.vaultId, title: stored.vaultTitle }]
      : [],
  );
  const [vaultId, setVaultId] = useState(stored?.vaultId ?? "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selectedVault = vaults.find((vault) => vault.id === vaultId);

  const persistSelection = (
    name: string,
    vault: Pick<OnePasswordVault, "id" | "title">,
  ) => {
    saveOnePasswordSettings(name, vault);
    success(`1Password vault set to ${vault.title}`);
  };

  const handleConnect = async () => {
    if (!accountName.trim()) {
      error("Enter the 1Password account name from the app sidebar.");
      return;
    }

    try {
      setIsConnecting(true);
      const nextVaults = await listOnePasswordVaults(accountName);
      setVaults(nextVaults);

      const stillThere = nextVaults.find((vault) => vault.id === vaultId);
      const nextVault = stillThere ?? nextVaults[0];
      if (!nextVault) {
        error("No vaults found. Create a Dotenvx vault, then try again.");
        return;
      }

      setVaultId(nextVault.id);
      persistSelection(accountName, nextVault);
    } catch (err) {
      error(String(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCreateVault = async () => {
    if (!accountName.trim()) {
      error("Enter the 1Password account name first.");
      return;
    }

    try {
      setIsCreating(true);
      const vault = await createOnePasswordVault(accountName, "Dotenvx");
      setVaults((prev) => {
        if (prev.some((item) => item.id === vault.id)) return prev;
        return [...prev, vault];
      });
      setVaultId(vault.id);
      persistSelection(accountName, vault);
    } catch (err) {
      error(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4" />
        1Password
      </div>
      <p className="text-sm text-muted-foreground">
        Uses the 1Password desktop app. Enable Settings → Developer → Integrate
        with other apps, then enter the account name from the sidebar.
      </p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="op-account">
          Account name
        </label>
        <Input
          id="op-account"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="e.g. wendyappleseed"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleConnect}
          disabled={isConnecting || isCreating}
          size="sm"
        >
          {isConnecting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          {isConnecting ? "Connecting…" : "Connect & list vaults"}
        </Button>
        <Button
          onClick={handleCreateVault}
          disabled={isConnecting || isCreating}
          variant="outline"
          size="sm"
        >
          {isCreating ? "Creating…" : "Create Dotenvx vault"}
        </Button>
      </div>

      {vaults.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="op-vault">
            Vault
          </label>
          <select
            id="op-vault"
            value={vaultId}
            onChange={(event) => {
              const next = vaults.find((vault) => vault.id === event.target.value);
              if (!next) return;
              setVaultId(next.id);
              persistSelection(accountName, next);
            }}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {vaults.map((vault) => (
              <option key={vault.id} value={vault.id}>
                {vault.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedVault && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle className="size-4" />
          Saving to {selectedVault.title}
        </div>
      )}
    </section>
  );
}
