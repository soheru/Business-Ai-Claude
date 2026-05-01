/**
 * SSE event-bus tests.
 *
 * The bus lives in src/app/api/_lib/event-bus.ts.  It uses "server-only"
 * which is neutralised by tests/setup.ts.
 *
 * We import the module directly — no mocking needed because the bus has no
 * external dependencies.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// The bus is a module-level singleton, so we need to re-import fresh state per
// test.  The easiest approach: just use unique runIds per test so listener maps
// never collide.  If we need true isolation we can vi.resetModules().

import { subscribe, publishEvent } from "@/app/api/_lib/event-bus";
import type { StreamEvent } from "@/lib/types";

// Helper: unique run id per invocation
let counter = 0;
function uid() {
  return `test-run-${++counter}`;
}

// Helper: build a minimal valid StreamEvent
function chunkEvent(runId: string, text = "hello"): StreamEvent {
  return { type: "chunk", runId, text };
}

describe("Event bus", () => {
  describe("subscribe / publishEvent", () => {
    it("delivers an event to a single subscriber", () => {
      const runId = uid();
      const received: StreamEvent[] = [];

      subscribe(runId, (e) => received.push(e));
      publishEvent(runId, chunkEvent(runId, "hello"));

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ type: "chunk", runId, text: "hello" });
    });

    it("delivers the same event to multiple subscribers", () => {
      const runId = uid();
      const received1: StreamEvent[] = [];
      const received2: StreamEvent[] = [];

      subscribe(runId, (e) => received1.push(e));
      subscribe(runId, (e) => received2.push(e));

      const event = chunkEvent(runId, "broadcast");
      publishEvent(runId, event);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      expect(received1[0]).toEqual(event);
      expect(received2[0]).toEqual(event);
    });

    it("does not deliver events published before subscription (no replay)", () => {
      const runId = uid();
      const received: StreamEvent[] = [];

      // Publish BEFORE subscribing
      publishEvent(runId, chunkEvent(runId, "before"));

      subscribe(runId, (e) => received.push(e));

      expect(received).toHaveLength(0);
    });

    it("stops delivering events after unsubscribe", () => {
      const runId = uid();
      const received: StreamEvent[] = [];

      const unsubscribe = subscribe(runId, (e) => received.push(e));

      publishEvent(runId, chunkEvent(runId, "first"));
      unsubscribe();
      publishEvent(runId, chunkEvent(runId, "second"));

      expect(received).toHaveLength(1);
      expect((received[0] as { text: string }).text).toBe("first");
    });

    it("delivers events to remaining subscribers after one unsubscribes", () => {
      const runId = uid();
      const received1: StreamEvent[] = [];
      const received2: StreamEvent[] = [];

      const unsub1 = subscribe(runId, (e) => received1.push(e));
      subscribe(runId, (e) => received2.push(e));

      unsub1(); // remove first subscriber
      publishEvent(runId, chunkEvent(runId, "only-to-two"));

      expect(received1).toHaveLength(0);
      expect(received2).toHaveLength(1);
    });
  });
});
