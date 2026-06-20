import { getProjectRoot } from "@/lib/config";
import { NextResponse } from "next/server";
import { basename } from "node:path";

function isStreamPath(pathSegments: string[]): boolean {
  return pathSegments.at(-1) === "stream";
}

const PROXY_PREFIX = "/api/eve-proxy/";

function parseProxyPath(request: Request): { pathSegments: string[]; forwardSearch: string } {
  const incoming = new URL(request.url);
  let pathParam = incoming.searchParams.get("path") ?? "";

  if (!pathParam) {
    const rewrite = request.headers.get("x-middleware-rewrite");
    if (rewrite) {
      const rewriteUrl = rewrite.startsWith("http")
        ? new URL(rewrite)
        : new URL(rewrite, incoming.origin);
      pathParam = rewriteUrl.searchParams.get("path") ?? "";
    }
  }

  if (!pathParam && incoming.pathname.startsWith(PROXY_PREFIX)) {
    pathParam = incoming.pathname.slice(PROXY_PREFIX.length);
  }

  const pathSegments = pathParam.split("/").filter(Boolean);
  const forwardParams = new URLSearchParams(incoming.searchParams);
  forwardParams.delete("path");
  const forwardSearch = forwardParams.toString();
  return { pathSegments, forwardSearch };
}

export async function handleEveProxyRequest(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const { pathSegments, forwardSearch } = parseProxyPath(request);
  const targetPath = pathSegments.join("/");

  let agentRoot: string;
  try {
    agentRoot = await getProjectRoot();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[eve-proxy] ${request.method} /${targetPath} — no agent root: ${message}`);
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const agentLabel = basename(agentRoot);

  let backendOrigin: string;
  try {
    const { resolvePreviewBackendOrigin } = await import("@/lib/preview-backend");
    backendOrigin = await resolvePreviewBackendOrigin(agentRoot, incoming.origin, {
      allowSpawn: request.method !== "GET" || !isStreamPath(pathSegments),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[eve-proxy] ${request.method} /${targetPath} — backend unavailable for ${agentLabel}: ${message}`,
    );
    return NextResponse.json(
      {
        error: message,
        hint: "Run `forge dev -p <agent-dir>` and ensure `npm install` completed in the agent project.",
      },
      { status: 502 },
    );
  }

  const targetUrl = `${backendOrigin.replace(/\/+$/, "")}/${targetPath}${
    forwardSearch ? `?${forwardSearch}` : ""
  }`;

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

  try {
    const response = await fetch(targetUrl, init);
    if (!response.ok || isStreamPath(pathSegments)) {
      console.log(
        `[eve-proxy] ${request.method} /${targetPath} → ${response.status} (${agentLabel} → ${backendOrigin})`,
      );
    }
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("transfer-encoding");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[eve-proxy] ${request.method} /${targetPath} — fetch failed for ${agentLabel}: ${message}`,
    );
    return NextResponse.json(
      {
        error: `Eve preview unreachable: ${message}`,
        hint: "Run `forge dev` from your agent directory or run `npm install` in the project.",
      },
      { status: 502 },
    );
  }
}
