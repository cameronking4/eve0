"use client";

import { computeLineDiff, type DiffLine } from "@/lib/diff-lines";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

export function DiffView({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  const lines = computeLineDiff(before, after);

  return (
    <ScrollArea className={cn("h-full rounded-md border bg-muted/30 font-mono text-xs", className)}>
      <div className="min-w-full p-2">
        {lines.length === 0 ? (
          <p className="text-muted-foreground">No changes</p>
        ) : (
          lines.map((line, index) => <DiffLineRow key={`${index}-${line.type}`} line={line} />)
        )}
      </div>
    </ScrollArea>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-all px-2 py-0.5",
        line.type === "added" && "bg-emerald-500/15 text-emerald-200",
        line.type === "removed" && "bg-red-500/15 text-red-200 line-through opacity-80",
        line.type === "unchanged" && "text-muted-foreground",
      )}
    >
      <span className="mr-2 inline-block w-4 select-none opacity-60">
        {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
      </span>
      {line.content || " "}
    </div>
  );
}
