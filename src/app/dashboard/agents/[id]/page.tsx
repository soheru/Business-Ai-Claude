import { notFound } from "next/navigation";
import Link from "next/link";
import type { Agent, Task, Run } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatTimeAgo } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function getAgent(id: string): Promise<Agent | null> {
  try {
    const res = await fetch(`${BASE}/api/agents/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json() as Promise<Agent>;
  } catch {
    return null;
  }
}

async function getTasks(agentId: string): Promise<Task[]> {
  try {
    const res = await fetch(`${BASE}/api/tasks`, { cache: "no-store" });
    if (!res.ok) return [];
    const all = (await res.json()) as Task[];
    return all.filter((t) => t.agentId === agentId);
  } catch {
    return [];
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [agent, tasks] = await Promise.all([getAgent(id), getTasks(id)]);

  if (!agent) notFound();

  const completedTasks = tasks.filter((t) => t.status === "done");
  const completionRate =
    tasks.length > 0
      ? Math.round((completedTasks.length / tasks.length) * 100)
      : 0;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      {/* Back */}
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/agents">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Agents
        </Link>
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{agent.name}</h2>
          <p className="text-muted-foreground mt-1">
            <span className="font-mono text-sm">{agent.model}</span>
            {" · "}
            <span className="capitalize">{agent.role}</span>
          </p>
        </div>
        <Button asChild>
          <Link href={`/dashboard/tasks/new?agent=${agent.role}`}>
            New Task
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-2xl font-bold">{tasks.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-2xl font-bold">{completedTasks.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 text-center">
            <p className="text-2xl font-bold">{completionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">Completion Rate</p>
          </CardContent>
        </Card>
      </div>

      {/* System prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="font-mono text-sm text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
            {agent.systemPrompt}
          </pre>
        </CardContent>
      </Card>

      {/* Capabilities */}
      {agent.capabilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-sm"
                >
                  {cap}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task history */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Task History</h3>
        {tasks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              No tasks assigned to this agent yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tasks
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((task) => (
                <Link key={task.id} href={`/dashboard/tasks/${task.id}`}>
                  <Card className="hover:border-ring/50 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {task.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatTimeAgo(task.createdAt)}
                          </p>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
