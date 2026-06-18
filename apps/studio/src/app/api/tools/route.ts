import { getProjectRoot } from "@/lib/config";
import {
  readProjectFile,
  scaffoldTool,
  stageProjectFile,
  writeToolApproval,
} from "@forge/core";
import type { ApprovalMode } from "@forge/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as
    | { action: "approval"; toolPath: string; mode: ApprovalMode }
    | { action: "create"; name: string; description: string; needsApproval?: boolean }
    | { action: "gallery"; name: string; content: string };

  try {
    const root = await getProjectRoot();
    if (body.action === "approval") {
      await writeToolApproval(root, body.toolPath, body.mode);
      const content = await readProjectFile(root, body.toolPath);
      await stageProjectFile(root, body.toolPath, content);
    } else if (body.action === "create") {
      await scaffoldTool(root, body.name, body.description, body.needsApproval);
      const path = `agent/tools/${body.name}.ts`;
      const content = await readProjectFile(root, path);
      await stageProjectFile(root, path, content);
    } else if (body.action === "gallery") {
      const path = `agent/tools/${body.name}.ts`;
      await stageProjectFile(root, path, body.content);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
