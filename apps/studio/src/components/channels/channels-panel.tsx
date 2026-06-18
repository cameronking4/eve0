"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Plus, Radio } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EveChannelInfo } from "@forge/core";
import { useStaging } from "@/context/staging-context";

type ChannelCatalogItem = {
  kind: string;
  label: string;
  description: string;
  docsUrl: string;
  cli?: boolean;
};

export function ChannelsPanel({
  channels,
  onOpenFile,
  onRefresh,
}: {
  channels: EveChannelInfo[];
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
}) {
  const [catalog, setCatalog] = useState<ChannelCatalogItem[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const { refresh: refreshStaging, isStaged } = useStaging();

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/channels");
    const data = await res.json();
    setCatalog(data.catalog ?? []);
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  async function addChannel(kind: string) {
    setAdding(kind);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to add channel", {
          description: data.detail,
        });
        return;
      }
      await refreshStaging();
      const staged = (data.staged as string[] | undefined) ?? [];
      if (staged.length > 0) {
        toast.success(`Staged ${staged.length} channel file(s) — publish when ready`);
      } else {
        toast.success(data.message ?? "Channel added");
      }
      onRefresh();
    } finally {
      setAdding(null);
    }
  }

  const installedKinds = new Set(
    channels.map((c) => c.kind ?? c.id).filter(Boolean),
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Channels</h2>
        <p className="text-sm text-muted-foreground">
          Ingress surfaces where users reach your agent. Channels live in{" "}
          <code className="rounded bg-muted px-1">agent/channels/</code> per{" "}
          <a
            href="https://eve.dev/docs/reference/project-layout"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Eve project layout
          </a>
          .
        </p>
      </div>

      <div className="grid gap-3">
        {channels.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No channels yet. Add Eve for local preview, or Slack/Web for production.
            </CardContent>
          </Card>
        ) : (
          channels.map((ch) => (
            <Card key={ch.id} size="sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Radio className="size-4 text-muted-foreground" />
                  <CardTitle className="font-mono text-sm">{ch.id}</CardTitle>
                  {ch.kind && <Badge variant="outline">{ch.kind}</Badge>}
                  {ch.sourcePath && isStaged(ch.sourcePath) && (
                    <Badge variant="secondary" className="text-[10px]">
                      staged
                    </Badge>
                  )}
                </div>
                {ch.sourcePath && (
                  <CardDescription className="font-mono text-xs">{ch.sourcePath}</CardDescription>
                )}
              </CardHeader>
              {ch.sourcePath && (
                <CardContent>
                  <Button variant="outline" size="sm" onClick={() => onOpenFile(ch.sourcePath!)}>
                    Open channel file
                  </Button>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Add channel</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {catalog.map((item) => {
            const installed =
              item.kind === "eve"
                ? channels.some((c) => c.id === "eve" || c.sourcePath?.includes("eve.ts"))
                : installedKinds.has(item.kind);
            return (
              <Card key={item.kind} size="sm">
                <CardHeader>
                  <CardTitle className="text-sm">{item.label}</CardTitle>
                  <CardDescription className="text-xs">{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={adding === item.kind || (item.kind === "eve" && installed)}
                    onClick={() => addChannel(item.kind)}
                  >
                    {adding === item.kind ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Plus />
                    )}
                    {installed && item.kind === "eve" ? "Installed" : "Add"}
                  </Button>
                  <a
                    href={item.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-sm hover:bg-muted"
                  >
                    <ExternalLink className="size-4" />
                    Docs
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Slack and Web run <code className="rounded bg-muted px-1">eve channels add &lt;kind&gt; -y</code>{" "}
          under the hood. If provisioning fails, run the command in your project terminal for interactive setup.
        </p>
      </div>
    </section>
  );
}
