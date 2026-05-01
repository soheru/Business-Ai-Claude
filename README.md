# Business Management AI Claude

> **A local-first multi-agent orchestration dashboard built on the Claude Agent SDK. Run a full AI product team — CEO, Marketer, Developer, PM, UX, QA, and your own custom agents — directly on your machine using your existing Claude subscription.**

[![Built with Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Claude Agent SDK](https://img.shields.io/badge/Claude%20Agent%20SDK-Anthropic-D97706)](https://docs.anthropic.com/)
[![SQLite](https://img.shields.io/badge/SQLite-Local-003B57?logo=sqlite)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A self-hosted dashboard that turns Claude into a coordinated team of AI agents. The CEO agent receives your request, breaks it down, and delegates to specialist sub-agents (Developer, Marketer, PM, UX, QA, plus any custom agents you define). Every step is animated live, every conversation is persisted, and everything runs locally on SQLite — **no API key, no cloud database, no per-token billing**.

---

## Why this exists

If you use Claude Code via subscription, you already pay for unlimited agent runs. But Claude Code is a CLI — there's no way to:

- See multiple agents working in parallel
- Persist tasks and conversation history across sessions
- Visualise how the orchestrator delegates to specialists
- Configure each agent's model, system prompt, and behaviour from a UI
- Continue a conversation later by replying to a finished task

This project fills that gap. It is **not** a wrapper around the Claude API (which would require a separate paid key) — it uses `@anthropic-ai/claude-agent-sdk` which authenticates through the same `claude` CLI you've already logged into. Your subscription, your machine, your data.

---

## Features

### Live Agent Orchestra
Animated visualisation of the CEO at the centre with sub-agents arranged in an orbit. Lines glow when delegation is active, nodes pulse while running, and the layout adapts to however many agents you've added — 6, 8, 12, doesn't matter.

### Six pre-built agents (and unlimited custom ones)
Out of the box: **CEO** (Opus orchestrator), **Marketer**, **Developer**, **PM**, **UX**, **QA** — each with a hand-written system prompt. Add your own — Researcher, Business Development Director, Data Analyst, Copywriter, anything — directly from the settings page.

### Peer delegation
Sub-agents can ask other sub-agents for help without bouncing back through the CEO. Hard depth cap (3 levels) prevents runaway recursion. The Developer can pull in UX directly; UX can pull in the Marketer. The CEO only steps in when synthesis is needed.

### Real filesystem access (when you want it)
Set a working directory on a task and the agents get scoped Read / Write / Edit / Glob / Grep / Bash tools — *only* in that directory. Ask the CEO to "build a landing page in `C:\Games\my-project`" and watch sub-agents actually create files. Without a workdir, agents are pure text — no surprises.

### Per-agent model swap
Settings page with a dropdown per agent. Drop CEO from Opus to Sonnet for cheaper runs. Upgrade Marketer to Sonnet when copy quality matters. Edits hit the DB and apply on the next run — no restart needed.

### Continue any conversation
Every task has a reply box. Type a follow-up — "make the hero more punchy", "change the colour palette to dark green" — and the same agent resumes with full conversation history.

### Streaming SSE everywhere
No polling. The dashboard receives chunks, tool calls, child run starts, and completion events live via Server-Sent Events. Sub-second latency from agent thought to UI pixel.

### Local-first by default
SQLite database in `data/claude-agent.db`. No network calls except to Anthropic's servers (via the `claude` CLI on your machine). No telemetry. No analytics. No login.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5.7 (strict mode) |
| UI | Tailwind CSS + shadcn/ui-style primitives + lucide-react icons |
| Animation | framer-motion |
| Database | SQLite via `better-sqlite3` (file-backed, zero-config) |
| Agent runtime | `@anthropic-ai/claude-agent-sdk` (uses Claude Code subscription auth) |
| Streaming | Server-Sent Events (no WebSocket dependency) |
| Validation | zod |
| Tests | vitest (42 tests covering DB, event bus, prompts, types) |

---

## Requirements

1. **Node.js 20+** ([download](https://nodejs.org/))
2. **Claude Code CLI installed and logged in** ([install guide](https://docs.anthropic.com/en/docs/claude-code/quickstart))
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude login
   ```
3. **Active Claude Pro or Claude Max subscription** (this project does *not* call the Anthropic API directly — it routes through the `claude` CLI's existing OAuth)

---

## Quick start

```bash
# Clone
git clone https://github.com/soheru/Business-Ai-Claude.git
cd Business-Ai-Claude

# Install
npm install

# Initialise the local SQLite database (creates ./data/claude-agent.db and seeds 6 agents)
npm run db:init

# Run the dev server
npm run dev
```

Open <http://localhost:3000> and click **Ask CEO**.

That's it.

---

## Project layout

```
Business-Ai-Claude/
├── db/                       SQLite schema, init, seed, repository layer
│   ├── client.ts             Singleton DB client
│   ├── schema.sql            Tables: agents, tasks, runs, messages
│   ├── init.ts               npm run db:init entry point
│   ├── seed.ts               Seeds 6 default agents (idempotent)
│   └── repos.ts              All DB read/write functions
├── src/
│   ├── app/
│   │   ├── api/              Next.js API routes (CRUD + SSE stream)
│   │   │   ├── agents/       GET, POST, PATCH /api/agents
│   │   │   ├── tasks/        GET, POST tasks; POST /tasks/:id/run
│   │   │   ├── runs/         GET runs; SSE /runs/:id/stream
│   │   │   └── _lib/         In-memory event bus (publish/subscribe)
│   │   └── dashboard/        Dashboard pages (home, agents, tasks, history, settings)
│   ├── components/
│   │   ├── orchestra/        Animated agent orchestra (graph, nodes, lines)
│   │   ├── ui/               Card, Button, Badge, Input, Textarea, Label, Dialog
│   │   └── *.tsx             AgentCard, TaskCard, TaskRunStream, TaskReplyForm, …
│   └── lib/
│       ├── agents/           Agent runtime (CEO orchestrator, sub-agent, delegation, prompts)
│       ├── types.ts          Shared TypeScript contracts
│       └── utils.ts          Helpers
├── tests/                    Vitest test suite (42 tests)
├── CONTRACTS.md              Build contract used during development
└── README.md                 (this file)
```

---

## How it works

### Architecture

```
                User Browser
                     │
            ┌────────┴────────┐
            │  Next.js App    │
            │  (Vercel-ready) │
            │                 │
            │  ┌───────────┐  │
            │  │ Dashboard │  │
            │  │  (RSC +   │  │
            │  │  client)  │  │
            │  └───────────┘  │
            │  ┌───────────┐  │
            │  │  API +    │  │     ┌──────────────────────┐
            │  │  SSE      │──┼────▶│  @anthropic-ai/      │
            │  │  Stream   │  │     │  claude-agent-sdk    │
            │  └───────────┘  │     │                      │
            └────────┬────────┘     │  → claude CLI       │
                     │              │  → Claude Pro/Max   │
                     ▼              │    subscription      │
            ┌─────────────────┐     └──────────────────────┘
            │ SQLite (local)  │
            │ data/*.db       │
            └─────────────────┘
```

### CEO orchestration pattern

The CEO agent gets the user's prompt and a set of in-process MCP tools (`delegate_to_developer`, `delegate_to_marketer`, …). When it calls a tool:

1. A child task and child run are created in the DB.
2. SSE events fire (`child_run_start`, `tool_use`) so the UI animates the delegation line.
3. The sub-agent runs with its own system prompt and model, optionally with peer-delegation tools (so it can hand off to *other* sub-agents).
4. Streamed text chunks flow back to the dashboard.
5. On completion the child task is marked done and the result is returned to the CEO as a tool result.
6. The CEO synthesises the final answer.

### Hard limits enforced in code

| Limit | Value | Why |
|---|---|---|
| Max delegation depth | 3 | Prevents runaway recursion (CEO → sub-agent → peer → stop) |
| Max turns per run | 5 (sub-agents), 10 (CEO) | Cap on agentic loops |
| Permission mode | `bypassPermissions` | Auto-approve all tool calls; no permission prompts (yet) |
| Tool scope | Filesystem tools only when `workdir` is set | Default is text-only |

---

## Roadmap

- [ ] Permission UI for tool approvals (currently auto-approved)
- [ ] Daily / monthly budget caps with a soft block
- [ ] Multi-user mode (Supabase Auth + per-org agent configs)
- [ ] Postgres adapter (alongside SQLite) for team deployments
- [ ] Atomic `startRun()` with `BEGIN IMMEDIATE` to fully eliminate the rare double-run race
- [ ] Hosted demo (Vercel + Anthropic API key, opt-in)
- [ ] Export/import agent definitions (share custom agents as JSON)
- [ ] Token usage charts on the dashboard home
- [ ] Mobile-friendly responsive layout

PRs welcome.

---

## Configuration

| Environment variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | Used in server components for self-fetches |
| `DAILY_BUDGET_USD` | `5.00` | Reserved for the budget-cap roadmap item (not yet enforced) |

No `.env` file is required for local development.

---

## Testing

```bash
npm test
```

Runs 42 vitest tests covering:

- DB repository layer (CRUD + edge cases)
- SSE event bus (subscribe / publish / unsubscribe)
- Agent system prompts (presence, length, role coverage)
- Type-level / structural invariants

Tests use an in-memory SQLite database — they do **not** call the Claude SDK and consume zero subscription quota.

---

## SEO keywords

`claude code` · `claude code dashboard` · `claude agent sdk` · `multi-agent orchestration` · `ai agents ui` · `anthropic claude` · `claude pro dashboard` · `claude max dashboard` · `local-first ai` · `subscription-based ai agents` · `nextjs ai dashboard` · `typescript ai agents` · `agent orchestrator` · `ai team simulation` · `ceo agent` · `sub-agent delegation` · `mcp sub-agents` · `claude self-hosted dashboard` · `business management ai` · `ai pm tool` · `ai dev agency` · `agent workflow visualization`

---

## Author

**Sohail Khan** — Founder, full-stack engineer, builder of AI tools.

- 🌐 Portfolio: [sohail.codes](https://sohail.codes)
- 💼 LinkedIn: [linkedin.com/in/sohailkhanit](https://www.linkedin.com/in/sohailkhanit/)
- 🐙 GitHub: [github.com/soheru](https://github.com/soheru)

If you're building with Claude or thinking about agent products — let's connect.

---

## Contributing

Issues and PRs welcome. The project structure is documented in [`CONTRACTS.md`](CONTRACTS.md), originally written as a build contract for the parallel agents that built v0 of this project (yes — this repo was scaffolded by the very orchestration system it implements).

Quick contribution loop:

```bash
# fork → clone → branch
npm install
npm run db:init
npm run dev
# make change, run tests
npm test
# open PR
```

---

## License

[MIT](LICENSE) © 2026 Sohail Khan

---

> **Made with Claude. Powered by your subscription. Runs on your machine.**
