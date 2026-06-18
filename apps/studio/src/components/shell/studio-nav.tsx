"use client";

import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  Clock,
  Download,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Radio,
  ScrollText,
  Shield,
  Wrench,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type StudioPanel =
  | "overview"
  | "instructions"
  | "skills"
  | "tools"
  | "evals"
  | "channels"
  | "schedules"
  | "security"
  | "export"
  | "file";

export type NavItem = {
  id: StudioPanel;
  label: string;
  description: string;
  icon: LucideIcon;
  group: "build" | "runtime" | "ship";
};

export const STUDIO_NAV: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Agent summary & model",
    icon: LayoutDashboard,
    group: "build",
  },
  {
    id: "instructions",
    label: "Instructions",
    description: "System prompt & behavior",
    icon: FileText,
    group: "build",
  },
  {
    id: "skills",
    label: "Skills",
    description: "Reusable workflows",
    icon: ScrollText,
    group: "build",
  },
  {
    id: "tools",
    label: "Tools",
    description: "Debug & visual builder",
    icon: Wrench,
    group: "build",
  },
  {
    id: "evals",
    label: "Evals",
    description: "Run regression tests",
    icon: FlaskConical,
    group: "build",
  },
  {
    id: "channels",
    label: "Channels",
    description: "Slack, web, Eve ingress",
    icon: Radio,
    group: "runtime",
  },
  {
    id: "schedules",
    label: "Schedules",
    description: "Cron & autonomous runs",
    icon: Clock,
    group: "runtime",
  },
  {
    id: "security",
    label: "Trust",
    description: "Approval & safety review",
    icon: Shield,
    group: "runtime",
  },
  {
    id: "export",
    label: "Export",
    description: "Ship to disk",
    icon: Download,
    group: "ship",
  },
];

const GROUP_LABELS: Record<NavItem["group"], string> = {
  build: "Build",
  runtime: "Runtime",
  ship: "Ship",
};

type StudioNavProps = {
  active: StudioPanel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (panel: StudioPanel) => void;
};

export function StudioNav({ active, open, onOpenChange, onSelect }: StudioNavProps) {
  const activeItem = STUDIO_NAV.find((item) => item.id === active) ?? STUDIO_NAV[0];
  const ActiveIcon = activeItem.icon;

  const groups = (["build", "runtime", "ship"] as const).map((group) => ({
    group,
    items: STUDIO_NAV.filter((item) => item.group === group),
  }));

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="shrink-0">
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left shadow-sm transition-all",
          "hover:border-primary/30 hover:bg-accent/40 hover:shadow-md",
          open && "border-primary/40 bg-accent/30",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors",
            "group-hover:bg-primary/15",
          )}
        >
          <ActiveIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">{open ? "Studio" : activeItem.label}</span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {open ? "Collapse navigation" : activeItem.description}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-2">
        <nav
          className="max-h-[min(42vh,360px)] space-y-3 overflow-y-auto rounded-lg border bg-card/50 p-2"
          aria-label="Studio navigation"
        >
          {groups.map(({ group, items }) => (
            <div key={group}>
              <p className="mb-1.5 px-1 text-[10px] font-medium text-muted-foreground">
                {GROUP_LABELS[group]}
              </p>
              <div className="grid gap-1.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        "group/nav flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-all",
                        "hover:-translate-y-px hover:border-primary/25 hover:bg-accent/50 hover:shadow-md",
                        isActive
                          ? "border-primary/40 bg-primary/10 shadow-sm"
                          : "border-transparent bg-background/80",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground group-hover/nav:bg-primary/15 group-hover/nav:text-primary",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 py-0.5">
                        <span className="block text-xs font-medium leading-none">{item.label}</span>
                        <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </CollapsibleContent>
    </Collapsible>
  );
}
