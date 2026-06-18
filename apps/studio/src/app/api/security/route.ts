import { getProjectRoot } from "@/lib/config";
import { buildTrustReport, openForgeProject } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const project = await openForgeProject(root);
    const report = buildTrustReport(project.manifest);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
