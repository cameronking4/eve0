import { getProjectRoot } from "@/lib/config";
import {
  addChannelViaEveCli,
  CHANNEL_CATALOG,
  ensureEveChannel,
  listChannelFiles,
  readProjectFile,
  stageProjectFile,
} from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const files = await listChannelFiles(root);
    return NextResponse.json({ catalog: CHANNEL_CATALOG, files });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const root = await getProjectRoot();
    const body = (await req.json()) as { kind?: string };

    if (!body.kind) {
      return NextResponse.json({ error: "kind required" }, { status: 400 });
    }

    if (body.kind === "eve") {
      const result = await ensureEveChannel(root);
      const staged: string[] = [];
      if (result.created) {
        const content = await readProjectFile(root, result.path);
        await stageProjectFile(root, result.path, content);
        staged.push(result.path);
      }
      return NextResponse.json({
        ok: true,
        path: result.path,
        created: result.created,
        staged,
        message: result.created ? "Eve channel staged." : "Eve channel already exists.",
      });
    }

    if (body.kind === "slack" || body.kind === "web") {
      const before = new Set(await listChannelFiles(root));
      const result = await addChannelViaEveCli(root, body.kind);
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `eve channels add ${body.kind} failed. Run in terminal for interactive setup.`,
            detail: (result.stderr || result.stdout).trim(),
          },
          { status: 502 },
        );
      }
      const after = await listChannelFiles(root);
      const staged: string[] = [];
      for (const path of after) {
        if (before.has(path)) continue;
        const content = await readProjectFile(root, path);
        await stageProjectFile(root, path, content);
        staged.push(path);
      }
      return NextResponse.json({
        ok: true,
        message: `${body.kind} channel staged via Eve CLI.`,
        staged,
        output: result.stdout.trim(),
      });
    }

    return NextResponse.json({ error: `Unknown channel kind: ${body.kind}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
