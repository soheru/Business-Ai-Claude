import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTaskWithChildren, updateTask } from "@db/repos";
import type { Task } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const taskStatusSchema = z.enum([
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "failed",
]);
const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

const patchTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  output: z.string().nullable().optional(),
  assignedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<(Task & { children: Task[]; runs: unknown[] }) | { error: string }>> {
  try {
    const { id } = await params;
    const task = getTaskWithChildren(id);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (err) {
    console.error("[GET /api/tasks/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<Task | { error: string }>> {
  try {
    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const updated = updateTask(id, parsed.data);
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/tasks/[id]]", err);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}
