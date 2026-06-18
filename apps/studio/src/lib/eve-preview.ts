import { ensurePreviewHost } from "@forge/core";
import { resolve } from "node:path";
import { getWorkspaceRoot } from "@/lib/config";
import { EVE_PROXY_PREFIX } from "@/lib/eve-proxy";

/**
 * Returns same-origin proxy prefix in workspace mode, direct Eve origin otherwise, or "" for withEve.
 */
export async function resolveEvePreviewHost(agentRoot: string): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  if (workspaceRoot) {
    return EVE_PROXY_PREFIX;
  }

  const primary = process.env.FORGE_PROJECT_ROOT;
  if (primary && resolve(agentRoot) === resolve(primary)) {
    return "";
  }

  return ensurePreviewHost(agentRoot, primary, workspaceRoot);
}
