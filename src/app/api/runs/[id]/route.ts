import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getRunWithMessages } from "@db/repos";
import type { Run, Message } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
): Promise<NextResponse<(Run & { messages: Message[] }) | { error: string }>> {
  try {
    const { id } = await params;
    const run = getRunWithMessages(id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (err) {
    console.error("[GET /api/runs/[id]]", err);
    return NextResponse.json(
      { error: "Failed to fetch run" },
      { status: 500 }
    );
  }
}
