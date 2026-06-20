import { createMCPClient } from "@ai-sdk/mcp";
import { createJiti } from "jiti";
import { join, resolve } from "node:path";
import type { McpClientConnectionDefinition } from "eve/connections";

export interface McpConnectionToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpConnectionDebugResult {
  result: unknown;
  durationMs: number;
  trace: string[];
}

type LoadedMcpConnection = McpClientConnectionDefinition & {
  tools?: { allow?: readonly string[]; block?: readonly string[] };
};

type ConnectionAuth = NonNullable<McpClientConnectionDefinition["auth"]>;

const DEBUG_PRINCIPAL = { type: "app" as const };

function resolveProjectRoot(projectRoot: string): string {
  if (projectRoot.startsWith("~")) {
    return join(process.env.HOME ?? "", projectRoot.slice(1));
  }
  return resolve(projectRoot);
}

function createProjectJiti(projectRoot: string) {
  const root = resolveProjectRoot(projectRoot);
  return createJiti(join(root, "agent/agent.ts"), {
    interopDefault: true,
    fsCache: false,
    moduleCache: false,
  });
}

async function loadMcpConnection(
  projectRoot: string,
  connectionRelPath: string,
): Promise<LoadedMcpConnection> {
  const root = resolveProjectRoot(projectRoot);
  const jiti = createProjectJiti(root);
  const mod = (await jiti(join(root, connectionRelPath))) as {
    default?: LoadedMcpConnection;
  };
  const connection = mod.default;
  if (!connection?.url) {
    throw new Error(`Module does not export an MCP connection with url: ${connectionRelPath}`);
  }
  return connection;
}

async function resolveHeaderRecord(
  headers: NonNullable<McpClientConnectionDefinition["headers"]>,
): Promise<Record<string, string>> {
  if (typeof headers === "function") {
    return headers();
  }

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "function") {
      resolved[key] = await value();
    } else {
      resolved[key] = await value;
    }
  }
  return resolved;
}

async function resolveConnectionHeaders(
  connection: LoadedMcpConnection,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};

  if (connection.headers) {
    Object.assign(headers, await resolveHeaderRecord(connection.headers));
  }

  const auth = connection.auth as ConnectionAuth | undefined;
  if (auth && typeof auth.getToken === "function") {
    try {
      const token = await auth.getToken({
        principal: DEBUG_PRINCIPAL,
        connection: { url: connection.url },
      });
      if (token?.token) {
        headers.Authorization = `Bearer ${token.token}`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/authorization|auth|token|401|403/i.test(message)) {
        throw new Error(
          "Connection requires authorization. Complete OAuth in the agent preview, or configure a bearer token in .env.local.",
        );
      }
      throw error;
    }
  }

  return headers;
}

function passesToolFilter(
  toolName: string,
  filter: LoadedMcpConnection["tools"],
): boolean {
  if (!filter) return true;
  if ("allow" in filter && filter.allow) {
    return filter.allow.includes(toolName);
  }
  if ("block" in filter && filter.block) {
    return !filter.block.includes(toolName);
  }
  return true;
}

async function connectMcpClient(url: string, headers: Record<string, string>) {
  try {
    return await createMCPClient({
      transport: { type: "http", url, headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable =
      /404|405|method not allowed|not found|unsupported|transport|sse/i.test(message);
    if (!retryable) throw error;
    return createMCPClient({
      transport: { type: "sse", url, headers },
    });
  }
}

export async function listMcpConnectionTools(
  projectRoot: string,
  connectionRelPath: string,
): Promise<McpConnectionToolInfo[]> {
  const connection = await loadMcpConnection(projectRoot, connectionRelPath);
  const headers = await resolveConnectionHeaders(connection);
  const client = await connectMcpClient(connection.url, headers);

  try {
    const listed = await client.listTools();
    return listed.tools
      .filter((tool) => passesToolFilter(tool.name, connection.tools))
      .map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? {},
      }));
  } finally {
    await client.close();
  }
}

export async function debugMcpConnectionTool(
  projectRoot: string,
  connectionRelPath: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<McpConnectionDebugResult> {
  const trace: string[] = [];
  const started = Date.now();

  trace.push(`Loading ${connectionRelPath}`);
  const connection = await loadMcpConnection(projectRoot, connectionRelPath);

  trace.push(`Connecting to ${connection.url}`);
  const headers = await resolveConnectionHeaders(connection);
  const client = await connectMcpClient(connection.url, headers);

  try {
    const listed = await client.listTools();
    const visible = listed.tools.filter((tool) =>
      passesToolFilter(tool.name, connection.tools),
    );
    const definition = visible.find((tool) => tool.name === toolName);
    if (!definition) {
      throw new Error(`Tool "${toolName}" not found on connection`);
    }

    trace.push(`Executing ${toolName}`);
    const tools = client.toolsFromDefinitions({ tools: [definition] });
    const tool = tools[toolName];
    if (!tool?.execute) {
      throw new Error(`Tool "${toolName}" is not executable`);
    }

    const result = await tool.execute(input, {
      toolCallId: "forge-debug",
      messages: [],
      context: {},
    } as Parameters<NonNullable<typeof tool.execute>>[1]);

    trace.push(`Completed in ${Date.now() - started}ms`);
    return {
      result,
      durationMs: Date.now() - started,
      trace,
    };
  } finally {
    await client.close();
  }
}

export function jsonSchemaToInputFields(
  schema: Record<string, unknown>,
): Array<{ name: string; type: string; optional?: boolean; description?: string }> {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object") return [];

  const required = Array.isArray(schema.required)
    ? new Set(schema.required.filter((v): v is string => typeof v === "string"))
    : new Set<string>();

  return Object.entries(properties as Record<string, Record<string, unknown>>).map(
    ([name, field]) => ({
      name,
      type: typeof field.type === "string" ? field.type : "unknown",
      optional: !required.has(name),
      description: typeof field.description === "string" ? field.description : undefined,
    }),
  );
}
