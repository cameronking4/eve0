import { getProjectRoot } from "@/lib/config";
import { readToolInputFields } from "@forge/core";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { toolPath?: string };
    if (!body.toolPath) {
      return NextResponse.json({ error: "toolPath required" }, { status: 400 });
    }

    const root = await getProjectRoot();
    const fields = await readToolInputFields(root, body.toolPath);
    return NextResponse.json({ fields });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
