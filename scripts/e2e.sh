#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building Forge..."
pnpm build

echo "==> Scaffolding Stripe chargeback agent..."
OUT="/tmp/forge-e2e-agent"
rm -rf "$OUT"
node packages/cli/dist/index.js scaffold \
  "Monitor Stripe chargebacks over \$500, alert Slack before auto-responding" \
  -o "$OUT"

echo "==> Verifying structure..."
test -f "$OUT/agent/instructions.md"
test -f "$OUT/agent/tools/stripe-disputes.ts"
test -f "$OUT/agent/tools/stripe-respond.ts"
test -f "$OUT/agent/skills/chargeback-triage.md"
test -f "$OUT/CONNECTIONS.md"
test -f "$OUT/tsconfig.json"
test -f "$OUT/agent/channels/eve.ts"

echo "==> Installing Eve in scaffolded project..."
(cd "$OUT" && pnpm install --silent)

echo "==> Validating with eve info..."
(cd "$OUT" && npx eve info --json > /dev/null)

echo "==> Exporting..."
FORGE_PROJECT_ROOT="$OUT" node packages/cli/dist/index.js export "$OUT/exported" -p "$OUT"

test -f "$OUT/exported/README.md"
test -f "$OUT/exported/SECURITY.md"

echo "==> E2E checks passed"
