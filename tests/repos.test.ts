/**
 * Repository layer tests.
 *
 * All DB calls go through an in-memory SQLite instance so no production data
 * is touched and tests are fully isolated.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDb } from "./helpers/test-db";

// ----------------------------------------------------------------------------
// Set up the mock BEFORE any import that transitively calls getDb()
// ----------------------------------------------------------------------------
let testDb: TestDb;

vi.mock("@db/client", () => ({
  getDb: () => testDb.db,
}));

// Now safe to import the repos (they will call the mocked getDb)
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
  getTaskWithChildren,
  createRun,
  updateRun,
  getRunWithMessages,
  appendMessage,
  listMessages,
  getRunningRunForTask,
} from "@db/repos";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function makeTask(agentId: string, overrides?: Record<string, unknown>) {
  return createTask({
    agentId,
    agentRole: "developer",
    title: "Test task",
    description: "A test task description",
    priority: "medium",
    ...overrides,
  });
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe("Repository layer", () => {
  beforeEach(() => {
    if (!testDb) {
      testDb = createTestDb();
    } else {
      testDb.seed();
    }
  });

  // --------------------------------------------------------------------------
  // Tasks
  // --------------------------------------------------------------------------

  describe("createTask / getTask", () => {
    it("creates a task and retrieves it by id", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId, { title: "My first task" });

      expect(task.id).toBeTypeOf("string");
      expect(task.title).toBe("My first task");
      expect(task.status).toBe("backlog");
      expect(task.priority).toBe("medium");
      expect(task.agentId).toBe(agentId);
      expect(task.parentTaskId).toBeNull();
      expect(task.output).toBeNull();

      const fetched = getTask(task.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(task.id);
    });

    it("returns null for a nonexistent task id", () => {
      const result = getTask("00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });

    it("persists parentTaskId for child tasks", () => {
      const agentId = testDb.agentIds["pm"];
      const parent = makeTask(agentId, { title: "Parent task" });
      const child = makeTask(agentId, {
        title: "Child task",
        parentTaskId: parent.id,
      });

      expect(child.parentTaskId).toBe(parent.id);

      const fetched = getTask(child.id);
      expect(fetched!.parentTaskId).toBe(parent.id);
    });
  });

  describe("listTasks", () => {
    it("returns all tasks when called without filters", () => {
      const agentId = testDb.agentIds["developer"];
      makeTask(agentId, { title: "Task A" });
      makeTask(agentId, { title: "Task B" });

      const tasks = listTasks();
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it("filters by status", () => {
      const agentId = testDb.agentIds["developer"];
      const t1 = makeTask(agentId, { title: "Backlog task" });
      const t2 = makeTask(agentId, { title: "In-progress task" });

      updateTask(t2.id, { status: "in_progress" });

      const backlog = listTasks({ status: "backlog" });
      const inProgress = listTasks({ status: "in_progress" });

      expect(backlog.some((t) => t.id === t1.id)).toBe(true);
      expect(backlog.some((t) => t.id === t2.id)).toBe(false);
      expect(inProgress.some((t) => t.id === t2.id)).toBe(true);
    });

    it("filters by agentRole", () => {
      const devId = testDb.agentIds["developer"];
      const qaId = testDb.agentIds["qa"];

      const devTask = makeTask(devId, { title: "Dev task" });
      const qaTask = makeTask(qaId, { title: "QA task" });

      const devTasks = listTasks({ agentRole: "developer" });
      const qaTasks = listTasks({ agentRole: "qa" });

      expect(devTasks.some((t) => t.id === devTask.id)).toBe(true);
      expect(devTasks.some((t) => t.id === qaTask.id)).toBe(false);
      expect(qaTasks.some((t) => t.id === qaTask.id)).toBe(true);
    });

    it("returns empty array when no tasks match the filter", () => {
      // No tasks seeded with status 'done' yet
      const done = listTasks({ status: "done" });
      expect(done).toEqual([]);
    });
  });

  describe("updateTask", () => {
    it("updates individual fields without touching others", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId, { title: "Original title", priority: "low" });

      const updated = updateTask(task.id, { status: "in_progress", priority: "high" });

      expect(updated.status).toBe("in_progress");
      expect(updated.priority).toBe("high");
      expect(updated.title).toBe("Original title"); // untouched
    });

    it("returns the existing task when patch is empty", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);
      const returned = updateTask(task.id, {});
      expect(returned.id).toBe(task.id);
    });
  });

  describe("getTaskWithChildren", () => {
    it("includes child tasks and runs in the result", () => {
      const agentId = testDb.agentIds["developer"];
      const parent = makeTask(agentId, { title: "Parent" });
      makeTask(agentId, { title: "Child", parentTaskId: parent.id });
      const run = createRun({ taskId: parent.id, agentId });

      const result = getTaskWithChildren(parent.id);
      expect(result).not.toBeNull();
      expect(result!.children).toHaveLength(1);
      expect(result!.runs.some((r) => r.id === run.id)).toBe(true);
    });

    it("returns null for nonexistent task id", () => {
      expect(getTaskWithChildren("nonexistent-id")).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Runs
  // --------------------------------------------------------------------------

  describe("createRun / updateRun / getRunWithMessages", () => {
    it("creates a run with status=running and no endedAt", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });

      expect(run.id).toBeTypeOf("string");
      expect(run.status).toBe("running");
      expect(run.endedAt).toBeNull();
      expect(run.tokensInput).toBe(0);
      expect(run.taskId).toBe(task.id);
      expect(run.agentId).toBe(agentId);
    });

    it("updates run fields correctly", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });

      const now = new Date().toISOString();
      const updated = updateRun(run.id, {
        status: "completed",
        endedAt: now,
        tokensInput: 100,
        tokensOutput: 200,
        costUsd: 0.005,
      });

      expect(updated.status).toBe("completed");
      expect(updated.endedAt).toBe(now);
      expect(updated.tokensInput).toBe(100);
      expect(updated.tokensOutput).toBe(200);
      expect(updated.costUsd).toBeCloseTo(0.005);
    });

    it("getRunWithMessages returns run + ordered messages", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });

      appendMessage({ runId: run.id, role: "user", content: "Hello", toolName: null });
      appendMessage({ runId: run.id, role: "assistant", content: "World", toolName: null });

      const result = getRunWithMessages(run.id);
      expect(result).not.toBeNull();
      expect(result!.messages).toHaveLength(2);
      expect(result!.messages[0].role).toBe("user");
      expect(result!.messages[1].role).toBe("assistant");
    });

    it("getRunWithMessages returns null for nonexistent run", () => {
      expect(getRunWithMessages("no-such-run")).toBeNull();
    });
  });

  describe("getRunningRunForTask", () => {
    it("returns the running run for a task", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });

      const found = getRunningRunForTask(task.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(run.id);
    });

    it("returns null after the run is completed", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });
      updateRun(run.id, { status: "completed", endedAt: new Date().toISOString() });

      const found = getRunningRunForTask(task.id);
      expect(found).toBeNull();
    });

    it("returns null when no run exists for the task", () => {
      const agentId = testDb.agentIds["developer"];
      const task = makeTask(agentId);

      expect(getRunningRunForTask(task.id)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------

  describe("appendMessage / listMessages", () => {
    it("appends messages and lists them in timestamp order", () => {
      const agentId = testDb.agentIds["qa"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });

      const m1 = appendMessage({ runId: run.id, role: "user", content: "First", toolName: null });
      const m2 = appendMessage({
        runId: run.id,
        role: "assistant",
        content: "Second",
        toolName: null,
      });
      const m3 = appendMessage({
        runId: run.id,
        role: "tool_use",
        content: "{}",
        toolName: "some_tool",
      });

      const messages = listMessages(run.id);
      expect(messages).toHaveLength(3);
      expect(messages[0].id).toBe(m1.id);
      expect(messages[1].id).toBe(m2.id);
      expect(messages[2].id).toBe(m3.id);
      expect(messages[2].toolName).toBe("some_tool");
    });

    it("returns empty array for a run with no messages", () => {
      const agentId = testDb.agentIds["qa"];
      const task = makeTask(agentId);
      const run = createRun({ taskId: task.id, agentId });

      expect(listMessages(run.id)).toEqual([]);
    });
  });
});
