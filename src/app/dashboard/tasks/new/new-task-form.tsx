"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { Agent, AgentRole, TaskPriority, CreateTaskRequest } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

interface AgentOption {
  value: AgentRole;
  label: string;
  description: string;
}

const SEEDED_DESCRIPTIONS: Record<string, string> = {
  ceo: "Orchestrator — delegates to all other agents",
  marketer: "Marketing, copy, campaigns",
  developer: "Code, architecture, technical work",
  pm: "Product management, planning",
  ux: "User experience, design",
  qa: "Testing, quality assurance",
};

function toOption(a: Pick<Agent, "name" | "role" | "systemPrompt">): AgentOption {
  return {
    value: a.role,
    label: a.name,
    description:
      SEEDED_DESCRIPTIONS[a.role] ??
      (a.systemPrompt
        ? a.systemPrompt.split("\n")[0].slice(0, 100)
        : `Custom agent: ${a.name}`),
  };
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function NewTaskForm({ initialAgents }: { initialAgents: Agent[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const agentOptions = initialAgents.map(toOption);
  const preselectedAgent = (searchParams.get("agent") ?? "ceo") as AgentRole;
  const initialAgentRole =
    agentOptions.find((o) => o.value === preselectedAgent)?.value ??
    agentOptions[0]?.value ??
    "ceo";

  const [agentRole, setAgentRole] = useState<AgentRole>(initialAgentRole);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [workdir, setWorkdir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const body: CreateTaskRequest = {
        agentRole,
        title: title.trim(),
        description: description.trim(),
        priority,
        ...(workdir.trim() && { workdir: workdir.trim() }),
      };

      const createRes = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        throw new Error(`Failed to create task: ${text}`);
      }

      const task = (await createRes.json()) as { id: string };

      const runRes = await fetch(`/api/tasks/${task.id}/run`, {
        method: "POST",
      });

      if (!runRes.ok) {
        router.push(`/dashboard/tasks/${task.id}`);
        return;
      }

      router.push(`/dashboard/tasks/${task.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/dashboard/tasks">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Tasks
        </Link>
      </Button>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">New Task</h2>
        <p className="text-muted-foreground mt-1">
          Assign a task to an agent and kick off a run
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Agent</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {agentOptions.length === 0 && (
                  <p className="col-span-full text-xs text-muted-foreground italic">
                    No agents found. Add one in Settings.
                  </p>
                )}
                {agentOptions.map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAgentRole(value)}
                    className={`text-left rounded-md border p-3 transition-colors text-sm ${
                      agentRole === value
                        ? "border-ring bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    <p className="font-semibold">{label}</p>
                    <p className="text-xs mt-0.5 opacity-70 line-clamp-2">
                      {description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. Write a landing page copy for v2 launch"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Provide context, constraints, or expected output…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                disabled={loading}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPriority(value)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                      priority === value
                        ? "border-ring bg-accent text-accent-foreground font-medium"
                        : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="workdir">
                Working Directory{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="workdir"
                placeholder="absolute path"
                value={workdir}
                onChange={(e) => setWorkdir(e.target.value)}
                disabled={loading}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Absolute path (Windows: <span className="font-mono">C:\Games\MyProject</span>{" "}
                · Unix: <span className="font-mono">/home/user/myproject</span>). If set,
                the agent can read and write files in this directory. Leave empty for a
                text-only response.
              </p>
            </div>

            {error && (
              <div className="text-sm text-destructive-foreground bg-destructive/20 border border-destructive/50 rounded px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading || !title.trim()} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating &amp; Running…
                  </>
                ) : (
                  "Create Task & Run"
                )}
              </Button>
              <Button asChild variant="outline" disabled={loading}>
                <Link href="/dashboard/tasks">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
