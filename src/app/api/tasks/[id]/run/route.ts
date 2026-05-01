import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getTask, createRun, updateTask, getRunningRunForTask } from "@db/repos";
import { runTask } from "@/lib/agents/runner";
import { publishEvent } from "@/app/api/_lib/event-bus";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<{ runId: string } | { error: string }>> {
  try {
    const { id: taskId } = await params;

    // Look up task
    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check if there is already a running run for this task
    const existingRun = getRunningRunForTask(taskId);
    if (existingRun) {
      return NextResponse.json(
        { error: "Task already has a running run" },
        { status: 409 }
      );
    }

    // Create a run row
    const run = createRun({ taskId, agentId: task.agentId });
    const runId = run.id;

    // Update task status to in_progress and set assignedAt
    updateTask(taskId, {
      status: "in_progress",
      assignedAt: new Date().toISOString(),
    });

    // Fire-and-forget: do NOT await the agent runtime
    queueMicrotask(async () => {
      try {
        await runTask({
          taskId,
          runId,
          onEvent: (e) => publishEvent(runId, e),
        });
      } catch (err) {
        console.error(`[runTask error] taskId=${taskId} runId=${runId}`, err);
      }
    });

    return NextResponse.json({ runId }, { status: 202 });
  } catch (err) {
    console.error("[POST /api/tasks/[id]/run]", err);
    return NextResponse.json(
      { error: "Failed to start task run" },
      { status: 500 }
    );
  }
}
