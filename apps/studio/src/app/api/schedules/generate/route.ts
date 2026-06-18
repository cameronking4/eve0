import { getProjectRoot } from "@/lib/config";
import { completeChat, getAiApiKey, stripCodeFences } from "@/lib/ai-complete";
import { loadProjectEnv, listSchedules, openForgeProject, readProjectFile, refreshManifest } from "@forge/core";
import { NextResponse } from "next/server";

const HARNESS = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);

export async function POST(request: Request) {
  try {
    const projectRoot = await getProjectRoot();
    loadProjectEnv(projectRoot);

    const apiKey = getAiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in the agent project's .env.local" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { prompt?: string };
    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const project = await refreshManifest(await openForgeProject(projectRoot));
    const manifest = project.manifest;
    const existingSchedules = await listSchedules(projectRoot);

    let instructionsExcerpt = "";
    try {
      instructionsExcerpt = (await readProjectFile(projectRoot, "agent/instructions.md")).slice(0, 800);
    } catch {
      instructionsExcerpt = "";
    }

    const tools = manifest.tools
      .filter((t) => !HARNESS.has(t.name))
      .map((t) => ({ name: t.name, description: t.description ?? "" }));

    const system = `You convert natural language into an Eve agent schedule definition.
Return ONLY valid JSON:
{
  "id": "kebab-case-name",
  "cron": "5-field cron UTC",
  "cronLabel": "human readable timing",
  "prompt": "what the agent should do when the schedule runs"
}
Rules:
- cron must be valid 5-field cron (minute hour day-of-month month day-of-week), UTC
- id must be kebab-case, unique vs existing: ${existingSchedules.map((s) => s.id).join(", ") || "(none)"}
- prompt should be specific and reference the agent's tools when relevant
- infer sensible timing from phrases like "every morning", "weekdays", "hourly"`;

    const user = JSON.stringify(
      {
        userRequest: body.prompt.trim(),
        instructionsExcerpt,
        tools,
        existingSchedules: existingSchedules.map((s) => s.id),
      },
      null,
      2,
    );

    const text = await completeChat(apiKey, system, user, { temperature: 0.2 });
    const parsed = JSON.parse(stripCodeFences(text)) as {
      id?: string;
      cron?: string;
      cronLabel?: string;
      prompt?: string;
    };

    if (!parsed.cron?.trim() || !parsed.prompt?.trim()) {
      return NextResponse.json({ error: "AI response missing cron or prompt" }, { status: 500 });
    }

    const id =
      parsed.id?.trim().replace(/\.(md|ts)$/, "").replace(/\s+/g, "-").toLowerCase() ??
      "new-schedule";

    return NextResponse.json({
      id,
      cron: parsed.cron.trim(),
      cronLabel: parsed.cronLabel?.trim() || parsed.cron.trim(),
      prompt: parsed.prompt.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
