import "server-only";

import { query, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { SDKAssistantMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { StreamEvent } from "@/lib/types";
import { appendMessage } from "@db/repos";
import { AGENT_PROMPTS, AGENT_MODELS } from "./prompts";
import {
  MAX_DEPTH,
  buildDelegationTools,
  getDelegatableRoles,
} from "./delegation";

// Re-export for callers that referenced ceo.ts
export { MAX_DEPTH };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TURNS = 10; // CEO may need more turns for multi-step orchestration

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
// Delegation tools live in ./delegation.ts (shared with sub-agent.ts so peers
// can delegate too). CEO uses buildDelegationTools at depth 0.
// ---------------------------------------------------------------------------

// Filesystem tools enabled when a workdir is set (mirrors sub-agent list)
const FILESYSTEM_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep", "Bash"] as const;

// ---------------------------------------------------------------------------
// runCEOAgent
// ---------------------------------------------------------------------------

/**
 * Runs the CEO orchestrator agent with sub-agent MCP tools registered.
 * The CEO uses in-process MCP tools to delegate to specialist sub-agents.
 *
 * When workdir is provided the CEO and all delegated sub-agents operate in
 * that directory with filesystem tools enabled.
 */
export async function runCEOAgent(opts: {
  runId: string;
  taskId: string;
  prompt: string;
  workdir?: string | null;
  /** Override systemPrompt — preferred over AGENT_PROMPTS.ceo so custom CEOs work. */
  systemPrompt?: string;
  /** Override model — preferred over AGENT_MODELS.ceo. */
  model?: string;
  onEvent: (e: StreamEvent) => void;
}): Promise<{ text: string; tokensIn: number; tokensOut: number; costUsd: number }> {
  const { runId, taskId, prompt, workdir, onEvent } = opts;

  const hasWorkdir = typeof workdir === "string" && workdir.length > 0;

  // Build in-process MCP server with sub-agent tools at depth 0 (CEO level),
  // forwarding the workdir so delegated sub-agents use the same directory.
  const subAgentTools = buildDelegationTools({
    parentRunId: runId,
    parentTaskId: taskId,
    depth: 0,
    workdir,
    onEvent,
    callerLabel: "CEO",
  });

  const mcpServer = createSdkMcpServer({
    name: "sub-agents",
    version: "1.0.0",
    tools: subAgentTools,
  });

  // Pick the base system prompt: explicit override (from agent DB row) wins,
  // then the seeded CEO prompt, then a minimal fallback.
  const baseCeoPrompt =
    opts.systemPrompt ??
    AGENT_PROMPTS.ceo ??
    "You are the CEO orchestrator agent.";

  // When a workdir is set, augment the CEO system prompt so it knows the scope
  const ceоSystemPrompt = hasWorkdir
    ? baseCeoPrompt +
      `\n\nYou are operating in working directory: ${workdir}. ` +
      `Use filesystem tools to read/write files there. ` +
      `Do NOT modify files outside this directory.`
    : baseCeoPrompt;

  // MCP tools are exposed to Claude with the prefix `mcp__<server>__<tool>`.
  // The `allowedTools` list must use that exact prefixed form, otherwise the
  // SDK treats the call as un-approved and triggers a permission prompt.
  const ceоAllowedTools: string[] = [
    ...getDelegatableRoles().map((r) => `mcp__sub-agents__delegate_to_${r}`),
    ...(hasWorkdir ? [...FILESYSTEM_TOOLS] : []),
  ];

  const result = query({
    prompt,
    options: {
      systemPrompt: ceоSystemPrompt,
      model: opts.model ?? AGENT_MODELS.ceo ?? "claude-opus-4-7",
      maxTurns: MAX_TURNS,
      // Register the in-process MCP server with sub-agent tools
      mcpServers: {
        "sub-agents": mcpServer,
      },
      // Enable filesystem tools when a workdir is set; disable built-in tools otherwise.
      // Sub-agent delegation happens via the MCP server, not via built-in tools.
      tools: hasWorkdir ? [...FILESYSTEM_TOOLS] : [],
      // Don't persist ephemeral orchestration sessions
      persistSession: false,
      // Auto-approve every tool the agent uses — no permission prompt UI exists yet.
      // Belt-and-suspenders: bypassPermissions mode + explicit allowedTools list.
      permissionMode: "bypassPermissions",
      allowedTools: ceоAllowedTools,
      // Set the process working directory when a workdir is provided
      ...(hasWorkdir && { cwd: workdir }),
    },
  });

  let finalText = "";
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  type TextBlock = { type: "text"; text: string };
  type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };

  for await (const message of result) {
    if (isAssistantMessage(message)) {
      const content = message.message.content as Array<{ type: string; text?: string; name?: string; input?: unknown; id?: string }>;
      const textBlocks: TextBlock[] = content.filter(
        (block): block is TextBlock => block.type === "text" && typeof block.text === "string"
      );

      for (const block of textBlocks) {
        if (block.text) {
          onEvent({ type: "chunk", runId, text: block.text });
          finalText += block.text;
        }
      }

      const assembled = textBlocks.map((b: TextBlock) => b.text).join("");
      if (assembled) {
        appendMessage({
          runId,
          role: "assistant",
          content: assembled,
          toolName: null,
        });
      }

      // Also capture tool_use blocks for event emission and DB persistence
      const toolUseBlocks: ToolUseBlock[] = content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use"
      );

      for (const toolBlock of toolUseBlocks) {
        appendMessage({
          runId,
          role: "tool_use",
          content: JSON.stringify(toolBlock.input),
          toolName: toolBlock.name,
        });
      }
    } else if (isResultMessage(message)) {
      costUsd = message.total_cost_usd ?? 0;
      tokensIn = message.usage?.inputTokens ?? 0;
      tokensOut = message.usage?.outputTokens ?? 0;

      if (message.subtype === "success" && message.result && !finalText) {
        finalText = message.result;
      }
      break;
    }
  }

  return { text: finalText, tokensIn, tokensOut, costUsd };
}
