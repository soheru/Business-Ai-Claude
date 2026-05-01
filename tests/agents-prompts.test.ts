/**
 * Sanity checks on the agents prompts module.
 *
 * We verify structure and content without making any SDK calls.
 */

import { describe, it, expect } from "vitest";
import { AGENT_PROMPTS, AGENT_MODELS } from "@/lib/agents/prompts";
import type { AgentRole } from "@/lib/types";

const ALL_ROLES: AgentRole[] = ["ceo", "marketer", "developer", "pm", "ux", "qa"];

// Tools the CEO delegates through — must appear in the CEO prompt
const CEO_DELEGATION_TOOLS = [
  "delegate_to_developer",
  "delegate_to_marketer",
  "delegate_to_pm",
  "delegate_to_ux",
  "delegate_to_qa",
];

describe("AGENT_PROMPTS", () => {
  it("has entries for all 6 roles", () => {
    for (const role of ALL_ROLES) {
      expect(AGENT_PROMPTS).toHaveProperty(role);
    }
  });

  it("every prompt is a non-empty string", () => {
    for (const role of ALL_ROLES) {
      const prompt = AGENT_PROMPTS[role];
      expect(typeof prompt).toBe("string");
      expect(prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("every prompt length is between 50 and 3000 chars", () => {
    for (const role of ALL_ROLES) {
      const len = AGENT_PROMPTS[role].length;
      expect(len).toBeGreaterThanOrEqual(50);
      expect(len).toBeLessThanOrEqual(3000);
    }
  });

  it("CEO prompt mentions all 5 delegation tools", () => {
    const ceoPrompt = AGENT_PROMPTS.ceo;
    for (const tool of CEO_DELEGATION_TOOLS) {
      expect(ceoPrompt).toContain(tool);
    }
  });

  it("CEO prompt mentions maximum recursion depth", () => {
    // CONTRACTS.md specifies max recursion depth of 3
    expect(AGENT_PROMPTS.ceo).toMatch(/\b3\b/);
  });
});

describe("AGENT_MODELS", () => {
  it("has model assignments for all 6 roles", () => {
    for (const role of ALL_ROLES) {
      expect(AGENT_MODELS).toHaveProperty(role);
    }
  });

  it("every model is a non-empty string", () => {
    for (const role of ALL_ROLES) {
      const model = AGENT_MODELS[role];
      expect(typeof model).toBe("string");
      expect(model.trim().length).toBeGreaterThan(0);
    }
  });

  it("CEO uses the opus model (most capable)", () => {
    expect(AGENT_MODELS.ceo).toContain("opus");
  });

  it("QA and marketer use haiku (cost-optimised)", () => {
    expect(AGENT_MODELS.qa).toContain("haiku");
    expect(AGENT_MODELS.marketer).toContain("haiku");
  });

  it("developer, pm, and ux use sonnet", () => {
    for (const role of ["developer", "pm", "ux"] as AgentRole[]) {
      expect(AGENT_MODELS[role]).toContain("sonnet");
    }
  });
});
