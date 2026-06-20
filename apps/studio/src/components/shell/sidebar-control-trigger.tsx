"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function sidebarControlTriggerClassName(active?: boolean) {
  return cn(
    "group flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2 text-left shadow-none transition-colors",
    "hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-60",
    active && "bg-muted/50",
  );
}

export function SidebarControlTriggerContent({
  icon: Icon,
  title,
  subtitle,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium leading-tight">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground leading-tight">
          {subtitle}
        </span>
      </span>
      {trailing}
    </>
  );
}
