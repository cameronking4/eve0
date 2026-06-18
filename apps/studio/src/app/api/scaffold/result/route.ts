import { NextResponse } from "next/server";
import { resolveScaffoldSession } from "@/lib/scaffold-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const session = await resolveScaffoldSession(id);
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    status: session.status,
    result: session.result ?? null,
    error: session.error ?? null,
    steps: session.steps,
    planSource: session.planSource ?? null,
  });
}
