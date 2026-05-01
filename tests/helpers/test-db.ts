/**
 * Creates a fresh in-memory SQLite database for each test suite.
 *
 * Usage in a test file:
 *
 *   vi.mock("@db/client", () => ({ getDb: () => testDb.db }));
 *   import { createTestDb } from "./helpers/test-db";
 *   const testDb = createTestDb();
 *
 * Call testDb.seed() inside beforeEach to reset between tests.
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Resolve schema relative to the project root (not this file's location)
const SCHEMA_PATH = path.resolve(__dirname, "../../db/schema.sql");

export interface TestDb {
  db: Database.Database;
  /** Drop all rows and re-insert the 6 standard agents */
  seed(): void;
  /** IDs of the seeded agents, keyed by role */
  agentIds: Record<string, string>;
}

export function createTestDb(): TestDb {
  const db = new Database(":memory:");

  // Same pragmas as production
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Apply the real schema
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  // Mutable map populated (and repopulated) by seed()
  const agentIds: Record<string, string> = {};

  function seed(): void {
    // Wipe in dependency order (foreign keys are ON)
    db.exec("DELETE FROM messages");
    db.exec("DELETE FROM runs");
    db.exec("DELETE FROM tasks");
    db.exec("DELETE FROM agents");

    const roles = ["ceo", "marketer", "developer", "pm", "ux", "qa"] as const;

    const insert = db.prepare(`
      INSERT INTO agents (id, name, role, system_prompt, model, capabilities, is_active, created_at)
      VALUES (@id, @name, @role, @system_prompt, @model, @capabilities, 1, @created_at)
    `);

    for (const role of roles) {
      const id = crypto.randomUUID();
      agentIds[role] = id;
      insert.run({
        id,
        name: role.toUpperCase(),
        role,
        system_prompt: `System prompt for ${role}`,
        model: role === "ceo" ? "claude-opus-4-5" : "claude-sonnet-4-5",
        capabilities: "[]",
        created_at: new Date().toISOString(),
      });
    }
  }

  // Run initial seed so the db is ready immediately after createTestDb()
  seed();

  return { db, seed, agentIds };
}
