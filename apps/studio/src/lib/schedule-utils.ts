import type { ScheduleData } from "@forge/core";

function generateScheduleTypeScript(cron: string, prompt: string): string {
  return `import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: ${JSON.stringify(cron)},
  markdown: ${JSON.stringify(prompt)},
});
`;
}

function generateScheduleMarkdown(cron: string, prompt: string): string {
  return `---\ncron: ${JSON.stringify(cron)}\n---\n\n${prompt.trim()}\n`;
}

export function serializeSchedule(schedule: Pick<ScheduleData, "cron" | "prompt" | "format">): string {
  return schedule.format === "typescript"
    ? generateScheduleTypeScript(schedule.cron, schedule.prompt)
    : generateScheduleMarkdown(schedule.cron, schedule.prompt);
}

export function scheduleFilePath(id: string, format: ScheduleData["format"]): string {
  return format === "typescript" ? `agent/schedules/${id}.ts` : `agent/schedules/${id}.md`;
}
