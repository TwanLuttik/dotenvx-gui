#!/usr/bin/env node
"use strict";

const sdk = require("@1password/sdk");
const { withUniqueFileIds } = require("./onepassword-file-ids.cjs");
const {
  FILES_SECTION,
  META_SECTION,
  PROJECT_PATH_FIELD,
  applyProjectMetadata,
  isMissingItemError,
} = require("./onepassword-save.cjs");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function ok(payload) {
  process.stdout.write(JSON.stringify({ ok: true, ...payload }));
}

function fail(error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
}

async function createClient(accountName) {
  return sdk.createClient({
    auth: new sdk.DesktopAuth(accountName),
    integrationName: "Dotenvx",
    integrationVersion: "1.0.0",
  });
}

function toUint8(content) {
  return new Uint8Array(Buffer.from(content, "utf8"));
}

async function listVaults(client) {
  const vaults = await client.vaults.list({ decryptDetails: true });
  return vaults.map((vault) => ({
    id: vault.id,
    title: vault.title,
    vaultType: vault.vaultType,
  }));
}

async function createVault(client, title, description) {
  const vault = await client.vaults.create({ title, description });
  return { id: vault.id, title: vault.title, vaultType: vault.vaultType };
}

function buildCreateParams(request) {
  return {
    category: sdk.ItemCategory.SecureNote,
    vaultId: request.vaultId,
    title: request.title,
    notes: request.notes,
    tags: ["dotenvx"],
    sections: [
      { id: META_SECTION, title: "Project" },
      { id: FILES_SECTION, title: "Environment files" },
    ],
    fields: [
      {
        id: PROJECT_PATH_FIELD,
        title: "Project path",
        fieldType: sdk.ItemFieldType.Text,
        sectionId: META_SECTION,
        value: request.projectPath,
      },
    ],
    files: withUniqueFileIds(request.files).map((file) => ({
      name: file.name,
      content: toUint8(file.content),
      sectionId: FILES_SECTION,
      fieldId: file.fieldId,
    })),
  };
}

async function replaceFiles(client, item, files) {
  let current = item;
  for (const existing of [...(current.files || [])]) {
    current = await client.items.files.delete(
      current,
      existing.sectionId,
      existing.fieldId,
    );
  }

  for (const file of withUniqueFileIds(files)) {
    current = await client.items.files.attach(current, {
      name: file.name,
      content: toUint8(file.content),
      sectionId: FILES_SECTION,
      fieldId: file.fieldId,
    });
  }

  return current;
}

async function saveProject(client, request) {
  if (request.itemId) {
    let item;
    try {
      item = await client.items.get(request.vaultId, request.itemId);
    } catch (error) {
      if (!isMissingItemError(error)) {
        throw error;
      }
    }

    if (item) {
      // Keep existing file refs on put. Stripping them made 1Password report
      // the item as missing on the next save.
      item = await client.items.put(
        applyProjectMetadata(item, request, sdk.ItemFieldType.Text),
      );
      item = await replaceFiles(client, item, request.files);
      return { itemId: item.id, vaultId: item.vaultId, title: item.title };
    }
  }

  const created = await client.items.create(buildCreateParams(request));
  return { itemId: created.id, vaultId: created.vaultId, title: created.title };
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    throw new Error("No request payload received");
  }

  const request = JSON.parse(raw);
  if (!request.accountName) {
    throw new Error("1Password account name is required");
  }

  const client = await createClient(request.accountName);

  switch (request.action) {
    case "ping":
      ok({ connected: true });
      break;
    case "listVaults":
      ok({ vaults: await listVaults(client) });
      break;
    case "createVault":
      ok({
        vault: await createVault(
          client,
          request.title || "Dotenvx",
          request.description || "Environment files saved from Dotenvx",
        ),
      });
      break;
    case "saveProject":
      ok(await saveProject(client, request));
      break;
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

main().catch(fail);
