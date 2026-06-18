import { createJiti } from "jiti";
import { join } from "node:path";

export interface ToolDebugResult {
  result: unknown;
  durationMs: number;
  trace: string[];
}

export interface ToolInputField {
  name: string;
  type: string;
  optional?: boolean;
  description?: string;
}

function createMockToolContext() {
  return {
    sessionId: "forge-debug",
    turnId: "forge-debug-turn",
    async getToken() {
      throw new Error("getToken() is not available in Forge tool debug mode");
    },
    requireAuth() {
      throw new Error("requireAuth() is not available in Forge tool debug mode");
    },
  };
}

function createProjectJiti(projectRoot: string) {
  return createJiti(join(projectRoot, "agent/agent.ts"), {
    interopDefault: true,
    fsCache: false,
    moduleCache: false,
  });
}

type LoadedTool = {
  execute?: (input: unknown, ctx: unknown) => Promise<unknown> | unknown;
  inputSchema?: { parse: (v: unknown) => unknown; shape?: Record<string, { type?: string; description?: string; isOptional?: () => boolean }> };
  description?: string;
};

async function loadProjectTool(projectRoot: string, toolRelPath: string): Promise<LoadedTool> {
  const jiti = createProjectJiti(projectRoot);
  const mod = (await jiti(join(projectRoot, toolRelPath))) as { default?: LoadedTool };
  const tool = mod.default;
  if (!tool?.execute) {
    throw new Error(`Module does not export a tool with execute(): ${toolRelPath}`);
  }
  return tool;
}

export function extractToolInputFields(tool: LoadedTool): ToolInputField[] {
  const shape = tool.inputSchema?.shape;
  if (!shape) return [];

  return Object.entries(shape).map(([name, field]) => ({
    name,
    type: field.type ?? "unknown",
    optional: typeof field.isOptional === "function" ? field.isOptional() : false,
    description: field.description,
  }));
}

export async function readToolInputFields(
  projectRoot: string,
  toolRelPath: string,
): Promise<ToolInputField[]> {
  const tool = await loadProjectTool(projectRoot, toolRelPath);
  return extractToolInputFields(tool);
}

export async function debugProjectTool(
  projectRoot: string,
  toolRelPath: string,
  input: Record<string, unknown>,
): Promise<ToolDebugResult> {
  const trace: string[] = [];
  const started = Date.now();

  trace.push(`Loading ${toolRelPath} via jiti`);
  const tool = await loadProjectTool(projectRoot, toolRelPath);

  let parsedInput: unknown = input;
  if (tool.inputSchema?.parse) {
    trace.push("Validating input with tool schema");
    parsedInput = tool.inputSchema.parse(input);
  }

  trace.push("Running execute()");
  const execute = tool.execute;
  if (!execute) {
    throw new Error(`Module does not export a tool with execute(): ${toolRelPath}`);
  }
  const result = await execute(parsedInput, createMockToolContext());
  trace.push(`Completed in ${Date.now() - started}ms`);

  return {
    result,
    durationMs: Date.now() - started,
    trace,
  };
}

export interface ToolGalleryItem {
  id: string;
  name: string;
  description: string;
  category: string;
  needsApproval?: boolean;
  inputFields: Array<{ name: string; type: "string" | "number" | "boolean"; description?: string }>;
  implementation: string;
}

export const TOOL_GALLERY: ToolGalleryItem[] = [
  {
    id: "http-fetch",
    name: "http_fetch",
    description: "Fetch JSON from an HTTP GET endpoint",
    category: "Integrations",
    inputFields: [
      { name: "url", type: "string", description: "URL to fetch" },
    ],
    implementation: `    const res = await fetch(url);
    if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
    return { data: await res.json() };`,
  },
  {
    id: "slack-notify",
    name: "slack_notify",
    description: "Post a message to Slack",
    category: "Integrations",
    needsApproval: true,
    inputFields: [
      { name: "message", type: "string" },
      { name: "channelId", type: "string", description: "Slack channel ID" },
    ],
    implementation: `    // TODO: wire Slack API with process.env.SLACK_BOT_TOKEN
    return { sent: true, channelId, message };`,
  },
  {
    id: "lookup-record",
    name: "lookup_record",
    description: "Look up a record by ID from your datastore",
    category: "Data",
    inputFields: [
      { name: "id", type: "string" },
      { name: "collection", type: "string" },
    ],
    implementation: `    return { id, collection, record: null };`,
  },
  {
    id: "run-query",
    name: "run_query",
    description: "Run a read-only SQL query",
    category: "Data",
    inputFields: [{ name: "sql", type: "string" }],
    implementation: `    return { rows: [], sql };`,
  },
];
