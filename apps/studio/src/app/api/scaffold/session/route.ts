import { createScaffoldSession } from "@forge/core";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { putScaffoldSession, resolveScaffoldSession } from "@/lib/scaffold-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prompt?: string; outputDir?: string };
    const prompt = body.prompt?.trim();
    const outputDir = body.outputDir?.trim();
    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    if (!outputDir) {
      return NextResponse.json({ error: "outputDir is required" }, { status: 400 });
    }
    const session = createScaffoldSession({ prompt, outputDir: resolve(outputDir) });
    putScaffoldSession(session);
    return NextResponse.json({ id: session.id, session });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const session = await resolveScaffoldSession(id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ session });
}
