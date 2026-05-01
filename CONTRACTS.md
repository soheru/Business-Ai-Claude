# Build Contracts (read first)

This file is the contract that prevents the 4 parallel build agents from stepping on each other. Every agent must read this before writing any code.

## Project shape

- **Framework:** Next.js 15 (App Router) + TypeScript + TailwindCSS
- **DB:** SQLite via `better-sqlite3` (local file, no server)
- **Agent runtime:** `@anthropic-ai/claude-agent-sdk` (uses user's existing Claude subscription via OAuth)
- **Streaming:** Server-Sent Events
- **No paid services. Everything runs locally.**

## File ownership boundaries (DO NOT cross)

| Slice | Owner | Allowed paths |
|---|---|---|
| Database | DB agent | `db/**` only |
| API routes | Backend agent | `src/app/api/**` only |
| Dashboard UI | UI agent | `src/app/(dashboard)/**`, `src/app/page.tsx`, `src/components/**` |
| Agent runtime | Runtime agent | `src/lib/agents/**` |
| **Shared (read-only for all)** | — | `src/lib/types.ts`, `src/lib/utils.ts`, `CONTRACTS.md` |

If you need a shape not in `src/lib/types.ts`, **add it there** and document below — don't redefine it in your own slice.

## Database

- File location: `data/claude-agent.db` (relative to project root)
- Init script: `db/init.ts` creates schema, seeds 6 agents
- Client: `db/client.ts` exports a singleton `getDb()` returning a `better-sqlite3` `Database` instance
- All tables use snake_case column names; mapping to camelCase TypeScript happens in repository layer

### Tables

```sql
agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  capabilities TEXT NOT NULL DEFAULT '[]',  -- JSON array
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)

tasks (
  id TEXT PRIMARY KEY,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT NOT NULL DEFAULT 'medium',
  output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at TEXT,
  completed_at TEXT
)

runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT
)

messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_name TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Indexes on `tasks(parent_task_id)`, `tasks(status)`, `tasks(agent_id)`, `messages(run_id)`, `runs(task_id)`.

## API contract

Base path: `/api`

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/agents` | — | `Agent[]` |
| GET | `/agents/[id]` | — | `Agent` |
| GET | `/tasks` | query: `?status=&agent_role=` | `Task[]` |
| POST | `/tasks` | `CreateTaskRequest` | `Task` |
| GET | `/tasks/[id]` | — | `Task & { children: Task[]; runs: Run[] }` |
| PATCH | `/tasks/[id]` | partial Task | `Task` |
| POST | `/tasks/[id]/run` | — | `{ runId: string }` (kicks off async run) |
| GET | `/runs/[id]` | — | `Run & { messages: Message[] }` |
| GET | `/runs/[id]/stream` | — | SSE stream of `StreamEvent` |

All payloads use camelCase. Repository layer in `db/repos.ts` handles snake_case ↔ camelCase mapping.

## Agent runtime contract

`src/lib/agents/runner.ts` exports:

```ts
export async function runTask(opts: {
  taskId: string;
  onEvent: (e: StreamEvent) => void;
}): Promise<void>
```

This is the single entry point the backend calls. It:
1. Loads task + agent from DB
2. Creates a `runs` row
3. Calls `@anthropic-ai/claude-agent-sdk`'s `query()` with the agent's system prompt
4. Streams events via `onEvent` callback
5. If agent role is `ceo`, registers the other 5 agents as MCP tools (Pattern A: hierarchical)
6. Updates run + task status on completion
7. Persists every message to `messages` table

## Six agents (seeded in DB on `db:init`)

1. **CEO** — orchestrator, model: `claude-opus-4-5`, can call other 5 as tools
2. **Marketer** — model: `claude-haiku-4-5`
3. **Developer** — model: `claude-sonnet-4-5`
4. **PM** — model: `claude-sonnet-4-5`
5. **UX** — model: `claude-sonnet-4-5`
6. **QA** — model: `claude-haiku-4-5`

Full system prompts: defined in `src/lib/agents/prompts.ts`, imported into `db/seed.ts`.

## Hard limits (must enforce)

- Max recursion depth in CEO orchestration: 3
- Max tokens per run: 4096
- Daily budget cap: configurable via env var `DAILY_BUDGET_USD`, default `5.00`

## Conventions

- Use `crypto.randomUUID()` for all IDs
- All timestamps as ISO strings via `new Date().toISOString()`
- Prefer named exports over default exports
- No `any` — use `unknown` and narrow
- Server-only files (DB, agent runtime) must use `import "server-only"` to prevent client-bundle inclusion

## What v0 must do (definition of done)

1. `npm install && npm run db:init && npm run dev`
2. Open `localhost:3000` → see dashboard with 6 agents listed
3. Click "Ask CEO" → enter prompt → submit
4. See SSE-streamed output appear in task detail view
5. Task + run + messages persisted to SQLite
6. Tasks Kanban shows the new task
7. CEO can successfully invoke at least one sub-agent (Developer) as a tool
