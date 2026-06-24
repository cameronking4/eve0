"use client";

import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Pencil, Plus, RotateCcw, Save, Trash2, Wrench } from "lucide-react";
import type { EveConnectionInfo, EveToolInfo } from "@forge/core";
import { ToolDebugPanel } from "@/components/tools/tool-debug-panel";
import { ToolFlowEditor } from "@/components/tools/tool-flow-editor";
import { ToolGallerySheet } from "@/components/tools/tool-gallery-sheet";
import { ConnectionDebugPanel } from "@/components/tools/connection-debug-panel";
import { McpConnectionSheet } from "@/components/tools/mcp-connection-sheet";
import { useStaging } from "@/context/staging-context";
import { readForgeApiJson } from "@/lib/forge-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
const MANAGEABLE_CONNECTION = /^agent\/connections\/[a-z0-9-]+\.ts$/;

type RenameTarget =
  | { kind: "tool"; currentName: string; sourcePath: string }
  | { kind: "connection"; currentId: string; sourcePath: string };

type DeleteTarget =
  | { kind: "tool"; name: string; sourcePath: string }
  | { kind: "connection"; id: string; sourcePath: string };

export function ToolsPanel({
  tools,
  connections,
  onRefresh,
  onOpenFile,
  onSetApproval,
}: {
  tools: EveToolInfo[];
  connections: EveConnectionInfo[];
  onRefresh: () => void;
  onOpenFile: (path: string) => void;
  onSetApproval: (toolPath: string, mode: string) => void | Promise<void>;
}) {
  const authored = useMemo(
    () => tools.filter((t) => !HARNESS.has(t.name)),
    [tools],
  );

  const [selected, setSelected] = useState<string | null>(authored[0]?.name ?? null);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDesc, setNewToolDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const {
    files: stagedFiles,
    isStaged,
    isStagedForDeletion,
    publish,
    refresh: refreshStaging,
    revert,
  } = useStaging();

  const displayAuthored = useMemo(() => {
    const byPath = new Map<string, EveToolInfo>();
    for (const t of authored) {
      if (t.sourcePath) byPath.set(t.sourcePath, t);
      else byPath.set(t.name, t);
    }
    for (const entry of stagedFiles) {
      if (!entry.path.startsWith("agent/tools/") || !isStagedForDeletion(entry.path)) continue;
      if (byPath.has(entry.path)) continue;
      const name = entry.path.replace(/^agent\/tools\//, "").replace(/\.ts$/, "");
      byPath.set(entry.path, { name, sourcePath: entry.path });
    }
    return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [authored, stagedFiles, isStagedForDeletion]);

  const displayConnections = useMemo(() => {
    const byPath = new Map<string, EveConnectionInfo>();
    for (const c of connections) {
      if (c.sourcePath) byPath.set(c.sourcePath, c);
      else byPath.set(c.id, c);
    }
    for (const entry of stagedFiles) {
      if (!MANAGEABLE_CONNECTION.test(entry.path) || !isStagedForDeletion(entry.path)) continue;
      if (byPath.has(entry.path)) continue;
      const id = entry.path.replace(/^agent\/connections\//, "").replace(/\.ts$/, "");
      byPath.set(entry.path, { id, sourcePath: entry.path });
    }
    return [...byPath.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [connections, stagedFiles, isStagedForDeletion]);

  const tool = displayAuthored.find((t) => t.name === selected) ?? null;
  const connection = displayConnections.find((c) => c.id === selectedConnection) ?? null;

  useEffect(() => {
    if (displayAuthored.length && !displayAuthored.some((t) => t.name === selected)) {
      setSelected(displayAuthored[0]?.name ?? null);
    }
  }, [displayAuthored, selected]);

  useEffect(() => {
    if (selectedConnection && !displayConnections.some((c) => c.id === selectedConnection)) {
      setSelectedConnection(null);
    }
  }, [displayConnections, selectedConnection]);

  function selectTool(name: string) {
    setSelected(name);
    setSelectedConnection(null);
  }

  function selectConnection(id: string) {
    setSelectedConnection(id);
    setSelected(null);
  }

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

  function openRenameTool(tool: EveToolInfo) {
    if (!tool.sourcePath) return;
    setRenameTarget({ kind: "tool", currentName: tool.name, sourcePath: tool.sourcePath });
    setRenameValue(tool.name);
  }

  function openRenameConnection(connection: EveConnectionInfo) {
    if (!connection.sourcePath || !MANAGEABLE_CONNECTION.test(connection.sourcePath)) return;
    setRenameTarget({
      kind: "connection",
      currentId: connection.id,
      sourcePath: connection.sourcePath,
    });
    setRenameValue(connection.id);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const nextValue = renameValue.trim();
    if (!nextValue) {
      toast.error("Name is required");
      return;
    }

    const currentName =
      renameTarget.kind === "tool" ? renameTarget.currentName : renameTarget.currentId;
    if (nextValue === currentName) {
      toast.message("Name unchanged");
      return;
    }

    setRenaming(true);
    try {
      if (renameTarget.kind === "tool") {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "rename",
            sourcePath: renameTarget.sourcePath,
            newName: nextValue,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Rename failed");
        await refreshStaging();
        toast.success(`Staged rename to ${data.name} — publish when ready`);
        setSelected(data.name);
        setSelectedConnection(null);
      } else {
        const res = await fetch("/api/connections", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "rename",
            sourcePath: renameTarget.sourcePath,
            newSlug: nextValue,
          }),
        });
        const data = await readForgeApiJson<{ error?: string; slug?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "Rename failed");
        await refreshStaging();
        toast.success(`Staged rename to ${data.slug} — publish when ready`);
        setSelectedConnection(data.slug ?? nextValue);
        setSelected(null);
      }
      setRenameTarget(null);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRenaming(false);
    }
  }

  function requestDeleteTool(tool: EveToolInfo) {
    if (!tool.sourcePath) return;
    setDeleteTarget({ kind: "tool", name: tool.name, sourcePath: tool.sourcePath });
  }

  function requestDeleteConnection(connection: EveConnectionInfo) {
    if (!connection.sourcePath || !MANAGEABLE_CONNECTION.test(connection.sourcePath)) {
      toast.error("This connection cannot be deleted from Forge.");
      return;
    }
    setDeleteTarget({
      kind: "connection",
      id: connection.id,
      sourcePath: connection.sourcePath,
    });
  }

  async function publishStaged(path: string, pendingDelete: boolean) {
    setBusyPath(path);
    try {
      await publish(path);
      await refreshStaging();
      toast.success(pendingDelete ? "Deletion published" : "Changes published");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusyPath(null);
    }
  }

  async function revertStaged(path: string) {
    setBusyPath(path);
    try {
      await revert(path);
      await refreshStaging();
      toast.message("Staged change reverted");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setBusyPath(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeletingPath(deleteTarget.sourcePath);
    try {
      if (deleteTarget.kind === "tool") {
        const res = await fetch("/api/tools", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "delete", sourcePath: deleteTarget.sourcePath }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Delete failed");
        await refreshStaging();
        toast.success(`Staged deletion of ${deleteTarget.name} — publish when ready`);
        if (selected === deleteTarget.name) setSelected(null);
      } else {
        const res = await fetch(
          `/api/connections?path=${encodeURIComponent(deleteTarget.sourcePath)}`,
          { method: "DELETE" },
        );
        const data = await readForgeApiJson<{ error?: string }>(res);
        if (!res.ok) throw new Error(data.error ?? "Delete failed");
        await refreshStaging();
        toast.success(`Staged deletion of ${deleteTarget.id} — publish when ready`);
        if (selectedConnection === deleteTarget.id) setSelectedConnection(null);
      }
      setDeleteTarget(null);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <section className="flex h-[calc(100vh-8rem)] min-h-0 gap-4">
      <div className="flex w-56 shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Tools</h2>
            <p className="text-[10px] text-muted-foreground">
              {authored.length} authored · {connections.length} MCP
            </p>
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
          {displayAuthored.length === 0 && displayConnections.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No tools yet</p>
          ) : (
            <>
              {displayAuthored.length > 0 && (
                <p className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Authored
                </p>
              )}
              {displayAuthored.map((t) => {
                const path = t.sourcePath;
                const pendingDelete = path ? isStagedForDeletion(path) : false;
                const stagedEdit = path ? isStaged(path) && !pendingDelete : false;
                return (
                  <SidebarToolItem
                    key={path ?? t.name}
                    deleting={deletingPath === path}
                    pendingDelete={pendingDelete}
                    selected={selected === t.name}
                    stagedEdit={stagedEdit}
                    tool={t}
                    onDelete={() => requestDeleteTool(t)}
                    onRename={() => openRenameTool(t)}
                    onSelect={() => selectTool(t.name)}
                  />
                );
              })}
              {displayConnections.length > 0 && (
                <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  MCP connections
                </p>
              )}
              {displayConnections.map((c) => {
                const path = c.sourcePath;
                const pendingDelete = path ? isStagedForDeletion(path) : false;
                const stagedEdit = path ? isStaged(path) && !pendingDelete : false;
                const manageable = Boolean(path && MANAGEABLE_CONNECTION.test(path));
                return (
                  <SidebarConnectionItem
                    key={path ?? c.id}
                    connection={c}
                    deleting={deletingPath === path}
                    manageable={manageable}
                    pendingDelete={pendingDelete}
                    selected={selectedConnection === c.id}
                    stagedEdit={stagedEdit}
                    onDelete={() => requestDeleteConnection(c)}
                    onRename={() => openRenameConnection(c)}
                    onSelect={() => selectConnection(c.id)}
                  />
                );
              })}
            </>
          )}
        </ScrollArea>

        <div className="flex flex-col gap-1.5 [&_button]:w-full">
          <ToolGallerySheet onAdded={onRefresh} />
          <McpConnectionSheet onAdded={onRefresh} />
          <ToolFlowEditor onStaged={onRefresh} />
        </div>
      </div>

      {connection ? (
        (() => {
          const path = connection.sourcePath;
          const pendingDelete = path ? isStagedForDeletion(path) : false;
          const stagedEdit = path ? isStaged(path) && !pendingDelete : false;
          const busy = path !== undefined && busyPath === path;

          return (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">{connection.id}</span>
                    <Badge variant="outline">MCP</Badge>
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {connection.description ??
                      "Remote MCP tools exposed via connection__search and connection__<name>__<tool>."}
                  </p>
                  {connection.url && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {connection.url}
                    </p>
                  )}
                  {path && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{path}</p>
                  )}
                </div>
                {path && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!pendingDelete && (
                      <Button variant="outline" size="sm" onClick={() => onOpenFile(path)}>
                        Open connection file
                      </Button>
                    )}
                    {(pendingDelete || stagedEdit) && (
                      <StagingActions
                        busy={busy}
                        pendingDelete={pendingDelete}
                        onPublish={() => void publishStaged(path, pendingDelete)}
                        onRevert={() => void revertStaged(path)}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {pendingDelete ? (
                  <PendingDeletionNotice path={path!} />
                ) : (
                  <ConnectionDebugPanel key={connection.id} connection={connection} />
                )}
              </div>
            </div>
          );
        })()
      ) : tool ? (
        (() => {
          const path = tool.sourcePath;
          const pendingDelete = path ? isStagedForDeletion(path) : false;
          const stagedEdit = path ? isStaged(path) && !pendingDelete : false;
          const busy = path !== undefined && busyPath === path;

          return (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Wrench className="size-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">{tool.name}</span>
                    {tool.needsApproval && <Badge variant="destructive">approval</Badge>}
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tool.description ?? "No description"}
                  </p>
                  {path && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{path}</p>
                  )}
                </div>
                {path && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!pendingDelete && (
                      <>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Approval</Label>
                          <Select
                            value={tool.approvalMode ?? "none"}
                            onValueChange={(v) => v && onSetApproval(path, v)}
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
                        <Button variant="outline" size="sm" onClick={() => onOpenFile(path)}>
                          Open file
                        </Button>
                        <ToolFlowEditor toolPath={path} toolName={tool.name} onStaged={onRefresh} />
                      </>
                    )}
                    {(pendingDelete || stagedEdit) && (
                      <StagingActions
                        busy={busy}
                        pendingDelete={pendingDelete}
                        onPublish={() => void publishStaged(path, pendingDelete)}
                        onRevert={() => void revertStaged(path)}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                {pendingDelete ? (
                  <PendingDeletionNotice path={path!} />
                ) : (
                  <ToolDebugPanel key={tool.name} tool={tool} defaultOpen />
                )}
              </div>
            </div>
          );
        })()
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <p className="text-sm">Select or create a tool, or add an MCP connection</p>
          <div className="flex flex-wrap justify-center gap-2">
            <ToolGallerySheet onAdded={onRefresh} />
            <McpConnectionSheet onAdded={onRefresh} />
            <ToolFlowEditor onStaged={onRefresh} />
          </div>
        </div>
      )}
      <RenameResourceDialog
        open={renameTarget !== null}
        renaming={renaming}
        target={renameTarget}
        value={renameValue}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onChange={setRenameValue}
        onSubmit={() => void submitRename()}
      />
      <DeleteResourceDialog
        deleting={deletingPath !== null}
        open={deleteTarget !== null}
        target={deleteTarget}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open && !deletingPath) setDeleteTarget(null);
        }}
      />
    </section>
  );
}

function StagingActions({
  busy,
  onPublish,
  onRevert,
  pendingDelete,
}: {
  busy: boolean;
  onPublish: () => void;
  onRevert: () => void;
  pendingDelete: boolean;
}) {
  return (
    <>
      <Button size="sm" disabled={busy} onClick={onPublish}>
        {busy ? <Loader2 className="animate-spin" /> : <Save />}
        {pendingDelete ? "Publish deletion" : "Publish"}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onRevert}>
        <RotateCcw />
        Revert
      </Button>
    </>
  );
}

function PendingDeletionNotice({ path }: { path: string }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">Staged for deletion</p>
      <p className="text-sm text-muted-foreground">
        <code className="rounded bg-muted px-1 font-mono text-xs">{path}</code> is removed from
        preview. Publish to delete permanently, or revert to restore the published file.
      </p>
    </div>
  );
}

function SidebarToolItem({
  deleting,
  onDelete,
  onRename,
  onSelect,
  pendingDelete,
  selected,
  stagedEdit,
  tool,
}: {
  deleting: boolean;
  onDelete: () => void;
  onRename: () => void;
  onSelect: () => void;
  pendingDelete: boolean;
  selected: boolean;
  stagedEdit: boolean;
  tool: EveToolInfo;
}) {
  const canManage = Boolean(tool.sourcePath) && !pendingDelete;

  const button = (
    <Button
      variant={selected ? "secondary" : "ghost"}
      size="sm"
      disabled={deleting}
      className="mb-0.5 h-auto w-full justify-start py-1.5 font-mono text-xs"
      onClick={onSelect}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className="flex w-full items-center gap-1.5">
          <span className="truncate">{tool.name}</span>
          {pendingDelete && (
            <Badge variant="destructive" className="ml-auto h-4 px-1 text-[9px]">
              pending deletion
            </Badge>
          )}
          {stagedEdit && (
            <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px]">
              staged
            </Badge>
          )}
        </span>
      </span>
    </Button>
  );

  if (!canManage) return button;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">{button}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SidebarConnectionItem({
  connection,
  deleting,
  manageable,
  onDelete,
  onRename,
  onSelect,
  pendingDelete,
  selected,
  stagedEdit,
}: {
  connection: EveConnectionInfo;
  deleting: boolean;
  manageable: boolean;
  onDelete: () => void;
  onRename: () => void;
  onSelect: () => void;
  pendingDelete: boolean;
  selected: boolean;
  stagedEdit: boolean;
}) {
  const canManage = manageable && !pendingDelete;

  const button = (
    <Button
      variant={selected ? "secondary" : "ghost"}
      size="sm"
      disabled={deleting}
      className="mb-0.5 h-auto w-full justify-start py-1.5 text-xs"
      onClick={onSelect}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className="flex w-full items-center gap-1.5">
          <Link2 className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono">{connection.id}</span>
          {pendingDelete && (
            <Badge variant="destructive" className="ml-auto h-4 px-1 text-[9px]">
              pending deletion
            </Badge>
          )}
          {stagedEdit && (
            <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px]">
              staged
            </Badge>
          )}
        </span>
        {connection.description && (
          <span className="line-clamp-2 pl-4 text-[10px] font-normal text-muted-foreground">
            {connection.description}
          </span>
        )}
      </span>
    </Button>
  );

  if (!canManage) return button;

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block w-full">{button}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RenameResourceDialog({
  onChange,
  onOpenChange,
  onSubmit,
  open,
  renaming,
  target,
  value,
}: {
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  renaming: boolean;
  target: RenameTarget | null;
  value: string;
}) {
  const isTool = target?.kind === "tool";
  const currentName = target ? (isTool ? target.currentName : target.currentId) : "";
  const trimmed = value.trim();
  const hasChange = Boolean(target && trimmed && trimmed !== currentName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isTool ? "Rename tool" : "Rename MCP connection"}</DialogTitle>
          <DialogDescription>
            {isTool
              ? "Eve registers tools by filename in agent/tools/. Confirm the new name to move the module and update the tool id exposed to the agent."
              : "Eve registers MCP connections by slug. Confirm the new slug to move agent/connections/<slug>.ts and update connection__<slug> tools."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="rename-resource">{isTool ? "Tool name" : "Connection slug"}</Label>
            <Input
              id="rename-resource"
              value={value}
              autoFocus
              className="font-mono"
              placeholder={isTool ? "my_tool" : "my-mcp-server"}
              onChange={(e) =>
                onChange(
                  isTool
                    ? e.target.value.replace(/\W/g, "_")
                    : e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasChange) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
            />
            {target ? (
              <p className="text-[11px] text-muted-foreground">
                {isTool ? (
                  <>
                    Becomes{" "}
                    <code className="rounded bg-muted px-1">agent/tools/{value || "name"}.ts</code>
                  </>
                ) : (
                  <>
                    Becomes{" "}
                    <code className="rounded bg-muted px-1">
                      agent/connections/{value || "name"}.ts
                    </code>
                  </>
                )}
              </p>
            ) : null}
          </div>
          {hasChange ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">Confirm rename</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {currentName} → {trimmed}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Staged immediately for preview. Publish to apply permanently, or revert to undo.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={renaming || !hasChange} onClick={onSubmit}>
            {renaming ? "Renaming…" : "Confirm rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteResourceDialog({
  deleting,
  onConfirm,
  onOpenChange,
  open,
  target,
}: {
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target: DeleteTarget | null;
}) {
  const isTool = target?.kind === "tool";
  const name = target ? (isTool ? target.name : target.id) : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {isTool ? "tool" : "MCP connection"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This stages a deletion of{" "}
            <code className="rounded bg-muted px-1 font-mono">{name}</code>. The file disappears from
            preview immediately and appears in staged changes until you publish or revert.
          </AlertDialogDescription>
          {target ? (
            <p className="font-mono text-xs text-muted-foreground">{target.sourcePath}</p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            variant="destructive"
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
