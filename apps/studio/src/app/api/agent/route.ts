import { getProjectRoot } from "@/lib/config";
import { readAgentModel, writeAgentModel } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const model = await readAgentModel(root);
    return NextResponse.json({ model });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { model: string };
  try {
    const root = await getProjectRoot();
    await writeAgentModel(root, body.model);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
