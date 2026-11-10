/**
 * The SQLite database that holds each account's conversation, plan, jobs, applications and resume,
 * and the jobs employers post on Daari with the applications sent to them.
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
  // Version 2 shipped briefly with an employer side that was taken out again. Databases that ran it
  // have its two tables, which version 3 removes; a new database has nothing to do here.
  `
  SELECT 1;
  `,
  `
  DROP TABLE IF EXISTS listing_applications;
  DROP TABLE IF EXISTS job_listings;
  DELETE FROM documents WHERE kind IN ('role', 'providerDraft', 'providerMessages', 'postedListings');
  `,
  `
  -- Jobs employers post on Daari. The body holds the form as typed and the translated listing.
  CREATE TABLE postings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (json_valid(body)),
    closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    expires_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX postings_by_owner ON postings (owner_id);
  CREATE INDEX postings_open ON postings (closed, expires_at);

  -- One row per person who applied to a posting, with the card they agreed to send.
  CREATE TABLE posting_applications (
    id TEXT PRIMARY KEY,
    posting_id TEXT NOT NULL REFERENCES postings (id) ON DELETE CASCADE,
    applicant_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    card TEXT NOT NULL CHECK (json_valid(card)),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlisted', 'rejected', 'hired')),
    seen_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW},
    UNIQUE (posting_id, applicant_id)
  ) STRICT;
  CREATE INDEX posting_applications_by_applicant ON posting_applications (applicant_id);

  CREATE TABLE posting_reports (
    posting_id TEXT NOT NULL REFERENCES postings (id) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('asks_money', 'fake', 'rude', 'other')),
    created_at TEXT NOT NULL DEFAULT ${NOW},
    PRIMARY KEY (posting_id, reporter_id)
  ) STRICT, WITHOUT ROWID;
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
