import { getProjectRoot, getWorkspaceRoot } from "@/lib/config";
import { getEveAgentState } from "@forge/core";
import { basename } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let projectRoot = "";
  let mode: "missing" | "blank" | "ready" = "missing";
  try {
    projectRoot = await getProjectRoot();
    mode = getEveAgentState(projectRoot);
  } catch {
    mode = "missing";
  }

  // Where a brand-new project should be created (the dir where `forge dev` ran).
  const onboardingCwd =
    process.env["FORGE_ONBOARDING_CWD"] ||
    process.env["FORGE_PROJECT_ROOT"] ||
    process.cwd();

  return NextResponse.json({
    mode,
    projectRoot: mode === "missing" ? null : projectRoot,
    agentName: mode === "missing" ? null : basename(projectRoot),
    onboardingCwd,
    workspaceRoot: getWorkspaceRoot() ?? null,
    activeSessionId: process.env["FORGE_SCAFFOLD_SESSION"] || null,
  });
}
