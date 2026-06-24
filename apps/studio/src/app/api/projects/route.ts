import { AGENT_COOKIE, getProjectRoot, getWorkspaceRoot } from "@/lib/config";
import { resolveEvePreviewHost } from "@/lib/eve-preview";
import {
  discoverEveAgentsCached,
  ensurePreviewHost,
  fetchEveInfo,
  invalidateDiscoveryCache,
  isEveProjectRoot,
  resolvePreviewHostsManifest,
  setLastForgeAgent,
  watchWorkspaceAgents,
  type DiscoveredAgent,
} from "@forge/core";
import { cookies } from "next/headers";
import { basename, resolve } from "node:path";
import { NextResponse } from "next/server";

const watchedWorkspaces = new Set<string>();

function ensureWorkspaceWatcher(workspaceRoot: string): void {
  const key = resolve(workspaceRoot);
  if (watchedWorkspaces.has(key)) return;
  watchedWorkspaces.add(key);
  // Cache invalidation happens inside watchWorkspaceAgents; the callback keeps
  // the Set honest if the watcher ever needs to be re-keyed.
  watchWorkspaceAgents(key, () => {
    invalidateDiscoveryCache(key);
  });
}

/**
 * Cheap workspace agent list — driven entirely by the cached filesystem
 * discovery (folder + package.json name). Deliberately avoids `eve info` per
 * agent so this can be polled frequently without spawning child processes.
 */
function listWorkspaceAgents(workspaceRoot: string): DiscoveredAgent[] {
  ensureWorkspaceWatcher(workspaceRoot);
  return discoverEveAgentsCached(workspaceRoot);
}

export async function GET(request: Request) {
  try {
    const workspaceRoot = getWorkspaceRoot();
    const activeRoot = await getProjectRoot();
    const isWorkspace = Boolean(workspaceRoot);
    const agents = isWorkspace && workspaceRoot ? listWorkspaceAgents(workspaceRoot) : [];

    // Lightweight polling path: just the agent roster + active selection.
    if (new URL(request.url).searchParams.get("agents") === "1") {
      return NextResponse.json({
        workspaceRoot: workspaceRoot ?? null,
        activeRoot,
        isWorkspace,
        agents,
      });
    }

    const previewHost = await resolveEvePreviewHost(activeRoot);

    let agentName =
      agents.find((a) => resolve(a.root) === resolve(activeRoot))?.name ?? null;
    if (!agentName) {
      agentName = process.env["FORGE_AGENT_NAME"] ?? null;
      if (!agentName) {
        try {
          const info = await fetchEveInfo(activeRoot);
          agentName = info.name ?? basename(activeRoot);
        } catch {
          agentName = basename(activeRoot);
        }
      }
    }

    return NextResponse.json({
      workspaceRoot: workspaceRoot ?? null,
      activeRoot,
      isWorkspace,
      agents,
      previewHost: previewHost || null,
      usePreviewProxy: true,
      agentName,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { root?: string };
    const nextRoot = body.root?.trim();
    if (!nextRoot) {
      return NextResponse.json({ error: "root is required" }, { status: 400 });
    }

    const resolved = resolve(nextRoot);
    if (!isEveProjectRoot(resolved)) {
      return NextResponse.json({ error: "Not a valid Eve agent project" }, { status: 400 });
    }

    const workspaceRoot = getWorkspaceRoot();
    if (workspaceRoot) {
      const allowed = discoverEveAgentsCached(workspaceRoot).map((a) => resolve(a.root));
      if (!allowed.includes(resolved)) {
        return NextResponse.json({ error: "Agent is outside the workspace" }, { status: 403 });
      }
      setLastForgeAgent(workspaceRoot, resolved);
    }

    const cookieStore = await cookies();
    cookieStore.set(AGENT_COOKIE, resolved, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });

    if (workspaceRoot) {
      const manifest = resolvePreviewHostsManifest(workspaceRoot);
      const primaryRoot = manifest?.primaryRoot ?? process.env["FORGE_PROJECT_ROOT"];
      try {
        await ensurePreviewHost(resolved, primaryRoot, workspaceRoot);
      } catch (error) {
        console.warn(
          `[forge] Preview warmup failed for ${resolved}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const agents = workspaceRoot ? listWorkspaceAgents(workspaceRoot) : [];
    const previewHost = await resolveEvePreviewHost(resolved);

    let agentName = agents.find((a) => resolve(a.root) === resolved)?.name ?? null;
    if (!agentName) {
      try {
        agentName = (await fetchEveInfo(resolved)).name ?? basename(resolved);
      } catch {
        agentName = basename(resolved);
      }
    }

    return NextResponse.json({
      activeRoot: resolved,
      previewHost: previewHost || null,
      usePreviewProxy: Boolean(workspaceRoot),
      agentName,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
