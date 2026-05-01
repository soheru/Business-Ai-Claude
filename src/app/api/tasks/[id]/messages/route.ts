import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getTask,
  createRun,
  updateTask,
  getRunningRunForTask,
  listRunsForTask,
  listMessages,
  appendMessage,
} from "@db/repos";
import { runTask } from "@/lib/agents/runner";
import { publishEvent } from "@/app/api/_lib/event-bus";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const replySchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

/**
 * POST /api/tasks/[id]/messages
 *
 * Accepts a user reply, composes the full conversation history as a
 * continuation prompt, creates a new run, and fires the agent in the
 * background — identical fire-and-forget pattern as /api/tasks/[id]/run.
 */
export async function POST(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<{ runId: string } | { error: string }>> {
  try {
    const { id: taskId } = await params;

    // 1. Parse + validate request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }
    const { content } = parsed.data;

    // 2. Load task
    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // 3. Guard against concurrent runs
    const existingRun = getRunningRunForTask(taskId);
    if (existingRun) {
      return NextResponse.json(
        { error: "Task is currently running, wait for it to complete" },
        { status: 409 }
      );
    }

    // 4. Re-open task if it was previously terminal
    if (task.status === "done" || task.status === "failed") {
      updateTask(taskId, {
        status: "in_progress",
        assignedAt: new Date().toISOString(),
      });
    }

    // 5. Build conversation history from all prior runs for this task
    const priorRuns = listRunsForTask(taskId);
    const conversationLines: string[] = ["[Previous conversation]"];

    for (const run of priorRuns) {
      const messages = listMessages(run.id);
      for (const msg of messages) {
        if (msg.role === "user") {
          conversationLines.push(`User: ${msg.content}`);
        } else if (msg.role === "assistant") {
          conversationLines.push(`Assistant: ${msg.content}`);
        }
        // Skip tool_use / tool_result / system entries from the history block
        // to keep the composed prompt clean and avoid confusing the model.
      }
    }

    conversationLines.push("");
    conversationLines.push("[New message]");
    conversationLines.push(content);

    const continuationPrompt = conversationLines.join("\n");

    // 6. Create a new run for this continuation turn
    const run = createRun({ taskId, agentId: task.agentId });
    const runId = run.id;

    // 7. Persist just the bare user reply (not the composed prompt) so the UI
    //    shows only the new message, not the entire history repeated.
    appendMessage({
      runId,
      role: "user",
      content,
      toolName: null,
    });

    // 8. Fire-and-forget — do NOT await
    queueMicrotask(async () => {
      try {
        await runTask({
          taskId,
          runId,
          continuationPrompt,
          onEvent: (e) => publishEvent(runId, e),
        });
      } catch (err) {
        console.error(
          `[runTask continuation error] taskId=${taskId} runId=${runId}`,
          err
        );
      }
    });

    return NextResponse.json({ runId }, { status: 202 });
  } catch (err) {
    console.error("[POST /api/tasks/[id]/messages]", err);
    return NextResponse.json(
      { error: "Failed to send reply" },
      { status: 500 }
    );
  }
}
