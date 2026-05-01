import Link from "next/link";
import type { Agent, Task, TaskStatus } from "@/lib/types";
import { TaskCard } from "@/components/task-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

async function getTasks(agentRole?: string): Promise<Task[]> {
  try {
    const params = new URLSearchParams();
    if (agentRole) params.set("agent_role", agentRole);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${BASE}/api/tasks${qs}`, { cache: "no-store" });
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

interface PageProps {
  searchParams: Promise<{ agent_role?: string; priority?: string }>;
}

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "text-slate-400" },
  { status: "in_progress", label: "In Progress", color: "text-blue-400" },
  { status: "in_review", label: "In Review", color: "text-yellow-400" },
  { status: "done", label: "Done", color: "text-green-400" },
];

function buildHref(
  base: string,
  current: Record<string, string | undefined>,
  name: string,
  value: string
): string {
  const params = new URLSearchParams();
  // Preserve all current params except the one we're changing
  Object.entries(current).forEach(([k, v]) => {
    if (k !== name && v) params.set(k, v);
  });
  if (value) params.set(name, value);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const { agent_role, priority } = await searchParams;

  const [tasks, agents] = await Promise.all([
    getTasks(agent_role),
    getAgents(),
  ]);

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const filtered = priority
    ? tasks.filter((t) => t.priority === priority)
    : tasks;

  const byStatus = (status: TaskStatus) =>
    filtered.filter((t) => t.status === status);

  const currentParams = { agent_role, priority };

  return (
    <div className="p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-muted-foreground mt-1">
            {filtered.length} task{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/tasks/new">
            <Plus className="h-4 w-4 mr-1" />
            New Task
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <FilterSelect
          name="agent_role"
          label="Agent"
          current={agent_role}
          currentParams={currentParams}
          options={[
            { value: "", label: "All Agents" },
            ...agents.map((a) => ({ value: a.role, label: a.name })),
          ]}
        />
        <FilterSelect
          name="priority"
          label="Priority"
          current={priority}
          currentParams={currentParams}
          options={[
            { value: "", label: "All Priorities" },
            { value: "urgent", label: "Urgent" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {COLUMNS.map(({ status, label, color }) => {
          const colTasks = byStatus(status);
          return (
            <div key={status} className="space-y-3">
              {/* Column header */}
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-semibold ${color}`}>{label}</h3>
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {colTasks.length}
                </span>
              </div>
              {/* Cards */}
              <div className="space-y-2">
                {colTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    No tasks
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      agentName={agentMap.get(task.agentId)?.name}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({
  name,
  label,
  current,
  currentParams,
  options,
}: {
  name: string;
  label: string;
  current: string | undefined;
  currentParams: Record<string, string | undefined>;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <div className="flex flex-wrap gap-1">
        {options.map(({ value, label: optLabel }) => {
          const isActive = (current ?? "") === value;
          const href = buildHref("/dashboard/tasks", currentParams, name, value);
          return (
            <Link
              key={value}
              href={href}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {optLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
