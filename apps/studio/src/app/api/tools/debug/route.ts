import { getProjectRoot } from "@/lib/config";
import { loadProjectEnv } from "@forge/core";
import { debugProjectTool } from "@forge/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const root = await getProjectRoot();
    loadProjectEnv(root);

    const body = (await req.json()) as {
      toolPath?: string;
      input?: Record<string, unknown>;
    };

    if (!body.toolPath) {
      return NextResponse.json({ error: "toolPath required" }, { status: 400 });
    }

    const result = await debugProjectTool(root, body.toolPath, body.input ?? {});
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
