import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAgents, createAgent, getAgentByRole } from "@db/repos";
import type { Agent } from "@/lib/types";

export async function GET(): Promise<NextResponse<Agent[] | { error: string }>> {
  try {
    const agents = listAgents();
    return NextResponse.json(agents);
  } catch (err) {
    console.error("[GET /api/agents]", err);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_-]*$/, "Role must be a lowercase slug (a-z, 0-9, -, _)"),
  model: z.string().trim().min(1).default("claude-sonnet-4-6"),
  systemPrompt: z.string().trim().min(20, "System prompt must be at least 20 chars"),
});

export async function POST(req: NextRequest): Promise<NextResponse<Agent | { error: string }>> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    // Check role uniqueness
    if (getAgentByRole(parsed.data.role)) {
      return NextResponse.json(
        { error: `An agent with role "${parsed.data.role}" already exists` },
        { status: 409 }
      );
    }

    const agent = createAgent(parsed.data);
    return NextResponse.json(agent, { status: 201 });
  } catch (err) {
    console.error("[POST /api/agents]", err);
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
