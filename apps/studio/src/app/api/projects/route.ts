import { AGENT_COOKIE, getProjectRoot, getWorkspaceRoot } from "@/lib/config";
import { resolveEvePreviewHost } from "@/lib/eve-preview";
import {
  discoverEveAgentsCached,
  ensurePreviewHost,
  fetchEveInfo,
  getLastForgeAgent,
  invalidateDiscoveryCache,
  isEveProjectRoot,
  resolvePreviewHostsManifest,
  setLastForgeAgent,
  watchWorkspaceAgents,
} from "@forge/core";
import { cookies } from "next/headers";
import { basename, resolve } from "node:path";
import { NextResponse } from "next/server";

let workspaceWatcherStarted = false;

function ensureWorkspaceWatcher(workspaceRoot: string): void {
  if (workspaceWatcherStarted) return;
  workspaceWatcherStarted = true;
  watchWorkspaceAgents(workspaceRoot, () => {
    invalidateDiscoveryCache(workspaceRoot);
  });
}

async function enrichAgents(workspaceRoot: string) {
  ensureWorkspaceWatcher(workspaceRoot);
  const agents = discoverEveAgentsCached(workspaceRoot);
  return Promise.all(
    agents.map(async (agent) => {
      let name = agent.name;
      try {
        const info = await fetchEveInfo(agent.root);
        if (info.name) name = info.name;
      } catch {
        // fall back to package.json / folder name
      }
      return { ...agent, name };
    }),
  );
}

export async function GET() {
  try {
    const workspaceRoot = getWorkspaceRoot();
    const activeRoot = await getProjectRoot();
    const isWorkspace = Boolean(workspaceRoot);

    const agents = isWorkspace && workspaceRoot ? await enrichAgents(workspaceRoot) : [];
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

    const agents = workspaceRoot ? await enrichAgents(workspaceRoot) : [];
    const previewHost = await resolveEvePreviewHost(resolved);

    return NextResponse.json({
      activeRoot: resolved,
      previewHost: previewHost || null,
      usePreviewProxy: Boolean(workspaceRoot),
      agentName: agents.find((a) => resolve(a.root) === resolved)?.name ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
