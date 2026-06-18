import { getProjectRoot } from "@/lib/config";
import { getProjectFileTree } from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const tree = await getProjectFileTree(root);
    return NextResponse.json({ tree });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
