#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building Forge..."
pnpm build

OUT="/tmp/forge-e2e-agent"
NAME="$(basename "$OUT")"
echo "==> Scaffolding Stripe chargeback agent (--sync, eve init rebase)..."
rm -rf "$OUT"
node packages/cli/dist/index.js scaffold \
  "Monitor Stripe chargebacks over \$500, alert Slack before auto-responding" \
  -o "$OUT" --sync

echo "==> Verifying Forge content (semantics)..."
test -f "$OUT/agent/instructions.md"
test -f "$OUT/agent/tools/stripe-disputes.ts"
test -f "$OUT/agent/tools/stripe-respond.ts"
test -f "$OUT/agent/skills/chargeback-triage.md"
test -f "$OUT/evals/smoke.eval.ts"
test -f "$OUT/CONNECTIONS.md"

echo "==> Verifying eve init owns the project shell..."
test -f "$OUT/package.json"
test -f "$OUT/tsconfig.json"
test -f "$OUT/agent/channels/eve.ts"
test -f "$OUT/AGENTS.md"   # eve init marker — proves the shell came from Eve
# package.json must be the eve init shape: name == dir, has eve dependency.
node -e '
  const p = require(process.argv[1] + "/package.json");
  if (p.name !== process.argv[2]) throw new Error("package.json name mismatch: " + p.name);
  if (!p.dependencies || !p.dependencies.eve) throw new Error("package.json missing eve dependency");
' "$OUT" "$NAME"

echo "==> Slack channel documented for manual setup (needs Vercel Connect)..."
grep -qi "slack" "$OUT/CONNECTIONS.md"

echo "==> Validating with eve info (clean, no errors)..."
FORGE_INFO="$(node packages/cli/dist/index.js info -p "$OUT" --json)"
echo "$FORGE_INFO" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const m = JSON.parse(s);
    const errs = (m.diagnostics||[]).filter(d=>d.severity==="error");
    if (errs.length) throw new Error("eve info has errors: " + JSON.stringify(errs));
    console.log("  eve info clean: " + m.tools.length + " tools, " + m.skills.length + " skills");
  });
'

echo "==> Listing evals via Eve..."
node packages/cli/dist/index.js info -p "$OUT" >/dev/null

echo "==> Exporting..."
FORGE_PROJECT_ROOT="$OUT" node packages/cli/dist/index.js export "$OUT/exported" -p "$OUT"
test -f "$OUT/exported/README.md"
test -f "$OUT/exported/SECURITY.md"

echo "==> E2E checks passed"
