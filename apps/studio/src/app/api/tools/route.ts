import { getProjectRoot } from "@/lib/config";
import {
  readProjectFile,
  renameAuthoredTool,
  scaffoldTool,
  stageProjectFile,
  stageToolDeletion,
  writeToolApproval,
} from "@forge/core";
import type { ApprovalMode } from "@forge/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = (await req.json()) as
    | { action: "approval"; toolPath: string; mode: ApprovalMode }
    | { action: "create"; name: string; description: string; needsApproval?: boolean }
    | { action: "gallery"; name: string; content: string }
    | { action: "rename"; sourcePath: string; newName: string }
    | { action: "delete"; sourcePath: string };

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
    } else if (body.action === "rename") {
      if (!body.sourcePath || !body.newName?.trim()) {
        return NextResponse.json({ error: "sourcePath and newName required" }, { status: 400 });
      }
      const result = await renameAuthoredTool(root, body.sourcePath, body.newName);
      return NextResponse.json({ ok: true, ...result, staged: true });
    } else if (body.action === "delete") {
      if (!body.sourcePath) {
        return NextResponse.json({ error: "sourcePath required" }, { status: 400 });
      }
      await stageToolDeletion(root, body.sourcePath);
      return NextResponse.json({ ok: true, path: body.sourcePath, staged: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
