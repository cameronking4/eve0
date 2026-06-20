"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ChannelsPanel } from "@/components/channels/channels-panel";
import { SchedulesPanel } from "@/components/schedules/schedules-panel";
import { EvalsPanel } from "@/components/evals/evals-panel";
import { TrustPanel } from "@/components/trust/trust-panel";
import { InspectorPanel } from "@/components/shell/inspector-panel";
import { StudioSidebar } from "@/components/shell/studio-sidebar";
import { OverviewQuickLinks } from "@/components/shell/overview-quick-links";
import type { StudioPanel } from "@/components/shell/studio-nav";
import { InstructionsEditor } from "@/components/instructions/instructions-editor";
import { OpenAgentFolderButton } from "@/components/open-agent-folder-button";
import { FloatingAgentChat } from "@/components/preview/floating-agent-chat";
import { StagingBar } from "@/components/staging/staging-bar";
import { ToolsPanel } from "@/components/tools/tools-panel";
import { InlineToolDebug } from "@/components/tools/tool-debug-panel";
import { ToolFlowEditor } from "@/components/tools/tool-flow-editor";
import { SkillsPanel } from "@/components/skills/skills-panel";
import { FileEditorWorkspace } from "@/components/editor/file-editor-workspace";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import type {
  EveManifest,
  FileTreeNode,
  SkillData,
  StagedFileEntry,
} from "@forge/core";
import { useProject } from "@/context/project-context";
import { useStaging } from "@/context/staging-context";

type Panel = StudioPanel;

const MODELS = [
  "openai/gpt-5.4-mini",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-opus-4.8",
];

const OVERVIEW_STATS: Array<{
  label: string;
  panel: StudioPanel;
  getCount: (manifest: EveManifest, authoredToolCount: number) => number;
}> = [
  { label: "Tools", panel: "tools", getCount: (_, n) => n },
  { label: "Skills", panel: "skills", getCount: (m) => m.skills.length },
  { label: "Channels", panel: "channels", getCount: (m) => m.channels.length },
  { label: "Schedules", panel: "schedules", getCount: (m) => m.schedules.length },
];

export default function StudioPage() {
  const router = useRouter();
  const [gateChecked, setGateChecked] = useState(false);

  // Onboarding redirect guard (R14): if there's no agent, the agent is a blank
  // shell, or a scaffold session is mid-flight, send the user to the wizard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/state");
        const state = await res.json();
        if (cancelled) return;
        if (state.mode === "missing" || state.mode === "blank") {
          router.replace("/scaffold");
          return;
        }
        if (state.activeSessionId) {
          const sRes = await fetch(`/api/scaffold/session?id=${state.activeSessionId}`);
          if (sRes.ok) {
            const { session } = await sRes.json();
            if (session && session.status !== "complete" && session.status !== "archived") {
              router.replace("/scaffold");
              return;
            }
          }
        }
      } catch {
        // fall through to dashboard
      }
      if (!cancelled) setGateChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const { activeRoot, agentName, previewHost, workspaceRoot, isLoading, isSwitching } =
    useProject();
  const { refresh: refreshStaging } = useStaging();
  const [panel, setPanel] = useState<Panel>("overview");
  const [manifest, setManifest] = useState<EveManifest | null>(null);
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [projectRoot, setProjectRoot] = useState("");
  const [instructions, setInstructions] = useState("");
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [model, setModel] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [publishedFileContent, setPublishedFileContent] = useState("");
  const [exportPath, setExportPath] = useState("./forge-export");

  const refresh = useCallback(async () => {
    const [mRes, tRes, iRes, aRes] = await Promise.all([
      fetch("/api/manifest"),
      fetch("/api/tree"),
      fetch("/api/instructions"),
      fetch("/api/agent"),
    ]);
    const m = await mRes.json();
    const t = await tRes.json();
    const i = await iRes.json();
    const a = await aRes.json();
    setManifest(m.manifest);
    setProjectRoot(m.root ?? "");
    setTree(t.tree ?? []);
    setInstructions(i.instructions ?? "");
    setSkills(i.skills ?? []);
    setModel(a.model ?? m.manifest?.model ?? "");
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh, activeRoot]);

  const handleAgentSwitch = useCallback(async () => {
    setPanel("overview");
    setSelectedFile(null);
    setFileContent("");
    setPublishedFileContent("");
    setManifest(null);
    await refresh();
  }, [refresh]);

  async function saveModel(next: string) {
    setModel(next);
    await fetch("/api/agent", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: next }),
    });
    toast.success("Model updated");
    refresh();
  }

  async function setApproval(toolPath: string, mode: string) {
    await fetch("/api/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approval", toolPath, mode }),
    });
    await refreshStaging();
    toast.success(`Approval staged as ${mode} — publish when ready`);
    refresh();
  }

  async function openFile(path: string) {
    const [fileRes, stagingRes] = await Promise.all([
      fetch(`/api/file?path=${encodeURIComponent(path)}`),
      fetch("/api/staging"),
    ]);
    const data = await fileRes.json();
    const staging = await stagingRes.json();
    const staged = (staging.files as StagedFileEntry[] | undefined)?.find((f) => f.path === path);
    setSelectedFile(path);
    setFileContent(data.content ?? "");
    setPublishedFileContent(staged?.published ?? data.content ?? "");
    setPanel("file");
  }

  async function doExport() {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: exportPath }),
    });
    const data = await res.json();
    if (data.error) {
      if (data.diagnostics?.length) {
        toast.error(`${data.error}\n${data.diagnostics.join("\n")}`);
      } else {
        toast.error(data.error);
      }
    } else {
      toast.success(`Exported ${data.files?.length ?? 0} files to ${data.outputPath}`);
    }
  }

  if (!gateChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading workspace…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="font-semibold tracking-tight">Forge</div>
        <Badge variant="secondary">Eve Agent Studio</Badge>
        {workspaceRoot ? (
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            {workspaceRoot}
          </span>
        ) : (
          projectRoot && (
            <span className="hidden truncate text-xs text-muted-foreground md:inline">
              {projectRoot}
            </span>
          )
        )}
        <div className="ml-auto flex items-center gap-2">
          <OpenAgentFolderButton className="hidden sm:inline-flex" />
          <Link
            href="/scaffold?new=1"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Sparkles className="size-3.5" />
            Create new agent
          </Link>
          <Link
            href="/preview"
            target="_blank"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Open full preview
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </header>
      <StagingBar />

      <div className="flex min-h-0 flex-1">
        <StudioSidebar
          panel={panel}
          onPanelChange={setPanel}
          tree={tree}
          selectedFile={selectedFile}
          onSelectFile={openFile}
          onAgentSwitch={handleAgentSwitch}
          disabled={isSwitching}
        />

        <main className="relative min-w-0 flex-1 overflow-auto p-4">
          {(isLoading || isSwitching) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
              <p className="text-sm text-muted-foreground">
                {isSwitching ? "Switching agent…" : "Loading workspace…"}
              </p>
            </div>
          )}
          {panel === "overview" && manifest && (
            <Overview
              manifest={manifest}
              model={model}
              projectRoot={projectRoot}
              onModelChange={saveModel}
              onNavigate={(p) => setPanel(p as Panel)}
            />
          )}

          {panel === "instructions" && (
            <InstructionsEditor published={instructions} onRefresh={refresh} />
          )}

          {panel === "skills" && (
            <SkillsPanel skills={skills} onRefresh={refresh} />
          )}

          {panel === "tools" && manifest && (
            <ToolsPanel
              tools={manifest.tools}
              connections={manifest.connections}
              onRefresh={refresh}
              onOpenFile={openFile}
              onSetApproval={setApproval}
            />
          )}

          {panel === "evals" && <EvalsPanel />}

          {panel === "channels" && manifest && (
            <ChannelsPanel
              channels={manifest.channels}
              onOpenFile={openFile}
              onRefresh={refresh}
            />
          )}

          {panel === "schedules" && (
            <SchedulesPanel onOpenFile={openFile} onRefresh={refresh} />
          )}

          {panel === "security" && (
            <TrustPanel
              onRequireApproval={(path) => setApproval(path, "always")}
              onOpenFile={openFile}
            />
          )}

          {panel === "file" && selectedFile && (
            <div className="flex h-[calc(100vh-7rem)] min-h-0 flex-col gap-4">
              <div className="min-h-0 flex-1">
                <FileEditorWorkspace
                  key={selectedFile}
                  path={selectedFile}
                  initialContent={fileContent}
                  publishedContent={publishedFileContent}
                  onPublished={refresh}
                />
              </div>
              {selectedFile.startsWith("agent/tools/") && selectedFile.endsWith(".ts") && (
                <>
                  <ToolFlowEditor
                    toolPath={selectedFile}
                    toolName={selectedFile.split("/").pop()?.replace(/\.ts$/, "") ?? "tool"}
                    onStaged={refresh}
                  />
                  <InlineToolDebug
                    toolPath={selectedFile}
                    toolName={selectedFile.split("/").pop()?.replace(/\.ts$/, "") ?? "tool"}
                  />
                </>
              )}
            </div>
          )}

          {panel === "export" && (
            <section className="mx-auto max-w-lg space-y-4">
              <h2 className="text-lg font-semibold">Export</h2>
              <p className="text-sm text-muted-foreground">
                Export agent/, evals/, README.md, SECURITY.md, and .env.example.
              </p>
              <Input value={exportPath} onChange={(e) => setExportPath(e.target.value)} />
              <Button onClick={doExport}>Export project</Button>
            </section>
          )}
        </main>

        <aside className="hidden w-64 shrink-0 border-l p-4 lg:block">
          {manifest && (
            <InspectorPanel manifest={manifest} onNavigate={(p) => setPanel(p as Panel)} />
          )}
        </aside>
      </div>
      <FloatingAgentChat
        key={activeRoot}
        agentName={agentName || manifest?.name || "Agent"}
        agentScope={activeRoot}
        eveHost={previewHost}
      />
    </div>
  );
}

function Overview({
  manifest,
  model,
  projectRoot,
  onModelChange,
  onNavigate,
}: {
  manifest: EveManifest;
  model: string;
  projectRoot: string;
  onModelChange: (m: string) => void;
  onNavigate: (panel: StudioPanel) => void;
}) {
  const [deploying, setDeploying] = useState(false);
  const harness = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);
  const authoredTools = manifest.tools.filter((t) => !harness.has(t.name));

  async function runDeploy() {
    setDeploying(true);
    try {
      const res = await fetch("/api/ship", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deploy" }),
      });
      const data = await res.json();
      if (data.error) toast.error(data.error);
      else if (data.ok) toast.success("Deploy finished");
      else toast.error(`Deploy failed (exit ${data.exitCode})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }

  function copyLinkCommand() {
    const cmd = projectRoot ? `forge link -p ${projectRoot}` : "forge link";
    navigator.clipboard.writeText(cmd).catch(() => {});
    toast.info(`Run in terminal: ${cmd}`);
  }

  return (
    <section className="mx-auto m-4 max-w-3xl p-12 border rounded-lg bg-card space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{manifest.name ?? "Agent Overview"}</h2>
          <p className="text-sm text-muted-foreground">
            {projectRoot || "Local Eve agent"} — edit, stage, preview in chat, then publish.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyLinkCommand}>
            Link
          </Button>
          <Button size="sm" disabled={deploying} onClick={runDeploy}>
            {deploying ? "Deploying…" : "Deploy"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Model</Label>
        <Select value={model} onValueChange={(v) => v && onModelChange(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[model, ...MODELS.filter((m) => m !== model)].map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {OVERVIEW_STATS.map(({ label, panel, getCount }) => (
          <Card
            key={panel}
            size="sm"
            className="cursor-pointer hover:bg-muted/30"
            onClick={() => onNavigate(panel)}
          >
            <CardContent className="text-center">
              <div className="text-2xl font-semibold">
                {getCount(manifest, authoredTools.length)}
              </div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <OverviewQuickLinks manifest={manifest} onNavigate={onNavigate} />
    </section>
  );
}
