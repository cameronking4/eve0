import { getProjectRoot } from "@/lib/config";
import { exportProject, openForgeProject } from "@forge/core";
import { NextResponse } from "next/server";
import { join } from "node:path";

export async function POST(req: Request) {
  const body = (await req.json()) as { path?: string };
  const root = await getProjectRoot();
  const output = body.path ?? join(root, "forge-export");
  try {
    const project = await openForgeProject(root);
    const result = await exportProject(project, output);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
