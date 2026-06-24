"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, Plus } from "lucide-react";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { readForgeApiJson } from "@/lib/forge-api";

type CatalogEntry = {
  slug: string;
  label: string;
  hint?: string;
  description: string;
  url?: string;
  authKind: string;
  connector?: string;
};

type McpAuthKind = "none" | "connect" | "bearer-env" | "header";

const AUTH_LABELS: Record<McpAuthKind, string> = {
  none: "No auth",
  connect: "OAuth via Vercel Connect",
  "bearer-env": "Bearer token (env var)",
  header: "API key header (env var)",
};

export function McpConnectionSheet({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { refresh: refreshStaging } = useStaging();

  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [authKind, setAuthKind] = useState<McpAuthKind>("none");
  const [connector, setConnector] = useState("");
  const [service, setService] = useState("");
  const [envVar, setEnvVar] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerEnvVar, setHeaderEnvVar] = useState("");

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/connections");
    const data = await readForgeApiJson<{
      catalog?: CatalogEntry[];
      installed?: string[];
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(data.error ?? "Failed to load MCP catalog");
    setCatalog(data.catalog ?? []);
    setInstalled(data.installed ?? []);
  }, []);

  useEffect(() => {
    if (open) void loadCatalog().catch((e) => toast.error(String(e)));
  }, [open, loadCatalog]);

  async function addFromCatalog(entry: CatalogEntry) {
    setAdding(entry.slug);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "catalog", slug: entry.slug }),
      });
      const data = await readForgeApiJson<{
        error?: string;
        message?: string;
        envKeysRequired?: string[];
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to add MCP connection");
      await refreshStaging();
      toast.success(data.message ?? `Staged ${entry.slug}`, {
        description:
          entry.authKind === "connect"
            ? "Publish, then run vercel connect create for OAuth setup."
            : undefined,
      });
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(null);
    }
  }

  async function addCustom() {
    if (!slug.trim()) {
      toast.error("Connection name is required");
      return;
    }
    if (!url.trim()) {
      toast.error("MCP server URL is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "custom",
          slug: slug.trim(),
          description: description.trim(),
          url: url.trim(),
          authKind,
          connector: connector.trim() || undefined,
          service: service.trim() || undefined,
          envVar: envVar.trim() || undefined,
          headerName: headerName.trim() || undefined,
          headerEnvVar: headerEnvVar.trim() || undefined,
        }),
      });
      const data = await readForgeApiJson<{
        error?: string;
        message?: string;
        envKeysRequired?: string[];
      }>(res);
      if (!res.ok) throw new Error(data.error ?? "Failed to add MCP connection");
      await refreshStaging();
      const envKeys = (data.envKeysRequired as string[] | undefined) ?? [];
      toast.success(data.message ?? `Staged ${slug}`, {
        description:
          envKeys.length > 0
            ? `Add ${envKeys.join(", ")} to .env.local`
            : authKind === "connect"
              ? "Publish, then provision the Vercel Connect connector."
              : undefined,
      });
      setSlug("");
      setDescription("");
      setUrl("");
      setAuthKind("none");
      setConnector("");
      setService("");
      setEnvVar("");
      setHeaderName("");
      setHeaderEnvVar("");
      setOpen(false);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Link2 />
        Add MCP tools
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Add MCP tools</SheetTitle>
            <SheetDescription>
              MCP servers expose tools via{" "}
              <code className="rounded bg-muted px-1">agent/connections/</code> in Eve. Uses HTTP
              or SSE transport — stdio MCP only works in local Node/sandbox environments, not on
              Vercel.
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="catalog" className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="catalog">Catalog</TabsTrigger>
              <TabsTrigger value="custom">Custom URL</TabsTrigger>
            </TabsList>

            <TabsContent value="catalog" className="mt-4 space-y-3">
              {catalog.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading catalog…</p>
              ) : (
                catalog.map((entry) => {
                  const isInstalled = installed.includes(entry.slug);
                  return (
                    <Card key={entry.slug} size="sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-sm">{entry.label}</CardTitle>
                            <CardDescription>{entry.description}</CardDescription>
                          </div>
                          {entry.authKind === "connect" && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              OAuth
                            </Badge>
                          )}
                        </div>
                        {entry.url && (
                          <p className="font-mono text-[10px] text-muted-foreground">{entry.url}</p>
                        )}
                      </CardHeader>
                      <CardContent className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={adding === entry.slug || isInstalled}
                          onClick={() => void addFromCatalog(entry)}
                        >
                          {adding === entry.slug ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Plus />
                          )}
                          {isInstalled ? "Installed" : "Add connection"}
                        </Button>
                        <a
                          href="https://eve.dev/docs/connections"
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
                })
              )}
            </TabsContent>

            <TabsContent value="custom" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mcp-slug">Connection name</Label>
                <Input
                  id="mcp-slug"
                  placeholder="my-mcp-server"
                  value={slug}
                  onChange={(e) =>
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Becomes{" "}
                  <code className="rounded bg-muted px-1">
                    agent/connections/{slug || "name"}.ts
                  </code>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-desc">Description</Label>
                <Input
                  id="mcp-desc"
                  placeholder="What tools does this server provide?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcp-url">MCP server URL</Label>
                <Input
                  id="mcp-url"
                  placeholder="https://mcp.example.com/sse"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Streamable HTTP or SSE endpoint. Eve tries HTTP first, then falls back to SSE.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Authentication</Label>
                <Select value={authKind} onValueChange={(v) => v && setAuthKind(v as McpAuthKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUTH_LABELS) as McpAuthKind[]).map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {AUTH_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {authKind === "connect" && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="mcp-connector">Connect connector id</Label>
                    <Input
                      id="mcp-connector"
                      placeholder="linear"
                      value={connector}
                      onChange={(e) => setConnector(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mcp-service">Service host (optional)</Label>
                    <Input
                      id="mcp-service"
                      placeholder="mcp.linear.app"
                      value={service}
                      onChange={(e) => setService(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Used for <code className="rounded bg-muted px-1">vercel connect create</code>.
                      Defaults to the URL host.
                    </p>
                  </div>
                </div>
              )}

              {authKind === "bearer-env" && (
                <div className="space-y-2">
                  <Label htmlFor="mcp-env">Environment variable</Label>
                  <Input
                    id="mcp-env"
                    placeholder="MY_MCP_API_TOKEN"
                    value={envVar}
                    onChange={(e) => setEnvVar(e.target.value.toUpperCase().replace(/\W/g, "_"))}
                    className="font-mono text-sm"
                  />
                </div>
              )}

              {authKind === "header" && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="mcp-header">Header name</Label>
                    <Input
                      id="mcp-header"
                      placeholder="X-Api-Key"
                      value={headerName}
                      onChange={(e) => setHeaderName(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mcp-header-env">Environment variable</Label>
                    <Input
                      id="mcp-header-env"
                      placeholder="MY_API_KEY"
                      value={headerEnvVar}
                      onChange={(e) =>
                        setHeaderEnvVar(e.target.value.toUpperCase().replace(/\W/g, "_"))
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              )}

              <Button className="w-full" disabled={creating} onClick={() => void addCustom()}>
                {creating ? <Loader2 className="animate-spin" /> : <Plus />}
                Stage MCP connection
              </Button>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
