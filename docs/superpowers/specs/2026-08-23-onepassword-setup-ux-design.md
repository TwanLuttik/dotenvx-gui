# 1Password setup UX

Date: 2026-08-23

## Goal

Stop showing 1Password chrome until the user has connected an account and vault. Make that connect flow and the usual save failures easier to understand.

## Decisions

- Hide the header save button and every sync label until Settings has both an account name and a vault.
- Settings is the only way to discover 1Password.
- Once connected, show the button and labels everywhere, including "Not synced" for projects that have not been pushed.
- Disconnect clears local 1Password settings only. Project sync metadata stays so reconnecting still shows last-save times.
- "Configured" means stored settings exist (`accountName` + `vaultId`). We do not ping the desktop app on launch.
- Map known backend/SDK failures to short messages in `formatOnePasswordError`. No new bridge APIs.

## Visibility

`isOnePasswordConfigured()` is true when `loadOnePasswordSettings()` returns a value.

Hidden when false:

- Header "Save to 1Password" / "Update 1Password" and its sync line
- Sidebar `OnePasswordSyncStatus`
- File-header `OnePasswordSyncStatus`

The Settings 1Password section always stays visible.

App holds `onePasswordConfigured` and updates it when Settings connects or disconnects so the chrome appears without a reload.

## Settings

**Not connected:** numbered steps, then account name, Connect, and Create Dotenvx vault.

1. In the 1Password app, open Settings → Developer and turn on Integrate with other apps.
2. Copy the account name from the 1Password sidebar.
3. Connect below and pick a vault, or create a Dotenvx vault.

**Connected:** status card (`Connected · saving to {vault}`), account name, vault picker, Refresh vaults, Create Dotenvx vault, Disconnect.

## Errors

`formatOnePasswordError` maps:

| Signal | Message |
| --- | --- |
| Node/Bun missing | Install Node.js or Bun, then try again. |
| Bridge script missing | Couldn't find the 1Password helper. Reinstall Dotenvx and try again. |
| Desktop app / SDK integration | Open the 1Password app and enable Settings → Developer → Integrate with other apps. |
| Bad / missing account | Check the account name in Settings. It should match the 1Password sidebar. |
| Vault gone | The saved vault is missing. Pick a vault in Settings. |
| No secret files | No secret env files to save. Example files are skipped. |
| Not configured | Connect 1Password in Settings, then save again. |
| Anything else | Original message, stripped of an `Error:` prefix. |

Connect, create vault, and save all run through this helper.

## Out of scope

- Pull from 1Password
- Auto-detect the account name
- Live "is 1Password running" status on launch
- Clearing per-project sync ids on disconnect
