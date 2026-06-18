"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useStaging } from "@/context/staging-context";
import {
  createEmptyFlow,
  flowToToolSource,
  parseToolSource,
  toolFilePath,
  type ToolFlowField,
  type ToolFlowModel,
} from "@/lib/tool-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SortableInputField } from "@/components/tools/sortable-input-field";

export function ToolFlowEditor({
  toolPath,
  toolName,
  onStaged,
}: {
  toolPath?: string;
  toolName?: string;
  onStaged?: () => void;
}) {
  const { stage } = useStaging();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<ToolFlowModel>(() =>
    createEmptyFlow(toolName ?? "my_tool"),
  );
  const [loading, setLoading] = useState(false);
  const [staging, setStaging] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const generatedSource = useMemo(() => flowToToolSource(model), [model]);

  const loadTool = useCallback(async () => {
    if (!toolPath) {
      setModel(createEmptyFlow(toolName ?? "my_tool"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(toolPath)}`);
      const data = await res.json();
      const parsed = parseToolSource(data.content ?? "", toolName ?? "tool");
      if (parsed) setModel({ ...parsed, name: toolName ?? parsed.name });
    } finally {
      setLoading(false);
    }
  }, [toolPath, toolName]);

  useEffect(() => {
    if (open) void loadTool();
  }, [open, loadTool]);

  function updateField(id: string, patch: Partial<ToolFlowField>) {
    setModel((m) => ({
      ...m,
      inputs: m.inputs.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }

  function addField() {
    setModel((m) => ({
      ...m,
      inputs: [
        ...m.inputs,
        { id: String(Date.now()), name: `field_${m.inputs.length + 1}`, type: "string" },
      ],
    }));
  }

  function removeField(id: string) {
    setModel((m) => ({ ...m, inputs: m.inputs.filter((f) => f.id !== id) }));
  }

  async function generateWithAi(mode: "full" | "logic" = "full") {
    if (!aiPrompt.trim()) {
      toast.error("Describe what the tool should do");
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch("/api/tools/generate-flow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, model, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI generation failed");
      setModel(data.model);
      toast.success(mode === "logic" ? "Logic updated" : "Tool draft generated");
      setAiPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function stageTool() {
    const name = model.name.trim();
    if (!name) {
      toast.error("Tool name is required");
      return;
    }
    if (!/^[a-zA-Z_][\w-]*$/.test(name)) {
      toast.error("Tool name must be a valid identifier");
      return;
    }
    const badInput = model.inputs.find((f) => !/^[a-zA-Z_]\w*$/.test(f.name.trim()));
    if (badInput) {
      toast.error(`Invalid input name: ${badInput.name}`);
      return;
    }

    const path = toolPath ?? toolFilePath(name);
    setStaging(true);
    try {
      await stage(path, generatedSource);
      toast.success(`Staged ${path} — test in floating chat or debug panel`);
      setOpen(false);
      onStaged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to stage tool");
    } finally {
      setStaging(false);
    }
  }

  function handleInputDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setModel((m) => {
      const oldIndex = m.inputs.findIndex((f) => f.id === active.id);
      const newIndex = m.inputs.findIndex((f) => f.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return m;
      return { ...m, inputs: arrayMove(m.inputs, oldIndex, newIndex) };
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Wand2 />
        Visual editor
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className={cn(
            "flex h-[min(92vh,900px)] max-h-[92vh] w-[min(96vw,1440px)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0",
            "top-[4vh] left-[50%] translate-x-[-50%] translate-y-0 sm:max-w-[96vw]",
          )}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle>Tool builder</DialogTitle>
            <DialogDescription>
              Drag inputs to reorder · describe behavior in plain English · stage to test live
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading tool…
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* AI bar */}
              <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label className="text-xs">Describe in natural language</Label>
                    <Textarea
                      rows={2}
                      placeholder="e.g. Fetch Plaid transactions for a user ID over a date range and return totals by merchant"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      className="min-h-[52px] resize-none text-sm"
                    />
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={aiBusy}
                      onClick={() => void generateWithAi("full")}
                    >
                      {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      Generate tool
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={aiBusy}
                      onClick={() => void generateWithAi("logic")}
                    >
                      Update logic only
                    </Button>
                  </div>
                </div>
              </div>

              <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1 overflow-hidden">
                <ResizablePanel defaultSize={58} minSize={35} className="min-w-0">
                  <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4">
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Tool name</Label>
                          <Input
                            value={model.name}
                            onChange={(e) =>
                              setModel((m) => ({
                                ...m,
                                name: e.target.value.replace(/\W/g, "_"),
                              }))
                            }
                            className="font-mono"
                            disabled={Boolean(toolPath)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label className="text-xs">Description</Label>
                          <Input
                            value={model.description}
                            onChange={(e) =>
                              setModel((m) => ({ ...m, description: e.target.value }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="approval"
                          checked={model.needsApproval}
                          onCheckedChange={(v) =>
                            setModel((m) => ({ ...m, needsApproval: v === true }))
                          }
                        />
                        <Label htmlFor="approval" className="text-xs">
                          Requires human approval before running
                        </Label>
                      </div>

                      {/* Flow canvas — vertical stack fits the panel width */}
                      <div className="rounded-xl border bg-muted/15 p-3">
                        <div className="flex flex-col gap-3">
                          <FlowNode title="Inputs" badge={`${model.inputs.length}`}>
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={handleInputDragEnd}
                            >
                              <SortableContext
                                items={model.inputs.map((f) => f.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="space-y-2">
                                  {model.inputs.map((field) => (
                                    <SortableInputField
                                      key={field.id}
                                      field={field}
                                      onUpdate={(patch) => updateField(field.id, patch)}
                                      onRemove={() => removeField(field.id)}
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 w-full"
                              onClick={addField}
                            >
                              <Plus />
                              Add input
                            </Button>
                          </FlowNode>

                          <div className="flex justify-center py-0.5">
                            <ArrowDown className="size-4 text-muted-foreground" />
                          </div>

                          <FlowNode title="Logic" badge="execute">
                            <Tabs defaultValue="plain">
                              <TabsList className="mb-2 h-8">
                                <TabsTrigger value="plain" className="text-xs">
                                  Plain English
                                </TabsTrigger>
                                <TabsTrigger value="code" className="text-xs">
                                  Code
                                </TabsTrigger>
                              </TabsList>
                              <TabsContent value="plain" className="mt-0">
                                <Textarea
                                  rows={5}
                                  value={model.logicPrompt}
                                  onChange={(e) =>
                                    setModel((m) => ({ ...m, logicPrompt: e.target.value }))
                                  }
                                  className="text-xs"
                                  placeholder="What should this tool do when called?"
                                />
                              </TabsContent>
                              <TabsContent value="code" className="mt-0">
                                <Textarea
                                  rows={8}
                                  value={model.implementation}
                                  onChange={(e) =>
                                    setModel((m) => ({ ...m, implementation: e.target.value }))
                                  }
                                  className="font-mono text-xs"
                                  placeholder="return { ok: true };"
                                />
                              </TabsContent>
                            </Tabs>
                          </FlowNode>

                          <div className="flex justify-center py-0.5">
                            <ArrowDown className="size-4 text-muted-foreground" />
                          </div>

                          <FlowNode title="Output" badge="JSON">
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              The object returned from{" "}
                              <code className="rounded bg-muted px-1">execute()</code> is sent back
                              to the agent as structured tool output.
                            </p>
                          </FlowNode>
                        </div>
                      </div>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={42} minSize={28} className="min-w-0">
                  <div className="flex h-full min-h-0 flex-col overflow-hidden border-l">
                    <div className="shrink-0 border-b px-3 py-2 text-xs font-medium">
                      Generated TypeScript (live)
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <pre className="p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                        {generatedSource}
                      </pre>
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          )}

          <DialogFooter className="shrink-0 border-t px-4 py-3 sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Staged files are picked up by Eve dev + floating chat immediately.
            </p>
            <Button onClick={() => void stageTool()} disabled={loading || staging}>
              {staging ? <Loader2 className="animate-spin" /> : <Save />}
              Stage tool to agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FlowNode({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">{title}</span>
        <Badge variant="secondary" className="text-[10px]">
          {badge}
        </Badge>
      </div>
      <div className="flex-1 p-3">{children}</div>
    </div>
  );
}
