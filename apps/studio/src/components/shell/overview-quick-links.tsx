"use client";

import { ArrowRight } from "lucide-react";
import type { EveManifest } from "@forge/core";
import { STUDIO_NAV, type StudioPanel } from "@/components/shell/studio-nav";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const QUICK_LINK_ORDER: StudioPanel[] = [
  "instructions",
  "skills",
  "tools",
  "evals",
  "channels",
  "schedules",
  "security",
];

const ACTION_HINT: Partial<Record<StudioPanel, string>> = {
  instructions: "Define how the agent thinks and responds",
  skills: "Reusable playbooks the agent can load",
  tools: "Debug runs, visual builder, gallery",
  evals: "Catch regressions before you ship",
  channels: "Slack, web, and Eve ingress",
  schedules: "Cron jobs and autonomous digests",
  security: "Approvals, write tools, safety score",
};

const HARNESS = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);

function linkBadge(id: StudioPanel, manifest: EveManifest): string | null {
  const authoredTools = manifest.tools.filter((t) => !HARNESS.has(t.name)).length;
  switch (id) {
    case "tools":
      return authoredTools > 0 ? `${authoredTools} authored` : "Add tools";
    case "skills":
      return manifest.skills.length > 0 ? `${manifest.skills.length} skills` : "Add skills";
    case "channels":
      return manifest.channels.length > 0 ? `${manifest.channels.length} live` : "Connect";
    case "schedules":
      return manifest.schedules.length > 0
        ? `${manifest.schedules.length} scheduled`
        : "Automate";
    case "evals":
      return "Run suite";
    case "security":
      return "Review";
    default:
      return null;
  }
}

export function OverviewQuickLinks({
  manifest,
  onNavigate,
}: {
  manifest: EveManifest;
  onNavigate: (panel: StudioPanel) => void;
}) {
  const items = QUICK_LINK_ORDER.map((id) => STUDIO_NAV.find((n) => n.id === id)).filter(
    (n): n is (typeof STUDIO_NAV)[number] => Boolean(n),
  );

  const build = items.filter((i) => i.group === "build" && i.id !== "overview");
  const runtime = items.filter((i) => i.group === "runtime");

  return (
    <div className="space-y-4">
      <QuickLinkGroup title="Build" items={build} manifest={manifest} onNavigate={onNavigate} />
      <QuickLinkGroup title="Runtime" items={runtime} manifest={manifest} onNavigate={onNavigate} />
    </div>
  );
}

function QuickLinkGroup({
  title,
  items,
  manifest,
  onNavigate,
}: {
  title: string;
  items: (typeof STUDIO_NAV)[number][];
  manifest: EveManifest;
  onNavigate: (panel: StudioPanel) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          const badge = linkBadge(item.id, manifest);
          const hint = ACTION_HINT[item.id] ?? item.description;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={cn(
                "group/link flex w-full items-start gap-3 rounded-xl border bg-background/60 p-3 text-left transition-all",
                "hover:-translate-y-px hover:border-primary/30 hover:bg-accent/40 hover:shadow-md",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors",
                  "group-hover/link:bg-primary group-hover/link:text-primary-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium leading-none">{item.label}</span>
                  {badge && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                      {badge}
                    </Badge>
                  )}
                </span>
                <span className="mt-1.5 block text-xs leading-snug text-muted-foreground">
                  {hint}
                </span>
              </span>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/link:opacity-100" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
