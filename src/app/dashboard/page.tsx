import Link from "next/link";
import type { Agent, Task } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatTimeAgo } from "@/lib/utils";
import { Activity, CheckSquare, DollarSign, Cpu } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function getAgents(): Promise<Agent[]> {
  try {
    const res = await fetch(`${BASE}/api/agents`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<Agent[]>;
  } catch {
    return [];
  }
}

async function getTasks(): Promise<Task[]> {
  try {
    const res = await fetch(`${BASE}/api/tasks`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json() as Promise<Task[]>;
  } catch {
    return [];
  }
}

export default async function DashboardHome() {
  const [agents, tasks] = await Promise.all([getAgents(), getTasks()]);

  const activeRuns = tasks.filter((t) => t.status === "in_progress").length;
  const today = new Date().toISOString().slice(0, 10);
  const tasksToday = tasks.filter((t) => t.createdAt.slice(0, 10) === today).length;
  const agentsOnline = agents.filter((a) => a.isActive).length;
  const recentTasks = [...tasks]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const kpis = [
    {
      label: "Active Runs",
      value: activeRuns,
      icon: Activity,
      color: "text-blue-400",
    },
    {
      label: "Tasks Today",
      value: tasksToday,
      icon: CheckSquare,
      color: "text-green-400",
    },
    {
      label: "Cost Today",
      value: "$0.00",
      icon: DollarSign,
      color: "text-yellow-400",
    },
    {
      label: "Agents Online",
      value: agentsOnline,
      icon: Cpu,
      color: "text-purple-400",
    },
  ];

  return (
    <div className="p-8 space-y-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Overview of your agent workspace
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {label}
                  </p>
                  <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <Icon className={`h-8 w-8 ${color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <Link href="/dashboard/tasks/new?agent=ceo">Ask CEO</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/tasks/new">New Task</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/agents">View Agents</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent tasks */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Recent Tasks</h3>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/tasks">View all</Link>
            </Button>
          </div>
          {recentTasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                No tasks yet. Create your first task to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentTasks.map((task) => {
                const agent = agentMap.get(task.agentId);
                return (
                  <Link
                    key={task.id}
                    href={`/dashboard/tasks/${task.id}`}
                    className="block"
                  >
                    <Card className="hover:border-ring/50 transition-colors cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {task.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {agent?.name ?? "Unknown agent"} &middot;{" "}
                              {formatTimeAgo(task.createdAt)}
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
      </div>
    </div>
  );
}
