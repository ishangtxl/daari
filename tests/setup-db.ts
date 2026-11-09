import os from "node:os";
import path from "node:path";

// Runs before each test file. Tests write real listings, so every file gets its own throwaway
// database: they never touch .data/daari.db and never see each other's rows.
process.env.DATABASE_PATH = path.join(os.tmpdir(), `daari-vitest-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
