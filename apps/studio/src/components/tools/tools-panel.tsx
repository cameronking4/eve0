"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Wrench } from "lucide-react";
import type { EveToolInfo } from "@forge/core";
import { ToolDebugPanel } from "@/components/tools/tool-debug-panel";
import { ToolFlowEditor } from "@/components/tools/tool-flow-editor";
import { ToolGallerySheet } from "@/components/tools/tool-gallery-sheet";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const HARNESS = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);

export function ToolsPanel({
  tools,
  onRefresh,
  onOpenFile,
  onSetApproval,
}: {
  tools: EveToolInfo[];
  onRefresh: () => void;
  onOpenFile: (path: string) => void;
  onSetApproval: (toolPath: string, mode: string) => void | Promise<void>;
}) {
  const authored = useMemo(
    () => tools.filter((t) => !HARNESS.has(t.name)),
    [tools],
  );

  const [selected, setSelected] = useState<string | null>(authored[0]?.name ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const { isStaged, refresh: refreshStaging } = useStaging();

  const tool = authored.find((t) => t.name === selected) ?? null;

  useEffect(() => {
    if (authored.length && !authored.some((t) => t.name === selected)) {
      setSelected(authored[0]?.name ?? null);
    }
  }, [authored, selected]);

  async function createTool() {
    if (!newToolName.trim()) {
      toast.error("Tool name is required");
      return;
    }
    setCreating(true);
    try {
      const name = newToolName.trim();
      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          description: newToolDesc.trim() || `Tool ${name}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create tool");
      await refreshStaging();
      toast.success("Tool staged — publish when ready");
      setNewToolName("");
      setNewToolDesc("");
      setShowCreate(false);
      setSelected(name);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="flex h-[calc(100vh-8rem)] min-h-0 gap-4">
      <div className="flex w-56 shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Tools</h2>
            <p className="text-[10px] text-muted-foreground">{authored.length} authored</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCreate((v) => !v)}>
            <Plus />
          </Button>
        </div>

        {showCreate && (
          <Card size="sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">New tool</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                placeholder="tool_name"
                value={newToolName}
                onChange={(e) => setNewToolName(e.target.value.replace(/\W/g, "_"))}
                className="h-8 font-mono text-xs"
              />
              <Input
                placeholder="description"
                value={newToolDesc}
                onChange={(e) => setNewToolDesc(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" className="w-full" disabled={creating} onClick={() => void createTool()}>
                Stage tool
              </Button>
            </CardContent>
          </Card>
        )}

        <ScrollArea className="min-h-0 flex-1 rounded-md border p-1">
          {authored.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No tools yet</p>
          ) : (
            authored.map((t) => (
              <Button
                key={t.name}
                variant={selected === t.name ? "secondary" : "ghost"}
                size="sm"
                className="mb-0.5 h-auto w-full justify-start py-1.5 font-mono text-xs"
                onClick={() => setSelected(t.name)}
              >
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                  <span className="truncate">{t.name}</span>
                  {t.sourcePath && isStaged(t.sourcePath) && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">
                      staged
                    </Badge>
                  )}
                </span>
              </Button>
            ))
          )}
        </ScrollArea>

        <div className="flex flex-col gap-1.5 [&_button]:w-full">
          <ToolGallerySheet onAdded={onRefresh} />
          <ToolFlowEditor onStaged={onRefresh} />
        </div>
      </div>

      {tool ? (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Wrench className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">{tool.name}</span>
                {tool.needsApproval && <Badge variant="destructive">approval</Badge>}
                {tool.sourcePath && isStaged(tool.sourcePath) && (
                  <Badge variant="outline">Staged</Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tool.description ?? "No description"}
              </p>
              {tool.sourcePath && (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{tool.sourcePath}</p>
              )}
            </div>
            {tool.sourcePath && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Approval</Label>
                  <Select
                    value={tool.approvalMode ?? "none"}
                    onValueChange={(v) => v && onSetApproval(tool.sourcePath!, v)}
                  >
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="always">Always</SelectItem>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="never">Never</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => onOpenFile(tool.sourcePath!)}>
                  Open file
                </Button>
                <ToolFlowEditor
                  toolPath={tool.sourcePath}
                  toolName={tool.name}
                  onStaged={onRefresh}
                />
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <ToolDebugPanel key={tool.name} tool={tool} defaultOpen />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">Select or create a tool</p>
          <div className="flex gap-2">
            <ToolGallerySheet onAdded={onRefresh} />
            <ToolFlowEditor onStaged={onRefresh} />
          </div>
        </div>
      )}
    </section>
  );
}
