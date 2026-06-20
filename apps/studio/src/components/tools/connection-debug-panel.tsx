"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, Sparkles, Wrench } from "lucide-react";
import type { EveConnectionInfo, McpConnectionToolInfo } from "@forge/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

function McpToolDebugPanel({
  connection,
  tool,
}: {
  connection: EveConnectionInfo;
  tool: McpConnectionToolInfo;
}) {
  const [inputJson, setInputJson] = useState("{}");
  const [running, setRunning] = useState(false);
  const [filling, setFilling] = useState(false);
  const [result, setResult] = useState<{
    result?: unknown;
    trace?: string[];
    durationMs?: number;
    error?: string;
  } | null>(null);

  const fields = Object.keys(tool.inputSchema.properties ?? {}).length > 0;

  useEffect(() => {
    setInputJson("{}");
    setResult(null);
  }, [tool.name, connection.sourcePath]);

  async function fillWithAi() {
    if (!connection.sourcePath) return;
    setFilling(true);
    try {
      const res = await fetch("/api/connections/suggest-input", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionPath: connection.sourcePath,
          toolName: tool.name,
          inputSchema: tool.inputSchema,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI fill failed");
      setInputJson(JSON.stringify(data.input ?? {}, null, 2));
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setFilling(false);
    }
  }

  async function runDebug() {
    if (!connection.sourcePath) return;
    setRunning(true);
    setResult(null);
    try {
      const input = JSON.parse(inputJson) as Record<string, unknown>;
      const res = await fetch("/api/connections/debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionPath: connection.sourcePath,
          toolName: tool.name,
          input,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Debug run failed");
      setResult(data);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card size="sm" className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wrench className="size-4" />
          Debug: {tool.name}
        </CardTitle>
        {tool.description && <CardDescription>{tool.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Input JSON</Label>
            <div className="flex gap-2">
              {fields && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  disabled={filling}
                  onClick={() => void fillWithAi()}
                >
                  {filling ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Filling…
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3" />
                      Fill with AI
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          <Textarea
            rows={6}
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <Button size="sm" onClick={() => void runDebug()} disabled={running}>
          {running ? (
            <>
              <Loader2 className="animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play />
              Run tool
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{result.durationMs}ms</Badge>
                  <span className="text-xs text-muted-foreground">Result</span>
                </div>
                <ScrollArea className="h-40 rounded border bg-background p-2">
                  <pre className="text-xs whitespace-pre-wrap">
                    {JSON.stringify(result.result, null, 2)}
                  </pre>
                </ScrollArea>
                {result.trace && (
                  <>
                    <Label className="text-xs">Trace</Label>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {result.trace.map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ConnectionDebugPanel({ connection }: { connection: EveConnectionInfo }) {
  const [tools, setTools] = useState<McpConnectionToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  useEffect(() => {
    if (!connection.sourcePath) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTools([]);
    setSelectedTool(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/connections/tools?path=${encodeURIComponent(connection.sourcePath!)}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load MCP tools");
        if (cancelled) return;
        const loaded = (data.tools as McpConnectionToolInfo[]) ?? [];
        setTools(loaded);
        setSelectedTool(loaded[0]?.name ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection.sourcePath, connection.id]);

  const activeTool = tools.find((t) => t.name === selectedTool) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Remote tools</h3>
        <p className="text-xs text-muted-foreground">
          Tools discovered from the MCP server. Select one to run with test input.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Connecting to MCP server…
        </div>
      ) : error ? (
        <Card size="sm">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : tools.length === 0 ? (
        <Card size="sm">
          <CardContent className="py-4 text-sm text-muted-foreground">
            No tools returned from this connection.
          </CardContent>
        </Card>
      ) : (
        <>
          <ScrollArea className="max-h-36 rounded-md border p-1">
            <div className="flex flex-wrap gap-1">
              {tools.map((tool) => (
                <Button
                  key={tool.name}
                  size="sm"
                  variant={selectedTool === tool.name ? "secondary" : "outline"}
                  className="h-auto font-mono text-xs"
                  onClick={() => setSelectedTool(tool.name)}
                >
                  {tool.name}
                </Button>
              ))}
            </div>
          </ScrollArea>

          {activeTool && (
            <div className="min-h-0 flex-1 overflow-auto">
              <McpToolDebugPanel
                key={`${connection.id}:${activeTool.name}`}
                connection={connection}
                tool={activeTool}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
