"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MODEL_OPTIONS = [
  { value: "claude-opus-4-7", label: "claude-opus-4-7 — Opus (best reasoning, most expensive)" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 — Sonnet (balanced)" },
  { value: "claude-haiku-4-5", label: "claude-haiku-4-5 — Haiku (fastest, cheapest)" },
  // Legacy values used by current seeds — keep selectable
  { value: "claude-opus-4-5", label: "claude-opus-4-5 — Opus legacy" },
  { value: "claude-sonnet-4-5", label: "claude-sonnet-4-5 — Sonnet legacy" },
];

function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[^a-z]+/, ""); // ensure starts with a letter
}

const EMPTY_STATE = {
  name: "",
  role: "",
  model: "claude-sonnet-4-6",
  systemPrompt: "",
};

export function AddAgentForm() {
  const uid = useId();
  const router = useRouter();

  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(EMPTY_STATE.name);
  const [role, setRole] = useState(EMPTY_STATE.role);
  const [roleEdited, setRoleEdited] = useState(false);
  const [model, setModel] = useState(EMPTY_STATE.model);
  const [systemPrompt, setSystemPrompt] = useState(EMPTY_STATE.systemPrompt);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    // Auto-derive slug unless the user has manually edited the role field
    if (!roleEdited) {
      setRole(deriveSlug(value));
    }
  }

  function handleRoleChange(value: string) {
    setRoleEdited(true);
    // Enforce lowercase slug characters in real time
    setRole(value.toLowerCase().replace(/[^a-z0-9_-]/g, ""));
  }

  function handleCancel() {
    setExpanded(false);
    setName(EMPTY_STATE.name);
    setRole(EMPTY_STATE.role);
    setRoleEdited(false);
    setModel(EMPTY_STATE.model);
    setSystemPrompt(EMPTY_STATE.systemPrompt);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, model, systemPrompt }),
      });

      if (res.status === 201) {
        // Success — collapse, reset, refresh the server component list
        handleCancel();
        router.refresh();
        return;
      }

      const j = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(j.error ?? `HTTP ${res.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <span className="text-base leading-none">+</span>
        <span>Add Agent</span>
      </button>
    );
  }

  return (
    <Card className="border-dashed border-border bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">New Agent</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-name`}>Name</Label>
          <Input
            id={`${uid}-name`}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Researcher"
          />
        </div>

        {/* Role slug */}
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-role`}>Role slug</Label>
          <Input
            id={`${uid}-role`}
            value={role}
            onChange={(e) => handleRoleChange(e.target.value)}
            placeholder="e.g. researcher"
          />
          <p className="text-xs text-muted-foreground">
            lowercase a-z, 0-9, _, - (used as unique identifier)
          </p>
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-model`}>Model</Label>
          <select
            id={`${uid}-model`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* System prompt */}
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-prompt`}>System Prompt</Label>
          <Textarea
            id={`${uid}-prompt`}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={8}
            className="font-mono text-xs min-h-[180px] resize-y"
            placeholder="Describe this agent's role, expertise, and behaviour (min 20 chars)..."
          />
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? "Saving..." : "Save agent"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </Button>

          {error && (
            <span className="text-sm text-destructive">{error}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
