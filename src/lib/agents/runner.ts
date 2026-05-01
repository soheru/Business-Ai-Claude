import "server-only";

import type { StreamEvent, RunStatus } from "@/lib/types";
import {
  getTask,
  getAgent,
  createRun,
  getRun,
  updateRun,
  updateTask,
  appendMessage,
} from "@db/repos";
import { runCEOAgent } from "./ceo";
import { runSubAgent } from "./sub-agent";

// ---------------------------------------------------------------------------
// runTask — single entry point used by the backend API
// ---------------------------------------------------------------------------

/**
 * Loads a task + its assigned agent from DB, creates (or reuses) a run,
 * then drives the appropriate agent executor (CEO or sub-agent).
 * All events are forwarded via the onEvent callback for SSE streaming.
 *
 * Caller signature matches CONTRACTS.md with an optional runId extension:
 *   runTask({ taskId, runId?, continuationPrompt?, onEvent })
 *
 * When `continuationPrompt` is provided the runner uses it as the prompt
 * instead of `task.description`, and skips persisting a user message
 * (the API route already persisted the bare reply text).
 */
export async function runTask(opts: {
  taskId: string;
  runId?: string;
  /** Full composed prompt including conversation history. When set, this
   *  overrides task.description and the user-message persist step is skipped
   *  (the caller — /api/tasks/[id]/messages — already wrote the bare reply). */
  continuationPrompt?: string;
  onEvent: (e: StreamEvent) => void;
}): Promise<void> {
  const { taskId, onEvent } = opts;

  // -------------------------------------------------------------------------
  // 1. Load task
  // -------------------------------------------------------------------------
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  // -------------------------------------------------------------------------
  // 2. Load agent assigned to the task
  // -------------------------------------------------------------------------
  const agent = getAgent(task.agentId);
  if (!agent) {
    throw new Error(`Agent not found for task ${taskId}: agentId=${task.agentId}`);
  }

  // -------------------------------------------------------------------------
  // 3. Create run or reuse existing
  // -------------------------------------------------------------------------
  let run = opts.runId ? getRun(opts.runId) : null;

  if (!run) {
    run = createRun({ taskId, agentId: agent.id });
  }

  const runId = run.id;

  // -------------------------------------------------------------------------
  // 4. (Task is already marked in_progress by /api/tasks/[id]/run route —
  //     do not duplicate the write here.)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // 5. Resolve the prompt to send to the agent.
  //    For continuations the API route already persisted the bare reply text,
  //    so we use the composed prompt directly and skip writing a user message.
  // -------------------------------------------------------------------------
  const promptToSend = opts.continuationPrompt ?? task.description;

  if (!opts.continuationPrompt) {
    // Initial run: persist task description as the user turn.
    appendMessage({
      runId,
      role: "user",
      content: task.description,
      toolName: null,
    });
  }

  // -------------------------------------------------------------------------
  // 6. Execute agent
  // -------------------------------------------------------------------------
  try {
    let result: { text: string; tokensIn: number; tokensOut: number; costUsd: number };

    if (agent.role === "ceo") {
      result = await runCEOAgent({
        runId,
        taskId,
        prompt: promptToSend,
        workdir: task.workdir,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        onEvent,
      });
    } else {
      result = await runSubAgent({
        runId,
        agentRole: agent.role,
        prompt: promptToSend,
        workdir: task.workdir,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        taskId,
        onEvent,
      });
    }

    // -----------------------------------------------------------------------
    // 7. Success: persist run + task completion
    // -----------------------------------------------------------------------
    const now = new Date().toISOString();

    updateRun(runId, {
      status: "completed" as RunStatus,
      endedAt: now,
      tokensInput: result.tokensIn,
      tokensOutput: result.tokensOut,
      costUsd: result.costUsd,
    });

    updateTask(taskId, {
      status: "done",
      completedAt: now,
      output: result.text,
    });

    onEvent({
      type: "done",
      runId,
      status: "completed",
      output: result.text,
    });
  } catch (err: unknown) {
    // -----------------------------------------------------------------------
    // 8. Error handling: persist failure and emit error event
    // -----------------------------------------------------------------------
    const errorMsg = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();

    try {
      updateRun(runId, {
        status: "failed" as RunStatus,
        endedAt: now,
        error: errorMsg,
      });

      updateTask(taskId, {
        status: "failed",
      });
    } catch {
      // Best-effort DB cleanup — don't swallow the original error
    }

    onEvent({
      type: "error",
      runId,
      error: errorMsg,
    });

    throw err;
  }
}
