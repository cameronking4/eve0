import {
  isRunnableEveAgent,
  lookupPreviewHost,
  resolvePreviewHostsManifest,
  spawnEveDevServer,
} from "@forge/core";
import { getWorkspaceRoot } from "@/lib/config";
import { resolve } from "node:path";

const EVE_HEALTH_PATH = "/eve/v1/health";

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

  const manifestHost = lookupPreviewHost(resolved, manifest);
  if (manifestHost && manifestHost.length > 0 && (await isEveHealthy(manifestHost))) {
    return manifestHost;
  }

  const isPrimary = !primaryRoot || resolve(primaryRoot) === resolved;
  if (isPrimary && (await isEveHealthy(studioOrigin))) {
    return studioOrigin;
  }

  return spawnEveDevServer(resolved);
}
