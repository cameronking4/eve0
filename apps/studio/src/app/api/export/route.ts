import { getProjectRoot } from "@/lib/config";
import { exportProject, fetchEveInfo, openForgeProject } from "@forge/core";
import { NextResponse } from "next/server";
import { join } from "node:path";

export async function POST(req: Request) {
  const body = (await req.json()) as { path?: string; force?: boolean };
  const root = await getProjectRoot();
  const output = body.path ?? join(root, "forge-export");

  try {
    const manifest = await fetchEveInfo(root);
    const errors = manifest.diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 && !body.force) {
      return NextResponse.json(
        {
          error: "Export blocked: fix Eve diagnostics first or pass force: true.",
          diagnostics: errors.map((d) => d.message),
        },
        { status: 422 },
      );
    }

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
