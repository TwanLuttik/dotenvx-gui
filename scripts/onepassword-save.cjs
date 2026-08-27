"use strict";

const FILES_SECTION = "dotenvx-files";
const META_SECTION = "dotenvx-meta";
const PROJECT_PATH_FIELD = "project_path";

function isMissingItemError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /not found|couldn't be found|could not be found|unknown item|no item|itemNotFound/i.test(
    message,
  );
}

function withDotenvxSections(sections) {
  return [
    ...(sections || []).filter(
      (section) =>
        section.id !== META_SECTION && section.id !== FILES_SECTION,
    ),
    { id: META_SECTION, title: "Project" },
    { id: FILES_SECTION, title: "Environment files" },
  ];
}

function withProjectPathField(fields, projectPath, fieldType) {
  return [
    ...(fields || []).filter((field) => field.id !== PROJECT_PATH_FIELD),
    {
      id: PROJECT_PATH_FIELD,
      title: "Project path",
      fieldType,
      sectionId: META_SECTION,
      value: projectPath,
    },
  ];
}

function applyProjectMetadata(item, request, fieldType) {
  return {
    ...item,
    title: request.title,
    notes: request.notes,
    tags: Array.from(new Set([...(item.tags || []), "dotenvx"])),
    sections: withDotenvxSections(item.sections),
    fields: withProjectPathField(item.fields, request.projectPath, fieldType),
  };
}

module.exports = {
  FILES_SECTION,
  META_SECTION,
  PROJECT_PATH_FIELD,
  applyProjectMetadata,
  isMissingItemError,
  withDotenvxSections,
  withProjectPathField,
};
