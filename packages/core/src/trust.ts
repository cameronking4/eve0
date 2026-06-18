import type { EveManifest } from "./types.js";

const WRITE_KEYWORDS = ["write", "send", "delete", "refund", "respond", "post", "update", "create", "sync", "notify"];
const HARNESS_TOOLS = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);

export type TrustSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface TrustFinding {
  id: string;
  severity: TrustSeverity;
  title: string;
  detail: string;
  sourcePath?: string;
  toolName?: string;
  action?: "require-approval" | "open-file";
}

export interface TrustReport {
  score: number;
  findings: TrustFinding[];
  summary: {
    authoredTools: number;
    toolsNeedingApproval: number;
    writeCapableWithoutApproval: number;
    schedules: number;
    channels: number;
    connections: number;
  };
}

function isWriteCapable(name: string, description?: string): boolean {
  const text = `${name} ${description ?? ""}`.toLowerCase();
  return WRITE_KEYWORDS.some((k) => text.includes(k));
}

export function buildTrustReport(manifest: EveManifest): TrustReport {
  const findings: TrustFinding[] = [];
  const authoredTools = manifest.tools.filter((t) => t.sourcePath && !HARNESS_TOOLS.has(t.name));

  let writeCapableWithoutApproval = 0;
  let toolsNeedingApproval = 0;

  for (const tool of authoredTools) {
    if (tool.needsApproval) toolsNeedingApproval += 1;

    if (tool.name === "bash" || tool.name === "write_file") {
      findings.push({
        id: `harness-${tool.name}`,
        severity: "critical",
        title: `Harness tool exposed: ${tool.name}`,
        detail: "Shell and file-write harness tools can modify the host environment. Restrict in production agents.",
        toolName: tool.name,
      });
      continue;
    }

    if (isWriteCapable(tool.name, tool.description) && !tool.needsApproval) {
      writeCapableWithoutApproval += 1;
      findings.push({
        id: `approval-gap-${tool.name}`,
        severity: "high",
        title: `${tool.name} can mutate external state without approval`,
        detail: tool.description ?? "This tool appears write-capable but has no approval gate.",
        sourcePath: tool.sourcePath,
        toolName: tool.name,
        action: "require-approval",
      });
    }
  }

  for (const sched of manifest.schedules) {
    findings.push({
      id: `schedule-${sched.id}`,
      severity: "medium",
      title: `Autonomous schedule: ${sched.id}`,
      detail: sched.cron
        ? `Runs on cron ${sched.cron} (UTC) without a human in the loop.`
        : "Runs on a timer without a human in the loop.",
      sourcePath: sched.sourcePath,
      action: "open-file",
    });
  }

  for (const ch of manifest.channels) {
    findings.push({
      id: `channel-${ch.id}`,
      severity: ch.kind === "slack" ? "medium" : "low",
      title: `Ingress channel: ${ch.id}`,
      detail: `Users can reach your agent through this channel${ch.kind ? ` (${ch.kind})` : ""}. Review auth configuration.`,
      sourcePath: ch.sourcePath,
      action: "open-file",
    });
  }

  for (const conn of manifest.connections) {
    findings.push({
      id: `connection-${conn.id}`,
      severity: "high",
      title: `External connection: ${conn.id}`,
      detail: conn.description ?? "Agent can call an external integration. Verify scopes and secrets.",
      sourcePath: conn.sourcePath,
      action: "open-file",
    });
  }

  if (authoredTools.length === 0) {
    findings.push({
      id: "no-tools",
      severity: "info",
      title: "No authored tools yet",
      detail: "Add tools from the Tools gallery or scaffold them in agent/tools/.",
    });
  }

  const penalty =
    findings.filter((f) => f.severity === "critical").length * 25 +
    findings.filter((f) => f.severity === "high").length * 12 +
    findings.filter((f) => f.severity === "medium").length * 5;

  const score = Math.max(0, Math.min(100, 100 - penalty));

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return {
    score,
    findings,
    summary: {
      authoredTools: authoredTools.length,
      toolsNeedingApproval,
      writeCapableWithoutApproval,
      schedules: manifest.schedules.length,
      channels: manifest.channels.length,
      connections: manifest.connections.length,
    },
  };
}

function severityRank(severity: TrustSeverity): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    default:
      return 1;
  }
}
