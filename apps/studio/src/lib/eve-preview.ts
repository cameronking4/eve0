import { EVE_PROXY_PREFIX } from "@/lib/eve-proxy";

/**
 * Client-facing Eve host for `useEveAgent`.
 * Always routes through the Studio proxy so backend resolution is centralized
 * and works with or without withEve (onboarding, adopt-without-restart, etc.).
 */
export async function resolveEvePreviewHost(_agentRoot: string): Promise<string> {
  return EVE_PROXY_PREFIX;
}
