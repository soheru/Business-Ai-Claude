if (typeof window !== "undefined") {
  throw new Error("db/repos.ts must not be imported from client code");
}
import crypto from "crypto";
import { getDb } from "./client";
import type {
  Agent,
  AgentRole,
  Message,
  MessageRole,
  Run,
  RunStatus,
  Task,
  TaskPriority,
  TaskStatus,
  CreateTaskRequest,
} from "../src/lib/types.js";

// ---------------------------------------------------------------------------
// Raw DB row shapes (snake_case)
// ---------------------------------------------------------------------------

interface AgentRow {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  model: string;
  capabilities: string; // JSON array string
  is_active: number;
  created_at: string;
}

interface TaskRow {
  id: string;
  parent_task_id: string | null;
  agent_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  output: string | null;
  workdir: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
}

interface RunRow {
  id: string;
  task_id: string;
  agent_id: string;
  started_at: string;
  ended_at: string | null;
  tokens_input: number;
  tokens_output: number;
  cost_usd: number;
  status: string;
  error: string | null;
}

interface MessageRow {
  id: string;
  run_id: string;
  role: string;
  content: string;
  tool_name: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    role: row.role as AgentRole,
    systemPrompt: row.system_prompt,
    model: row.model,
    capabilities: JSON.parse(row.capabilities) as string[],
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    parentTaskId: row.parent_task_id,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    output: row.output,
    workdir: row.workdir ?? null,
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    completedAt: row.completed_at,
  };
}

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    taskId: row.task_id,
    agentId: row.agent_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    tokensInput: row.tokens_input,
    tokensOutput: row.tokens_output,
    costUsd: row.cost_usd,
    status: row.status as RunStatus,
    error: row.error,
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role as MessageRole,
    content: row.content,
    toolName: row.tool_name,
    timestamp: row.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Agent repos
// ---------------------------------------------------------------------------

export function listAgents(): Agent[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM agents ORDER BY created_at ASC").all() as AgentRow[];
  return rows.map(toAgent);
}

export function getAgent(id: string): Agent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  return row ? toAgent(row) : null;
}

export function getAgentByRole(role: AgentRole): Agent | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM agents WHERE role = ?").get(role) as AgentRow | undefined;
  return row ? toAgent(row) : null;
}

export function createAgent(input: {
  name: string;
  role: AgentRole;
  systemPrompt: string;
  model: string;
  isActive?: boolean;
}): Agent {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO agents (id, name, role, system_prompt, model, capabilities, is_active, created_at)
    VALUES (@id, @name, @role, @system_prompt, @model, '[]', @is_active, @created_at)
  `).run({
    id,
    name: input.name,
    role: input.role,
    system_prompt: input.systemPrompt,
    model: input.model,
    is_active: input.isActive === false ? 0 : 1,
    created_at: now,
  });

  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow;
  return toAgent(row);
}

export function updateAgent(
  id: string,
  patch: { name?: string; model?: string; systemPrompt?: string; isActive?: boolean }
): Agent {
  const db = getDb();
  const columnMap: Record<string, string> = {
    name: "name",
    model: "model",
    systemPrompt: "system_prompt",
    isActive: "is_active",
  };

  const setClauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    const col = columnMap[key];
    if (col) {
      setClauses.push(`${col} = @${col}`);
      params[col] = key === "isActive" ? (value ? 1 : 0) : value;
    }
  }

  if (setClauses.length === 0) {
    const existing = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
    if (!existing) throw new Error(`Agent not found: ${id}`);
    return toAgent(existing);
  }

  params.id = id;
  db.prepare(`UPDATE agents SET ${setClauses.join(", ")} WHERE id = @id`).run(params);

  const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  if (!updated) throw new Error(`Agent not found after update: ${id}`);
  return toAgent(updated);
}

// ---------------------------------------------------------------------------
// Task repos
// ---------------------------------------------------------------------------

export function listTasks(filters?: { status?: TaskStatus; agentRole?: AgentRole }): Task[] {
  const db = getDb();

  if (!filters || (!filters.status && !filters.agentRole)) {
    const rows = db
      .prepare("SELECT * FROM tasks ORDER BY created_at DESC")
      .all() as TaskRow[];
    return rows.map(toTask);
  }

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    conditions.push("t.status = ?");
    params.push(filters.status);
  }

  if (filters.agentRole) {
    conditions.push("a.role = ?");
    params.push(filters.agentRole);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT t.*
    FROM tasks t
    JOIN agents a ON a.id = t.agent_id
    ${where}
    ORDER BY t.created_at DESC
  `;

  const rows = db.prepare(sql).all(...params) as TaskRow[];
  return rows.map(toTask);
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

export function getTaskWithChildren(
  id: string
): (Task & { children: Task[]; runs: Run[] }) | null {
  const db = getDb();

  const taskRow = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  if (!taskRow) return null;

  const childRows = db
    .prepare("SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY created_at ASC")
    .all(id) as TaskRow[];

  const runRows = db
    .prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at ASC")
    .all(id) as RunRow[];

  return {
    ...toTask(taskRow),
    children: childRows.map(toTask),
    runs: runRows.map(toRun),
  };
}

export function createTask(
  input: CreateTaskRequest & { agentId: string }
): Task {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO tasks (id, parent_task_id, agent_id, title, description, status, priority, workdir, created_at)
    VALUES (@id, @parent_task_id, @agent_id, @title, @description, @status, @priority, @workdir, @created_at)
  `).run({
    id,
    parent_task_id: input.parentTaskId ?? null,
    agent_id: input.agentId,
    title: input.title,
    description: input.description,
    status: "backlog" as TaskStatus,
    priority: input.priority ?? "medium",
    workdir: input.workdir ?? null,
    created_at: now,
  });

  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow;
  return toTask(row);
}

export function updateTask(id: string, patch: Partial<Task>): Task {
  const db = getDb();

  // Build SET clause dynamically from camelCase patch → snake_case columns
  const columnMap: Record<string, string> = {
    parentTaskId: "parent_task_id",
    agentId: "agent_id",
    title: "title",
    description: "description",
    status: "status",
    priority: "priority",
    output: "output",
    workdir: "workdir",
    assignedAt: "assigned_at",
    completedAt: "completed_at",
  };

  const setClauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    const col = columnMap[key];
    if (col) {
      setClauses.push(`${col} = @${col}`);
      params[col] = value;
    }
  }

  if (setClauses.length === 0) {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    if (!row) throw new Error(`Task not found: ${id}`);
    return toTask(row);
  }

  params["id"] = id;
  db.prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = @id`).run(params);

  const updated = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
  if (!updated) throw new Error(`Task not found after update: ${id}`);
  return toTask(updated);
}

// ---------------------------------------------------------------------------
// Run repos
// ---------------------------------------------------------------------------

export function createRun(input: { taskId: string; agentId: string }): Run {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO runs (id, task_id, agent_id, started_at, status)
    VALUES (@id, @task_id, @agent_id, @started_at, 'running')
  `).run({
    id,
    task_id: input.taskId,
    agent_id: input.agentId,
    started_at: now,
  });

  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow;
  return toRun(row);
}

export function updateRun(id: string, patch: Partial<Run>): Run {
  const db = getDb();

  const columnMap: Record<string, string> = {
    taskId: "task_id",
    agentId: "agent_id",
    startedAt: "started_at",
    endedAt: "ended_at",
    tokensInput: "tokens_input",
    tokensOutput: "tokens_output",
    costUsd: "cost_usd",
    status: "status",
    error: "error",
  };

  const setClauses: string[] = [];
  const params: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    const col = columnMap[key];
    if (col) {
      setClauses.push(`${col} = @${col}`);
      params[col] = value;
    }
  }

  if (setClauses.length === 0) {
    const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    if (!row) throw new Error(`Run not found: ${id}`);
    return toRun(row);
  }

  params["id"] = id;
  db.prepare(`UPDATE runs SET ${setClauses.join(", ")} WHERE id = @id`).run(params);

  const updated = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  if (!updated) throw new Error(`Run not found after update: ${id}`);
  return toRun(updated);
}

export function getRun(id: string): Run | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? toRun(row) : null;
}

export function listRunsForTask(taskId: string): Run[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM runs WHERE task_id = ? ORDER BY started_at ASC")
    .all(taskId) as RunRow[];
  return rows.map(toRun);
}

export function getRunningRunForTask(taskId: string): Run | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM runs WHERE task_id = ? AND status = 'running' LIMIT 1")
    .get(taskId) as RunRow | undefined;
  return row ? toRun(row) : null;
}

export function getRunWithMessages(id: string): (Run & { messages: Message[] }) | null {
  const db = getDb();

  const runRow = db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
  if (!runRow) return null;

  const msgRows = db
    .prepare("SELECT * FROM messages WHERE run_id = ? ORDER BY timestamp ASC")
    .all(id) as MessageRow[];

  return {
    ...toRun(runRow),
    messages: msgRows.map(toMessage),
  };
}

// ---------------------------------------------------------------------------
// Message repos
// ---------------------------------------------------------------------------

export function appendMessage(
  input: Omit<Message, "id" | "timestamp">
): Message {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO messages (id, run_id, role, content, tool_name, timestamp)
    VALUES (@id, @run_id, @role, @content, @tool_name, @timestamp)
  `).run({
    id,
    run_id: input.runId,
    role: input.role,
    content: input.content,
    tool_name: input.toolName ?? null,
    timestamp: now,
  });

  const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
  return toMessage(row);
}

export function listMessages(runId: string): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE run_id = ? ORDER BY timestamp ASC")
    .all(runId) as MessageRow[];
  return rows.map(toMessage);
}
