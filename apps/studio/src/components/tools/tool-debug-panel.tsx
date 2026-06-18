"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Sparkles, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { EveToolInfo } from "@forge/core";

export function ToolDebugPanel({
  tool,
  defaultOpen = false,
}: {
  tool: EveToolInfo;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [inputJson, setInputJson] = useState("{}");
  const [running, setRunning] = useState(false);
  const [filling, setFilling] = useState(false);
  const [fields, setFields] = useState<Array<{ name: string; type: string; optional?: boolean }>>([]);
  const [result, setResult] = useState<{
    result?: unknown;
    trace?: string[];
    durationMs?: number;
    error?: string;
  } | null>(null);

  const toolPath = tool.sourcePath;

  const sampleInput = useMemo(() => {
    const name = tool.name;
    if (name.includes("plaid") && name.includes("account")) return '{\n  "userId": "user_123"\n}';
    if (name.includes("transaction")) {
      return '{\n  "accountId": "acc_1",\n  "startDate": "2026-06-01",\n  "endDate": "2026-06-17"\n}';
    }
    return "{}";
  }, [tool.name]);

  const hasFields = fields.length > 0;

  useEffect(() => {
    if (!toolPath) return;
    void (async () => {
      try {
        const res = await fetch("/api/tools/schema", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ toolPath }),
        });
        const data = await res.json();
        if (data.fields?.length) setFields(data.fields);
      } catch {
        // schema introspection is best-effort
      }
    })();
  }, [toolPath]);

  async function fillWithAi() {
    if (!toolPath) return;
    setFilling(true);
    try {
      const res = await fetch("/api/tools/suggest-input", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolPath, toolName: tool.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI fill failed");
      if (data.fields) setFields(data.fields);
      setInputJson(JSON.stringify(data.input ?? {}, null, 2));
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setFilling(false);
    }
  }

  async function runDebug() {
    if (!toolPath) return;
    setRunning(true);
    setResult(null);
    try {
      const input = JSON.parse(inputJson) as Record<string, unknown>;
      const res = await fetch("/api/tools/debug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolPath, input }),
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

  if (!toolPath) {
    return (
      <p className="text-xs text-muted-foreground">No source file linked for this tool.</p>
    );
  }

  return (
    <Card size="sm" className="border-dashed">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Wrench className="size-4" />
            Debug: {tool.name}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Collapse" : "Expand"}
          </Button>
        </div>
        <CardDescription className="font-mono text-xs">{toolPath}</CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Input JSON</Label>
              <div className="flex gap-2">
                {hasFields && (
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
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setInputJson(sampleInput)}
                >
                  Load sample
                </Button>
              </div>
            </div>
            {hasFields && (
              <p className="text-[11px] text-muted-foreground">
                Fields: {fields.map((f) => f.name).join(", ")}
              </p>
            )}
            <Textarea
              rows={6}
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <Button size="sm" onClick={runDebug} disabled={running}>
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
      )}
    </Card>
  );
}

export function InlineToolDebug({ toolPath, toolName }: { toolPath: string; toolName: string }) {
  return (
    <ToolDebugPanel
      defaultOpen
      tool={{
        name: toolName,
        sourcePath: toolPath,
        needsApproval: false,
        approvalMode: "none",
      }}
    />
  );
}
