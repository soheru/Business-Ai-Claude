import "server-only";

import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentRole, StreamEvent } from "@/lib/types";
import { appendMessage } from "@db/repos";
import { AGENT_PROMPTS, AGENT_MODELS } from "./prompts";
import {
  MAX_DEPTH,
  buildDelegationTools,
  getDelegatableRoles,
} from "./delegation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TURNS = 5;
// Note: MAX_TOKENS is not a direct SDK option; the SDK uses maxBudgetUsd for
// spend limits. We enforce context discipline via the system prompt instead.

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isAssistantMessage(msg: unknown): msg is SDKAssistantMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "assistant"
  );
}

function isResultMessage(msg: unknown): msg is SDKResultMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "result"
  );
}

// ---------------------------------------------------------------------------
// runSubAgent
// ---------------------------------------------------------------------------

// Filesystem tools enabled when a workdir is set
const FILESYSTEM_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"] as const;

/**
 * Runs a single non-CEO agent against a prompt.
 * Streams text chunks via onEvent and persists assistant messages to DB.
 * Returns the final text and token usage when the result message arrives.
 *
 * When workdir is provided the agent gets filesystem tools scoped to that
 * directory and the system prompt is augmented with a working-directory note.
 */
export async function runSubAgent(opts: {
  runId: string;
  agentRole: AgentRole;
  prompt: string;
  workdir?: string | null;
  /** Depth in the delegation tree. CEO=0. Default for direct calls = 1. */
  depth?: number;
  /** Task ID for parent linkage when this sub-agent delegates onward. */
  taskId?: string;
  /** Override systemPrompt — preferred over AGENT_PROMPTS lookup so custom
   *  agents (added via the UI) work. */
  systemPrompt?: string;
  /** Override model — preferred over AGENT_MODELS lookup. */
  model?: string;
  onEvent: (e: StreamEvent) => void;
}): Promise<{ text: string; tokensIn: number; tokensOut: number; costUsd: number }> {
  const { runId, agentRole, prompt, workdir, onEvent } = opts;
  const depth = opts.depth ?? 1;
  const taskId = opts.taskId ?? runId;

  let systemPrompt =
    opts.systemPrompt ??
    AGENT_PROMPTS[agentRole] ??
    `You are the ${agentRole} agent. Help the user with their request.`;
  const model =
    opts.model ?? AGENT_MODELS[agentRole] ?? "claude-sonnet-4-6";

  // When a workdir is provided, scope the agent to that directory and enable
  // filesystem tools so it can read and write files there.
  const hasWorkdir = typeof workdir === "string" && workdir.length > 0;
  if (hasWorkdir) {
    systemPrompt =
      systemPrompt +
      `\n\nYou are operating in working directory: ${workdir}. ` +
      `Use filesystem tools to read/write files there. ` +
      `Do NOT modify files outside this directory.`;
  }

  // Peer delegation: while we're below the depth cap, expose delegate_to_*
  // tools to this sub-agent so it can ask peers (other sub-agents) for help
  // without going back to the CEO. Self is excluded to prevent self-recursion.
  const peerTools = buildDelegationTools({
    parentRunId: runId,
    parentTaskId: taskId,
    depth,
    workdir,
    onEvent,
    excludeRoles: [agentRole],
    callerLabel: agentRole,
  });
  const hasPeers = peerTools.length > 0;

  const peerRoles = getDelegatableRoles().filter((r) => r !== agentRole);

  if (hasPeers) {
    const peerNames = peerRoles
      .map((r) => `delegate_to_${r}`)
      .join(", ");
    systemPrompt =
      systemPrompt +
      `\n\nYou can delegate parts of your work to peer specialists when it ` +
      `is genuinely useful (do not delegate trivial work). Available peers: ${peerNames}. ` +
      `Provide self-contained prompts — peers cannot see your conversation. ` +
      `Current depth: ${depth} of ${MAX_DEPTH}. Going deeper is not allowed.`;
  }

  const peerMcp = hasPeers
    ? createSdkMcpServer({
        name: "peer-agents",
        version: "1.0.0",
        tools: peerTools,
      })
    : null;

  const allowedTools: string[] = [
    ...(hasPeers
      ? peerRoles.map((r) => `mcp__peer-agents__delegate_to_${r}`)
      : []),
    ...(hasWorkdir ? [...FILESYSTEM_TOOLS] : []),
  ];

  const result = query({
    prompt,
    options: {
      systemPrompt,
      model,
      maxTurns: MAX_TURNS,
      // Built-in tools — filesystem only when workdir is set, otherwise none.
      tools: hasWorkdir ? [...FILESYSTEM_TOOLS] : [],
      // Register the peer-delegation MCP server when peer tools are available.
      ...(peerMcp && { mcpServers: { "peer-agents": peerMcp } }),
      // Auto-approve every tool — no permission-prompt UI yet.
      permissionMode: "bypassPermissions",
      ...(allowedTools.length > 0 && { allowedTools }),
      // Set the process working directory when a workdir is provided.
      ...(hasWorkdir && { cwd: workdir }),
      // Don't persist these ephemeral sessions to disk.
      persistSession: false,
    },
  });

  let finalText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  for await (const message of result) {
    if (isAssistantMessage(message)) {
      // Extract text content blocks and emit chunk events.
      // SDK content blocks are loosely typed; cast to known shape.
      type TextBlock = { type: "text"; text: string };
      const content = message.message.content as Array<{ type: string; text?: string }>;
      const textBlocks: TextBlock[] = content
        .filter((block): block is TextBlock => block.type === "text" && typeof block.text === "string");

      for (const block of textBlocks) {
        if (block.text) {
          onEvent({ type: "chunk", runId, text: block.text });
          finalText += block.text;
        }
      }

      // Persist the assembled text from this assistant turn
      const assembled = textBlocks.map((b: TextBlock) => b.text).join("");
      if (assembled) {
        appendMessage({
          runId,
          role: "assistant",
          content: assembled,
          toolName: null,
        });
      }
    } else if (isResultMessage(message)) {
      // Capture usage — NonNullableUsage uses camelCase per coreTypes.d.ts
      costUsd = message.total_cost_usd ?? 0;
      tokensIn = message.usage?.inputTokens ?? 0;
      tokensOut = message.usage?.outputTokens ?? 0;

      // If result text differs from assembled text (edge case), use it
      if (message.subtype === "success" && message.result && !finalText) {
        finalText = message.result;
      }
      break;
    }
    // system, stream_event, tool_progress etc. — ignored for sub-agents
  }

  return { text: finalText, tokensIn, tokensOut, costUsd };
}
