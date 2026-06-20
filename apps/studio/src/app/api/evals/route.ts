import { getProjectRoot } from "@/lib/config";
import { loadProjectEnv, listProjectEvals, runProjectEvals } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    loadProjectEnv(root);
    const evals = await listProjectEvals(root);
    return NextResponse.json({ evals });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const root = await getProjectRoot();
    loadProjectEnv(root);

    const body = (await req.json()) as { ids?: string[] };
    const incoming = new URL(req.url);
    const report = await runProjectEvals(root, body.ids, {
      workspaceRoot: process.env["FORGE_WORKSPACE_ROOT"],
      primaryRoot: process.env["FORGE_PROJECT_ROOT"],
      studioOrigin: incoming.origin,
    });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
