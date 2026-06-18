"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import type { TrustFinding, TrustReport } from "@forge/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function severityVariant(severity: TrustFinding["severity"]) {
  switch (severity) {
    case "critical":
    case "high":
      return "destructive" as const;
    case "medium":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function TrustPanel({
  onRequireApproval,
  onOpenFile,
}: {
  onRequireApproval: (sourcePath: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const [report, setReport] = useState<TrustReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/security");
        setReport(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Analyzing agent surface…</p>;
  }

  if (!report || "error" in report) {
    return <p className="text-sm text-destructive">Could not load trust report.</p>;
  }

  const actionable = report.findings.filter((f) => f.severity !== "info");

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <Shield className="mt-1 size-6 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Trust &amp; Safety</h2>
          <p className="text-sm text-muted-foreground">
            Actionable review of tools, ingress channels, autonomous schedules, and approval gaps.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Posture score</CardTitle>
          <CardDescription>
            {report.score >= 80
              ? "Looking good — minor items to review."
              : report.score >= 50
                ? "Some risks need attention before production."
                : "High-risk surface — address findings below."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={report.score} className="flex-1" />
            <span className="text-2xl font-semibold tabular-nums">{report.score}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <Stat label="Authored tools" value={report.summary.authoredTools} />
            <Stat label="With approval" value={report.summary.toolsNeedingApproval} />
            <Stat
              label="Write w/o approval"
              value={report.summary.writeCapableWithoutApproval}
              warn={report.summary.writeCapableWithoutApproval > 0}
            />
            <Stat label="Channels" value={report.summary.channels} />
            <Stat label="Schedules" value={report.summary.schedules} />
            <Stat label="Connections" value={report.summary.connections} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">
          Findings ({actionable.length})
        </h3>
        {actionable.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-green-500" />
              No high-priority findings. Keep approval gates on write-capable tools in production.
            </CardContent>
          </Card>
        ) : (
          actionable.map((finding) => (
            <Card key={finding.id} size="sm">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
                  <CardTitle className="text-sm">{finding.title}</CardTitle>
                </div>
                <CardDescription className="text-xs">{finding.detail}</CardDescription>
              </CardHeader>
              {(finding.action === "require-approval" || finding.action === "open-file") &&
                finding.sourcePath && (
                  <CardContent>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        finding.action === "require-approval"
                          ? onRequireApproval(finding.sourcePath!)
                          : onOpenFile(finding.sourcePath!)
                      }
                    >
                      {finding.action === "require-approval" ? "Require approval" : "Open file"}
                    </Button>
                  </CardContent>
                )}
            </Card>
          ))
        )}
      </div>

      {report.findings.some((f) => f.severity === "info") && (
        <p className="text-xs text-muted-foreground">
          Tip: Schedules run autonomously on UTC cron. Channels are public ingress — verify auth in each
          channel file.
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        warn && "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {warn && <AlertTriangle className="size-3 text-amber-500" />}
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
