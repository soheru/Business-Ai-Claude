import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAgent, updateAgent } from "@db/repos";
import type { Agent } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<Agent | { error: string }>> {
  try {
    const { id } = await params;
    const agent = getAgent(id);
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json(agent);
  } catch (err) {
    console.error("[GET /api/agents/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch agent" },
      { status: 500 }
    );
  }
}

const patchAgentSchema = z.object({
  name: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<Agent | { error: string }>> {
  try {
    const { id } = await params;
    const existing = getAgent(id);
    if (!existing) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchAgentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const updated = updateAgent(id, parsed.data);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/agents/[id]]", err);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }
}
