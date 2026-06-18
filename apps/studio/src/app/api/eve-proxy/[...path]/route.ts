import { ensurePreviewHost, resolvePreviewHostsManifest } from "@forge/core";
import { getProjectRoot, getWorkspaceRoot } from "@/lib/config";

async function resolveBackendOrigin(request: Request, agentRoot: string): Promise<string> {
  const workspaceRoot = getWorkspaceRoot();
  const manifest = resolvePreviewHostsManifest(workspaceRoot);
  const primaryRoot = manifest?.primaryRoot ?? process.env.FORGE_PROJECT_ROOT;
  const host = await ensurePreviewHost(agentRoot, primaryRoot, workspaceRoot);

  if (!host) {
    return new URL(request.url).origin;
  }

  return host;
}

async function proxyRequest(request: Request, pathSegments: string[]): Promise<Response> {
  const agentRoot = await getProjectRoot();
  const backendOrigin = await resolveBackendOrigin(request, agentRoot);
  const incoming = new URL(request.url);
  const targetPath = pathSegments.join("/");
  const targetUrl = `${backendOrigin.replace(/\/+$/, "")}/${targetPath}${incoming.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const response = await fetch(targetUrl, init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("transfer-encoding");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
