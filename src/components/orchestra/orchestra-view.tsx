"use client";

import { useMemo } from "react";
import type { StreamEvent, Agent, AgentRole } from "@/lib/types";
import { useOrchestraState } from "./use-orchestra-state";
import { AgentNode } from "./agent-node";
import { DelegationLine, DotGlowFilter } from "./delegation-line";

// Minimal agent shape needed by this component
type AgentSummary = Pick<Agent, "id" | "name" | "role">;

interface OrchestraViewProps {
  events: StreamEvent[];
  /** Live agent list from the DB. When omitted, falls back to the 5 default sub-agents. */
  agents?: AgentSummary[];
}

// Layout constants
const SVG_W = 560;
const SVG_H = 460;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2;

// Default seeded sub-agents used when no `agents` prop is provided
const DEFAULT_SUB_AGENT_ROLES: AgentRole[] = ["marketer", "developer", "pm", "ux", "qa"];

/**
 * Compute orbit radius based on sub-agent count.
 * Larger orbits prevent crowding as more agents are added.
 */
function orbitRadius(n: number): number {
  if (n <= 6) return 170;
  if (n <= 9) return 200;
  return 220;
}

/**
 * Compute node size based on sub-agent count.
 * Slightly smaller nodes when orbit becomes dense.
 */
function nodeSize(n: number): { nodeW: number; nodeH: number } {
  if (n <= 9) return { nodeW: 90, nodeH: 80 };
  return { nodeW: 76, nodeH: 68 };
}

function getSubAgentPosition(index: number, total: number, radius: number): { x: number; y: number } {
  // Distribute agents evenly; offset by -π/2 so the first agent starts at top
  const angle = (2 * Math.PI / total) * index - Math.PI / 2;
  return {
    x: CENTER_X + radius * Math.cos(angle),
    y: CENTER_Y + radius * Math.sin(angle),
  };
}

function formatDuration(sinceMs: number): string {
  const elapsed = Math.round((Date.now() - sinceMs) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
}

export function OrchestraView({ events, agents }: OrchestraViewProps) {
  // ─── Resolve agent list ───────────────────────────────────────────────────
  const { ceoAgent, subAgents } = useMemo(() => {
    if (!agents || agents.length === 0) {
      // Backwards-compatible fallback: use the 5 default sub-agent roles
      return {
        ceoAgent: { id: "ceo", name: "CEO", role: "ceo" } as AgentSummary,
        subAgents: DEFAULT_SUB_AGENT_ROLES.map((r) => ({
          id: r,
          name: r.charAt(0).toUpperCase() + r.slice(1),
          role: r,
        })) as AgentSummary[],
      };
    }

    const found = agents.find((a) => a.role === "ceo");
    const ceo = found ?? { id: "ceo", name: "CEO", role: "ceo" };
    const subs = agents.filter((a) => a.role !== "ceo");
    return { ceoAgent: ceo, subAgents: subs };
  }, [agents]);

  // ─── Derive canonical role list for the state hook ───────────────────────
  const agentRoles = useMemo(
    () => [ceoAgent.role, ...subAgents.map((a) => a.role)],
    [ceoAgent, subAgents]
  );

  const { statuses, activeDelegations, completedDelegations, runStartTime } =
    useOrchestraState(events, agentRoles);

  // ─── Layout geometry ─────────────────────────────────────────────────────
  const n = subAgents.length;
  const radius = orbitRadius(n);
  const { nodeW, nodeH } = nodeSize(n);

  const positions = useMemo(() => {
    const map: Record<string, { x: number; y: number }> = {
      [ceoAgent.role]: { x: CENTER_X, y: CENTER_Y },
    };
    subAgents.forEach((agent, i) => {
      map[agent.role] = getSubAgentPosition(i, n, radius);
    });
    return map;
  }, [subAgents, ceoAgent.role, n, radius]);

  // ─── Status labels ────────────────────────────────────────────────────────
  const statusLabels = useMemo(() => {
    const labels: Record<string, string | undefined> = {};

    for (const agent of subAgents) {
      const s = statuses[agent.role];
      if (s === "running") {
        const delegation = activeDelegations.find((d) => d.to === agent.role);
        labels[agent.role] = delegation
          ? `active ${formatDuration(delegation.since)}`
          : "running...";
      } else if (s === "done") {
        labels[agent.role] = "done";
      } else if (s === "failed") {
        labels[agent.role] = "failed";
      }
    }

    const ceoStatus = statuses[ceoAgent.role];
    if (ceoStatus === "running" && runStartTime) {
      labels[ceoAgent.role] = `active ${formatDuration(runStartTime)}`;
    } else if (ceoStatus === "done") {
      labels[ceoAgent.role] = "done";
    } else if (ceoStatus === "failed") {
      labels[ceoAgent.role] = "failed";
    }

    return labels;
  }, [statuses, activeDelegations, runStartTime, subAgents, ceoAgent.role]);

  function getDelegationState(role: AgentRole): "pending" | "flowing" | "idle" {
    if (activeDelegations.some((d) => d.to === role)) return "flowing";
    if (completedDelegations.some((d) => d.to === role)) return "idle";
    return "pending";
  }

  const ceoPos = positions[ceoAgent.role];
  const hasAnyActivity = events.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Agent Orchestra
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {statuses[ceoAgent.role] === "running" && (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Orchestrating
            </>
          )}
          {statuses[ceoAgent.role] === "done" && (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
              Complete
            </>
          )}
          {statuses[ceoAgent.role] === "failed" && (
            <>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
              Failed
            </>
          )}
          {statuses[ceoAgent.role] === "idle" && !hasAnyActivity && (
            <span className="text-muted-foreground/50">Waiting to start</span>
          )}
        </span>
      </div>

      {/* SVG canvas — responsive */}
      <div className="relative h-[360px] md:h-[420px] w-full">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-full"
          aria-label="Agent orchestra visualization"
        >
          <defs>
            <DotGlowFilter />
            {/* Subtle radial background gradient */}
            <radialGradient id="bg-grad" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(148,163,184,0.04)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>

          {/* Background */}
          <rect width={SVG_W} height={SVG_H} fill="url(#bg-grad)" />

          {/* Faint orbit ring */}
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={radius}
            fill="none"
            stroke="rgba(148,163,184,0.1)"
            strokeWidth={1}
            strokeDasharray="6 6"
          />

          {/* Delegation lines — rendered below nodes */}
          {subAgents.map((agent) => {
            const lineState = getDelegationState(agent.role);
            const to = positions[agent.role];
            if (!to) return null;
            return (
              <DelegationLine
                key={agent.id}
                fromX={ceoPos.x}
                fromY={ceoPos.y}
                toX={to.x}
                toY={to.y}
                state={lineState}
              />
            );
          })}

          {/* Sub-agent nodes */}
          {subAgents.map((agent) => {
            const pos = positions[agent.role];
            if (!pos) return null;
            return (
              <foreignObject
                key={agent.id}
                x={pos.x - nodeW / 2}
                y={pos.y - nodeH / 2}
                width={nodeW}
                height={nodeH}
                overflow="visible"
              >
                <AgentNode
                  role={agent.role}
                  name={agent.name}
                  status={statuses[agent.role] ?? "idle"}
                  label={statusLabels[agent.role]}
                />
              </foreignObject>
            );
          })}

          {/* CEO node — center, larger */}
          <foreignObject
            x={CENTER_X - 55}
            y={CENTER_Y - 60}
            width={110}
            height={100}
            overflow="visible"
          >
            <AgentNode
              role={ceoAgent.role}
              name={ceoAgent.name}
              status={statuses[ceoAgent.role] ?? "idle"}
              label={statusLabels[ceoAgent.role]}
              centerNode
            />
          </foreignObject>
        </svg>
      </div>

      {/* Legend / stats bar */}
      <div className="px-4 py-2 border-t border-border flex items-center gap-4 flex-wrap">
        {[
          { color: "bg-muted-foreground/30", label: "Idle" },
          { color: "bg-blue-500 animate-pulse", label: "Running" },
          { color: "bg-green-500", label: "Done" },
          { color: "bg-red-500", label: "Failed" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
            {label}
          </span>
        ))}

        <span className="ml-auto text-xs text-muted-foreground/50">
          {events.length} events
        </span>
      </div>
    </div>
  );
}
