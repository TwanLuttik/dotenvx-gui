#!/usr/bin/env node
"use strict";

const sdk = require("@1password/sdk");
const { withUniqueFileIds } = require("./onepassword-file-ids.cjs");

const FILES_SECTION = "dotenvx-files";
const META_SECTION = "dotenvx-meta";
const PROJECT_PATH_FIELD = "project_path";

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
    try {
      let item = await client.items.get(request.vaultId, request.itemId);
      const { files: _existingFiles, ...itemWithoutFiles } = item;
      item = {
        ...itemWithoutFiles,
        title: request.title,
        notes: request.notes,
        tags: Array.from(new Set([...(item.tags || []), "dotenvx"])),
        sections: [
          ...(item.sections || []).filter(
            (section) =>
              section.id !== META_SECTION && section.id !== FILES_SECTION,
          ),
          { id: META_SECTION, title: "Project" },
          { id: FILES_SECTION, title: "Environment files" },
        ],
        fields: [
          ...(item.fields || []).filter(
            (field) =>
              field.id !== PROJECT_PATH_FIELD &&
              !String(field.id || "").startsWith("file-"),
          ),
          {
            id: PROJECT_PATH_FIELD,
            title: "Project path",
            fieldType: sdk.ItemFieldType.Text,
            sectionId: META_SECTION,
            value: request.projectPath,
          },
        ],
      };
      item = await client.items.put(item);
      item = await replaceFiles(client, item, request.files);
      return { itemId: item.id, vaultId: item.vaultId, title: item.title };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/not found|unknown item|no item/i.test(message)) {
        throw error;
      }
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
