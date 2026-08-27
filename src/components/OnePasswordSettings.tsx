import { useMemo, useState, type ReactNode } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useToast } from "../contexts/ToastContext";
import {
  clearOnePasswordSettings,
  createOnePasswordVault,
  formatOnePasswordError,
  listOnePasswordVaults,
  loadOnePasswordSettings,
  saveOnePasswordSettings,
} from "../lib/onepassword";
import { OnePasswordVault } from "../types";
import { CheckCircle, KeyRound, Loader2 } from "lucide-react";

interface OnePasswordSettingsProps {
  onConfiguredChange?: (configured: boolean) => void;
}

export function OnePasswordSettings({
  onConfiguredChange,
}: OnePasswordSettingsProps) {
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

  const selectedVault = vaults.find((vault) => vault.id === vaultId) ?? null;
  const isConfigured = selectedVault !== null;

  const persistSelection = (
    name: string,
    vault: Pick<OnePasswordVault, "id" | "title">,
  ) => {
    saveOnePasswordSettings(name, vault);
    onConfiguredChange?.(true);
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
      if (nextVaults.length === 0) {
        error("No vaults found. Create a Dotenvx vault, then try again.");
        return;
      }

      setVaults(nextVaults);
      const stillThere = nextVaults.find((vault) => vault.id === vaultId);
      const nextVault = stillThere ?? nextVaults[0];

      setVaultId(nextVault.id);
      persistSelection(accountName, nextVault);
    } catch (err) {
      error(formatOnePasswordError(err));
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
      error(formatOnePasswordError(err));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDisconnect = () => {
    clearOnePasswordSettings();
    setVaults([]);
    setVaultId("");
    onConfiguredChange?.(false);
    success("1Password disconnected");
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4" />
        1Password
      </div>

      {selectedVault ? (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle className="size-4" />
          Connected · saving to {selectedVault.title}
        </div>
      ) : (
        <ol className="space-y-2">
          <SetupStep n={1}>
            In the 1Password app, open Settings → Developer and turn on
            Integrate with other apps.
          </SetupStep>
          <SetupStep n={2}>
            Copy the account name from the 1Password sidebar.
          </SetupStep>
          <SetupStep n={3}>
            Connect below and pick a vault, or create a Dotenvx vault.
          </SetupStep>
        </ol>
      )}

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
          {isConnecting
            ? "Connecting…"
            : isConfigured
              ? "Refresh vaults"
              : "Connect"}
        </Button>
        <Button
          onClick={handleCreateVault}
          disabled={isConnecting || isCreating}
          variant="outline"
          size="sm"
        >
          {isCreating ? "Creating…" : "Create Dotenvx vault"}
        </Button>
        {isConfigured && (
          <Button
            onClick={handleDisconnect}
            disabled={isConnecting || isCreating}
            variant="ghost"
            size="sm"
          >
            Disconnect
          </Button>
        )}
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
    </section>
  );
}

function SetupStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm text-muted-foreground">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-foreground">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
