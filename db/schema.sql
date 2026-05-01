-- ClaudeAgentAI database schema
-- Run via db/init.ts (npm run db:init)

CREATE TABLE IF NOT EXISTS agents (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL,
  role         TEXT    NOT NULL UNIQUE,
  system_prompt TEXT   NOT NULL,
  model        TEXT    NOT NULL DEFAULT 'claude-sonnet-4-5',
  capabilities TEXT    NOT NULL DEFAULT '[]',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id       TEXT NOT NULL REFERENCES agents(id),
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'backlog',
  priority       TEXT NOT NULL DEFAULT 'medium',
  output         TEXT,
  workdir        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at    TEXT,
  completed_at   TEXT
);

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT    PRIMARY KEY,
  task_id       TEXT    NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id      TEXT    NOT NULL REFERENCES agents(id),
  started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT,
  tokens_input  INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL    NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'running',
  error         TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id        TEXT PRIMARY KEY,
  run_id    TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  role      TEXT NOT NULL,
  content   TEXT NOT NULL,
  tool_name TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_agent_id       ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_run_id      ON messages(run_id);
CREATE INDEX IF NOT EXISTS idx_runs_task_id         ON runs(task_id);
