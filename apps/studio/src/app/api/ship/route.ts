import { getProjectRoot } from "@/lib/config";
import { runEve } from "@forge/core";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string };
    const action = body.action?.trim();
    if (action !== "deploy") {
      return NextResponse.json(
        {
          error:
            action === "link"
              ? "Link requires an interactive terminal. Run `forge link` in your agent directory."
              : "action must be deploy",
        },
        { status: action === "link" ? 400 : 400 },
      );
    }

    const root = await getProjectRoot();
    const logs: string[] = [];
    const result = await runEve({
      cwd: root,
      args: ["deploy"],
      timeoutMs: 600_000,
      onLine: (line) => logs.push(line),
    });

    return NextResponse.json({
      exitCode: result.exitCode,
      ok: result.exitCode === 0,
      logs: logs.join("\n"),
      stderr: result.stderr,
      stdout: result.stdout,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
