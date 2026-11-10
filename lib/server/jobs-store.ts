import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { FullJob, PostedJobMetadata } from "../types";
import { database, transaction } from "./db";

/**
 * Provider job listings, kept in the job_listings table. The route handlers only use the functions
 * below, so where the data lives can change without touching them.
 */

/** How long a featured placement lasts once approved. */
export const FEATURED_DAYS = 14;

/** Until a team reviews requests, every request is approved. Set FEATURED_AUTO_APPROVE=off to hold them. */
const autoApprove = () => process.env.FEATURED_AUTO_APPROVE !== "off";

const LEGACY_FILE = path.join(process.cwd(), "data", "posted_jobs.json");
const imported = new WeakSet<DatabaseSync>();

type Row = { body: string; status: string; is_featured: number; featured_until: string | null; featured_requested: number };

const COLUMNS = "body, status, is_featured, featured_until, featured_requested";

function fromRow(row: Row): FullJob {
  const job = JSON.parse(row.body) as FullJob;
  if (job.metadata) {
    // The columns are the truth for these; the copy inside the JSON may be older.
    job.metadata.status = row.status as PostedJobMetadata["status"];
    job.metadata.isFeatured = row.is_featured === 1;
    job.metadata.featuredUntil = row.featured_until ?? undefined;
    job.metadata.featuredRequested = row.featured_requested === 1;
  }
  return job;
}

function upsert(db: DatabaseSync, job: FullJob) {
  const m = job.metadata;
  db.prepare(`
    INSERT INTO job_listings
      (id, poster_id, status, employer, area, role_category, posted_at, expires_at, is_featured, featured_until, featured_requested, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      poster_id = excluded.poster_id, status = excluded.status, employer = excluded.employer, area = excluded.area,
      role_category = excluded.role_category, posted_at = excluded.posted_at, expires_at = excluded.expires_at,
      is_featured = excluded.is_featured, featured_until = excluded.featured_until,
      featured_requested = excluded.featured_requested, body = excluded.body
  `).run(
    job.id,
    m?.posterId ?? "",
    m?.status ?? "active",
    job.employer,
    job.area,
    m?.roleCategory ?? "",
    job.postedAt ?? m?.createdAt ?? new Date().toISOString(),
    m?.expiresAt ?? null,
    m?.isFeatured ? 1 : 0,
    m?.featuredUntil ?? null,
    m?.featuredRequested ? 1 : 0,
    JSON.stringify(job),
  );
}

/** The database, with listings from the old data/posted_jobs.json brought in once if the table is still empty. */
function ready(): DatabaseSync {
  const db = database();
  if (imported.has(db)) return db;
  imported.add(db);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM job_listings").get() as { n: number };
  if (n === 0 && existsSync(LEGACY_FILE)) {
    try {
      const old = JSON.parse(readFileSync(LEGACY_FILE, "utf-8"));
      if (Array.isArray(old) && old.length) transaction(db, () => old.forEach((job: FullJob) => upsert(db, job)));
    } catch (error) {
      console.error("[jobs-store] Could not import the old posted jobs file:", error);
    }
  }
  return db;
}

/** Live listings, newest first. Featured ones are not moved: they stand out where they are, and a seeker can choose to sort by them. */
export function getActiveJobsSync(): FullJob[] {
  const now = new Date().toISOString();
  const rows = ready()
    .prepare(`
      SELECT ${COLUMNS} FROM job_listings
      WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY posted_at DESC
    `)
    .all(now) as Row[];
  return rows.map(fromRow);
}

export async function getActiveJobs(): Promise<FullJob[]> {
  return getActiveJobsSync();
}

export async function getJobById(id: string): Promise<FullJob | null> {
  const row = ready().prepare(`SELECT ${COLUMNS} FROM job_listings WHERE id = ?`).get(id) as Row | undefined;
  return row ? fromRow(row) : null;
}

export async function saveJob(job: FullJob): Promise<void> {
  upsert(ready(), job);
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** An active listing by the same poster for the same business, role and locality. A different role or locality is not a duplicate. */
export async function findDuplicateActiveJob(
  posterId: string,
  businessName: string,
  roleCategory: string,
  locality: string,
): Promise<FullJob | null> {
  return (
    getActiveJobsSync().find(
      (j) =>
        j.metadata?.posterId === posterId &&
        norm(j.employer) === norm(businessName) &&
        norm(j.metadata.roleCategory) === norm(roleCategory) &&
        norm(j.area) === norm(locality),
    ) ?? null
  );
}

export async function closeJob(id: string, posterPhone: string): Promise<boolean> {
  const result = ready().prepare("UPDATE job_listings SET status = 'paused' WHERE id = ? AND poster_id = ?").run(id, posterPhone);
  return Number(result.changes) > 0;
}

export async function listJobsByPoster(posterPhone: string): Promise<FullJob[]> {
  const rows = ready()
    .prepare(`SELECT ${COLUMNS} FROM job_listings WHERE poster_id = ? ORDER BY posted_at DESC`)
    .all(posterPhone) as Row[];
  return rows.map(fromRow);
}

/** Promote or un-promote a listing. Used by the admin route and by approved requests. */
export function setFeatured(id: string, featured: boolean, days = FEATURED_DAYS): boolean {
  const until = featured ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const result = ready()
    .prepare("UPDATE job_listings SET is_featured = ?, featured_until = ?, featured_requested = ? WHERE id = ?")
    .run(featured ? 1 : 0, until, featured ? 1 : 0, id);
  return Number(result.changes) > 0;
}

export type FeaturedRequest = { ok: true; approved: boolean } | { ok: false; reason: "not_found" | "not_owner" | "closed" };

/** A provider asks for their own live listing to be featured. No payment: it is a flag for the Daari team. */
export function requestFeatured(id: string, posterId: string): FeaturedRequest {
  const db = ready();
  const row = db.prepare("SELECT poster_id, status FROM job_listings WHERE id = ?").get(id) as { poster_id: string; status: string } | undefined;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.poster_id !== posterId) return { ok: false, reason: "not_owner" };
  if (row.status !== "active") return { ok: false, reason: "closed" };
  if (autoApprove()) {
    setFeatured(id, true);
    return { ok: true, approved: true };
  }
  db.prepare("UPDATE job_listings SET featured_requested = 1 WHERE id = ?").run(id);
  return { ok: true, approved: false };
}
