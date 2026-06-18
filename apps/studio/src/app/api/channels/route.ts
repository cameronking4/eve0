import { getProjectRoot } from "@/lib/config";
import {
  addChannelViaEveCli,
  CHANNEL_CATALOG,
  listChannelFiles,
  readProjectFile,
  stageProjectFile,
  verifyEveChannel,
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
      // P3/P4: the Eve channel is owned by `eve init`. Forge only verifies it.
      const { present, channels } = await verifyEveChannel(root);
      return NextResponse.json({
        ok: present,
        path: "agent/channels/eve.ts",
        created: false,
        staged: [],
        channels,
        message: present
          ? "Eve channel verified in eve info."
          : "Eve channel not found. Run `forge init` to create the base project.",
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
