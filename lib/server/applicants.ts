import { isFeaturedJob, profileSchema, type Applicant, type ApplicantSnapshot, type ApplicantStatus, type ListingApplicants, type Localized } from "../types";
import { database } from "./db";

/**
 * Seekers applying to provider listings, and providers working through who applied. A seeker's
 * profile is copied at the moment they apply, so the provider sees what the seeker showed then.
 */

type ApplicantRow = { id: number; listing_id: string; status: string; snapshot: string; applied_at: string };

/** Phone numbers are shown only for people the provider has chosen to contact, so nobody can bulk-collect them. */
export const phoneVisible = (status: ApplicantStatus) => status === "shortlisted" || status === "hired";

function toApplicant(row: ApplicantRow): Applicant {
  const snapshot = JSON.parse(row.snapshot) as ApplicantSnapshot;
  const status = row.status as ApplicantStatus;
  const { phone, ...rest } = snapshot;
  return { ...rest, id: row.id, listingId: row.listing_id, status, appliedAt: row.applied_at, phone: phoneVisible(status) ? phone : null };
}

/** The seeker's saved profile, cut down to what a provider needs to decide. */
export function buildSnapshot(account: { id: string }, sessionName?: string): ApplicantSnapshot {
  const db = database();
  const row = db.prepare("SELECT body FROM documents WHERE user_id = ? AND kind = 'profile'").get(account.id) as { body: string } | undefined;
  const parsed = profileSchema.safeParse(row ? JSON.parse(row.body) : {});
  const profile = parsed.success ? parsed.data : profileSchema.parse({});
  // Phone sign-in ids are the phone number itself; Google ids are not, so only the first is a fallback.
  const idPhone = account.id.startsWith("phone:") ? account.id.slice("phone:".length) : "";
  return {
    name: profile.name.trim() || sessionName?.trim() || "",
    phone: profile.phone.trim() || idPhone,
    area: profile.area,
    skills: profile.skills,
    experience: profile.experience.map((item) => ({ role: item.role, years: item.years })),
    languages: profile.languages,
    education: profile.education,
  };
}

export type ApplyResult = { ok: true; created: boolean } | { ok: false; reason: "not_found" | "closed" | "own_listing" };

/** Records an application. Applying twice keeps the first one. */
export function applyToListing(listingId: string, account: { id: string }, sessionSub: string, sessionName?: string): ApplyResult {
  const db = database();
  const listing = db.prepare("SELECT poster_id, status, expires_at FROM job_listings WHERE id = ?").get(listingId) as
    | { poster_id: string; status: string; expires_at: string | null }
    | undefined;
  if (!listing) return { ok: false, reason: "not_found" };
  if (listing.status !== "active" || (listing.expires_at && listing.expires_at < new Date().toISOString())) return { ok: false, reason: "closed" };
  if (listing.poster_id === sessionSub) return { ok: false, reason: "own_listing" };
  const result = db
    .prepare("INSERT INTO listing_applications (listing_id, seeker_id, snapshot) VALUES (?, ?, ?) ON CONFLICT (listing_id, seeker_id) DO NOTHING")
    .run(listingId, account.id, JSON.stringify(buildSnapshot(account, sessionName)));
  return { ok: true, created: Number(result.changes) > 0 };
}

/** The listings this seeker has applied to through Daari. */
export function appliedListingIds(seekerId: string): string[] {
  return (database().prepare("SELECT listing_id FROM listing_applications WHERE seeker_id = ?").all(seekerId) as { listing_id: string }[]).map((r) => r.listing_id);
}

/** Every listing of this provider, with who applied. Only the provider's own listings are ever returned. */
export function applicantsForPoster(posterId: string): ListingApplicants[] {
  const db = database();
  const listings = db
    .prepare("SELECT id, status, body, is_featured, featured_until, featured_requested FROM job_listings WHERE poster_id = ? ORDER BY posted_at DESC")
    .all(posterId) as {
    id: string;
    status: string;
    body: string;
    is_featured: number;
    featured_until: string | null;
    featured_requested: number;
  }[];
  const select = db.prepare(
    "SELECT id, listing_id, status, snapshot, applied_at FROM listing_applications WHERE listing_id = ? ORDER BY applied_at DESC, id DESC",
  );
  return listings.map((listing) => {
    const job = JSON.parse(listing.body) as { title: Localized; employer: string; area: string };
    return {
      listing: {
        id: listing.id,
        title: job.title,
        employer: job.employer,
        area: job.area,
        status: listing.status as ListingApplicants["listing"]["status"],
        featured: isFeaturedJob({ metadata: { isFeatured: listing.is_featured === 1, featuredUntil: listing.featured_until ?? undefined } }),
        featuredRequested: listing.featured_requested === 1,
      },
      applicants: (select.all(listing.id) as ApplicantRow[]).map(toApplicant),
    };
  });
}

/** Moves one applicant to a new status. False unless the application is on a listing this provider owns. */
export function setApplicantStatus(applicationId: number, posterId: string, status: ApplicantStatus): boolean {
  const result = database()
    .prepare(`
      UPDATE listing_applications SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ? AND listing_id IN (SELECT id FROM job_listings WHERE poster_id = ?)
    `)
    .run(status, applicationId, posterId);
  return Number(result.changes) > 0;
}
