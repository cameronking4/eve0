import { getProjectRoot } from "@/lib/config";
import { fileManagerName, openPathInFileManager } from "@/lib/open-folder";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ fileManager: fileManagerName() });
}

export async function POST() {
  try {
    const root = await getProjectRoot();
    await openPathInFileManager(root);
    return NextResponse.json({ ok: true, path: root, fileManager: fileManagerName() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
