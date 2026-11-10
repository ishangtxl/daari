/**
 * Postings and the applications sent to them. Every change is checked against the account doing
 * it: only the employer who posted a job can see who applied or change it, and only the person who
 * applied can see or take back their own application.
 */

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { database } from "./db";
import {
  HIDE_AFTER_REPORTS,
  POSTING_PREFIX,
  POSTING_DAYS,
  postingToJob,
  type Applicant,
  type ApplicantCard,
  type ApplicantStatus,
  type MyApplication,
  type PostingBody,
  type PostingState,
  type PostingSummary,
  type ReportReason,
} from "../postings";
import type { Job } from "../types";

type Row = { id: string; owner_id: string; body: string; closed: number; created_at: string; expires_at: string; reports: number };

const DAY_MS = 86_400_000;
const newId = (prefix: string) => `${prefix}${randomBytes(8).toString("hex")}`;

export type ApplyResult = "ok" | "missing" | "closed" | "own" | "duplicate";

export function createPostings(db: DatabaseSync, now: () => Date = () => new Date()) {
  const columns = `p.id, p.owner_id, p.body, p.closed, p.created_at, p.expires_at,
    (SELECT COUNT(*) FROM posting_reports r WHERE r.posting_id = p.id) AS reports`;
  const insert = db.prepare("INSERT INTO postings (id, owner_id, body, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)");
  const replaceBody = db.prepare("UPDATE postings SET body = ?, updated_at = ? WHERE id = ? AND owner_id = ?");
  const setClosed = db.prepare("UPDATE postings SET closed = ?, expires_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?");
  const byId = db.prepare(`SELECT ${columns} FROM postings p WHERE p.id = ?`);
  const byOwner = db.prepare(`
    SELECT ${columns},
      (SELECT COUNT(*) FROM posting_applications a WHERE a.posting_id = p.id) AS applicants,
      (SELECT COUNT(*) FROM posting_applications a WHERE a.posting_id = p.id AND a.seen_at IS NULL) AS fresh
    FROM postings p WHERE p.owner_id = ? ORDER BY p.created_at DESC
  `);
  const live = db.prepare(`SELECT ${columns} FROM postings p WHERE p.closed = 0 AND p.expires_at > ?`);
  const applicantsOf = db.prepare("SELECT id, card, status, created_at FROM posting_applications WHERE posting_id = ? ORDER BY created_at DESC");
  const markSeen = db.prepare("UPDATE posting_applications SET seen_at = ? WHERE posting_id = ? AND seen_at IS NULL");
  const setStatus = db.prepare(`
    UPDATE posting_applications SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND posting_id IN (SELECT id FROM postings WHERE id = ? AND owner_id = ?)
  `);
  const insertApplication = db.prepare("INSERT INTO posting_applications (id, posting_id, applicant_id, card) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING");
  const deleteApplication = db.prepare("DELETE FROM posting_applications WHERE posting_id = ? AND applicant_id = ?");
  const applicationOf = db.prepare("SELECT status, seen_at, created_at FROM posting_applications WHERE posting_id = ? AND applicant_id = ?");
  const applicationsBy = db.prepare("SELECT posting_id, status, seen_at, created_at FROM posting_applications WHERE applicant_id = ?");
  const touch = db.prepare("UPDATE postings SET updated_at = ? WHERE id = ?");
  const versionOf = db.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at), '') AS at FROM postings");
  const insertReport = db.prepare("INSERT INTO posting_reports (posting_id, reporter_id, reason) VALUES (?, ?, ?) ON CONFLICT DO NOTHING");

  const stamp = () => now().toISOString();
  const expiry = () => new Date(now().getTime() + POSTING_DAYS * DAY_MS).toISOString();

  function state(row: Row): PostingState {
    if (row.reports >= HIDE_AFTER_REPORTS) return "hidden";
    if (row.closed) return "closed";
    return row.expires_at <= stamp() ? "expired" : "open";
  }
  const read = (id: string) => byId.get(id) as Row | undefined;
  const body = (row: Row) => JSON.parse(row.body) as PostingBody;

  return {
    create(ownerId: string, posting: PostingBody): string {
      const id = newId(POSTING_PREFIX);
      insert.run(id, ownerId, JSON.stringify(posting), stamp(), stamp(), expiry());
      return id;
    },

    /** Replaces what a posting says. People who already applied stay on it. */
    update(ownerId: string, id: string, posting: PostingBody): boolean {
      return replaceBody.run(JSON.stringify(posting), stamp(), id, ownerId).changes > 0;
    },

    /** Closing takes it out of the job lists at once. Reopening puts it up for a fresh 30 days. */
    setOpen(ownerId: string, id: string, open: boolean): boolean {
      const row = read(id);
      if (!row || row.owner_id !== ownerId) return false;
      if (open && state(row) === "hidden") return false;
      return setClosed.run(open ? 0 : 1, open ? expiry() : row.expires_at, stamp(), id, ownerId).changes > 0;
    },

    mine(ownerId: string): PostingSummary[] {
      return (byOwner.all(ownerId) as (Row & { applicants: number; fresh: number })[]).map((row) => ({
        id: row.id,
        body: body(row),
        state: state(row),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        applicants: row.applicants,
        fresh: row.fresh,
      }));
    },

    /** The posting with everyone who applied, for its employer only. Opening it counts as seeing them. */
    forOwner(ownerId: string, id: string): (PostingSummary & { people: Applicant[] }) | null {
      const row = read(id);
      if (!row || row.owner_id !== ownerId) return null;
      const people = (applicantsOf.all(id) as { id: string; card: string; status: ApplicantStatus; created_at: string }[]).map((entry) => ({
        id: entry.id,
        card: JSON.parse(entry.card) as ApplicantCard,
        status: entry.status,
        at: entry.created_at,
      }));
      const fresh = Number(markSeen.run(stamp(), id).changes);
      return { id, body: body(row), state: state(row), createdAt: row.created_at, expiresAt: row.expires_at, applicants: people.length, fresh, people };
    },

    setApplicantStatus(ownerId: string, postingId: string, applicationId: string, status: ApplicantStatus): boolean {
      return setStatus.run(status, applicationId, postingId, ownerId).changes > 0;
    },

    /** Postings people can find and apply to right now, as jobs. */
    liveJobs(): Job[] {
      return (live.all(stamp()) as Row[]).filter((row) => state(row) === "open").map((row) => postingToJob(row.id, body(row), row.created_at));
    },

    /** Any posting by id, open or not, so a saved link still shows what the job was. Hidden ones are gone. */
    job(id: string): { job: Job; state: PostingState; ownerId: string } | null {
      const row = read(id);
      if (!row || state(row) === "hidden") return null;
      return { job: postingToJob(row.id, body(row), row.created_at), state: state(row), ownerId: row.owner_id };
    },

    apply(applicantId: string, postingId: string, card: ApplicantCard): ApplyResult {
      const row = read(postingId);
      if (!row || state(row) === "hidden") return "missing";
      if (state(row) !== "open") return "closed";
      if (row.owner_id === applicantId) return "own";
      return insertApplication.run(newId("a"), postingId, applicantId, JSON.stringify(card)).changes ? "ok" : "duplicate";
    },

    /** Takes an application back. The employer no longer sees it at all. */
    withdraw(applicantId: string, postingId: string): boolean {
      return deleteApplication.run(postingId, applicantId).changes > 0;
    },

    applicationOf(applicantId: string, postingId: string): MyApplication | null {
      const row = read(postingId);
      const entry = applicationOf.get(postingId, applicantId) as { status: ApplicantStatus; seen_at: string | null; created_at: string } | undefined;
      if (!row || !entry) return null;
      return { status: entry.status, seen: Boolean(entry.seen_at), at: entry.created_at, postingState: state(row) };
    },

    /** Every application this person has sent, by posting id. */
    applicationsBy(applicantId: string): Record<string, MyApplication> {
      const result: Record<string, MyApplication> = {};
      for (const entry of applicationsBy.all(applicantId) as { posting_id: string; status: ApplicantStatus; seen_at: string | null; created_at: string }[]) {
        const row = read(entry.posting_id);
        if (row) result[entry.posting_id] = { status: entry.status, seen: Boolean(entry.seen_at), at: entry.created_at, postingState: state(row) };
      }
      return result;
    },

    /** Changes whenever a posting is added, changed, closed or reopened, so saved matches know to refresh. */
    version(): string {
      const { n, at } = versionOf.get() as { n: number; at: string };
      return `${n}:${at}`;
    },

    /** One report per person per posting. Enough of them take the posting down. */
    report(reporterId: string, postingId: string, reason: ReportReason): boolean {
      const row = read(postingId);
      if (!row || row.owner_id === reporterId) return false;
      insertReport.run(postingId, reporterId, reason);
      // Taken down now, so saved matches that still show it should refresh.
      if (state(read(postingId)!) === "hidden") touch.run(stamp(), postingId);
      return true;
    },
  };
}

export type Postings = ReturnType<typeof createPostings>;

let shared: Postings | null = null;
export function postings(): Postings {
  shared ??= createPostings(database());
  return shared;
}
