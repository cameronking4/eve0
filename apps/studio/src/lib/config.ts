import { cookies } from "next/headers";
import { resolve } from "node:path";
import { discoverEveAgentsCached, isEveProjectRoot } from "@forge/core";

const AGENT_COOKIE = "forge-agent-root";

function getAllowedAgentRoots(): string[] {
  const workspace = process.env.FORGE_WORKSPACE_ROOT;
  if (workspace) {
    return discoverEveAgentsCached(workspace).map((agent) => resolve(agent.root));
  }

  const fallback = process.env.FORGE_PROJECT_ROOT;
  return fallback ? [resolve(fallback)] : [];
}

export async function getProjectRoot(): Promise<string> {
  const fallback = process.env.FORGE_PROJECT_ROOT ?? process.cwd();
  const allowed = getAllowedAgentRoots();

  const cookieStore = await cookies();
  const selected = cookieStore.get(AGENT_COOKIE)?.value;
  if (selected) {
    const resolved = resolve(selected);
    if (allowed.length === 0) {
      if (isEveProjectRoot(resolved)) return resolved;
    } else if (allowed.includes(resolved)) {
      return resolved;
    }
  }

  if (allowed.length > 0) {
    const resolvedFallback = resolve(fallback);
    if (allowed.includes(resolvedFallback)) return resolvedFallback;
    return allowed[0];
  }

  return fallback;
}

export function getWorkspaceRoot(): string | undefined {
  return process.env.FORGE_WORKSPACE_ROOT;
}

export { AGENT_COOKIE };

export function getEveUrl(): string {
  return process.env.FORGE_EVE_URL ?? "http://127.0.0.1:3000";
}
