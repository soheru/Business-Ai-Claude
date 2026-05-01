"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, StreamEvent } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { OrchestraView } from "@/components/orchestra/orchestra-view";

type AgentSummary = Pick<Agent, "id" | "name" | "role">;

interface TaskRunStreamProps {
  runId: string;
  /** Agents pre-loaded from the server. When provided, the client skips the
   *  /api/agents fetch entirely so the orchestra renders correct agents on
   *  first paint (no loading-flash with hardcoded defaults). */
  initialAgents?: AgentSummary[];
}

interface EventLogEntry {
  id: string;
  event: StreamEvent;
  timestamp: number;
}

export function TaskRunStream({ runId, initialAgents }: TaskRunStreamProps) {
  const [chunks, setChunks] = useState<string[]>([]);
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Use SSR-provided agents when available; otherwise fetch on mount as fallback.
  const [agents, setAgents] = useState<AgentSummary[]>(initialAgents ?? []);
  useEffect(() => {
    if (initialAgents && initialAgents.length > 0) return; // already populated
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setAgents(
            (data as Agent[]).map(({ id, name, role }) => ({ id, name, role }))
          );
        }
      })
      .catch(() => setAgents([]));
  }, [initialAgents]);

  useEffect(() => {
    if (!runId) return;

    const es = new EventSource(`/api/runs/${runId}/stream`);

    es.onmessage = (e) => {
      try {
        const event: StreamEvent = JSON.parse(e.data as string);
        const entry: EventLogEntry = {
          id: `${Date.now()}-${Math.random()}`,
          event,
          timestamp: Date.now(),
        };

        setEvents((prev) => [...prev, entry]);

        if (event.type === "chunk") {
          setChunks((prev) => [...prev, event.text]);
          // Auto-scroll output
          setTimeout(() => {
            outputRef.current?.scrollTo({
              top: outputRef.current.scrollHeight,
              behavior: "smooth",
            });
          }, 0);
        } else if (event.type === "done") {
          setIsDone(true);
          es.close();
        } else if (event.type === "error") {
          setError(event.error);
          setIsDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setError("Stream connection lost");
      setIsDone(true);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [runId]);

  const fullText = chunks.join("");

  // Derive a plain StreamEvent[] from entries for the orchestra view
  const streamEvents = useMemo(
    () => events.map((e) => e.event),
    [events]
  );

  return (
    <div className="space-y-4">
      {/* Animated orchestra visualization */}
      <OrchestraView events={streamEvents} agents={agents} />

      {/* Streaming text output */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Output
          </h3>
          <div className="flex items-center gap-2">
            {!isDone && !error && (
              <span className="flex items-center gap-1.5 text-xs text-blue-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Streaming
              </span>
            )}
            {isDone && !error && (
              <Badge variant="success" className="text-xs">Done</Badge>
            )}
            {error && (
              <Badge variant="destructive" className="text-xs">Error</Badge>
            )}
          </div>
        </div>
        <div
          ref={outputRef}
          className="rounded-md border border-border bg-black/50 p-4 font-mono text-sm text-green-300 min-h-[120px] max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words"
        >
          {fullText || (
            <span className="text-muted-foreground italic">
              {isDone ? "No output." : "Waiting for output…"}
            </span>
          )}
          {!isDone && !error && fullText && (
            <span className="inline-block w-2 h-4 bg-green-400 ml-0.5 animate-pulse align-text-bottom" />
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-destructive-foreground bg-destructive/20 border border-destructive/50 rounded px-3 py-2">
            {error}
          </p>
        )}
      </div>

      {/* Event log */}
      {events.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Event Log
          </h3>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {events
              .filter((e) => e.event.type !== "chunk")
              .map((entry) => (
                <EventLogItem key={entry.id} entry={entry} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EventLogItem({ entry }: { entry: EventLogEntry }) {
  const { event } = entry;

  switch (event.type) {
    case "tool_use":
      return (
        <div className="flex items-start gap-2 text-xs rounded bg-muted/30 px-3 py-2 font-mono">
          <Badge variant="info" className="text-xs shrink-0">tool</Badge>
          <span className="text-foreground font-semibold">{event.toolName}</span>
          <span className="text-muted-foreground truncate">
            {JSON.stringify(event.input).slice(0, 80)}
          </span>
        </div>
      );
    case "tool_result":
      return (
        <div className="flex items-start gap-2 text-xs rounded bg-muted/30 px-3 py-2 font-mono">
          <Badge variant="success" className="text-xs shrink-0">result</Badge>
          <span className="text-foreground font-semibold">{event.toolName}</span>
          <span className="text-muted-foreground truncate">{event.output.slice(0, 80)}</span>
        </div>
      );
    case "child_run_start":
      return (
        <div className="flex items-center gap-2 text-xs rounded bg-purple-900/20 border border-purple-800/30 px-3 py-2">
          <Badge variant="secondary" className="text-xs shrink-0">child run</Badge>
          <span className="text-purple-300">
            Started: <span className="font-semibold">{event.agentRole}</span>
          </span>
          <span className="text-muted-foreground font-mono ml-auto">{event.childRunId.slice(0, 8)}</span>
        </div>
      );
    case "child_run_end":
      return (
        <div className="flex items-center gap-2 text-xs rounded bg-muted/20 border border-border px-3 py-2">
          <Badge variant="secondary" className="text-xs shrink-0">child end</Badge>
          <span className="text-muted-foreground font-mono">{event.childRunId.slice(0, 8)}</span>
          <Badge
            variant={event.status === "completed" ? "success" : "destructive"}
            className="text-xs ml-auto"
          >
            {event.status}
          </Badge>
        </div>
      );
    case "done":
      return (
        <div className="flex items-center gap-2 text-xs rounded bg-green-900/20 border border-green-800/30 px-3 py-2">
          <Badge variant="success" className="text-xs">done</Badge>
          <span className="text-green-300">Run completed — status: {event.status}</span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-2 text-xs rounded bg-destructive/20 border border-destructive/40 px-3 py-2">
          <Badge variant="destructive" className="text-xs">error</Badge>
          <span className="text-destructive-foreground">{event.error}</span>
        </div>
      );
    default:
      return null;
  }
}
