import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { database } from "../lib/server/db";
import { store } from "../lib/server/store";
import { saveJob, setFeatured, getActiveJobs } from "../lib/server/jobs-store";
import { GET as getJobs } from "../app/api/jobs/route";
import { PATCH as patchJob } from "../app/api/jobs/[id]/route";
import { POST as applyRoute } from "../app/api/jobs/[id]/apply/route";
import { GET as listApplicants } from "../app/api/provider/applicants/route";
import { PATCH as patchApplicant } from "../app/api/provider/applicants/[id]/route";
import { POST as adminFeatured } from "../app/api/admin/featured/route";
import type { ApplicantStatus, FullJob, ListingApplicants } from "../lib/types";

let mockSession: { sub: string; name?: string; provider: "phone" | "google" } | null = null;
vi.mock("../lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth")>();
  return { ...actual, getSession: () => Promise.resolve(mockSession) };
});

const PROVIDER = "+919000000001";
const SEEKER = "+919000000002";
const OTHER_PROVIDER = "+919000000003";

const job = (id: string, posterId = PROVIDER): FullJob => ({
  id,
  roles: ["auto_mech"],
  title: { en: `Mechanic ${id}`, hi: "m", kn: "m" },
  summary: { en: "s", hi: "s", kn: "s" },
  employer: "Test Garage",
  area: "Peenya",
  publisher: "Daari Direct",
  applyLink: "https://wa.me/919000000001",
  postedAt: new Date().toISOString(),
  salaryText: "₹18,000",
  salaryMin: 18000,
  genderRestriction: null,
  requirements: [],
  signals: { asks_payment: 0, asks_sensitive: 0, unrealistic: 0 },
  description: "fixture",
  metadata: {
    source: "direct_employer",
    roleCategory: "Mechanic",
    posterPhone: posterId,
    posterId,
    verification: { proofType: "none", isVerified: false, businessName: "Test Garage", businessAddress: "Peenya", locality: "Peenya" },
    whatsappContact: "919000000001",
    status: "active",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  },
});

const call = (url: string, init?: RequestInit) => new NextRequest(`http://localhost:3000${url}`, init as never);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const asSeeker = () => (mockSession = { sub: SEEKER, name: "Ravi Kumar", provider: "phone" });
const asProvider = (sub = PROVIDER) => (mockSession = { sub, name: "Shop", provider: "phone" });

beforeEach(() => {
  const db = database();
  db.exec("DELETE FROM listing_applications; DELETE FROM job_listings;");
  mockSession = null;
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
  delete process.env.FEATURED_AUTO_APPROVE;
});

describe("job_listings store", () => {
  it("keeps listings in the database in posting order and flags featured ones in place", async () => {
    await saveJob({ ...job("job_a"), postedAt: "2026-01-01T00:00:00.000Z" });
    await saveJob({ ...job("job_b"), postedAt: "2026-01-02T00:00:00.000Z" });
    setFeatured("job_a", true);
    const jobs = await getActiveJobs();
    expect(jobs.map((j) => j.id)).toEqual(["job_b", "job_a"]);
    expect(jobs.find((j) => j.id === "job_a")?.metadata?.isFeatured).toBe(true);
  });

  it("stops treating a listing as featured once featured_until has passed", async () => {
    await saveJob(job("job_old"));
    database().prepare("UPDATE job_listings SET is_featured = 1, featured_until = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", "job_old");
    const res = await getJobs(call("/api/jobs?source=direct&featured=true"));
    expect((await res.json()).jobs).toHaveLength(0);
  });
});

describe("GET /api/jobs featured ordering", () => {
  it("spreads featured listings by default, puts them first only with sort=featured, and supports ?featured=true", async () => {
    await saveJob({ ...job("job_star"), postedAt: "2026-01-01T00:00:00.000Z" });
    await saveJob({ ...job("job_plain"), postedAt: "2026-01-02T00:00:00.000Z" });
    setFeatured("job_star", true);
    const all = (await (await getJobs(call("/api/jobs?source=direct"))).json()).jobs as FullJob[];
    expect(all.map((j) => j.id)).toEqual(["job_plain", "job_star"]);
    const sorted = (await (await getJobs(call("/api/jobs?source=direct&sort=featured"))).json()).jobs as FullJob[];
    expect(sorted.map((j) => j.id)).toEqual(["job_star", "job_plain"]);
    const only = (await (await getJobs(call("/api/jobs?source=direct&featured=true"))).json()).jobs as FullJob[];
    expect(only.map((j) => j.id)).toEqual(["job_star"]);
  });

  it("never returns closed listings", async () => {
    await saveJob(job("job_closed"));
    asProvider();
    await patchJob(call("/api/jobs/job_closed", { method: "PATCH", body: JSON.stringify({ action: "close" }) }), ctx("job_closed"));
    const ids = ((await (await getJobs(call("/api/jobs?source=direct"))).json()).jobs as FullJob[]).map((j) => j.id);
    expect(ids).not.toContain("job_closed");
  });
});

describe("featured placement requests", () => {
  it("approves the owner's request, and refuses everyone else", async () => {
    await saveJob(job("job_req"));
    const request = () => patchJob(call("/api/jobs/job_req", { method: "PATCH", body: JSON.stringify({ action: "request_featured" }) }), ctx("job_req"));

    mockSession = null;
    expect((await request()).status).toBe(401);
    asProvider(OTHER_PROVIDER);
    expect((await request()).status).toBe(403);
    asProvider();
    const res = await request();
    expect(res.status).toBe(200);
    expect((await res.json()).approved).toBe(true);
    const featured = ((await (await getJobs(call("/api/jobs?source=direct&featured=true"))).json()).jobs as FullJob[]).map((j) => j.id);
    expect(featured).toEqual(["job_req"]);
  });

  it("only flags the request when auto-approve is off", async () => {
    process.env.FEATURED_AUTO_APPROVE = "off";
    await saveJob(job("job_hold"));
    asProvider();
    const res = await patchJob(call("/api/jobs/job_hold", { method: "PATCH", body: JSON.stringify({ action: "request_featured" }) }), ctx("job_hold"));
    expect((await res.json()).approved).toBe(false);
    expect(((await (await getJobs(call("/api/jobs?source=direct&featured=true"))).json()).jobs as FullJob[])).toHaveLength(0);
  });
});

describe("admin featured route", () => {
  const post = (secret: string | null) =>
    adminFeatured(call("/api/admin/featured", { method: "POST", headers: secret ? { "x-admin-secret": secret } : {}, body: JSON.stringify({ id: "job_adm", featured: true }) }));

  it("is closed without a configured secret, with a wrong secret, or with none", async () => {
    await saveJob(job("job_adm"));
    expect((await post("anything")).status).toBe(403);
    process.env.ADMIN_SECRET = "s3cret-value";
    expect((await post(null)).status).toBe(403);
    expect((await post("wrong-value!")).status).toBe(403);
    expect((await post("s3cret-value")).status).toBe(200);
    expect((await getActiveJobs())[0].metadata?.isFeatured).toBe(true);
  });
});

describe("applicants", () => {
  const apply = () => applyRoute(call("/api/jobs/job_app/apply", { method: "POST" }), ctx("job_app"));
  const applicants = async () =>
    ((await (await listApplicants()).json()).listings as ListingApplicants[]).find((l) => l.listing.id === "job_app")!.applicants;
  const setStatus = (id: number, status: ApplicantStatus) =>
    patchApplicant(call(`/api/provider/applicants/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }), ctx(String(id)));

  beforeEach(async () => {
    await saveJob(job("job_app"));
    const seeker = { id: `phone:${SEEKER}`, provider: "phone" as const };
    store().touch(seeker);
    store().save(seeker.id, {
      profile: {
        goal: "job", name: "Ravi Kumar", phone: "9876543210", area: "Jayanagar", education: "ITI", hasIti: true, hasDrivingLicence: null,
        skills: ["welding", "fitting", "lathe", "painting"], experience: [{ role: "Fitter", place: "X", years: "2" }], wantedWork: [],
        languages: ["Kannada"], words: "", confirmed: {},
      },
    });
  });

  it("needs a signed-in seeker, and refuses to apply to one's own or a missing listing", async () => {
    mockSession = null;
    expect((await apply()).status).toBe(401);
    asProvider();
    expect((await apply()).status).toBe(409);
    asSeeker();
    expect((await applyRoute(call("/api/jobs/nope/apply", { method: "POST" }), ctx("nope"))).status).toBe(404);
  });

  it("records one application per seeker, with a snapshot of the profile", async () => {
    asSeeker();
    expect((await (await apply()).json()).created).toBe(true);
    expect((await (await apply()).json()).created).toBe(false);
    asProvider();
    const list = await applicants();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Ravi Kumar", area: "Jayanagar", status: "new", skills: ["welding", "fitting", "lathe", "painting"] });
  });

  it("keeps the phone number hidden until the provider shortlists", async () => {
    asSeeker();
    await apply();
    asProvider();
    const [first] = await applicants();
    expect(first.phone).toBeNull();
    expect(JSON.stringify(await (await listApplicants()).json())).not.toContain("9876543210");

    expect((await setStatus(first.id, "shortlisted")).status).toBe(200);
    expect((await applicants())[0].phone).toBe("9876543210");

    await setStatus(first.id, "rejected");
    expect((await applicants())[0].phone).toBeNull();
  });

  it("lets only the listing's owner see or change applicants", async () => {
    asSeeker();
    await apply();
    asProvider();
    const [first] = await applicants();

    asProvider(OTHER_PROVIDER);
    expect(((await (await listApplicants()).json()).listings as ListingApplicants[]).flatMap((l) => l.applicants)).toHaveLength(0);
    expect((await setStatus(first.id, "hired")).status).toBe(404);

    asSeeker();
    expect((await setStatus(first.id, "hired")).status).toBe(404);
    asProvider();
    expect((await patchApplicant(call("/api/provider/applicants/1", { method: "PATCH", body: JSON.stringify({ status: "bogus" }) }), ctx("1"))).status).toBe(400);
  });

  it("refuses applications to a closed listing", async () => {
    asProvider();
    await patchJob(call("/api/jobs/job_app", { method: "PATCH", body: JSON.stringify({ action: "close" }) }), ctx("job_app"));
    asSeeker();
    expect((await apply()).status).toBe(409);
  });
});
