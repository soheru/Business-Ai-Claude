"use client";

import { useMemo } from "react";
import type { AgentRole, StreamEvent } from "@/lib/types";

export type NodeStatus = "idle" | "running" | "done" | "failed";

export interface DelegationRecord {
  from: AgentRole;
  to: AgentRole;
  since: number;
  /** childRunId that started this delegation */
  childRunId: string;
}

export interface OrchestraState {
  statuses: Record<string, NodeStatus>;
  chunkCounts: Record<string, number>;
  activeDelegations: DelegationRecord[];
  /** Delegations that finished (used to draw faint residual lines) */
  completedDelegations: DelegationRecord[];
  runStartTime: number | null;
}

const DEFAULT_ROLES: AgentRole[] = ["ceo", "marketer", "developer", "pm", "ux", "qa"];

function makeDefaultStatuses(roles: AgentRole[]): Record<string, NodeStatus> {
  return Object.fromEntries(roles.map((r) => [r, "idle" as NodeStatus]));
}

/**
 * Computes orchestra state from SSE stream events.
 *
 * @param events - The list of stream events to process.
 * @param agentRoles - Optional canonical list of role slugs (from DB). Falls
 *   back to the 6 seeded roles when omitted. Any role found in events that
 *   isn't in the canonical list is added dynamically so unknown agents are
 *   still tracked.
 */
export function useOrchestraState(
  events: StreamEvent[],
  agentRoles?: AgentRole[]
): OrchestraState {
  return useMemo(() => {
    // Start from the canonical role list; we'll add event-derived roles below
    const canonicalRoles = agentRoles && agentRoles.length > 0 ? agentRoles : DEFAULT_ROLES;
    const knownRoles = new Set(canonicalRoles);

    // Pre-scan events to discover any roles not in the canonical list
    for (const ev of events) {
      if (ev.type === "child_run_start" && !knownRoles.has(ev.agentRole)) {
        knownRoles.add(ev.agentRole);
      }
    }

    const allRoles = Array.from(knownRoles);
    const statuses = makeDefaultStatuses(allRoles);
    const chunkCounts: Record<string, number> = Object.fromEntries(
      allRoles.map((r) => [r, 0])
    );

    // childRunId → agentRole (so child_run_end can find the role)
    const childRunRoles = new Map<string, AgentRole>();
    const activeDelegations: DelegationRecord[] = [];
    const completedDelegations: DelegationRecord[] = [];
    let runStartTime: number | null = null;

    for (const ev of events) {
      switch (ev.type) {
        case "chunk": {
          // First chunk means CEO is running
          if (statuses.ceo === "idle") {
            statuses.ceo = "running";
            runStartTime = runStartTime ?? Date.now();
          }
          chunkCounts.ceo = (chunkCounts.ceo ?? 0) + 1;
          break;
        }

        case "child_run_start": {
          const role = ev.agentRole;
          childRunRoles.set(ev.childRunId, role);

          // Ensure the role is tracked even if it wasn't in the canonical list
          if (!(role in statuses)) {
            statuses[role] = "idle";
            chunkCounts[role] = 0;
          }
          statuses[role] = "running";

          // Start an active delegation CEO → role if not already there
          const alreadyActive = activeDelegations.some(
            (d) => d.to === role && d.childRunId === ev.childRunId
          );
          if (!alreadyActive) {
            activeDelegations.push({
              from: "ceo",
              to: role,
              since: Date.now(),
              childRunId: ev.childRunId,
            });
          }
          break;
        }

        case "child_run_end": {
          const role = childRunRoles.get(ev.childRunId);
          if (role) {
            statuses[role] = ev.status === "completed" ? "done" : "failed";

            // Move delegation from active to completed
            const idx = activeDelegations.findIndex(
              (d) => d.childRunId === ev.childRunId
            );
            if (idx !== -1) {
              const [finished] = activeDelegations.splice(idx, 1);
              completedDelegations.push(finished);
            }
          }
          break;
        }

        case "done": {
          statuses.ceo = ev.status === "completed" ? "done" : "failed";
          break;
        }

        case "error": {
          statuses.ceo = "failed";
          break;
        }

        default:
          break;
      }
    }

    return {
      statuses,
      chunkCounts,
      activeDelegations,
      completedDelegations,
      runStartTime,
    };
  }, [events, agentRoles]);
}
