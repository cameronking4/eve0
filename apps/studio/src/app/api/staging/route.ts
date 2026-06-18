import { getProjectRoot } from "@/lib/config";
import {
  getStagingManifest,
  publishAllStaged,
  publishProjectFile,
  revertAllStaged,
  revertProjectFile,
  stageProjectFile,
} from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const manifest = await getStagingManifest(root);
    return NextResponse.json({ manifest, files: Object.values(manifest.files) });
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
      action: "stage" | "publish" | "revert" | "publishAll" | "revertAll";
      path?: string;
      content?: string;
    };
    const root = await getProjectRoot();

    switch (body.action) {
      case "stage": {
        if (!body.path || body.content === undefined) {
          return NextResponse.json({ error: "path and content required" }, { status: 400 });
        }
        const manifest = await stageProjectFile(root, body.path, body.content);
        return NextResponse.json({ ok: true, manifest, files: Object.values(manifest.files) });
      }
      case "publish": {
        if (!body.path) {
          return NextResponse.json({ error: "path required" }, { status: 400 });
        }
        const manifest = await publishProjectFile(root, body.path);
        return NextResponse.json({ ok: true, manifest, files: Object.values(manifest.files) });
      }
      case "revert": {
        if (!body.path) {
          return NextResponse.json({ error: "path required" }, { status: 400 });
        }
        const manifest = await revertProjectFile(root, body.path);
        return NextResponse.json({ ok: true, manifest, files: Object.values(manifest.files) });
      }
      case "publishAll": {
        const manifest = await publishAllStaged(root);
        return NextResponse.json({ ok: true, manifest, files: [] });
      }
      case "revertAll": {
        const manifest = await revertAllStaged(root);
        return NextResponse.json({ ok: true, manifest, files: [] });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
