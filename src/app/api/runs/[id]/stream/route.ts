import "server-only";
import { NextRequest } from "next/server";
import { getRun } from "@db/repos";
import { subscribe } from "@/app/api/_lib/event-bus";
import type { StreamEvent } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

/** Format a StreamEvent as an SSE data frame. */
function sseData(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** SSE heartbeat comment to keep the connection alive. */
const SSE_PING = ": ping\n\n";

export async function GET(
  req: NextRequest,
  { params }: RouteContext
): Promise<Response> {
  const { id: runId } = await params;

  // Look up the run to verify it exists and check completion state
  const run = getRun(runId);
  if (!run) {
    return new Response(JSON.stringify({ error: "Run not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed — ignore
        }
      };

      const close = () => {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // If run is already completed/failed/cancelled, emit a done event immediately and close
      if (run.status !== "running") {
        const doneEvent: StreamEvent = {
          type: "done",
          runId,
          status: run.status,
          output: "",
        };
        write(sseData(doneEvent));
        close();
        return;
      }

      // Subscribe to live events from the event bus
      const unsubscribe = subscribe(runId, (event: StreamEvent) => {
        write(sseData(event));

        // Close stream after terminal events
        if (event.type === "done" || event.type === "error") {
          unsubscribe();
          clearInterval(heartbeat);
          close();
        }
      });

      // Heartbeat every 15 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        write(SSE_PING);
      }, 15_000);

      // Handle client disconnect via AbortSignal
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearInterval(heartbeat);
        close();
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
