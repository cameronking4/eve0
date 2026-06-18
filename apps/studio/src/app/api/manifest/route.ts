import { getProjectRoot } from "@/lib/config";
import { openForgeProject, refreshManifest } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const project = await refreshManifest(await openForgeProject(root));
    return NextResponse.json({
      root: project.root,
      manifest: project.manifest,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
