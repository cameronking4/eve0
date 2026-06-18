# `eve init` baseline (Phase 0 inventory)

Snapshot of `eve init <name>` output for the pinned Eve version (see
`FORGE_EVE_VERSION` in `@forge/core`). Used by unit tests to assert Forge no
longer maintains a parallel project format.

## What `eve init` owns (Forge must never write these)

- `package.json` — includes `@vercel/connect`, `tsgo` typecheck, node `24.x`,
  `overrides`/`resolutions` pinning `ai`. (Forge's old `generatePackageJson`
  had drifted: wrong deps, `openai/gpt-5.4-mini` defaults, no `@vercel/connect`.)
- `tsconfig.json`, `.gitignore`, `.vercelignore`
- `pnpm-workspace.yaml` (build allowlist + eve compat package extensions)
- `AGENTS.md`, `CLAUDE.md` (agent guidance)
- `agent/agent.ts` (default model `anthropic/claude-sonnet-4.6`)
- `agent/channels/eve.ts` (auth chain)
- `agent/instructions.md` (placeholder identity)
- `pnpm-lock.yaml` (init runs install automatically)

## What Forge adds on top (content / semantics only)

- `agent/instructions.md` (overwrite placeholder with the plan's prompt)
- `agent/agent.ts` model (rewrite the model from the plan)
- `agent/tools/*.ts`, `agent/skills/*.md`
- `evals/evals.config.ts`, `evals/smoke.eval.ts` (init does NOT create `evals/`)
- `.env.example` (merge), `CONNECTIONS.md`
- channels beyond `eve` via `eve channels add <kind> -y`

## Delta vs the OLD Forge scaffold (pre-rebase)

| File | Old Forge | `eve init` | Resolution |
|------|-----------|-----------|------------|
| `package.json` | hand-written, drifted deps | authoritative | delegate to `eve init` |
| `tsconfig.json` | hand-written | authoritative | delegate |
| `.gitignore` | hand-written | authoritative | delegate |
| `agent/channels/eve.ts` | template string | authoritative | delegate (no template) |
| `pnpm-workspace.yaml` | (missing) | present | delegate |
| `AGENTS.md` / `CLAUDE.md` | (missing) | present | delegate |
| default model | `openai/gpt-5.4-mini` | `anthropic/claude-sonnet-4.6` | plan-driven content only |

## `eve info --json` shape notes

- Top-level `model`, `instructions`, `skills`, `tools`, `channels`,
  `diagnostics: { errors, warnings }`, `status`.
- The `eve` channel surfaces as multiple `{ name: "eve", kind: "http", method, urlPath }` rows.
- A banner (` eve  vX`, preview notice) is printed to stdout BEFORE the JSON —
  `runEveJson` must slice from the first `{` to the last `}`.
