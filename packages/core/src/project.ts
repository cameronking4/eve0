import { existsSync } from "node:fs";
import { join } from "node:path";
import { fetchEveInfo, enrichManifestFromDisk } from "./manifest.js";
import type { ForgeProject } from "./types.js";

export async function openForgeProject(root: string): Promise<ForgeProject> {
  const resolved = root.startsWith("~")
    ? join(process.env.HOME ?? "", root.slice(1))
    : root;

  if (!existsSync(join(resolved, "agent"))) {
    throw new Error(`Not an Eve project: missing agent/ directory at ${resolved}`);
  }

  const manifest = await enrichManifestFromDisk(resolved, await fetchEveInfo(resolved));

  return {
    root: resolved,
    agentDir: join(resolved, "agent"),
    evalsDir: join(resolved, "evals"),
    manifest,
  };
}

export async function refreshManifest(project: ForgeProject): Promise<ForgeProject> {
  const manifest = await enrichManifestFromDisk(project.root, await fetchEveInfo(project.root));
  return { ...project, manifest };
}
