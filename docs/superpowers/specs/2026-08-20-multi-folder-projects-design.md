# Multi-folder projects and rename

Date: 2026-08-20

## Goal

A project is a named container for one or more independent folders that use dotenvx. Importing a monorepo with `api` and `next` creates one project that holds both. The project name is editable and is what 1Password uses on the next save.

## Decisions

- One picked folder becomes one project. The picked path is the project root.
- Every descendant directory that contains `.env*` files is a folder on that project. The root itself is included only if it has `.env*` files.
- Skip noise directories: `node_modules`, `.git`, `dist`, `build`, `.next`, `target`, `vendor`, `coverage`, `.turbo`, `.cache`, `out`, `tmp`, `temp`, `.vercel`, `.output`, `.nuxt`, `Pods`, and other hidden directories.
- Do not follow symlinks. Stop walking at depth 12.
- Rename is local and instant. 1Password item title (`Dotenvx / {project.name}`) updates on the next Save / Update.
- Re-importing the same root refreshes that project (keeps id, name, 1Password item id).
- Example-key validation stays per folder, not across the whole project.
- Out of scope: attaching folders from outside the imported root, auto-push on rename, importing a parent of independent repos as multiple projects.

## Data model

```ts
interface ProjectFolder {
  path: string;      // absolute directory
  envFiles: EnvFile[];
}

interface Project {
  id: string;
  name: string;      // display + 1Password title source
  path: string;      // imported root
  folders: ProjectFolder[];
  envFiles: EnvFile[]; // flattened from folders, kept in sync
  createdAt: string;
  lastModified: string;
  onePasswordItemId?: string;
}
```

`folders` is the source of truth. `envFiles` is always `folders.flatMap(f => f.envFiles)` so existing 1Password and viewer code keep working.

Env file ids are the absolute file path so two `.env` files in different folders do not collide.

On load, projects missing `folders` migrate to one folder at `project.path` using the stored `envFiles`. Refresh then rediscovers descendants.

## Discovery

Rust walks the tree and returns `{ directory, name, path }` for each `.env*` file (excluding `*.db`). The TypeScript scanner groups hits by directory, reads contents, parses variables, and validates each folder against its own `.env.example`.

## Import, refresh, rename

- Import: folder picker → scan → create project named after the last path segment (or update the existing project with the same root).
- Refresh: rescan `project.path`, replace `folders` / `envFiles`, keep name and 1Password id.
- Rename: inline edit in the sidebar. Trimmed empty names are rejected. Path does not change.

## UI

- Sidebar shows name, root path, folder count, and file count.
- Viewer groups files by folder. With multiple folders, tab labels are `{relativeFolder}/{fileName}` (`.` for env files at the project root).
- Open folder opens the selected file’s directory, or the project root if none is selected.
- Empty state tells the user to add a `.env` under the project and refresh.

## 1Password

Unchanged push model: one item per project, attachments for every secret env file across all folders. Title is `Dotenvx / {project.name}` at save time.

## Errors

A root with no `.env*` files still imports. The project is empty and the toast says no env files were found. Walk / read failures surface as import or refresh errors. Already-imported roots refresh instead of duplicating.
