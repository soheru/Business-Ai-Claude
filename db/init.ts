import fs from "fs";
import path from "path";
import { getDb } from "./client";
import { seed } from "./seed";

async function init(): Promise<void> {
  // Ensure the data directory exists
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = getDb();

  // Read and execute the SQL schema
  const schemaPath = path.resolve(process.cwd(), "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  // Execute each statement individually (better-sqlite3 exec handles multiple statements)
  db.exec(schema);

  // Idempotent migrations for existing databases (CREATE IF NOT EXISTS doesn't
  // alter columns of pre-existing tables).
  const taskCols = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
  if (!taskCols.some((c) => c.name === "workdir")) {
    db.exec("ALTER TABLE tasks ADD COLUMN workdir TEXT");
    console.log("Migrated: added tasks.workdir column.");
  }

  // Seed the 6 agents
  await seed();

  console.log("Database initialized at data/claude-agent.db");
}

init().catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
