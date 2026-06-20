export type DiagnosticSeverity = "error" | "warning" | "info";

export interface EveDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  sourcePath?: string;
}

export interface EveToolInfo {
  name: string;
  description?: string;
  sourcePath?: string;
  needsApproval?: boolean;
  approvalMode?: "always" | "once" | "never" | "predicate" | "none";
}

export interface EveSkillInfo {
  id: string;
  description?: string;
  sourcePath?: string;
}

export interface EveChannelInfo {
  id: string;
  kind?: string;
  sourcePath?: string;
}

export interface EveScheduleInfo {
  id: string;
  cron?: string;
  sourcePath?: string;
}

export interface EveConnectionInfo {
  id: string;
  description?: string;
  sourcePath?: string;
  url?: string;
}

export interface EveManifest {
  name?: string;
  model?: string;
  tools: EveToolInfo[];
  skills: EveSkillInfo[];
  channels: EveChannelInfo[];
  schedules: EveScheduleInfo[];
  connections: EveConnectionInfo[];
  diagnostics: EveDiagnostic[];
  raw?: Record<string, unknown>;
}

export interface ForgeProject {
  root: string;
  agentDir: string;
  evalsDir: string;
  manifest: EveManifest;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export type ApprovalMode = "always" | "once" | "never" | "none";

export interface SecurityNode {
  id: string;
  label: string;
  kind: "tool" | "channel" | "connection" | "schedule" | "harness";
  risk: "low" | "medium" | "high" | "critical";
  sourcePath?: string;
  description?: string;
  needsApproval?: boolean;
}

export interface SecurityEdge {
  from: string;
  to: string;
  label?: string;
}

export interface SecuritySurface {
  nodes: SecurityNode[];
  edges: SecurityEdge[];
}

export interface SkillData {
  slug: string;
  description: string;
  body: string;
}

export interface ExportResult {
  outputPath: string;
  files: string[];
}
