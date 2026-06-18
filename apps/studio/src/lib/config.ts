import { cookies } from "next/headers";
import { resolve } from "node:path";
import {
  discoverEveAgentsCached,
  getLastForgeProject,
  isEveProjectRoot,
} from "@forge/core";

const AGENT_COOKIE = "forge-agent-root";

/** Read at runtime — avoid Next inlining an empty build-time value in standalone bundles. */
function forgeProjectRootEnv(): string | undefined {
  return process.env["FORGE_PROJECT_ROOT"];
}

function forgeWorkspaceRootEnv(): string | undefined {
  return process.env["FORGE_WORKSPACE_ROOT"];
}

function getAllowedAgentRoots(): string[] {
  const workspace = forgeWorkspaceRootEnv();
  if (workspace) {
    return discoverEveAgentsCached(workspace).map((agent) => resolve(agent.root));
  }

  const envRoot = forgeProjectRootEnv();
  return envRoot && isEveProjectRoot(envRoot) ? [resolve(envRoot)] : [];
}

export async function getProjectRoot(): Promise<string> {
  const envRoot = forgeProjectRootEnv();
  const allowed = getAllowedAgentRoots();

  const cookieStore = await cookies();
  const selected = cookieStore.get(AGENT_COOKIE)?.value;
  if (selected) {
    const resolved = resolve(selected);
    if (!isEveProjectRoot(resolved)) {
      // Stale cookie from a prior session — ignore it.
    } else if (allowed.length === 0 || allowed.includes(resolved)) {
      return resolved;
    }
  }

  if (envRoot) {
    const resolved = resolve(envRoot);
    if (isEveProjectRoot(resolved)) {
      if (allowed.length === 0 || allowed.includes(resolved)) return resolved;
    }
  }

  if (allowed.length > 0) {
    return allowed[0];
  }

  const last = getLastForgeProject();
  if (last && isEveProjectRoot(last)) return last;

  const cwd = process.cwd();
  if (isEveProjectRoot(cwd)) return cwd;

  throw new Error(
    "No Eve agent project configured. Run `forge dev` from an agent directory or pass `-p <path>`.",
  );
}

export function getWorkspaceRoot(): string | undefined {
  return forgeWorkspaceRootEnv();
}

export { AGENT_COOKIE };

export function getEveUrl(): string {
  return process.env["FORGE_EVE_URL"] ?? "http://127.0.0.1:3000";
}
