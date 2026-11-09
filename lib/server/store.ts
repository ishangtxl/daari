/**
 * Reading and writing one account's data. Every function takes the account id from the signed
 * session, and every statement is scoped by it, so one account can never read or change another's.
 */

import type { DatabaseSync } from "node:sqlite";
import { database, transaction } from "./db";
import {
  applicationSchema,
  chatMessageSchema,
  DOCUMENT_KINDS,
  documentSchemas,
  type Application,
  type ChatMessage,
  type DocumentKind,
  type StatePatch,
} from "../state";

export type Account = { id: string; provider: "phone" | "google" };

/** The newest messages sent back when an account loads. Older ones are kept up to MAX_KEPT. */
export const MAX_LOADED = 300;
export const MAX_KEPT = 1000;

export type LoadedState = {
  documents: Partial<Record<DocumentKind, unknown>>;
  messages: ChatMessage[];
  applications: Application[];
  /** Nothing saved yet, so the browser may offer what it kept from before accounts existed. */
  empty: boolean;
};

export function createStore(db: DatabaseSync) {
  const touchUser = db.prepare(`
    INSERT INTO users (id, provider) VALUES (?, ?)
    ON CONFLICT (id) DO UPDATE SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `);
  const selectDocuments = db.prepare("SELECT kind, body FROM documents WHERE user_id = ?");
  const upsertDocument = db.prepare(`
    INSERT INTO documents (user_id, kind, body) VALUES (?, ?, ?)
    ON CONFLICT (user_id, kind) DO UPDATE SET body = excluded.body, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `);
  const selectMessages = db.prepare(`
    SELECT id, role, content, roadmap FROM (
      SELECT id, role, content, roadmap, seq FROM messages WHERE user_id = ? ORDER BY seq DESC LIMIT ?
    ) ORDER BY seq ASC
  `);
  const lastSeq = db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE user_id = ?");
  const insertMessage = db.prepare(`
    INSERT INTO messages (user_id, id, seq, role, content, roadmap) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, id) DO NOTHING
  `);
  const trimMessages = db.prepare("DELETE FROM messages WHERE user_id = ? AND seq <= ?");
  const selectApplications = db.prepare(`
    SELECT job_id, title, employer, apply_link, status, applied_at FROM applications WHERE user_id = ? ORDER BY applied_at DESC
  `);
  const selectApplicationIds = db.prepare("SELECT job_id FROM applications WHERE user_id = ?");
  const deleteApplication = db.prepare("DELETE FROM applications WHERE user_id = ? AND job_id = ?");
  const upsertApplication = db.prepare(`
    INSERT INTO applications (user_id, job_id, title, employer, apply_link, status, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, job_id) DO UPDATE SET
      title = excluded.title, employer = excluded.employer, apply_link = excluded.apply_link,
      status = excluded.status, applied_at = excluded.applied_at, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `);
  const deleteUser = db.prepare("DELETE FROM users WHERE id = ?");

  return {
    /** Records the account on each visit, so its rows always have an owner to belong to. */
    touch(account: Account) {
      touchUser.run(account.id, account.provider);
    },

    load(userId: string): LoadedState {
      const documents: LoadedState["documents"] = {};
      for (const row of selectDocuments.all(userId) as { kind: string; body: string }[]) {
        if (!(DOCUMENT_KINDS as string[]).includes(row.kind)) continue;
        const kind = row.kind as DocumentKind;
        // A document saved by older code that no longer fits is skipped, not served half-broken.
        const parsed = documentSchemas[kind].safeParse(JSON.parse(row.body));
        if (parsed.success) documents[kind] = parsed.data;
      }
      const messages = (selectMessages.all(userId, MAX_LOADED) as { id: string; role: string; content: string; roadmap: string | null }[])
        .map((row) => chatMessageSchema.safeParse({ id: row.id, role: row.role, content: row.content, ...(row.roadmap ? { roadmap: JSON.parse(row.roadmap) } : {}) }))
        .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
      const applications = (selectApplications.all(userId) as Record<string, string>[])
        .map((row) => applicationSchema.safeParse({
          jobId: row.job_id, title: JSON.parse(row.title), employer: row.employer, applyLink: row.apply_link, status: row.status, at: row.applied_at,
        }))
        .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
      return { documents, messages, applications, empty: !Object.keys(documents).length && !messages.length && !applications.length };
    },

    /** Saves the parts that changed, all together or not at all. */
    save(userId: string, patch: StatePatch) {
      transaction(db, () => {
        for (const kind of DOCUMENT_KINDS) {
          if (patch[kind] !== undefined) upsertDocument.run(userId, kind, JSON.stringify(patch[kind]));
        }
        if (patch.applications) {
          // The list is the whole set: drop the ones it no longer has, then write the rest.
          const keep = new Set(patch.applications.map((application) => application.jobId));
          for (const { job_id } of selectApplicationIds.all(userId) as { job_id: string }[]) {
            if (!keep.has(job_id)) deleteApplication.run(userId, job_id);
          }
          for (const a of patch.applications) {
            upsertApplication.run(userId, a.jobId, JSON.stringify(a.title), a.employer, a.applyLink, a.status, a.at);
          }
        }
      });
    },

    /**
     * Adds messages after the ones already saved. Sending the same message twice stores it once,
     * so a save that is retried after a dropped connection is harmless.
     */
    appendMessages(userId: string, messages: ChatMessage[]) {
      transaction(db, () => {
        let seq = (lastSeq.get(userId) as { seq: number }).seq;
        for (const message of messages) {
          const result = insertMessage.run(userId, message.id, seq + 1, message.role, message.content, message.roadmap ? JSON.stringify(message.roadmap) : null);
          if (result.changes) seq++;
        }
        trimMessages.run(userId, seq - MAX_KEPT);
      });
    },

    /** Deletes the account and, through the foreign keys, everything it owns. */
    remove(userId: string) {
      deleteUser.run(userId);
    },
  };
}

export type Store = ReturnType<typeof createStore>;

let shared: Store | null = null;
export function store(): Store {
  shared ??= createStore(database());
  return shared;
}
