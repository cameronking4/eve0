import { AGENT_COOKIE, getWorkspaceRoot } from "@/lib/config";
import { invalidateDiscoveryCache, isEveProjectRoot, setLastForgeAgent, setLastForgeProject } from "@forge/core";
import { cookies } from "next/headers";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Handoff after scaffold/onboarding: make the new project the active agent. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { projectRoot?: string };
    const projectRoot = body.projectRoot?.trim();
    if (!projectRoot) {
      return NextResponse.json({ error: "projectRoot is required" }, { status: 400 });
    }
    const resolved = resolve(projectRoot);
    if (!isEveProjectRoot(resolved)) {
      return NextResponse.json({ error: "Not a valid Eve project" }, { status: 400 });
    }
    setLastForgeProject(resolved);
    const workspaceRoot = getWorkspaceRoot();
    if (workspaceRoot) {
      setLastForgeAgent(workspaceRoot, resolved);
      invalidateDiscoveryCache(workspaceRoot);
    }
    const cookieStore = await cookies();
    cookieStore.set(AGENT_COOKIE, resolved, { httpOnly: true, sameSite: "lax", path: "/" });
    return NextResponse.json({ ok: true, projectRoot: resolved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
