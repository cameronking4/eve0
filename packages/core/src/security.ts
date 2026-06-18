import type { EveManifest, SecurityEdge, SecurityNode, SecuritySurface } from "./types.js";

const WRITE_KEYWORDS = ["write", "send", "delete", "refund", "respond", "post", "update", "create"];
const READ_KEYWORDS = ["read", "get", "list", "fetch", "query"];

function classifyToolRisk(name: string, description?: string, needsApproval?: boolean): SecurityNode["risk"] {
  const text = `${name} ${description ?? ""}`.toLowerCase();
  if (WRITE_KEYWORDS.some((k) => text.includes(k))) {
    return needsApproval ? "medium" : "high";
  }
  if (READ_KEYWORDS.some((k) => text.includes(k))) return "low";
  if (name === "bash" || name === "write_file") return "critical";
  if (name === "read_file" || name === "grep") return "medium";
  return "low";
}

export function analyzeSecuritySurface(manifest: EveManifest): SecuritySurface {
  const nodes: SecurityNode[] = [];
  const edges: SecurityEdge[] = [];

  const agentId = "agent:root";
  nodes.push({ id: agentId, label: manifest.name ?? "Agent", kind: "tool", risk: "low" });

  for (const tool of manifest.tools) {
    const id = `tool:${tool.name}`;
    nodes.push({
      id,
      label: tool.name,
      kind: tool.sourcePath ? "tool" : "harness",
      risk: classifyToolRisk(tool.name, tool.description, tool.needsApproval),
      sourcePath: tool.sourcePath,
      description: tool.description,
      needsApproval: tool.needsApproval,
    });
    edges.push({ from: agentId, to: id, label: "can call" });
  }

  for (const ch of manifest.channels) {
    const id = `channel:${ch.id}`;
    nodes.push({
      id,
      label: ch.id,
      kind: "channel",
      risk: "medium",
      sourcePath: ch.sourcePath,
      description: `Ingress channel${ch.kind ? `: ${ch.kind}` : ""}`,
    });
    edges.push({ from: id, to: agentId, label: "ingress" });
  }

  for (const conn of manifest.connections) {
    const id = `connection:${conn.id}`;
    nodes.push({
      id,
      label: conn.id,
      kind: "connection",
      risk: "high",
      sourcePath: conn.sourcePath,
      description: conn.description,
    });
    edges.push({ from: agentId, to: id, label: "connects" });
  }

  for (const sched of manifest.schedules) {
    const id = `schedule:${sched.id}`;
    nodes.push({
      id,
      label: sched.id,
      kind: "schedule",
      risk: "high",
      sourcePath: sched.sourcePath,
      description: sched.cron ? `Autonomous cron: ${sched.cron}` : "Autonomous trigger",
    });
    edges.push({ from: id, to: agentId, label: "triggers" });
  }

  return { nodes, edges };
}
