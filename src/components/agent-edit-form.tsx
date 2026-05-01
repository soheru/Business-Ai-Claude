"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const MODEL_OPTIONS = [
  { value: "claude-opus-4-7", label: "claude-opus-4-7 — Opus (best reasoning, most expensive)" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 — Sonnet (balanced)" },
  { value: "claude-haiku-4-5", label: "claude-haiku-4-5 — Haiku (fastest, cheapest)" },
  // Legacy values used by current seeds — keep selectable
  { value: "claude-opus-4-5", label: "claude-opus-4-5 — Opus legacy" },
  { value: "claude-sonnet-4-5", label: "claude-sonnet-4-5 — Sonnet legacy" },
];

interface Props {
  agent: Agent;
}

export function AgentEditForm({ agent }: Props) {
  const router = useRouter();

  const [name, setName] = useState(agent.name);
  const [model, setModel] = useState(agent.model);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDirty =
    name !== agent.name ||
    model !== agent.model ||
    systemPrompt !== agent.systemPrompt;

  // Show "Saved" confirmation for 4 seconds after a successful save
  const showSaved = savedAt !== null && Date.now() - savedAt < 4000;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, systemPrompt, name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <CardTitle className="text-base truncate">{agent.name}</CardTitle>
            <Badge variant="secondary" className="shrink-0 capitalize">
              {agent.role}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {agent.model}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor={`name-${agent.id}`}>Name</Label>
          <Input
            id={`name-${agent.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor={`model-${agent.id}`}>Model</Label>
          <select
            id={`model-${agent.id}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {/* If the agent's current model isn't in the known list, show it as an option so it isn't lost */}
            {!MODEL_OPTIONS.some((o) => o.value === model) && (
              <option value={model}>{model} (current)</option>
            )}
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label htmlFor={`prompt-${agent.id}`}>System Prompt</Label>
          <Textarea
            id={`prompt-${agent.id}`}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={10}
            className="font-mono text-xs min-h-[280px] resize-y"
            placeholder="System prompt for this agent..."
          />
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-3 pt-1">
          <Button
            onClick={handleSave}
            disabled={!isDirty || saving}
            size="sm"
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>

          {showSaved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Saved a few seconds ago
            </span>
          )}

          {error && (
            <span className="text-sm text-destructive">{error}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
