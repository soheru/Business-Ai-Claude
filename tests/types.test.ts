/**
 * Structural / runtime checks on the shared type definitions in src/lib/types.ts.
 *
 * TypeScript union types vanish at runtime, so we maintain parallel runtime
 * arrays here and verify they match what the rest of the codebase expects.
 */

import { describe, it, expect } from "vitest";
import type {
  AgentRole,
  TaskStatus,
  TaskPriority,
  RunStatus,
  MessageRole,
} from "@/lib/types";

// Runtime mirrors of the TS union types (must be kept in sync with types.ts)
const AGENT_ROLES: AgentRole[] = ["ceo", "marketer", "developer", "pm", "ux", "qa"];

const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "in_progress",
  "in_review",
  "done",
  "failed",
];

const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];

const RUN_STATUSES: RunStatus[] = ["running", "completed", "failed", "cancelled"];

const MESSAGE_ROLES: MessageRole[] = [
  "user",
  "assistant",
  "tool_use",
  "tool_result",
  "system",
];

describe("Type structural checks", () => {
  it("has exactly 6 agent roles", () => {
    expect(AGENT_ROLES).toHaveLength(6);
  });

  it("agent roles include all required roles", () => {
    for (const role of ["ceo", "marketer", "developer", "pm", "ux", "qa"]) {
      expect(AGENT_ROLES).toContain(role);
    }
  });

  it("task statuses form a complete lifecycle", () => {
    // Every status that maps to a kanban column or terminal state
    for (const s of ["backlog", "in_progress", "in_review", "done", "failed"]) {
      expect(TASK_STATUSES).toContain(s);
    }
  });

  it("task priorities have all 4 levels", () => {
    expect(TASK_PRIORITIES).toHaveLength(4);
    expect(TASK_PRIORITIES).toContain("urgent");
  });

  it("run statuses include running and all terminal states", () => {
    expect(RUN_STATUSES).toContain("running");
    expect(RUN_STATUSES).toContain("completed");
    expect(RUN_STATUSES).toContain("failed");
    expect(RUN_STATUSES).toContain("cancelled");
  });

  it("message roles include all SSE-related roles", () => {
    expect(MESSAGE_ROLES).toContain("tool_use");
    expect(MESSAGE_ROLES).toContain("tool_result");
  });

  it("no duplicate values in any union", () => {
    const allUnions = [
      AGENT_ROLES,
      TASK_STATUSES,
      TASK_PRIORITIES,
      RUN_STATUSES,
      MESSAGE_ROLES,
    ];

    for (const union of allUnions) {
      const unique = new Set(union);
      expect(unique.size).toBe(union.length);
    }
  });
});
