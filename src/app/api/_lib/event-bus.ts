import "server-only";
import type { StreamEvent } from "@/lib/types";

type Listener = (event: StreamEvent) => void;

// Module-level map persists across requests in the same Node process
const listeners = new Map<string, Set<Listener>>();

/**
 * Publish a StreamEvent to all subscribers for a given runId.
 */
export function publishEvent(runId: string, event: StreamEvent): void {
  const subs = listeners.get(runId);
  if (!subs) return;
  for (const fn of subs) {
    fn(event);
  }
}

/**
 * Subscribe to events for a given runId.
 * Returns an unsubscribe function.
 */
export function subscribe(runId: string, listener: Listener): () => void {
  let subs = listeners.get(runId);
  if (!subs) {
    subs = new Set();
    listeners.set(runId, subs);
  }
  subs.add(listener);

  return () => {
    const s = listeners.get(runId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) {
      listeners.delete(runId);
    }
  };
}
