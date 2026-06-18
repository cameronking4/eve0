# Forge

**Visual builder and scaffolder for [Eve](https://vercel.com/eve) agents.**

> `forge scaffold "Monitor Stripe chargebacks…"` → live wizard → review what was built → edit in Studio → ship with Eve.

Forge does **not** invent a parallel project format. **Eve owns the shell** (`package.json`, `tsconfig`, channels, runtime, validation, ship commands). **Forge owns semantics** (natural-language plans, instructions/tools/skills content, visual editing, staging, export docs, scaffold UX). Every Forge capability that Eve already exposes runs through `eve` under the hood.

---

## Two tools, one platform

| Surface | Eve (platform) | Forge (accelerator) |
|---------|----------------|---------------------|
| Project shape | `eve init`, `package.json`, `tsconfig`, `agent/channels/eve.ts` | — |
| Runtime / preview | `withEve`, `eve dev`, `/eve/v1/*` session API | Studio chat via `/api/eve-proxy` + `useEveAgent` |
| Validation | `eve info --json` (source of truth) | Same diagnostics in Studio + `forge info` |
| Ship | `eve link`, `eve build`, `eve deploy`, `eve eval` | `forge link/deploy/eval/…` passthrough + Overview actions |
| Agent content | Files on disk under `agent/` | NL scaffold, editors, staging, trust view |
| Create agent | `eve init` (blank shell) | `forge scaffold` (describe → wizard → filled agent) |
| Edit agent | Any editor | Forge Studio (panels, file tree, preview) |

---

## Paths (pick yours)

| Path | Flow |
|------|------|
| **A — Blank Eve shell** | `forge init my-agent` → `cd my-agent && forge dev` → describe agent in onboarding wizard |
| **B — Describe from scratch** | `forge scaffold "…" -o ./my-agent` → wizard progress → review → dashboard |
| **C — Existing agent** | `cd my-agent && forge dev` → Studio loads manifest from `eve info` |
| **D — Monorepo workspace** | `forge dev -p ./monorepo --workspace` → agent switcher + preview pool |

---

## Requirements

- **Node.js 20+** (Eve recommends 24+ for production)
- **pnpm 9+** or **npm** (Eve projects use either; Forge scaffolds via pinned `eve@0.11.4`)
- **Model access** — `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY` for NL scaffold; agent project `.env.local` for preview chat

```bash
cp .env.example .env.local
# Set ONE of: AI_GATEWAY_API_KEY, OPENAI_API_KEY
```

---

## Install

```bash
git clone https://github.com/cameronking4/eve0.git forge
cd forge
pnpm install
pnpm build
pnpm link --global   # optional: `forge` on PATH
```

---

## Quick start

### Scaffold (wizard-first)

```bash
forge scaffold \
  "Monitor Stripe chargebacks over \$500, alert Slack before responding" \
  -o ~/my-agent
```

Opens **http://localhost:4000/scaffold** — live stepper (`eve init` → plan → content → channels → validate) → review screen → **Continue to dashboard**.

Use **`--sync`** for headless/CI (no browser):

```bash
forge scaffold "…" -o ~/my-agent --sync
```

The Stripe chargeback example works **offline** (no LLM). Other prompts need `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY`.

### Dev + Studio

```bash
cd ~/my-agent
npm install          # or pnpm install — Eve must be in node_modules
cp .env.example .env.local
forge dev            # or: cd forge && forge dev -p ~/my-agent
```

| URL | Purpose |
|-----|---------|
| http://localhost:4000 | Studio dashboard |
| http://localhost:4000/scaffold | Scaffold / onboarding wizard |
| http://localhost:4000/preview | Full-screen chat |
| Bottom-right chat icon | Inline preview while editing |

**Onboarding:** If you run `forge dev` with no Eve agent, or a blank `eve init` shell, Studio opens the describe-your-agent flow automatically (same pipeline as `forge scaffold`).

---

## Scaffold pipeline

Forge CLI (`--sync`) and Studio wizard call the **same** `runScaffoldPipeline`:

```
1. prepare        Resolve output dir; refuse non-empty unless --force
2. eve init       Pinned eve init (Forge never writes package.json/tsconfig)
3. install deps   npm/pnpm fallback if init install fails
4. plan           NL → ScaffoldPlan (example | llm | offline)
5. apply content  instructions, tools, skills, evals, .env.example, CONNECTIONS.md
6. channels       eve channels add slack/web (-y); non-fatal on failure
7. validate       eve info --json
8. repair         Optional LLM fix (max 1 pass)
9. finalize       Session result + last-project hint
```

Resulting tree = **`eve init` + Forge content only** (see `packages/scaffolder/fixtures/eve-init-baseline/DELTA.md`).

---

## CLI reference

All commands accept `-p, --project <path>` (and `--agent` in workspaces).

| Command | Under the hood | Notes |
|---------|----------------|-------|
| `forge init [name]` | `eve init` | `--web` adds Next.js web channel |
| `forge scaffold "<prompt>"` | pipeline above | Default: opens wizard; `--sync` for CI |
| `forge dev` | Studio + Eve preview | Onboarding when agent missing/blank |
| `forge info` | `eve info --json` | `--json` for scripting |
| `forge export [path]` | read manifest + copy tree | Blocked on `[error]` diagnostics in Studio |
| `forge doctor` | `eve info` + baseline checks | Non-destructive alignment report |
| `forge eval` | `eve eval` | Passthrough; e.g. `--list` |
| `forge build` | `eve build` | Passthrough |
| `forge start` | `eve start` | Passthrough |
| `forge link` | `eve link` | Interactive TTY |
| `forge deploy` | `eve deploy` | Passthrough |
| `forge channels` | `eve channels` | e.g. `add slack -y` |
| `forge agents` | filesystem discovery | `--workspace` for monorepos |

Examples:

```bash
forge doctor -p ./my-agent
forge eval --list -p ./my-agent
forge deploy -p ./my-agent
forge info --json -p ./my-agent
```

---

## Studio

Three-column layout: file tree · editor panels · manifest/diagnostics.

| Panel | Disk |
|-------|------|
| Overview | Model picker, Link/Deploy shortcuts |
| Instructions | `agent/instructions.md` |
| Skills | `agent/skills/*.md` |
| Tools | `agent/tools/*.ts` approvals, debug, flow |
| Channels | `eve channels` + verify Eve channel |
| Schedules | `agent/schedules/*.ts` |
| Evals | `eve eval` results |
| Security | Trust graph from manifest |
| Export | Bundle + README/SECURITY |

**Staging:** Edits land in `.forge/staging/` until published to disk. Preview chat reads staged files.

---

## How preview works

1. Chat uses `useEveAgent({ host: "/api/eve-proxy" })` — all preview traffic goes through Studio.
2. The proxy health-checks `withEve` on the Studio origin when available.
3. If Eve isn't running there (onboarding handoff, failed install, etc.), Forge spawns `eve dev --no-ui` for that agent automatically.

Ensure `.env.local` in the **agent project** has model credentials before chatting.

---

## Health check

```bash
forge doctor -p ./my-agent
```

Reports:

- Eve project structure vs `eve init` baseline (required files, tsconfig, dependencies)
- Blank vs ready agent state
- `eve info` diagnostics
- Channel alignment (disk vs manifest)

Exit code `1` when error-severity findings exist.

---

## Environment

| Variable | Set by | Purpose |
|----------|--------|---------|
| `FORGE_PROJECT_ROOT` | `forge dev` | Active Eve agent path |
| `FORGE_WORKSPACE_ROOT` | `forge dev` | Monorepo workspace |
| `FORGE_ONBOARDING_CWD` | `forge dev` / scaffold | Default output dir for onboarding |
| `FORGE_EVE_VERSION` | optional | Override pinned Eve for bootstrap (default `0.11.4`) |
| `AI_GATEWAY_API_KEY` | you | NL scaffold + agent chat |

---

## Repo layout

```
forge/
├── apps/studio/          # Next.js Studio + scaffold wizard + /api/eve-proxy
├── packages/
│   ├── cli/              # forge binary
│   ├── core/             # runEve, manifest, doctor, preview pool
│   └── scaffolder/       # runScaffoldPipeline (CLI + wizard)
├── packages/scaffolder/fixtures/eve-init-baseline/   # contract snapshot
└── scripts/e2e.sh
```

---

## Development

```bash
pnpm build
pnpm typecheck
pnpm test:e2e          # scaffold --sync → info → export → eval --list
FORGE_PROJECT_ROOT=~/my-agent pnpm studio
```

---

## Troubleshooting

**Chat: "Preview unavailable" / Load failed**  
Run `npm install` in the agent project. Restart `forge dev` from the agent directory. Run `forge doctor` for details.

**`eve init` install failed (pnpm "packages field missing")**  
Forge retries with `npm install` during scaffold. Run `npm install` manually if needed.

**NL scaffold uses offline template**  
Set `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY` in Forge repo `.env.local`.

**Export blocked**  
Fix `[error]` diagnostics from `forge info` or `forge doctor` first.

**Port 4000 in use**  
`forge dev --port 4001`

---

## License

Apache-2.0 (Forge). Eve is licensed separately by Vercel — see [vercel/eve](https://github.com/vercel/eve).
