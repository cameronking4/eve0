import { getProjectRoot } from "@/lib/config";
import {
  deleteSchedule,
  generateScheduleMarkdown,
  generateScheduleTypeScript,
  listSchedules,
  scheduleMarkdownPath,
  scheduleTypeScriptPath,
  stageProjectFile,
} from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const schedules = await listSchedules(root);
    return NextResponse.json({ schedules });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      cron?: string;
      prompt?: string;
      format?: "markdown" | "typescript";
    };

    if (!body.id?.trim() || !body.cron?.trim() || !body.prompt?.trim()) {
      return NextResponse.json(
        { error: "id, cron, and prompt are required" },
        { status: 400 },
      );
    }

    const root = await getProjectRoot();
    const id = body.id.trim().replace(/\.(md|ts)$/, "");
    const format = body.format ?? "markdown";
    const path =
      format === "typescript" ? scheduleTypeScriptPath(id) : scheduleMarkdownPath(id);
    const content =
      format === "typescript"
        ? generateScheduleTypeScript(body.cron.trim(), body.prompt.trim())
        : generateScheduleMarkdown(body.cron.trim(), body.prompt.trim());

    await stageProjectFile(root, path, content);

    return NextResponse.json({ ok: true, path, staged: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const root = await getProjectRoot();
    await deleteSchedule(root, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
