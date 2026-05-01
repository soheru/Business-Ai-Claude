// Shared type contracts. ALL parallel agents must conform to these shapes.
// DB rows match these names exactly. API responses match these shapes.

/**
 * Agent role identifier — a lowercase slug. The 6 seeded roles below are the
 * "well-known" set; users can add custom agents with arbitrary role slugs.
 */
export type AgentRole = string;

export const SEEDED_AGENT_ROLES = [
  "ceo",
  "marketer",
  "developer",
  "pm",
  "ux",
  "qa",
] as const;

export type SeededAgentRole = (typeof SEEDED_AGENT_ROLES)[number];

export type TaskStatus =
  | "backlog"
  | "in_progress"
  | "in_review"
  | "done"
  | "failed";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type RunStatus = "running" | "completed" | "failed" | "cancelled";

export type MessageRole = "user" | "assistant" | "tool_use" | "tool_result" | "system";

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  systemPrompt: string;
  model: string;
  capabilities: string[];
  isActive: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  parentTaskId: string | null;
  agentId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  output: string | null;
  createdAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  /** Optional absolute path the agent should operate within. When set, the
   *  runtime enables filesystem tools (Read/Write/Edit/Bash) scoped to this
   *  directory. */
  workdir: string | null;
}

export interface Run {
  id: string;
  taskId: string;
  agentId: string;
  startedAt: string;
  endedAt: string | null;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  status: RunStatus;
  error: string | null;
}

export interface Message {
  id: string;
  runId: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  timestamp: string;
}

// API request shapes
export interface CreateTaskRequest {
  agentRole: AgentRole;
  title: string;
  description: string;
  priority?: TaskPriority;
  parentTaskId?: string | null;
  workdir?: string | null;
}

export interface UpdateAgentRequest {
  name?: string;
  model?: string;
  systemPrompt?: string;
  isActive?: boolean;
}

export interface RunTaskRequest {
  taskId: string;
}

// SSE event shapes streamed from /api/runs/[id]/stream
export type StreamEvent =
  | { type: "chunk"; runId: string; text: string }
  | { type: "tool_use"; runId: string; toolName: string; input: unknown }
  | { type: "tool_result"; runId: string; toolName: string; output: string }
  | { type: "child_run_start"; runId: string; childRunId: string; agentRole: AgentRole }
  | { type: "child_run_end"; runId: string; childRunId: string; status: RunStatus }
  | { type: "done"; runId: string; status: RunStatus; output: string }
  | { type: "error"; runId: string; error: string };
