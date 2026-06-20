import { getProjectRoot } from "@/lib/config";
import {
  addCustomMcpConnection,
  addMcpConnectionFromCatalog,
  CONNECTION_CATALOG,
  listAuthoredConnections,
  renameAuthoredConnection,
  stageConnectionDeletion,
  type AddCustomMcpConnectionInput,
  type McpAuthKind,
} from "@forge/core";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const root = await getProjectRoot();
    const installed = await listAuthoredConnections(root);
    return NextResponse.json({
      catalog: CONNECTION_CATALOG.map((entry) => ({
        slug: entry.slug,
        label: entry.label,
        hint: entry.hint,
        description: entry.description,
        protocols: entry.protocols,
        url: entry.mcp?.url,
        authKind: entry.auth.kind,
        connector: entry.auth.kind === "connect" ? entry.auth.connector : undefined,
      })),
      installed,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const root = await getProjectRoot();
    const body = (await req.json()) as
      | { action: "catalog"; slug: string; force?: boolean }
      | {
          action: "custom";
          slug: string;
          description: string;
          url: string;
          authKind: McpAuthKind;
          connector?: string;
          service?: string;
          envVar?: string;
          headerName?: string;
          headerEnvVar?: string;
          force?: boolean;
        }
      | { action: "rename"; sourcePath: string; newSlug: string };

    if (body.action === "catalog") {
      if (!body.slug) {
        return NextResponse.json({ error: "slug required" }, { status: 400 });
      }
      const { result, staged } = await addMcpConnectionFromCatalog(root, body.slug, body.force);
      return NextResponse.json({
        ok: true,
        result,
        staged,
        message:
          result.action === "skipped"
            ? `Connection "${result.slug}" already exists`
            : `Staged MCP connection ${result.slug}`,
      });
    }

    if (body.action === "custom") {
      const input: AddCustomMcpConnectionInput = {
        slug: body.slug,
        description: body.description,
        url: body.url,
        authKind: body.authKind,
        connector: body.connector,
        service: body.service,
        envVar: body.envVar,
        headerName: body.headerName,
        headerEnvVar: body.headerEnvVar,
      };
      const { result, staged } = await addCustomMcpConnection(root, input, body.force);
      return NextResponse.json({
        ok: true,
        result,
        staged,
        envKeysRequired: result.envKeysRequired,
        envKeysAdded: result.envKeysAdded,
        message:
          result.action === "skipped"
            ? `Connection "${result.slug}" already exists`
            : `Staged custom MCP connection ${result.slug}`,
      });
    }

    if (body.action === "rename") {
      if (!body.sourcePath || !body.newSlug?.trim()) {
        return NextResponse.json({ error: "sourcePath and newSlug required" }, { status: 400 });
      }
      const result = await renameAuthoredConnection(root, body.sourcePath, body.newSlug);
      return NextResponse.json({ ok: true, ...result, staged: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  try {
    const root = await getProjectRoot();
    await stageConnectionDeletion(root, path);
    return NextResponse.json({ ok: true, path, staged: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
