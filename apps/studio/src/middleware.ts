import { NextRequest, NextResponse } from "next/server";

const PROXY_PREFIX = "/api/eve-proxy/";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith(PROXY_PREFIX)) {
    return NextResponse.next();
  }

  const path = pathname.slice(PROXY_PREFIX.length);
  if (!path) {
    return NextResponse.json({ error: "Missing Eve proxy path" }, { status: 400 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/api/eve-proxy-handler";
  url.searchParams.set("path", path);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/api/eve-proxy/:path*",
};
