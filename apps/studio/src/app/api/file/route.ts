import { getProjectRoot } from "@/lib/config";
import { readProjectFile, writeProjectFile } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });
  try {
    const root = await getProjectRoot();
    const content = await readProjectFile(root, path);
    return NextResponse.json({ path, content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { path: string; content: string };
  if (!body.path) return NextResponse.json({ error: "path required" }, { status: 400 });
  try {
    const root = await getProjectRoot();
    await writeProjectFile(root, body.path, body.content);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
