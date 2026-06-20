import {
  isRunnableEveAgent,
  lookupPreviewHost,
  resolveActiveDevServerOrigin,
  resolvePreviewHostsManifest,
  spawnEveDevServer,
} from "@forge/core";
import { getWorkspaceRoot } from "@/lib/config";
import { basename, resolve } from "node:path";

const EVE_HEALTH_PATH = "/eve/v1/health";

export interface ResolvePreviewBackendOptions {
  /** When false, return an error instead of spawning `eve dev` (used for stream reconnects). */
  allowSpawn?: boolean;
}

async function isEveHealthy(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin.replace(/\/+$/, "")}${EVE_HEALTH_PATH}`, {
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve the Eve HTTP origin for an agent's preview chat.
 * Prefers withEve on the Studio origin when healthy; otherwise starts a
 * dedicated `eve dev --no-ui` process (covers standalone Studio bundles).
 */
export async function resolvePreviewBackendOrigin(
  agentRoot: string,
  studioOrigin: string,
  options?: ResolvePreviewBackendOptions,
): Promise<string> {
  const resolved = resolve(agentRoot);
  if (!isRunnableEveAgent(resolved)) {
    throw new Error(
      `Not a runnable Eve agent at ${resolved}. Run \`npm install\` in the project so \`eve\` is in node_modules.`,
    );
  }

  const workspaceRoot = getWorkspaceRoot();
  const manifest = resolvePreviewHostsManifest(workspaceRoot);
  const primaryRoot =
    manifest?.primaryRoot ?? process.env["FORGE_PROJECT_ROOT"];

  const active = await resolveActiveDevServerOrigin(resolved, {
    workspaceRoot: workspaceRoot ?? undefined,
    primaryRoot: primaryRoot ?? undefined,
    studioOrigin,
  });
  if (active) return active;

  const manifestHost = lookupPreviewHost(resolved, manifest);
  if (manifestHost && manifestHost.length > 0 && (await isEveHealthy(manifestHost))) {
    return manifestHost;
  }

  const isPrimary = !primaryRoot || resolve(primaryRoot) === resolved;
  if (isPrimary && (await isEveHealthy(studioOrigin))) {
    return studioOrigin;
  }

  const pendingSpawn = options?.allowSpawn !== false;
  if (!pendingSpawn) {
    throw new Error(
      `Eve preview for ${basename(resolved)} is still starting. Send a message again in a few seconds.`,
    );
  }

  return spawnEveDevServer(resolved);
}
