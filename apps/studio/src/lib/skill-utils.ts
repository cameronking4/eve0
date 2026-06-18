import type { SkillData } from "@forge/core";

export function serializeSkillFile(skill: SkillData): string {
  const desc = JSON.stringify(skill.description);
  return `---\ndescription: ${desc}\n---\n\n${skill.body.trim()}\n`;
}

export function parseSkillFile(content: string, slug: string): SkillData {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n+([\s\S]*)$/);
  let description = "";
  let body = content;
  if (fmMatch) {
    body = fmMatch[2].trim();
    const descMatch = fmMatch[1].match(/description:\s*(.+)/);
    if (descMatch) {
      try {
        description = JSON.parse(descMatch[1].trim());
      } catch {
        description = descMatch[1].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return { slug, description, body };
}

export function skillFilePath(slug: string): string {
  return `agent/skills/${slug}.md`;
}

export const SKILL_GALLERY: Array<Pick<SkillData, "slug" | "description" | "body">> = [
  {
    slug: "error-handling",
    description: "How to handle API failures and retries",
    body: `## Error handling

1. Retry idempotent reads up to 3 times with exponential backoff
2. Never retry mutations without human approval
3. Surface clear error messages with request IDs`,
  },
  {
    slug: "data-privacy",
    description: "Rules for handling user financial data",
    body: `## Data privacy

- Redact account numbers in responses (last 4 only)
- Never log full API keys or tokens
- Scope queries to the authenticated user's linked items`,
  },
  {
    slug: "escalation",
    description: "When to ask a human for help",
    body: `## Escalation

Escalate when:
- A tool returns 401/403 twice in a row
- The user requests an irreversible action
- Confidence in the answer is low after tool calls`,
  },
];
