import { getDb } from "./client";
import crypto from "crypto";

// Inline placeholder prompts — used when src/lib/agents/prompts.ts doesn't exist yet
const DEFAULT_PROMPTS: Record<string, string> = {
  ceo: "You are the CEO agent. You orchestrate other agents to fulfill user requests. Break down complex tasks and delegate them to the appropriate specialist agents.",
  marketer:
    "You are the Marketer agent. You create compelling marketing copy, campaigns, and strategies that resonate with target audiences.",
  developer:
    "You are the Developer agent. You write clean, maintainable code, review technical implementations, and solve engineering problems.",
  pm: "You are the PM agent. You manage product requirements, prioritize features, and ensure the team delivers value to users.",
  ux: "You are the UX agent. You design intuitive user experiences, create wireframes, and ensure the product is accessible and user-friendly.",
  qa: "You are the QA agent. You verify software quality, write test cases, and ensure features work correctly across all scenarios.",
};

interface AgentSeed {
  role: string;
  name: string;
  model: string;
  systemPrompt: string;
}

export async function seed(): Promise<void> {
  const db = getDb();

  // Load prompts from the runtime agent slice; fall back to defaults
  let prompts: Record<string, string> = { ...DEFAULT_PROMPTS };
  try {
    const mod = await import("../src/lib/agents/prompts");
    if (mod && typeof mod.AGENT_PROMPTS === "object") {
      prompts = { ...prompts, ...mod.AGENT_PROMPTS };
    }
  } catch (err) {
    console.log("src/lib/agents/prompts.ts not loaded; using default prompts.", err);
  }

  const agents: AgentSeed[] = [
    {
      role: "ceo",
      name: "CEO",
      model: "claude-opus-4-5",
      systemPrompt: prompts.ceo,
    },
    {
      role: "marketer",
      name: "Marketer",
      model: "claude-haiku-4-5",
      systemPrompt: prompts.marketer,
    },
    {
      role: "developer",
      name: "Developer",
      model: "claude-sonnet-4-5",
      systemPrompt: prompts.developer,
    },
    {
      role: "pm",
      name: "PM",
      model: "claude-sonnet-4-5",
      systemPrompt: prompts.pm,
    },
    {
      role: "ux",
      name: "UX",
      model: "claude-sonnet-4-5",
      systemPrompt: prompts.ux,
    },
    {
      role: "qa",
      name: "QA",
      model: "claude-haiku-4-5",
      systemPrompt: prompts.qa,
    },
  ];

  const insert = db.prepare(`
    INSERT INTO agents (id, name, role, system_prompt, model, capabilities, is_active, created_at)
    VALUES (@id, @name, @role, @system_prompt, @model, @capabilities, 1, @created_at)
    ON CONFLICT(role) DO UPDATE SET
      name = excluded.name,
      system_prompt = excluded.system_prompt,
      model = excluded.model
  `);

  const insertMany = db.transaction((rows: AgentSeed[]) => {
    for (const agent of rows) {
      insert.run({
        id: crypto.randomUUID(),
        name: agent.name,
        role: agent.role,
        system_prompt: agent.systemPrompt,
        model: agent.model,
        capabilities: "[]",
        created_at: new Date().toISOString(),
      });
    }
  });

  insertMany(agents);
  console.log(`Seeded ${agents.length} agents.`);
}
