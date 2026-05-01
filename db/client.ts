if (typeof window !== "undefined") {
  throw new Error("db/client.ts must not be imported from client code");
}
import Database from "better-sqlite3";
import path from "path";

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const dbPath = path.resolve(process.cwd(), "data", "claude-agent.db");

  const db = new Database(dbPath);

  // Performance and integrity settings
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  instance = db;
  return instance;
}
