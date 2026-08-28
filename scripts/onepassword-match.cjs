"use strict";

function normalizeProjectPath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function itemProjectPath(item) {
  const field = (item?.fields || []).find((entry) => entry.id === "project_path");
  return field?.value ? normalizeProjectPath(field.value) : "";
}

function isDotenvxItem(item) {
  const tags = item?.tags || [];
  const title = item?.title || "";
  return tags.includes("dotenvx") || title.startsWith("Dotenvx /");
}

function itemUpdatedAt(item) {
  const value = item?.updatedAt;
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(time) ? time : 0;
}

function newestItem(items) {
  return [...items].sort((left, right) => itemUpdatedAt(right) - itemUpdatedAt(left))[0] || null;
}

function matchExistingItem(items, request) {
  const candidates = (items || []).filter(isDotenvxItem);
  const projectPath = normalizeProjectPath(request?.projectPath);
  const title = request?.title || "";

  const byPath = projectPath
    ? candidates.filter((item) => itemProjectPath(item) === projectPath)
    : [];
  if (byPath.length === 1) return byPath[0];
  if (byPath.length > 1) {
    const titled = title ? byPath.filter((item) => item.title === title) : [];
    return newestItem(titled.length ? titled : byPath);
  }

  if (title) {
    const byTitle = candidates.filter((item) => item.title === title);
    if (byTitle.length === 1) return byTitle[0];
    if (byTitle.length > 1) return newestItem(byTitle);
  }

  return null;
}

function itemFileNames(item) {
  return (item?.files || [])
    .map((file) => file.attributes?.name || file.name)
    .filter(Boolean);
}

function summarizeItem(item) {
  if (!item) return null;
  const updatedAt = item.updatedAt
    ? new Date(item.updatedAt).toISOString()
    : null;
  return {
    itemId: item.id,
    vaultId: item.vaultId,
    title: item.title,
    projectPath: itemProjectPath(item) || null,
    fileNames: itemFileNames(item),
    updatedAt,
  };
}

module.exports = {
  isDotenvxItem,
  itemFileNames,
  itemProjectPath,
  matchExistingItem,
  normalizeProjectPath,
  summarizeItem,
};
