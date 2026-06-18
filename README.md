# Forge

**The visual builder for [Eve](https://vercel.com/eve) agents.**

Forge is a local-first tool that lets you describe an agent in plain English, scaffold a complete Eve project, edit it in a visual studio, preview it in a live chat, and export production-ready files — all without inventing a parallel config format. Every change writes real files under `agent/` that Eve understands natively.

Think of it as **tweakcn for Eve**: you work directly on the filesystem structure Eve already uses.

---

## What Forge does

| Capability | What you get |
|------------|--------------|
| **NL scaffold** | Describe an agent → full `agent/`, `evals/`, `.env.example` on disk |
| **Visual editor** | Edit instructions, skills, tools, approvals, channels from a browser UI |
| **Live preview** | Chat with your agent using Eve's `useEveAgent` hook (same as [web-chat-next](https://github.com/vercel/eve/tree/main/apps/templates/web-chat-next)) |
| **Security view** | See every tool, channel, and schedule color-coded by risk |
| **Export** | Drop-in `agent/` bundle with `README.md` and `SECURITY.md` |

Forge does **not** replace Eve. It sits on top of Eve's CLI, discovery manifest, and session API.

---

## Requirements

- **Node.js 20+** (Eve recommends 24+ for production; 20 works for local dev)
- **pnpm 9+** (`corepack enable`)
- **Eve** — installed in each agent project (`eve` npm package; Forge runs `npx eve@latest` where needed)
- **Model access** for preview/chat — set in the Eve project's `.env.local` (e.g. `AI_GATEWAY_API_KEY` or Vercel OIDC via `eve link`)
- **Optional:** `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` at the Forge repo root for open-ended NL scaffolding beyond built-in examples

---

## Install Forge

Clone and build from source:

```bash
git clone https://github.com/cameronking4/eve0.git forge
cd forge
pnpm install
pnpm build
```

Link the CLI globally (optional):

```bash
cd forge
pnpm build
pnpm link --global   # then `forge` works everywhere
```

Or always run via pnpm from the forge repo:

```bash
pnpm forge <command>
```

---

## Quick start (5 minutes)

### 1. Scaffold an agent from natural language

```bash
cd forge
pnpm forge scaffold \
  "Monitor Stripe chargebacks over \$500, alert Slack before auto-responding to disputes" \
  -o ~/my-chargeback-agent
```

This writes a complete Eve project:

```
my-chargeback-agent/
├── agent/
│   ├── agent.ts
│   ├── instructions.md
│   ├── tools/          # stripe-disputes, stripe-respond, slack-notify
│   ├── skills/         # chargeback-triage, evidence-builder
│   ├── channels/       # slack
│   └── schedules/      # dispute-monitor (every 15 min)
├── evals/
│   ├── evals.config.ts
│   └── smoke.eval.ts
├── package.json
└── .env.example
```

The Stripe chargeback example works **offline** (no LLM call). Other prompts need an API key.

### 2. Install Eve in the agent project

```bash
cd ~/my-chargeback-agent
pnpm install   # or npm install
```

Copy env vars and add your keys:

```bash
cp .env.example .env.local
# Edit .env.local — add STRIPE_SECRET_KEY, SLACK_BOT_TOKEN, model gateway key, etc.
```

### 3. Open Forge Studio + live preview

From the Forge repo (uses your last scaffolded agent automatically):

```bash
cd ~/Projects/forge
pnpm forge dev
```

Or run from inside the agent directory:

```bash
cd ~/my-chargeback-agent
pnpm forge dev   # if forge is on your PATH, or use pnpm exec forge dev
```

Override detection with `-p` when needed: `pnpm forge dev -p ~/other-agent`

Your browser opens **http://localhost:4000**.

| URL | Purpose |
|-----|---------|
| http://localhost:4000 | Visual editor (file tree, panels, diagnostics) |
| http://localhost:4000/preview | Full-screen agent chat preview |
| Editor → **Preview** tab | Embedded chat alongside the editor |

To open the chat preview directly on launch:

```bash
pnpm forge dev --preview
```

### 4. Edit, preview, export

1. Change the **$500 threshold** in **Instructions**
2. Toggle **approval gates** on tools in the **Tools** panel
3. **Extract a skill** — select text in Instructions → "Extract to skill"
4. Chat in **Preview** to test behavior
5. **Export** when ready:

```bash
pnpm forge export ./release
```

---

## Alternative: start from an empty Eve project

```bash
pnpm forge init my-agent
cd my-agent
pnpm install
cd /path/to/forge
pnpm forge dev
```

Or add Eve to an existing app with `npx eve@latest init .` and open Forge against that directory.

---

## CLI reference

All commands accept `-p, --project <path>` to target an Eve project root (directory containing `agent/`).

```bash
forge init [name]
```
Scaffolds a new Eve project via `npx eve@latest init`.

```bash
forge scaffold "<description>" [-o ./output-dir]
```
Natural language → full project tree. Built-in example: Stripe chargebacks + Slack.

```bash
forge dev [-p <project>] [--port 4000] [--preview] [--no-open]
```
Starts Forge Studio. Eve runs **inside** the Next.js dev server via `withEve()` — no separate `eve dev` terminal needed.

| Flag | Default | Description |
|------|---------|-------------|
| `-p, --project` | current directory | Eve project root |
| `--port` | `4000` | Studio port |
| `--preview` | off | Open `/preview` instead of editor |
| `--no-open` | off | Don't launch browser |

```bash
forge export [destination] [-p <project>]
```
Copies `agent/`, `evals/`, `.env.example`, plus generated `README.md` and `SECURITY.md`.

```bash
forge info [-p <project>] [--json]
```
Prints Eve's discovery manifest (tools, skills, channels, diagnostics).

---

## Studio guide

Forge Studio is a three-column layout:

```
┌──────────────┬────────────────────────────┬──────────────┐
│  File tree   │       Editor panel         │  Manifest    │
│  agent/      │  (context-sensitive)       │  Diagnostics │
│  evals/      │                            │              │
└──────────────┴────────────────────────────┴──────────────┘
```

### Panels

| Panel | Edits on disk |
|-------|----------------|
| **Overview** | `agent/agent.ts` model picker |
| **Instructions** | `agent/instructions.md` |
| **Skills** | `agent/skills/*.md` (YAML frontmatter) |
| **Tools** | `agent/tools/*.ts` approval toggles, create stubs |
| **Channels** | Lists `agent/channels/*`, `agent/schedules/*` |
| **Security** | Read-only risk graph; one-click approval gates |
| **Preview** | Live chat via `useEveAgent` |
| **Export** | Writes export bundle to disk |

### Instructions → Skills splitter

1. Open **Instructions**
2. Select a paragraph of domain knowledge
3. Enter a skill slug and description
4. Click **Extract to skill**

Forge creates `agent/skills/<slug>.md` and removes that section from `instructions.md`.

### Tool approvals

In **Tools**, set approval mode per tool:

- **None** — runs without human gate
- **Always** — requires approval every time (`needsApproval: always()`)
- **Once** — first call only
- **Never** — explicitly disabled gate

Destructive tools scaffolded by Forge (e.g. `stripe-respond`) default to **Always**.

---

## How preview works

Forge Studio uses Eve's official Next.js integration:

1. `withEve()` in `next.config.ts` points at your project via `FORGE_PROJECT_ROOT`
2. On `forge dev`, Eve boots alongside Next.js and serves `/eve/v1/*` on the same origin
3. The preview UI calls `useEveAgent()` from `eve/react` — identical to the [web-chat-next template](https://github.com/vercel/eve/tree/main/apps/templates/web-chat-next)

You get streaming replies, tool call cards, reasoning blocks, and approval buttons in the chat — not a simplified mock.

**Preview needs a working model.** Ensure `.env.local` in your agent project has valid AI Gateway / provider credentials before chatting.

**First `forge dev` may take ~30s** while Eve compiles artifacts and installs the `microsandbox` sandbox adapter. If the agent preview shows "unavailable", stop and restart `forge dev` once `pnpm install` has finished — Eve rebuilds when `package.json` changes during first boot.

---

## How scaffolding works

```
Your prompt
    ↓
Structured plan (tools, skills, channels, schedules, instructions)
    ↓
Template codegen → writes real Eve TypeScript/Markdown files
    ↓
eve info validation (diagnostics surfaced in CLI + Studio)
```

- **Offline examples:** prompts mentioning Stripe + chargebacks use a built-in plan (no API key)
- **Open-ended prompts:** require `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` in Forge's environment
- **Approval defaults:** tools with write/send/delete/refund/respond in the description get `needsApproval: always()`

---

## Environment variables

### Forge dev (`forge dev`)

| Variable | Set by | Purpose |
|----------|--------|---------|
| `FORGE_PROJECT_ROOT` | CLI | Absolute path to Eve project |
| `FORGE_AGENT_NAME` | CLI | Display name in preview header |

### Agent project (your Eve app)

| Variable | Purpose |
|----------|---------|
| `AI_GATEWAY_API_KEY` | Model access via Vercel AI Gateway |
| `VERCEL_OIDC_TOKEN` | OIDC auth when linked to Vercel |
| Per-tool keys | See `.env.example` in scaffolded projects |

### Forge repo (NL scaffolding only)

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | LLM plan generation for custom prompts |
| `AI_GATEWAY_API_KEY` | Alternative for plan generation |

---

## Project structure (Forge repo)

```
forge/
├── apps/studio/          # Next.js visual editor + preview
├── packages/
│   ├── cli/              # forge binary
│   ├── core/             # filesystem adapter, writers, export
│   └── scaffolder/       # NL → Eve codegen
├── templates/
│   └── minimal-agent/    # fallback scaffold
└── scripts/e2e.sh        # smoke test
```

---

## Development

```bash
# Build everything
pnpm build

# Typecheck
pnpm typecheck

# E2E: scaffold Stripe agent + export
pnpm test:e2e

# Run studio alone (needs FORGE_PROJECT_ROOT)
FORGE_PROJECT_ROOT=~/my-agent pnpm studio
```

---

## Troubleshooting

**"Could not run eve info" in diagnostics**  
Run `pnpm install` in your agent project so `eve` is in `node_modules`.

**Preview: "Dev server is unavailable"**  
Port 4000 is the Forge editor (Next.js). Chat goes through Eve's dev server at `/eve/v1/*`, which boots inside `forge dev`. If Eve crashed or left a stale process from an earlier run, stop `forge dev` (Ctrl+C) and start it again — Forge now clears stale Eve workers on startup. Wait up to ~30s on first boot while Eve compiles.

**Preview shows errors / no response**  
Check `.env.local` in the **agent project** (not just the Forge repo) for `AI_GATEWAY_API_KEY` or another model provider key.

**NL scaffold fails**  
Use the Stripe chargeback example to verify the pipeline, or set `OPENAI_API_KEY` for custom prompts.

**Port 4000 in use**  
`forge dev --port 4001`

---

## What Forge does not do (yet)

- Hosted SaaS / cloud deploy (export and use `vercel deploy` on the Eve project)
- Full eval workbench UI (eval files are visible; use `eve eval` in the agent project)
- Marketplace / agent gallery

---

## License

Apache-2.0 (Forge). Eve is licensed separately by Vercel — see [vercel/eve](https://github.com/vercel/eve).
