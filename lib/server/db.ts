/**
 * The SQLite database that holds each account's conversation, plan, jobs, applications and resume.
 * One file on the server, opened once per process. Every query is scoped by the account id taken
 * from the signed session, never by anything the browser sends.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

/**
 * Each entry moves the schema one version forward, in order, inside a transaction. Applied
 * migrations are never edited: a change to the schema is a new entry at the end.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('phone', 'google')),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    last_seen_at TEXT NOT NULL DEFAULT ${NOW}
  ) STRICT;

  -- One JSON document per part of the account (profile, plan, resume...), replaced whole on save.
  CREATE TABLE documents (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    body TEXT NOT NULL CHECK (json_valid(body)),
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, kind)
  ) STRICT, WITHOUT ROWID;

  -- The conversation, one row per message, in the order it happened.
  CREATE TABLE messages (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    roadmap TEXT CHECK (roadmap IS NULL OR json_valid(roadmap)),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, id)
  ) STRICT;
  CREATE UNIQUE INDEX messages_in_order ON messages (user_id, seq);

  CREATE TABLE applications (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_id TEXT NOT NULL,
    title TEXT NOT NULL CHECK (json_valid(title)),
    employer TEXT NOT NULL,
    apply_link TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('statusApplied', 'statusCalled', 'statusInterview', 'statusOffer', 'statusNoReply')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (user_id, job_id)
  ) STRICT, WITHOUT ROWID;
  `,
  `
  -- Listings posted by providers. The whole job is kept as JSON in body; the columns are what
  -- queries filter, sort and check ownership by. Featured placement lives here too.
  CREATE TABLE job_listings (
    id TEXT PRIMARY KEY,
    poster_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'rejected')),
    employer TEXT NOT NULL,
    area TEXT NOT NULL,
    role_category TEXT NOT NULL DEFAULT '',
    posted_at TEXT NOT NULL,
    expires_at TEXT,
    is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
    featured_until TEXT,
    featured_requested INTEGER NOT NULL DEFAULT 0 CHECK (featured_requested IN (0, 1)),
    body TEXT NOT NULL CHECK (json_valid(body))
  ) STRICT;
  CREATE INDEX job_listings_by_poster ON job_listings (poster_id, posted_at);
  CREATE INDEX job_listings_feed ON job_listings (status, is_featured, posted_at);

  -- A seeker applying to a listing. The snapshot is the profile as it was at that moment.
  CREATE TABLE listing_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL REFERENCES job_listings (id) ON DELETE CASCADE,
    seeker_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlisted', 'rejected', 'hired')),
    snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
    applied_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    UNIQUE (listing_id, seeker_id)
  ) STRICT;
  CREATE INDEX listing_applications_by_listing ON listing_applications (listing_id, applied_at);
  `,
];

export function openDatabase(file: string): DatabaseSync {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // WAL lets pages read while a save is being written; foreign keys are off by default in SQLite.
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  migrate(db);
  return db;
}

export function migrate(db: DatabaseSync) {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (current > MIGRATIONS.length) {
    throw new Error(`The database is at version ${current}, newer than this code (${MIGRATIONS.length}). Deploy the newer code.`);
  }
  for (let version = current; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

/** Runs `work` as one transaction: everything in it is saved, or none of it is. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Where the database lives. In production it must be set to a folder outside the release, or every
 * deploy would start from an empty database.
 */
export function databasePath() {
  const configured = process.env.DATABASE_PATH;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("DATABASE_PATH must be set in production");
  return path.join(process.cwd(), ".data", "daari.db");
}

// Kept on globalThis so development reloads reuse one connection instead of opening a new one each time.
const holder = globalThis as unknown as { daariDb?: DatabaseSync };

export function database(): DatabaseSync {
  holder.daariDb ??= openDatabase(databasePath());
  return holder.daariDb;
}
