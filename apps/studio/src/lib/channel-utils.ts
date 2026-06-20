import type { EveChannelInfo } from "@forge/core";

export function isProtectedChannel(channel: Pick<EveChannelInfo, "id" | "sourcePath">): boolean {
  return (
    channel.id === "eve" ||
    channel.sourcePath === "agent/channels/eve.ts" ||
    channel.sourcePath?.endsWith("/channels/eve.ts") === true
  );
}
