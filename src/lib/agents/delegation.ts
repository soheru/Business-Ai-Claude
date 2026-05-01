if (typeof window !== "undefined") {
  throw new Error("src/lib/agents/delegation.ts is server-only");
}

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { AgentRole, StreamEvent } from "@/lib/types";
import {
  appendMessage,
  createRun,
  updateRun,
  createTask,
  updateTask,
  getAgentByRole,
  listAgents,
} from "@db/repos";

/** Backwards-compatible default sub-agent roles (the originally seeded 5).
 *  Live delegation reads ALL active non-CEO agents from the DB instead. */
export const ALL_SUB_AGENT_ROLES: AgentRole[] = [
  "marketer",
  "developer",
  "pm",
  "ux",
  "qa",
];

/** Returns every active non-CEO agent role currently in the DB.
 *  Used by `buildDelegationTools` so newly-added custom agents become
 *  delegation targets automatically. */
export function getDelegatableRoles(): AgentRole[] {
  return listAgents()
    .filter((a) => a.isActive && a.role !== "ceo")
    .map((a) => a.role);
}

/** Hard cap on delegation depth.
 *  0 = CEO (root)
 *  1 = sub-agent invoked by CEO
 *  2 = peer of a sub-agent (sub-agent → sub-agent)
 *  At depth >= MAX_DEPTH the delegation factory returns no tools. */
export const MAX_DEPTH = 3;

interface BuildDelegationToolsOptions {
  /** ID of the run that owns these tools (for SSE events). */
  parentRunId: string;
  /** ID of the task that owns these tools (children parented here). */
  parentTaskId: string;
  /** Current depth in the delegation tree. */
  depth: number;
  /** Optional working directory forwarded to delegated agents. */
  workdir: string | null | undefined;
  /** SSE event sink. */
  onEvent: (e: StreamEvent) => void;
  /** Roles to exclude (e.g. the calling sub-agent's own role). */
  excludeRoles?: AgentRole[];
  /** Label used in the child task title (e.g. "delegated by CEO" / "delegated by developer"). */
  callerLabel: string;
}

/**
 * Builds in-process MCP tool definitions for delegating to sub-agents.
 * Each tool creates a child task + run, executes the target sub-agent at
 * `depth + 1`, and returns the result text to the caller as a tool result.
 *
 * Returns an empty array when the depth limit is reached, which causes the
 * SDK to expose no delegation tools to the caller — preventing further recursion.
 *
 * Imports `runSubAgent` lazily to avoid an eager circular import with sub-agent.ts.
 */
export function buildDelegationTools(opts: BuildDelegationToolsOptions) {
  const {
    parentRunId,
    parentTaskId,
    depth,
    workdir,
    onEvent,
    excludeRoles = [],
    callerLabel,
  } = opts;

  if (depth >= MAX_DEPTH) {
    return [];
  }

  // Source of truth: DB. This makes newly-added custom agents become
  // delegation targets automatically without code changes.
  const allRoles = getDelegatableRoles();
  const targets = allRoles.filter((r) => !excludeRoles.includes(r));

  return targets.map((role) =>
    tool(
      `delegate_to_${role}`,
      `Delegate a focused task to the ${role} specialist agent. ` +
        `Provide a self-contained prompt with all necessary context — ` +
        `the ${role} agent cannot see your conversation history.`,
      {
        prompt: z
          .string()
          .describe(
            `A clear, self-contained task description for the ${role} agent. ` +
              `Include all background context required.`
          ),
      },
      async ({ prompt }) => {
        // Lazy import to break the circular dependency with sub-agent.ts
        const { runSubAgent } = await import("./sub-agent");

        const agentRecord = getAgentByRole(role);
        if (!agentRecord) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: agent for role "${role}" not found in database.`,
              },
            ],
          };
        }

        const childTask = createTask({
          agentRole: role,
          agentId: agentRecord.id,
          title: `Sub-task: ${role} (delegated by ${callerLabel})`,
          description: prompt,
          priority: "medium",
          parentTaskId,
        });

        const childRun = createRun({
          taskId: childTask.id,
          agentId: agentRecord.id,
        });

        appendMessage({
          runId: childRun.id,
          role: "user",
          content: prompt,
          toolName: null,
        });

        onEvent({
          type: "child_run_start",
          runId: parentRunId,
          childRunId: childRun.id,
          agentRole: role,
        });

        onEvent({
          type: "tool_use",
          runId: parentRunId,
          toolName: `delegate_to_${role}`,
          input: { prompt },
        });

        let resultText = "";
        let childStatus: "completed" | "failed" = "completed";

        try {
          const result = await runSubAgent({
            runId: childRun.id,
            agentRole: role,
            prompt,
            workdir,
            depth: depth + 1,
            taskId: childTask.id,
            // Forward the delegated agent's stored prompt + model from the DB
            // so custom agents (or edited prompts) take effect.
            systemPrompt: agentRecord.systemPrompt,
            model: agentRecord.model,
            onEvent: (e) => onEvent(e),
          });

          resultText = result.text;

          const completedAt = new Date().toISOString();
          updateRun(childRun.id, {
            status: "completed",
            endedAt: completedAt,
            tokensInput: result.tokensIn,
            tokensOutput: result.tokensOut,
            costUsd: result.costUsd,
          });

          updateTask(childTask.id, {
            status: "done",
            output: resultText,
            completedAt,
          });
        } catch (err: unknown) {
          childStatus = "failed";
          const errorMsg = err instanceof Error ? err.message : String(err);
          resultText = `Sub-agent ${role} failed: ${errorMsg}`;
          const failedAt = new Date().toISOString();

          updateRun(childRun.id, {
            status: "failed",
            endedAt: failedAt,
            error: errorMsg,
          });

          updateTask(childTask.id, {
            status: "failed",
            output: errorMsg,
            completedAt: failedAt,
          });
        }

        onEvent({
          type: "child_run_end",
          runId: parentRunId,
          childRunId: childRun.id,
          status: childStatus,
        });

        onEvent({
          type: "tool_result",
          runId: parentRunId,
          toolName: `delegate_to_${role}`,
          output: resultText,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: resultText,
            },
          ],
        };
      }
    )
  );
}
