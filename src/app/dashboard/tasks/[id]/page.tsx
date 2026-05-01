import { notFound } from "next/navigation";
import Link from "next/link";
import type { Task, Run, Agent } from "@/lib/types";
import { listAgents } from "@db/repos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { TaskRunStream } from "@/components/task-run-stream";
import { TaskReplyForm } from "@/components/task-reply-form";
import { formatTimeAgo } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

interface TaskWithChildren extends Task {
  children: Task[];
  runs: Run[];
}

async function getTask(id: string): Promise<TaskWithChildren | null> {
  try {
    const res = await fetch(`${BASE}/api/tasks/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<TaskWithChildren>;
  } catch {
    return null;
  }
}

async function getAgent(id: string): Promise<Agent | null> {
  try {
    const res = await fetch(`${BASE}/api/agents/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<Agent>;
  } catch {
    return null;
  }
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-800 text-slate-400 border-slate-700",
  medium: "bg-blue-900/50 text-blue-400 border-blue-800",
  high: "bg-orange-900/50 text-orange-400 border-orange-800",
  urgent: "bg-red-900/50 text-red-400 border-red-800",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const task = await getTask(id);

  if (!task) notFound();

  const agent = await getAgent(task.agentId);

  // Server-side load of all agents for the orchestra view (avoids client
  // loading-flash where the default 5 render before the fetch resolves).
  const allAgents = listAgents().map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
  }));

  // Find the most recent run (for live streaming)
  const latestRun =
    task.runs.length > 0
      ? task.runs.sort((a, b) =>
          b.startedAt.localeCompare(a.startedAt)
        )[0]
      : null;

  const activeRun = task.runs.find(
    (r) => r.status === "running"
  ) ?? latestRun;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/tasks">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Tasks
        </Link>
      </Button>

      {/* Task header */}
      <div className="space-y-2">
        <div className="flex items-start gap-3 flex-wrap">
          <h2 className="text-2xl font-bold tracking-tight flex-1">
            {task.title}
          </h2>
          <StatusBadge status={task.status} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {agent && (
            <Link
              href={`/dashboard/agents/${agent.id}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {agent.name}
            </Link>
          )}
          <span
            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${
              priorityColors[task.priority] ?? ""
            }`}
          >
            {task.priority}
          </span>
          <span className="text-xs text-muted-foreground">
            Created {formatTimeAgo(task.createdAt)}
          </span>
        </div>
        {task.workdir && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-800 bg-amber-900/30 px-2.5 py-1 text-xs font-mono text-amber-300">
              <span>&#128193;</span>
              <span>Working in: {task.workdir}</span>
            </span>
          </div>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider">
              Description
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {task.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live stream / output */}
      {activeRun && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Run Output
              </CardTitle>
              <div className="flex items-center gap-2">
                <StatusBadge status={activeRun.status} />
                <span className="text-xs text-muted-foreground font-mono">
                  {activeRun.id.slice(0, 8)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <TaskRunStream runId={activeRun.id} initialAgents={allAgents} />
          </CardContent>
        </Card>
      )}

      {/* Output (if completed) */}
      {task.output && task.status === "done" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Final Output</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <pre className="font-mono text-sm text-green-300 bg-black/50 rounded p-4 whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
              {task.output}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Sub-tasks */}
      {task.children.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">
            Sub-tasks ({task.children.length})
          </h3>
          <div className="space-y-2 pl-4 border-l-2 border-border">
            {task.children.map((child) => (
              <Link key={child.id} href={`/dashboard/tasks/${child.id}`}>
                <Card className="hover:border-ring/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium truncate flex-1">
                        {child.title}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={child.status} />
                        <span className="text-xs text-muted-foreground">
                          {formatTimeAgo(child.createdAt)}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* All runs */}
      {task.runs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">
            Runs ({task.runs.length})
          </h3>
          <div className="space-y-2">
            {task.runs
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
              .map((run) => (
                <Card key={run.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {run.id.slice(0, 8)}
                          </span>
                          <StatusBadge status={run.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Started {formatTimeAgo(run.startedAt)}
                          {run.endedAt &&
                            ` · ended ${formatTimeAgo(run.endedAt)}`}
                        </p>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>
                          In:{" "}
                          <span className="text-foreground">
                            {run.tokensInput.toLocaleString()}
                          </span>{" "}
                          tok
                        </span>
                        <span>
                          Out:{" "}
                          <span className="text-foreground">
                            {run.tokensOutput.toLocaleString()}
                          </span>{" "}
                          tok
                        </span>
                        <span>
                          Cost:{" "}
                          <span className="text-foreground">
                            ${run.costUsd.toFixed(4)}
                          </span>
                        </span>
                      </div>
                    </div>
                    {run.error && (
                      <p className="mt-2 text-xs text-destructive-foreground bg-destructive/20 border border-destructive/40 rounded px-2 py-1">
                        {run.error}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* Reply / continue conversation */}
      <div className="mt-8">
        <TaskReplyForm taskId={task.id} taskStatus={task.status} />
      </div>
    </div>
  );
}
