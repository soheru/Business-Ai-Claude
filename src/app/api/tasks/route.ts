import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { existsSync } from "node:fs";
import { isAbsolute } from "node:path";
import { listTasks, createTask, getAgentByRole } from "@db/repos";
import type { Task, TaskStatus, AgentRole } from "@/lib/types";

const taskStatusSchema = z.enum([
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "failed",
]);
const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const agentRoleSchema = z.enum(["ceo", "marketer", "developer", "pm", "ux", "qa"]);

const createTaskSchema = z.object({
  agentRole: agentRoleSchema,
  title: z.string().min(1, "Title is required"),
  description: z.string().default(""),
  priority: taskPrioritySchema.optional().default("medium"),
  parentTaskId: z.string().nullable().optional().default(null),
  workdir: z.string().trim().min(1).nullable().optional(),
});

export async function GET(
  req: NextRequest
): Promise<NextResponse<Task[] | { error: string }>> {
  try {
    const { searchParams } = req.nextUrl;
    const rawStatus = searchParams.get("status");
    const rawAgentRole = searchParams.get("agent_role");
    const status = rawStatus
      ? (taskStatusSchema.safeParse(rawStatus).success
          ? (rawStatus as TaskStatus)
          : undefined)
      : undefined;
    const agentRole = rawAgentRole
      ? (agentRoleSchema.safeParse(rawAgentRole).success
          ? (rawAgentRole as AgentRole)
          : undefined)
      : undefined;
    const tasks = listTasks({ status, agentRole });
    return NextResponse.json(tasks);
  } catch (err) {
    console.error("[GET /api/tasks]", err);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<Task | { error: string }>> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const { agentRole, title, description, priority, parentTaskId, workdir } = parsed.data;

    // Validate workdir when provided
    if (workdir != null) {
      if (!isAbsolute(workdir)) {
        return NextResponse.json(
          { error: "workdir must be an absolute path (e.g. C:\\Games\\MyProject or /home/user/myproject)" },
          { status: 400 }
        );
      }
      if (!existsSync(workdir)) {
        return NextResponse.json(
          { error: `workdir does not exist: ${workdir}. Create the directory first.` },
          { status: 400 }
        );
      }
    }

    // Look up agent by role
    const agent = getAgentByRole(agentRole);
    if (!agent) {
      return NextResponse.json(
        { error: `No agent found with role: ${agentRole}` },
        { status: 400 }
      );
    }

    const task = createTask({
      agentId: agent.id,
      agentRole,
      title,
      description,
      priority,
      parentTaskId: parentTaskId ?? null,
      workdir: workdir ?? null,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    console.error("[POST /api/tasks]", err);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
