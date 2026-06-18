"use client";

import { useEffect, useState } from "react";
import type { EveManifest, TrustReport } from "@forge/core";
import { useStaging } from "@/context/staging-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const HARNESS = new Set(["bash", "read_file", "write_file", "grep", "glob", "list_dir"]);

export function InspectorPanel({
  manifest,
  onNavigate,
}: {
  manifest: EveManifest;
  onNavigate: (panel: string) => void;
}) {
  const { files, hasStaged } = useStaging();
  const [trust, setTrust] = useState<TrustReport | null>(null);

  const authoredTools = manifest.tools.filter((t) => t.sourcePath && !HARNESS.has(t.name));

  useEffect(() => {
    void fetch("/api/security")
      .then((r) => r.json())
      .then(setTrust)
      .catch(() => setTrust(null));
  }, [manifest]);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="mb-2 font-medium">Manifest</h3>
        <div className="space-y-2">
          <Row label="Authored tools" value={authoredTools.length} />
          <Row label="Skills" value={manifest.skills.length} />
          <Row label="Channels" value={manifest.channels.length} />
          <Row label="Schedules" value={manifest.schedules.length} />
          <Row label="Connections" value={manifest.connections.length} />
        </div>
      </div>

      {trust && !("error" in trust) && (
        <>
          <Separator />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">Trust</h3>
              <span className="text-xs tabular-nums text-muted-foreground">{trust.score}/100</span>
            </div>
            <Progress value={trust.score} className="mb-2 h-1.5" />
            {trust.summary.writeCapableWithoutApproval > 0 && (
              <p className="text-xs text-amber-200">
                {trust.summary.writeCapableWithoutApproval} write tool(s) without approval
              </p>
            )}
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => onNavigate("security")}
            >
              Review trust findings →
            </Button>
          </div>
        </>
      )}

      {hasStaged && (
        <>
          <Separator />
          <div>
            <h3 className="mb-2 font-medium">Staging</h3>
            <Badge variant="outline" className="mb-2 border-amber-500/40">
              {files.length} staged
            </Badge>
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {files.map((f) => (
                <li key={f.path} className="truncate font-mono">{f.path}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Separator />
      <div>
        <h3 className="mb-2 font-medium">Diagnostics</h3>
        {manifest.diagnostics.length === 0 ? (
          <p className="text-xs text-muted-foreground">No issues</p>
        ) : (
          <div className="space-y-2">
            {manifest.diagnostics.map((d, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs",
                  d.severity === "error" && "border-destructive/50 text-destructive",
                  d.severity === "warning" && "border-amber-500/40 text-amber-200",
                )}
              >
                <span className="font-medium">[{d.severity}]</span> {d.message}
                {d.sourcePath && (
                  <div className="mt-0.5 truncate font-mono text-[10px] opacity-70">{d.sourcePath}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}
