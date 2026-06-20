import { getProjectRoot } from "@/lib/config";
import { listMcpConnectionTools, loadProjectEnv } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  try {
    const root = await getProjectRoot();
    loadProjectEnv(root);
    const tools = await listMcpConnectionTools(root, path.replace(/^\/+/, ""));
    return NextResponse.json({ tools });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
