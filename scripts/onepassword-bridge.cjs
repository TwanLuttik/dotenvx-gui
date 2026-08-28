#!/usr/bin/env node
"use strict";

const sdk = require("@1password/sdk");
const { withUniqueFileIds } = require("./onepassword-file-ids.cjs");
const {
  isDotenvxItem,
  matchExistingItem,
  summarizeItem,
} = require("./onepassword-match.cjs");
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

async function getItems(client, vaultId, itemIds) {
  if (itemIds.length === 0) return [];

  if (typeof client.items.getAll === "function") {
    try {
      const response = await client.items.getAll(vaultId, itemIds);
      return (response.individualResponses || [])
        .map((entry) => entry.content)
        .filter(Boolean);
    } catch {
      // Fall through to one-at-a-time fetches.
    }
  }

  const items = [];
  for (const itemId of itemIds) {
    try {
      items.push(await client.items.get(vaultId, itemId));
    } catch {
      // Skip items that disappeared between list and get.
    }
  }
  return items;
}

async function listDotenvxItems(client, vaultId) {
  const overviews = await client.items.list(vaultId, {
    type: "ByState",
    content: { active: true, archived: false },
  });
  const candidates = overviews.filter(isDotenvxItem);
  return getItems(
    client,
    vaultId,
    candidates.map((item) => item.id),
  );
}

async function findExistingItem(client, vaultId, projectPath, title) {
  const overviews = await client.items.list(vaultId, {
    type: "ByState",
    content: { active: true, archived: false },
  });
  const candidates = overviews.filter(isDotenvxItem);
  if (candidates.length === 0) return null;

  const titleMatches = title
    ? candidates.filter((item) => item.title === title)
    : [];
  const toFetch = titleMatches.length > 0 ? titleMatches : candidates;
  const items = await getItems(
    client,
    vaultId,
    toFetch.map((item) => item.id),
  );
  return matchExistingItem(items, { projectPath, title });
}

async function updateExistingItem(client, item, request) {
  // Keep existing file refs on put. Stripping them made 1Password report
  // the item as missing on the next save.
  const updated = await client.items.put(
    applyProjectMetadata(item, request, sdk.ItemFieldType.Text),
  );
  const withFiles = await replaceFiles(client, updated, request.files);
  return {
    itemId: withFiles.id,
    vaultId: withFiles.vaultId,
    title: withFiles.title,
  };
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
      return updateExistingItem(client, item, request);
    }
  }

  const existing = await findExistingItem(
    client,
    request.vaultId,
    request.projectPath,
    request.title,
  );
  if (existing) {
    return updateExistingItem(client, existing, request);
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
    case "listProjectItems":
      if (!request.vaultId) {
        throw new Error("A 1Password vault is required");
      }
      ok({
        items: (await listDotenvxItems(client, request.vaultId)).map(summarizeItem),
      });
      break;
    case "findProject":
      if (!request.vaultId) {
        throw new Error("A 1Password vault is required");
      }
      ok({
        item: summarizeItem(
          await findExistingItem(
            client,
            request.vaultId,
            request.projectPath,
            request.title,
          ),
        ),
      });
      break;
    default:
      throw new Error(`Unknown action: ${request.action}`);
  }
}

main().catch(fail);
