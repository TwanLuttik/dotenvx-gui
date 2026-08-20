# 1Password push (one item per project)

Date: 2026-08-20

## Goal

Push a project's secret env files into 1Password. Local files stay the source of truth. 1Password is a destination.

## Decisions

- Direction: push only
- Shape: one 1Password item per project, multiple file attachments
- Item type: Secure Note (Document items allow only one file)
- Repeat save: update that item in place
- Content: on-disk bytes (do not decrypt)
- Files: `.env*` and `.env.keys`; skip `.env.example`
- Vault: remember last choice in Settings
- Auth: official `@1password/sdk` with `DesktopAuth` (1Password desktop app)

## Architecture

The JS SDK is Node-only (WASM + `fs`/`os`). A bridge script (`scripts/onepassword-bridge.cjs`) runs under Node/Bun. Rust Tauri commands spawn it, pass JSON on stdin, and return JSON on stdout. The frontend never talks to the SDK directly.

Each project stores `onePasswordItemId`. Settings store `accountName`, `vaultId`, and `vaultTitle`.

Item title: `Dotenvx / {project.name}`. Tag: `dotenvx`. Notes and a text field hold the project path and last-saved time.

## Errors

Missing Node/Bun, 1Password app not running, developer integration off, or a bad account name surface as actionable messages. If the stored item was deleted, create a new item and store the new id.
