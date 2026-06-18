import { Suspense } from "react";
import { ScaffoldWizard } from "@/components/scaffold/scaffold-wizard";

export const dynamic = "force-dynamic";

export default function ScaffoldPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted-foreground">Loading…</div>}>
      <ScaffoldWizard />
    </Suspense>
  );
}
