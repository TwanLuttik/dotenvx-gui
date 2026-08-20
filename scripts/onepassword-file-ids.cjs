"use strict";

function normalizePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function relativeFilePath(projectPath, filePath) {
  const root = normalizePath(projectPath);
  const file = normalizePath(filePath);
  if (root && (file === root || file.startsWith(`${root}/`))) {
    return file.slice(root.length + 1) || file.split("/").pop() || file;
  }
  const parts = file.split("/").filter(Boolean);
  return parts[parts.length - 1] || file;
}

function fieldIdForFile(relativePath) {
  const slug = normalizePath(relativePath)
    .replace(/^\.\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `file-${slug || "unnamed"}`;
}

function withUniqueFileIds(files) {
  const used = new Set();
  return (files || []).map((file) => {
    const relativePath = file.relativePath || file.name;
    let fieldId = fieldIdForFile(relativePath);
    if (used.has(fieldId)) {
      let suffix = 2;
      while (used.has(`${fieldId}-${suffix}`)) {
        suffix += 1;
      }
      fieldId = `${fieldId}-${suffix}`;
    }
    used.add(fieldId);
    return {
      ...file,
      relativePath,
      name: relativePath,
      fieldId,
    };
  });
}

module.exports = {
  relativeFilePath,
  fieldIdForFile,
  withUniqueFileIds,
};
