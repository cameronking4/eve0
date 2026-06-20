import { handleEveProxyRequest } from "@/lib/eve-proxy-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleEveProxyRequest(request);
}

export async function POST(request: Request) {
  return handleEveProxyRequest(request);
}

export async function PUT(request: Request) {
  return handleEveProxyRequest(request);
}

export async function PATCH(request: Request) {
  return handleEveProxyRequest(request);
}

export async function DELETE(request: Request) {
  return handleEveProxyRequest(request);
}

export async function OPTIONS(request: Request) {
  return handleEveProxyRequest(request);
}
