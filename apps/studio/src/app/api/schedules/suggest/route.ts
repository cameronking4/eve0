import { getProjectRoot } from "@/lib/config";
import { completeChat, getAiApiKey, stripCodeFences } from "@/lib/ai-complete";
import type { ScheduleSuggestion } from "@/lib/schedule-suggestions";
import { loadProjectEnv, listSchedules, openForgeProject, readProjectFile, refreshManifest } from "@forge/core";
import { NextResponse } from "next/server";

const HARNESS = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);

export async function POST() {
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

    const project = await refreshManifest(await openForgeProject(projectRoot));
    const manifest = project.manifest;
    const existingSchedules = await listSchedules(projectRoot);

    let instructionsExcerpt = "";
    try {
      const instructions = await readProjectFile(projectRoot, "agent/instructions.md");
      instructionsExcerpt = instructions.slice(0, 1200);
    } catch {
      instructionsExcerpt = "";
    }

    const tools = manifest.tools
      .filter((t) => !HARNESS.has(t.name))
      .map((t) => ({ name: t.name, description: t.description ?? "" }));
    const skills = manifest.skills.map((s) => ({ id: s.id, description: s.description ?? "" }));
    const channels = manifest.channels.map((c) => ({ id: c.id, kind: c.kind ?? "" }));

    const system = `You suggest autonomous cron schedules for Eve AI agents.
Return ONLY valid JSON: { "suggestions": [ ... ] }
Each suggestion:
{
  "id": "kebab-case-unique-id",
  "title": "short human title",
  "description": "one-line subtitle",
  "cron": "5-field cron in UTC",
  "cronLabel": "human-readable schedule e.g. Every Monday at 9:00 AM UTC",
  "prompt": "detailed instruction for what the agent should do when the schedule fires",
  "rationale": "one sentence why this fits this agent"
}
Rules:
- Return 1 to 3 suggestions only
- Do NOT reuse existing schedule ids: ${existingSchedules.map((s) => s.id).join(", ") || "(none)"}
- Reference the agent's real tools/skills/channels when relevant
- Vary cadence (daily, weekly, hourly) — avoid duplicate patterns
- cron must be valid standard 5-field cron (minute hour dom month dow), UTC
- prompts should be actionable and specific to this agent's domain`;

    const user = JSON.stringify(
      {
        instructionsExcerpt,
        tools,
        skills,
        channels,
        existingSchedules: existingSchedules.map((s) => ({
          id: s.id,
          cron: s.cron,
          prompt: s.prompt.slice(0, 200),
        })),
      },
      null,
      2,
    );

    const text = await completeChat(apiKey, system, user, { temperature: 0.4 });
    const parsed = JSON.parse(stripCodeFences(text)) as { suggestions?: ScheduleSuggestion[] };
    const suggestions = (parsed.suggestions ?? [])
      .filter((s) => s.id && s.cron && s.prompt && s.title)
      .slice(0, 3)
      .map((s) => ({
        ...s,
        id: s.id.trim().replace(/\.(md|ts)$/, "").replace(/\s+/g, "-").toLowerCase(),
        cronLabel: s.cronLabel || s.cron,
      }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
