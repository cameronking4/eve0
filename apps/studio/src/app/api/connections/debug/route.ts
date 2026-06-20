import { getProjectRoot } from "@/lib/config";
import { debugMcpConnectionTool, loadProjectEnv } from "@forge/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const root = await getProjectRoot();
    loadProjectEnv(root);

    const body = (await req.json()) as {
      connectionPath?: string;
      toolName?: string;
      input?: Record<string, unknown>;
    };

    if (!body.connectionPath || !body.toolName) {
      return NextResponse.json(
        { error: "connectionPath and toolName required" },
        { status: 400 },
      );
    }

    const result = await debugMcpConnectionTool(
      root,
      body.connectionPath,
      body.toolName,
      body.input ?? {},
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
