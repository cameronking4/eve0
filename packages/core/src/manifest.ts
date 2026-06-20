import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { EveCliError, runEveJson } from "./eve-cli.js";
import type {
  EveChannelInfo,
  EveConnectionInfo,
  EveDiagnostic,
  EveManifest,
  EveScheduleInfo,
  EveSkillInfo,
  EveToolInfo,
} from "./types.js";

const DEFAULT_HARNESS_TOOLS = [
  "bash",
  "read_file",
  "write_file",
  "grep",
  "glob",
  "list_dir",
];

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function toolNameFromPath(path: string): string {
  return basename(path).replace(/\.ts$/i, "");
}

function skillIdFromPath(path: string): string {
  return basename(path).replace(/\.md$/i, "");
}

function agentRelativePath(logicalPath: string): string {
  const normalized = logicalPath.replace(/^\/+/, "");
  return normalized.startsWith("agent/") ? normalized : `agent/${normalized}`;
}

function parseToolEntry(entry: unknown, agentPrefix = "agent"): EveToolInfo {
  if (typeof entry === "string") {
    return {
      name: entry,
      sourcePath: `${agentPrefix}/tools/${entry}.ts`,
      needsApproval: false,
      approvalMode: "none",
    };
  }

  const raw = asRecord(entry) ?? {};
  const logicalPath = asString(raw.logicalPath) ?? asString(raw.sourcePath) ?? asString(raw.path);
  const sourcePath = logicalPath ? agentRelativePath(logicalPath) : undefined;
  const name =
    asString(raw.name) ??
    asString(raw.id) ??
    (sourcePath ? toolNameFromPath(sourcePath) : undefined) ??
    "unknown";

  const approval = raw.needsApproval ?? raw.approval;
  let approvalMode: EveToolInfo["approvalMode"] = "none";
  if (approval === true) approvalMode = "always";
  else if (typeof approval === "string") approvalMode = approval as EveToolInfo["approvalMode"];

  const definition = asRecord(raw.definition);
  const description =
    asString(raw.description) ??
    asString(definition?.description) ??
    asString(definition?.summary);

  return {
    name,
    description,
    sourcePath,
    needsApproval: approvalMode !== "none" && approvalMode !== "never",
    approvalMode,
  };
}

function parseSkillEntry(entry: unknown, agentPrefix = "agent"): EveSkillInfo {
  if (typeof entry === "string") {
    return {
      id: entry,
      sourcePath: `${agentPrefix}/skills/${entry}.md`,
    };
  }

  const raw = asRecord(entry) ?? {};
  const logicalPath = asString(raw.logicalPath) ?? asString(raw.sourcePath) ?? asString(raw.path);
  const sourcePath = logicalPath ? agentRelativePath(logicalPath) : undefined;
  const id =
    asString(raw.id) ??
    asString(raw.name) ??
    (sourcePath ? skillIdFromPath(sourcePath) : undefined) ??
    "unknown";

  const definition = asRecord(raw.definition);
  const description =
    asString(raw.description) ?? asString(definition?.description);

  return { id, description, sourcePath };
}

function parseChannel(raw: Record<string, unknown>): EveChannelInfo {
  const logicalPath = asString(raw.logicalPath) ?? asString(raw.sourcePath) ?? asString(raw.path);
  const sourcePath = logicalPath ? agentRelativePath(logicalPath) : undefined;
  return {
    id:
      asString(raw.id) ??
      asString(raw.name) ??
      (sourcePath ? basename(sourcePath).replace(/\.ts$/i, "") : "unknown"),
    kind: asString(raw.kind) ?? asString(raw.type) ?? asString(raw.sourceKind),
    sourcePath,
  };
}

function parseSchedule(raw: Record<string, unknown>): EveScheduleInfo {
  const logicalPath = asString(raw.logicalPath) ?? asString(raw.sourcePath) ?? asString(raw.path);
  const sourcePath = logicalPath ? agentRelativePath(logicalPath) : undefined;
  const definition = asRecord(raw.definition);
  const id =
    asString(raw.id) ??
    asString(raw.name) ??
    (sourcePath ? skillIdFromPath(sourcePath) : undefined) ??
    "unknown";

  return {
    id,
    cron: asString(raw.cron) ?? asString(definition?.cron),
    sourcePath,
  };
}

function parseConnection(raw: Record<string, unknown>): EveConnectionInfo {
  const logicalPath = asString(raw.logicalPath) ?? asString(raw.sourcePath) ?? asString(raw.path);
  const sourcePath = logicalPath ? agentRelativePath(logicalPath) : undefined;
  const id =
    asString(raw.connectionName) ??
    asString(raw.id) ??
    asString(raw.name) ??
    (sourcePath ? basename(sourcePath).replace(/\.ts$/i, "") : undefined) ??
    "unknown";

  const definition = asRecord(raw.definition);
  const description =
    asString(raw.description) ??
    asString(definition?.description);

  return {
    id,
    description,
    sourcePath,
  };
}

function parseDiagnostic(raw: Record<string, unknown>): EveDiagnostic {
  const severity = asString(raw.severity) ?? "info";
  return {
    severity: severity === "error" || severity === "warning" ? severity : "info",
    message: asString(raw.message) ?? "Unknown diagnostic",
    sourcePath: asString(raw.sourcePath) ?? asString(raw.path),
  };
}

function parseDiagnosticsBlock(value: unknown): EveDiagnostic[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== undefined)
      .map(parseDiagnostic);
  }

  const summary = asRecord(value) ?? asRecord(asRecord(value)?.summary);
  if (!summary) return [];

  const diagnostics: EveDiagnostic[] = [];
  const errors = typeof summary.errors === "number" ? summary.errors : 0;
  const warnings = typeof summary.warnings === "number" ? summary.warnings : 0;

  if (errors > 0) {
    diagnostics.push({
      severity: "error",
      message: `${errors} discovery error(s) — see .eve/discovery/diagnostics.json`,
    });
  }
  if (warnings > 0) {
    diagnostics.push({
      severity: "warning",
      message: `${warnings} discovery warning(s) — see .eve/discovery/diagnostics.json`,
    });
  }
  return diagnostics;
}

export async function loadDiscoveryDiagnostics(projectRoot: string): Promise<EveDiagnostic[]> {
  try {
    const content = await readFile(
      join(projectRoot, ".eve/discovery/diagnostics.json"),
      "utf-8",
    );
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return parseDiagnosticsBlock(parsed.diagnostics);
  } catch {
    return [];
  }
}

export function normalizeEveInfo(raw: Record<string, unknown>): EveManifest {
  if (raw.kind === "eve-agent-discovery-manifest") {
    return normalizeDiscoveryManifest(raw);
  }

  const agent = asRecord(raw.agent) ?? raw;
  const agentPrefix = "agent";

  const tools = asArray<unknown>(raw.tools ?? agent.tools).map((entry) =>
    parseToolEntry(entry, agentPrefix),
  );
  const skills = asArray<unknown>(raw.skills ?? agent.skills).map((entry) =>
    parseSkillEntry(entry, agentPrefix),
  );
  const channels = asArray<Record<string, unknown>>(raw.channels ?? agent.channels).map(parseChannel);
  const schedules = asArray<Record<string, unknown>>(raw.schedules ?? agent.schedules).map(parseSchedule);
  const connections = asArray<Record<string, unknown>>(raw.connections ?? agent.connections).map(
    (entry) => parseConnection(entry),
  );

  const diagnostics = [
    ...parseDiagnosticsBlock(raw.diagnostics),
    ...parseDiagnosticsBlock(raw.diagnosticsSummary),
  ];

  const model =
    asString(agent.model) ??
    asString(asRecord(agent.config)?.model) ??
    asString(raw.model);

  const name =
    asString(raw.name) ??
    asString(agent.name) ??
    asString(raw.agentId);

  return {
    name,
    model,
    tools,
    skills,
    channels,
    schedules,
    connections,
    diagnostics,
    raw,
  };
}

function normalizeDiscoveryManifest(raw: Record<string, unknown>): EveManifest {
  const diagnostics = [
    ...parseDiagnosticsBlock(raw.diagnostics),
    ...parseDiagnosticsBlock(raw.diagnosticsSummary),
  ];

  return {
    name: asString(raw.agentId),
    tools: asArray<unknown>(raw.tools).map((entry) => parseToolEntry(entry)),
    skills: asArray<unknown>(raw.skills).map((entry) => parseSkillEntry(entry)),
    channels: asArray<Record<string, unknown>>(raw.channels).map(parseChannel),
    schedules: asArray<Record<string, unknown>>(raw.schedules).map(parseSchedule),
    connections: asArray<Record<string, unknown>>(raw.connections).map((entry) =>
      parseConnection(entry),
    ),
    diagnostics,
    raw,
  };
}

export async function readCachedManifest(projectRoot: string): Promise<EveManifest | null> {
  const paths = [
    join(projectRoot, ".eve/discovery/agent-discovery-manifest.json"),
    join(projectRoot, ".eve/compile/compiled-agent-manifest.json"),
  ];

  for (const path of paths) {
    try {
      const content = await readFile(path, "utf-8");
      return normalizeEveInfo(JSON.parse(content) as Record<string, unknown>);
    } catch {
      // try next
    }
  }
  return null;
}

async function readToolDescriptionFromFile(
  projectRoot: string,
  sourcePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(projectRoot, sourcePath), "utf-8");
    const match = content.match(/description:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
    if (!match) return undefined;
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

async function readConnectionDescriptionFromFile(
  projectRoot: string,
  sourcePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(projectRoot, sourcePath), "utf-8");
    const match = content.match(/description:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
    if (!match) return undefined;
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

async function readConnectionUrlFromFile(
  projectRoot: string,
  sourcePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(projectRoot, sourcePath), "utf-8");
    const match = content.match(/url:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);
    if (!match) return undefined;
    return JSON.parse(match[1]) as string;
  } catch {
    return undefined;
  }
}

export async function fetchEveInfo(projectRoot: string): Promise<EveManifest> {
  try {
    // P4: `eve info --json` is the single source of truth.
    const raw = await runEveJson<Record<string, unknown>>(projectRoot, ["info"]);
    const info = normalizeEveInfo(raw);
    const discovery = await readCachedManifest(projectRoot);

    if (!discovery) return info;

    // P6: enrich the authoritative manifest from cached discovery (description/sourcePath only).
    return mergeManifests(info, discovery);
  } catch (error) {
    // P6: graceful degradation — fall back to cached .eve artifacts only when the CLI is unavailable.
    const cached = await readCachedManifest(projectRoot);
    if (cached) {
      return {
        ...cached,
        diagnostics: [
          {
            severity: "warning",
            message:
              "Using cached Eve manifest (eve info unavailable). Install Eve in the project or run forge dev for live diagnostics.",
          },
          ...cached.diagnostics,
        ],
      };
    }

    const hint = error instanceof EveCliError ? error.hint : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return {
      tools: [],
      skills: [],
      channels: [],
      schedules: [],
      connections: [],
      diagnostics: [
        {
          severity: "warning",
          message: `Could not run eve info: ${hint ?? message}`,
        },
      ],
    };
  }
}

function mergeManifests(info: EveManifest, discovery: EveManifest): EveManifest {
  const toolByName = new Map(discovery.tools.map((t) => [t.name, t]));
  const skillById = new Map(discovery.skills.map((s) => [s.id, s]));
  const connectionById = new Map(discovery.connections.map((c) => [c.id, c]));

  const connections =
    discovery.connections.length > 0
      ? discovery.connections.map((conn) => {
          const rich = connectionById.get(conn.id);
          if (!rich) return conn;
          return {
            ...conn,
            description: conn.description ?? rich.description,
            sourcePath: conn.sourcePath ?? rich.sourcePath,
          };
        })
      : info.connections;

  return {
    ...info,
    connections,
    tools: info.tools.map((tool) => {
      const rich = toolByName.get(tool.name);
      if (!rich) return tool;
      return {
        ...tool,
        description: tool.description ?? rich.description,
        sourcePath: tool.sourcePath ?? rich.sourcePath,
      };
    }),
    skills: info.skills.map((skill) => {
      const rich = skillById.get(skill.id);
      if (!rich) return skill;
      return {
        ...skill,
        description: skill.description ?? rich.description,
        sourcePath: skill.sourcePath ?? rich.sourcePath,
      };
    }),
  };
}

export async function enrichManifestFromDisk(
  projectRoot: string,
  manifest: EveManifest,
): Promise<EveManifest> {
  const { readToolApprovalFromFile } = await import("./writers/agent.js");

  const enrichedTools = await Promise.all(
    manifest.tools.map(async (tool) => {
      let next = { ...tool };
      const sourcePath = next.sourcePath;
      if (sourcePath) {
        const approval = await readToolApprovalFromFile(join(projectRoot, sourcePath));
        next = { ...next, ...approval };
        if (!next.description) {
          const description = await readToolDescriptionFromFile(projectRoot, sourcePath);
          if (description) next = { ...next, description };
        }
      }
      return next;
    }),
  );

  let enrichedConnections = await Promise.all(
    manifest.connections.map(async (conn) => {
      let next = { ...conn };
      if (next.sourcePath && !next.description) {
        const description = await readConnectionDescriptionFromFile(projectRoot, next.sourcePath);
        if (description) next = { ...next, description };
      }
      if (next.sourcePath && !next.url) {
        const url = await readConnectionUrlFromFile(projectRoot, next.sourcePath);
        if (url) next = { ...next, url };
      }
      return next;
    }),
  );

  if (enrichedConnections.length === 0) {
    const { listAuthoredConnections } = await import("./writers/connection.js");
    const slugs = await listAuthoredConnections(projectRoot);
    enrichedConnections = await Promise.all(
      slugs.map(async (slug) => {
        const sourcePath = `agent/connections/${slug}.ts`;
        const description = await readConnectionDescriptionFromFile(projectRoot, sourcePath);
        const url = await readConnectionUrlFromFile(projectRoot, sourcePath);
        return { id: slug, sourcePath, description, url };
      }),
    );
  }

  const existingNames = new Set(enrichedTools.map((t) => t.name));
  const harnessTools: EveToolInfo[] = DEFAULT_HARNESS_TOOLS.filter((n) => !existingNames.has(n)).map(
    (name) => ({
      name,
      description: `Default Eve harness tool: ${name}`,
      needsApproval: name === "bash" || name === "write_file",
      approvalMode: name === "bash" || name === "write_file" ? "never" : "none",
    }),
  );

  const discoveryDiagnostics = await loadDiscoveryDiagnostics(projectRoot);
  const diagnosticKeys = new Set(manifest.diagnostics.map((d) => `${d.severity}:${d.message}`));
  const mergedDiagnostics = [
    ...manifest.diagnostics,
    ...discoveryDiagnostics.filter((d) => !diagnosticKeys.has(`${d.severity}:${d.message}`)),
  ];

  return {
    ...manifest,
    tools: [...enrichedTools, ...harnessTools],
    connections: enrichedConnections,
    diagnostics: mergedDiagnostics,
  };
}
