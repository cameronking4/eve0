import { access } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  CONNECTION_CATALOG,
  ensureConnection,
  getCatalogEntry,
  isValidConnectionSlug,
  listAuthoredConnections,
  type ConnectionAuthSpec,
  type ConnectionCatalogEntry,
  type ConnectionMutationResult,
  type CustomConnectionInput,
} from "eve/setup/scaffold";
import { readProjectFile } from "../tree.js";
import { stageProjectFile, stageProjectFileDeletion } from "../staging.js";
import type { StagingManifest } from "../staging.js";

const CONNECTION_FILE_PATH = /^agent\/connections\/[a-z0-9-]+\.ts$/;

function normalizeConnectionPath(sourcePath: string): string {
  return sourcePath.replace(/^\/+/, "");
}

function connectionFilePath(slug: string): string {
  return `agent/connections/${slug}.ts`;
}

async function projectPathExists(projectRoot: string, relPath: string): Promise<boolean> {
  try {
    await access(join(projectRoot, relPath));
    return true;
  } catch {
    return false;
  }
}

function assertSingleFileConnectionPath(sourcePath: string): string {
  const normalized = normalizeConnectionPath(sourcePath);
  if (!CONNECTION_FILE_PATH.test(normalized)) {
    throw new Error(
      "Only single-file MCP connections in agent/connections/<slug>.ts can be managed here.",
    );
  }
  return normalized;
}

export async function stageConnectionDeletion(
  projectRoot: string,
  sourcePath: string,
): Promise<StagingManifest> {
  const normalized = assertSingleFileConnectionPath(sourcePath);
  return stageProjectFileDeletion(projectRoot, normalized);
}

export async function renameAuthoredConnection(
  projectRoot: string,
  sourcePath: string,
  newSlug: string,
): Promise<{ oldPath: string; newPath: string; slug: string }> {
  const oldPath = assertSingleFileConnectionPath(sourcePath);

  const slug = newSlug.trim();
  if (!isValidConnectionSlug(slug)) {
    throw new Error(
      "Connection name must be lowercase letters, numbers, or hyphens (e.g. linear, my-api)",
    );
  }

  const newPath = connectionFilePath(slug);
  if (newPath === oldPath) {
    return { oldPath, newPath, slug };
  }

  if (await projectPathExists(projectRoot, newPath)) {
    throw new Error(`Connection "${slug}" already exists`);
  }

  const content = await readProjectFile(projectRoot, oldPath);
  await stageProjectFile(projectRoot, newPath, content);
  await stageProjectFileDeletion(projectRoot, oldPath);

  return { oldPath, newPath, slug };
}

export {
  CONNECTION_CATALOG,
  getCatalogEntry,
  isValidConnectionSlug,
  listAuthoredConnections,
  type ConnectionAuthSpec,
  type ConnectionCatalogEntry,
  type ConnectionMutationResult,
};

export type McpAuthKind = "none" | "connect" | "bearer-env" | "header";

export interface AddCustomMcpConnectionInput {
  slug: string;
  description: string;
  url: string;
  authKind: McpAuthKind;
  /** Vercel Connect connector id (e.g. `linear`). */
  connector?: string;
  /** Managed connector service host for `vercel connect create` (e.g. `mcp.linear.app`). */
  service?: string;
  /** Environment variable for bearer token auth. */
  envVar?: string;
  /** Request header name for API key auth. */
  headerName?: string;
  /** Environment variable supplying the header value. */
  headerEnvVar?: string;
}

function authSpecForInput(input: AddCustomMcpConnectionInput): ConnectionAuthSpec {
  switch (input.authKind) {
    case "connect":
      if (!input.connector?.trim()) {
        throw new Error("connector is required for OAuth via Vercel Connect");
      }
      return {
        kind: "connect",
        connector: input.connector.trim(),
        service: input.service?.trim() || undefined,
      };
    case "bearer-env":
      if (!input.envVar?.trim()) {
        throw new Error("envVar is required for bearer token auth");
      }
      return { kind: "bearer-env", envVar: input.envVar.trim() };
    case "header":
      if (!input.headerName?.trim() || !input.headerEnvVar?.trim()) {
        throw new Error("headerName and headerEnvVar are required for header auth");
      }
      return {
        kind: "header",
        headers: [{ header: input.headerName.trim(), envVar: input.headerEnvVar.trim() }],
      };
    case "none":
      return { kind: "none" };
    default:
      return { kind: "none" };
  }
}

export function buildCustomMcpConnectionInput(
  input: AddCustomMcpConnectionInput,
): CustomConnectionInput {
  const slug = input.slug.trim();
  if (!isValidConnectionSlug(slug)) {
    throw new Error(
      "Connection name must be lowercase letters, numbers, or hyphens (e.g. linear, my-api)",
    );
  }
  const url = input.url.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("MCP URL must use HTTP or HTTPS (Streamable HTTP or SSE). Stdio is not supported.");
  }

  return {
    slug,
    description: input.description.trim() || `MCP connection: ${slug}`,
    protocols: ["mcp"],
    mcp: { url },
    auth: authSpecForInput(input),
  };
}

async function stageConnectionMutation(
  projectRoot: string,
  result: ConnectionMutationResult,
): Promise<string[]> {
  const staged: string[] = [];

  for (const absPath of result.filesWritten) {
    const rel = relative(projectRoot, absPath).replace(/\\/g, "/");
    const content = await readProjectFile(projectRoot, rel);
    await stageProjectFile(projectRoot, rel, content);
    staged.push(rel);
  }

  for (const mutation of result.packageJsonUpdated) {
    const rel = relative(projectRoot, mutation.path).replace(/\\/g, "/");
    const content = await readProjectFile(projectRoot, rel);
    await stageProjectFile(projectRoot, rel, content);
    if (!staged.includes(rel)) staged.push(rel);
  }

  return staged;
}

export async function addMcpConnectionFromCatalog(
  projectRoot: string,
  catalogSlug: string,
  force = false,
): Promise<{ result: ConnectionMutationResult; staged: string[] }> {
  const entry = getCatalogEntry(catalogSlug);
  if (!entry) {
    throw new Error(`Unknown MCP connection: ${catalogSlug}`);
  }
  if (!entry.protocols.includes("mcp")) {
    throw new Error(`Connection "${catalogSlug}" does not support MCP`);
  }

  const result = await ensureConnection({
    projectRoot,
    protocol: "mcp",
    entry,
    force,
  });

  const staged = await stageConnectionMutation(projectRoot, result);
  return { result, staged };
}

export async function addCustomMcpConnection(
  projectRoot: string,
  input: AddCustomMcpConnectionInput,
  force = false,
): Promise<{ result: ConnectionMutationResult; staged: string[] }> {
  const entry = buildCustomMcpConnectionInput(input);

  const result = await ensureConnection({
    projectRoot,
    slug: entry.slug,
    protocol: "mcp",
    entry,
    force,
  });

  const staged = await stageConnectionMutation(projectRoot, result);
  return { result, staged };
}
