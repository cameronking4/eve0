import matter from "gray-matter";
import { join } from "node:path";
import { writeProjectFile } from "../tree.js";

export interface ScheduleData {
  id: string;
  cron: string;
  prompt: string;
  format: "markdown" | "typescript";
  sourcePath: string;
}

export function scheduleMarkdownPath(id: string): string {
  return `agent/schedules/${id}.md`;
}

export function scheduleTypeScriptPath(id: string): string {
  return `agent/schedules/${id}.ts`;
}

export function generateScheduleTypeScript(cron: string, prompt: string): string {
  return `import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: ${JSON.stringify(cron)},
  markdown: ${JSON.stringify(prompt)},
});
`;
}

export function generateScheduleMarkdown(cron: string, prompt: string): string {
  return matter.stringify(`${prompt.trim()}\n`, { cron });
}

export function serializeSchedule(schedule: ScheduleData): string {
  return schedule.format === "typescript"
    ? generateScheduleTypeScript(schedule.cron, schedule.prompt)
    : generateScheduleMarkdown(schedule.cron, schedule.prompt);
}

export async function writeSchedule(
  projectRoot: string,
  schedule: Pick<ScheduleData, "id" | "cron" | "prompt" | "format">,
): Promise<string> {
  const path =
    schedule.format === "typescript"
      ? scheduleTypeScriptPath(schedule.id)
      : scheduleMarkdownPath(schedule.id);

  const content =
    schedule.format === "typescript"
      ? generateScheduleTypeScript(schedule.cron, schedule.prompt)
      : generateScheduleMarkdown(schedule.cron, schedule.prompt);

  await writeProjectFile(projectRoot, path, content);
  return path;
}

export async function deleteSchedule(projectRoot: string, id: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  const root = join(projectRoot, "agent/schedules");
  for (const ext of [".md", ".ts"]) {
    try {
      await unlink(join(root, `${id}${ext}`));
    } catch {
      // try next extension
    }
  }
}

export async function listSchedules(projectRoot: string): Promise<ScheduleData[]> {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = join(projectRoot, "agent/schedules");
  const schedules: ScheduleData[] = [];

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const id = file.replace(/\.md$/, "");
        const raw = await readFile(join(dir, file), "utf-8");
        const parsed = matter(raw);
        schedules.push({
          id,
          cron: String(parsed.data.cron ?? ""),
          prompt: parsed.content.trim(),
          format: "markdown",
          sourcePath: `agent/schedules/${file}`,
        });
      } else if (file.endsWith(".ts")) {
        const id = file.replace(/\.ts$/, "");
        const raw = await readFile(join(dir, file), "utf-8");
        const cronMatch = raw.match(/cron:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
        const markdownMatch = raw.match(/markdown:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
        schedules.push({
          id,
          cron: cronMatch ? JSON.parse(cronMatch[1]) : "",
          prompt: markdownMatch ? JSON.parse(markdownMatch[1]) : "",
          format: "typescript",
          sourcePath: `agent/schedules/${file}`,
        });
      }
    }
  } catch {
    return [];
  }

  return schedules.sort((a, b) => a.id.localeCompare(b.id));
}
