import Link from "next/link";
import type { Task, Agent } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatTimeAgo } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function getTasks(): Promise<Task[]> {
  try {
    const res = await fetch(`${BASE}/api/tasks`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<Task[]>;
  } catch {
    return [];
  }
}

async function getAgents(): Promise<Agent[]> {
  try {
    const res = await fetch(`${BASE}/api/agents`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<Agent[]>;
  } catch {
    return [];
  }
}

export default async function HistoryPage() {
  const [tasks, agents] = await Promise.all([getTasks(), getAgents()]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const sorted = [...tasks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );

  const completed = sorted.filter(
    (t) => t.status === "done" || t.status === "failed"
  );

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">History</h2>
        <p className="text-muted-foreground mt-1">
          Completed and failed tasks
        </p>
      </div>

      {completed.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No completed tasks yet.
        </div>
      ) : (
        <div className="space-y-2">
          {completed.map((task) => {
            const agent = agentMap.get(task.agentId);
            return (
              <Link key={task.id} href={`/dashboard/tasks/${task.id}`}>
                <Card className="hover:border-ring/50 transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {task.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {agent?.name ?? "Unknown"} &middot;{" "}
                          {task.completedAt
                            ? `Completed ${formatTimeAgo(task.completedAt)}`
                            : formatTimeAgo(task.createdAt)}
                        </p>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
