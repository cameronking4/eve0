"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Plus, Radio, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EveChannelInfo } from "@forge/core";
import { isProtectedChannel } from "@/lib/channel-utils";
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const {
    files: stagedFiles,
    refresh: refreshStaging,
    isStaged,
    isStagedForDeletion,
    publish,
    revert,
  } = useStaging();

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

  async function removeChannel(ch: EveChannelInfo) {
    if (!ch.sourcePath) return;
    if (isProtectedChannel(ch)) {
      toast.error("The Eve channel is required for local preview and cannot be deleted.");
      return;
    }
    if (!confirm(`Delete channel ${ch.id}? The file will be removed from preview until you publish or revert.`)) {
      return;
    }

    setDeleting(ch.sourcePath);
    try {
      const res = await fetch(`/api/channels?path=${encodeURIComponent(ch.sourcePath)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to stage channel deletion");
        return;
      }
      await refreshStaging();
      toast.success(`Staged deletion of ${ch.id} — publish when ready`);
      onRefresh();
    } finally {
      setDeleting(null);
    }
  }

  async function publishChannel(path: string) {
    setBusyPath(path);
    try {
      await publish(path);
      toast.success("Channel deletion published");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusyPath(null);
    }
  }

  async function revertChannel(path: string) {
    setBusyPath(path);
    try {
      await revert(path);
      toast.message("Channel deletion reverted");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setBusyPath(null);
    }
  }

  const displayChannels = useMemo(() => {
    const byPath = new Map<string, EveChannelInfo>();
    for (const ch of channels) {
      if (ch.sourcePath) byPath.set(ch.sourcePath, ch);
      else byPath.set(ch.id, ch);
    }
    for (const entry of stagedFiles) {
      if (!entry.path.startsWith("agent/channels/") || !isStagedForDeletion(entry.path)) continue;
      if (byPath.has(entry.path)) continue;
      const id = entry.path.replace(/^agent\/channels\//, "").replace(/\.ts$/, "");
      byPath.set(entry.path, { id, sourcePath: entry.path });
    }
    return [...byPath.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [channels, stagedFiles, isStagedForDeletion]);

  const installedKinds = new Set(
    displayChannels.map((c) => c.kind ?? c.id).filter(Boolean),
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
        {displayChannels.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No channels yet. Add Eve for local preview, or Slack/Web for production.
            </CardContent>
          </Card>
        ) : (
          displayChannels.map((ch) => {
            const path = ch.sourcePath;
            const pendingDelete = path ? isStagedForDeletion(path) : false;
            const stagedEdit = path ? isStaged(path) && !pendingDelete : false;
            const protectedChannel = isProtectedChannel(ch);
            const busy = path !== undefined && busyPath === path;

            return (
              <Card key={path ?? ch.id} size="sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Radio className="size-4 text-muted-foreground" />
                    <CardTitle className="font-mono text-sm">{ch.id}</CardTitle>
                    {ch.kind && <Badge variant="outline">{ch.kind}</Badge>}
                    {pendingDelete && (
                      <Badge variant="destructive" className="text-[10px]">
                        pending deletion
                      </Badge>
                    )}
                    {stagedEdit && (
                      <Badge variant="secondary" className="text-[10px]">
                        staged
                      </Badge>
                    )}
                  </div>
                  {path && (
                    <CardDescription className="font-mono text-xs">{path}</CardDescription>
                  )}
                </CardHeader>
                {path && (
                  <CardContent className="flex flex-wrap gap-2">
                    {!pendingDelete && (
                      <Button variant="outline" size="sm" onClick={() => onOpenFile(path)}>
                        Open channel file
                      </Button>
                    )}
                    {pendingDelete ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void publishChannel(path)}
                        >
                          {busy ? <Loader2 className="animate-spin" /> : <Save />}
                          Publish deletion
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void revertChannel(path)}
                        >
                          <RotateCcw />
                          Revert
                        </Button>
                      </>
                    ) : (
                      !protectedChannel && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={deleting === path}
                          onClick={() => void removeChannel(ch)}
                        >
                          {deleting === path ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                          Delete
                        </Button>
                      )
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Add channel</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {catalog.map((item) => {
            const installed =
              item.kind === "eve"
                ? displayChannels.some((c) => c.id === "eve" || c.sourcePath?.includes("eve.ts"))
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
