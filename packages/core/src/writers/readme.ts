import { analyzeSecuritySurface } from "../security.js";
import type { EveManifest, SecurityNode } from "../types.js";

export function generateReadme(manifest: EveManifest, projectName: string): string {
  const lines = [
    `# ${projectName}`,
    "",
    "Eve agent generated and maintained with [Forge](https://github.com/forge-eve/forge).",
    "",
    "## Overview",
    "",
    manifest.model ? `- **Model:** \`${manifest.model}\`` : "",
    `- **Tools:** ${manifest.tools.length}`,
    `- **Skills:** ${manifest.skills.length}`,
    `- **Channels:** ${manifest.channels.length}`,
    `- **Schedules:** ${manifest.schedules.length}`,
    "",
  ].filter(Boolean);

  if (manifest.tools.length) {
    lines.push("## Tools", "");
    for (const tool of manifest.tools) {
      const approval = tool.needsApproval ? " (approval required)" : "";
      lines.push(`- \`${tool.name}\`${approval}${tool.description ? ` — ${tool.description}` : ""}`);
    }
    lines.push("");
  }

  if (manifest.skills.length) {
    lines.push("## Skills", "");
    for (const skill of manifest.skills) {
      lines.push(`- \`${skill.id}\`${skill.description ? ` — ${skill.description}` : ""}`);
    }
    lines.push("");
  }

  if (manifest.channels.length) {
    lines.push("## Channels", "");
    for (const ch of manifest.channels) {
      lines.push(`- \`${ch.id}\`${ch.kind ? ` (${ch.kind})` : ""}`);
    }
    lines.push("");
  }

  if (manifest.schedules.length) {
    lines.push("## Schedules", "");
    for (const s of manifest.schedules) {
      lines.push(`- \`${s.id}\`${s.cron ? ` — cron \`${s.cron}\`` : ""}`);
    }
    lines.push("");
  }

  lines.push(
    "## Development",
    "",
    "```bash",
    "pnpm dev      # or: eve dev",
    "eve eval      # run eval suite",
    "forge dev     # open Forge visual editor",
    "```",
    "",
    "## Environment",
    "",
    "Copy `.env.example` to `.env.local` and fill in required variables.",
    "",
  );

  return lines.join("\n");
}

export function generateSecurityDoc(manifest: EveManifest): string {
  const surface = analyzeSecuritySurface(manifest);
  const lines = [
    "# Security Surface",
    "",
    "Attack surface profile for this Eve agent.",
    "",
    "## Risk Summary",
    "",
    "| Risk | Count |",
    "|------|-------|",
  ];

  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const node of surface.nodes) counts[node.risk]++;
  lines.push(
    `| Critical | ${counts.critical} |`,
    `| High | ${counts.high} |`,
    `| Medium | ${counts.medium} |`,
    `| Low | ${counts.low} |`,
    "",
    "## Components",
    "",
  );

  for (const node of surface.nodes.sort((a, b) => riskScore(b.risk) - riskScore(a.risk))) {
    lines.push(
      `### ${node.label} (\`${node.kind}\`)`,
      "",
      `- **Risk:** ${node.risk}`,
      node.description ? `- **Description:** ${node.description}` : "",
      node.needsApproval ? "- **Approval:** required" : "",
      node.sourcePath ? `- **Source:** \`${node.sourcePath}\`` : "",
      "",
    );
  }

  lines.push(
    "## Recommendations",
    "",
    "- Gate destructive tools with `needsApproval: always()` from `eve/tools/approval`.",
    "- Restrict sandbox network access in `agent/sandbox/` when running untrusted code.",
    "- Use Vercel Connect for OAuth instead of hardcoding tokens in tools.",
    "",
  );

  return lines.filter(Boolean).join("\n");
}

function riskScore(risk: SecurityNode["risk"]): number {
  const scores: Record<SecurityNode["risk"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return scores[risk];
}
