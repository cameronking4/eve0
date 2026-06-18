import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readProjectFile, writeProjectFile } from "./tree.js";

export interface StagedFileEntry {
  path: string;
  published: string;
  staged: string;
  stagedAt: string;
}

export interface StagingManifest {
  files: Record<string, StagedFileEntry>;
}

const FORGE_DIR = ".forge";
const MANIFEST_NAME = "staging-manifest.json";

function manifestPath(projectRoot: string): string {
  return join(projectRoot, FORGE_DIR, MANIFEST_NAME);
}

async function saveManifest(projectRoot: string, manifest: StagingManifest): Promise<void> {
  const dir = join(projectRoot, FORGE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(manifestPath(projectRoot), JSON.stringify(manifest, null, 2), "utf-8");
}

export async function getStagingManifest(projectRoot: string): Promise<StagingManifest> {
  try {
    const raw = await readFile(manifestPath(projectRoot), "utf-8");
    return JSON.parse(raw) as StagingManifest;
  } catch {
    return { files: {} };
  }
}

export function listStagedFiles(manifest: StagingManifest): StagedFileEntry[] {
  return Object.values(manifest.files);
}

export function hasStagedChanges(manifest: StagingManifest): boolean {
  return Object.keys(manifest.files).length > 0;
}

export async function stageProjectFile(
  projectRoot: string,
  relPath: string,
  content: string,
): Promise<StagingManifest> {
  const manifest = await getStagingManifest(projectRoot);
  const existing = manifest.files[relPath];

  let published: string;
  if (existing) {
    published = existing.published;
  } else {
    try {
      const prior = await readProjectFile(projectRoot, relPath);
      published = prior === content ? "" : prior;
    } catch {
      published = "";
    }
  }

  manifest.files[relPath] = {
    path: relPath,
    published,
    staged: content,
    stagedAt: new Date().toISOString(),
  };

  await writeProjectFile(projectRoot, relPath, content);
  await saveManifest(projectRoot, manifest);
  return manifest;
}

export async function publishProjectFile(
  projectRoot: string,
  relPath: string,
): Promise<StagingManifest> {
  const manifest = await getStagingManifest(projectRoot);
  const entry = manifest.files[relPath];
  if (!entry) return manifest;

  await writeProjectFile(projectRoot, relPath, entry.staged);
  delete manifest.files[relPath];
  await saveManifest(projectRoot, manifest);
  return manifest;
}

export async function revertProjectFile(
  projectRoot: string,
  relPath: string,
): Promise<StagingManifest> {
  const manifest = await getStagingManifest(projectRoot);
  const entry = manifest.files[relPath];
  if (!entry) return manifest;

  await writeProjectFile(projectRoot, relPath, entry.published);
  delete manifest.files[relPath];
  await saveManifest(projectRoot, manifest);
  return manifest;
}

export async function publishAllStaged(projectRoot: string): Promise<StagingManifest> {
  const manifest = await getStagingManifest(projectRoot);
  for (const entry of Object.values(manifest.files)) {
    await writeProjectFile(projectRoot, entry.path, entry.staged);
  }
  const cleared: StagingManifest = { files: {} };
  await saveManifest(projectRoot, cleared);
  return cleared;
}

export async function revertAllStaged(projectRoot: string): Promise<StagingManifest> {
  const manifest = await getStagingManifest(projectRoot);
  for (const entry of Object.values(manifest.files)) {
    await writeProjectFile(projectRoot, entry.path, entry.published);
  }
  const cleared: StagingManifest = { files: {} };
  await saveManifest(projectRoot, cleared);
  return cleared;
}
