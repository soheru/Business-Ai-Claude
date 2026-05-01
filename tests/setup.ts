/**
 * Vitest global setup.
 *
 * We do NOT touch the production DB.  Instead, every test file that exercises
 * the repository layer uses vi.mock("@db/client") pointing to the in-memory
 * Database instance created by tests/helpers/test-db.ts.
 *
 * This file is intentionally minimal — all DB bootstrapping happens per-file
 * (or per-test) via the helper so each suite starts from a clean slate.
 */

// Silence the "server-only" guard used by event-bus.ts and runner.ts.
// In tests we run in Node, not a browser, so we simply neutralise the package.
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
