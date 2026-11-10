import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parsePay } from "../lib/pay";
import { applicantCardSchema, payText, postingFormSchema, postingToJob, safeNext, screenVerdict, type ApplicantCard, type PostingBody } from "../lib/postings";
import { openDatabase } from "../lib/server/db";
import { createPostings, type Postings } from "../lib/server/postings";
import { createStore } from "../lib/server/store";

let dir: string;
let db: DatabaseSync;
let clock: Date;
let board: Postings;
const shop = "phone:+919000000001";
const ravi = "phone:+918888888888";
const asha = "google:1234567890";

const body = (title = "Mobile repair technician"): PostingBody => ({
  form: {
    lang: "en", roleId: "mobile_repair", workType: "", title, business: "Sri Ganesh Mobiles", area: "Jayanagar",
    summary: "Repair phones that customers bring in.", timings: "10 am to 8 pm", payMin: 15000, payMax: 18000, payPeriod: "month", requirements: ["Can replace screens"],
  },
  title: { en: title, hi: title, kn: title },
  summary: { en: "Repair phones.", hi: "फ़ोन ठीक करें।", kn: "ಫೋನ್ ರಿಪೇರಿ." },
  timings: { en: "10 am to 8 pm", hi: "10 से 8", kn: "10 ರಿಂದ 8" },
  requirements: [{ id: "r0", kind: "skill", en: "Can replace screens", hi: "", kn: "" }],
  signals: { asks_payment: 0.02, asks_sensitive: 0.01, discriminates: 0.01, unrealistic: 0.1 },
});

const card = (name = "Ravi"): ApplicantCard => ({
  name, phone: "8888888888", area: "Jayanagar", education: "ITI", skills: ["Screen replacement"], experience: [], languages: ["Kannada"],
  answers: { r0: true }, note: "", lang: "kn",
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "daari-postings-"));
  db = openDatabase(path.join(dir, "test.db"));
  clock = new Date("2026-11-10T10:00:00.000Z");
  board = createPostings(db, () => clock);
  const store = createStore(db);
  for (const id of [shop, ravi, asha]) store.touch({ id, provider: id.startsWith("phone") ? "phone" : "google" });
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("postings", () => {
  it("show up for job seekers while open, and leave as soon as they are closed", () => {
    const id = board.create(shop, body());
    expect(board.liveJobs().map((job) => job.id)).toEqual([id]);
    expect(board.setOpen(ravi, id, false)).toBe(false);
    expect(board.setOpen(shop, id, false)).toBe(true);
    expect(board.liveJobs()).toEqual([]);
    expect(board.job(id)?.state).toBe("closed");
  });

  it("expire after 30 days, and reopening gives another 30", () => {
    const id = board.create(shop, body());
    clock = new Date("2026-12-10T10:00:01.000Z");
    expect(board.liveJobs()).toEqual([]);
    expect(board.mine(shop)[0].state).toBe("expired");
    expect(board.apply(ravi, id, card())).toBe("closed");
    board.setOpen(shop, id, true);
    expect(board.liveJobs()).toHaveLength(1);
  });

  it("let only their employer see who applied, and mark them seen", () => {
    const id = board.create(shop, body());
    expect(board.apply(ravi, id, card())).toBe("ok");
    expect(board.forOwner(ravi, id)).toBeNull();
    expect(board.applicationOf(ravi, id)?.seen).toBe(false);
    const view = board.forOwner(shop, id)!;
    expect(view.people.map((person) => person.card.name)).toEqual(["Ravi"]);
    expect(view.fresh).toBe(1);
    expect(board.applicationOf(ravi, id)?.seen).toBe(true);
    expect(board.mine(shop)[0]).toMatchObject({ applicants: 1, fresh: 0 });
  });

  it("take one application per person, never from the employer, and never after closing", () => {
    const id = board.create(shop, body());
    expect(board.apply(ravi, id, card())).toBe("ok");
    expect(board.apply(ravi, id, card())).toBe("duplicate");
    expect(board.apply(shop, id, card())).toBe("own");
    board.setOpen(shop, id, false);
    expect(board.apply(asha, id, card("Asha"))).toBe("closed");
    expect(board.apply(asha, "dmissing", card("Asha"))).toBe("missing");
  });

  it("let the employer answer an applicant, which only they can do", () => {
    const id = board.create(shop, body());
    board.apply(ravi, id, card());
    const applicant = board.forOwner(shop, id)!.people[0];
    const other = board.create(asha, body("Helper"));
    expect(board.setApplicantStatus(asha, other, applicant.id, "rejected")).toBe(false);
    expect(board.setApplicantStatus(asha, id, applicant.id, "rejected")).toBe(false);
    expect(board.setApplicantStatus(shop, id, applicant.id, "shortlisted")).toBe(true);
    expect(board.applicationsBy(ravi)[id]).toMatchObject({ status: "shortlisted", postingState: "open" });
  });

  it("remove a withdrawn application from the employer's view entirely", () => {
    const id = board.create(shop, body());
    board.apply(ravi, id, card());
    expect(board.withdraw(ravi, id)).toBe(true);
    expect(board.forOwner(shop, id)!.people).toEqual([]);
    expect(board.applicationOf(ravi, id)).toBeNull();
  });

  it("are taken down after reports from three different people, and stay down", () => {
    const id = board.create(shop, body());
    const versionBefore = board.version();
    expect(board.report(shop, id, "fake")).toBe(false);
    board.report(ravi, id, "asks_money");
    board.report(ravi, id, "asks_money");
    board.report(asha, id, "fake");
    expect(board.liveJobs()).toHaveLength(1);
    createStore(db).touch({ id: "phone:+917777777777", provider: "phone" });
    clock = new Date("2026-11-10T11:00:00.000Z");
    board.report("phone:+917777777777", id, "rude");
    expect(board.liveJobs()).toEqual([]);
    expect(board.job(id)).toBeNull();
    expect(board.setOpen(shop, id, true)).toBe(false);
    expect(board.version()).not.toBe(versionBefore);
  });

  it("go when the employer deletes their account, along with every application to them", () => {
    const id = board.create(shop, body());
    board.apply(ravi, id, card());
    createStore(db).remove(shop);
    expect(board.job(id)).toBeNull();
    expect(board.applicationsBy(ravi)).toEqual({});
  });

  it("drop a person's applications when they delete their account", () => {
    const id = board.create(shop, body());
    board.apply(ravi, id, card());
    createStore(db).remove(ravi);
    expect(board.forOwner(shop, id)!.people).toEqual([]);
  });
});

describe("a posting as a job", () => {
  it("reads like any other listing, with pay the job list understands", () => {
    const job = postingToJob("d1", body(), "2026-11-10T10:00:00.000Z");
    expect(job).toMatchObject({ direct: true, publisher: "Daari", employer: "Sri Ganesh Mobiles", roles: ["mobile_repair"], salaryMin: 15000 });
    expect(parsePay(job.salaryText)).toEqual({ amount: "₹15,000 – ₹18,000", period: "month" });
  });

  it("compares day wages with monthly pay", () => {
    const daily = { ...body(), form: { ...body().form, payMin: 700, payMax: 700, payPeriod: "day" as const } };
    const job = postingToJob("d1", daily, "2026-11-10T10:00:00.000Z");
    expect(job.salaryText).toBe("Rs 700 a day");
    expect(parsePay(job.salaryText)?.period).toBe("day");
    expect(job.salaryMin).toBe(700 * 26);
  });

  it("is matched on the listed kind of work picked for work typed in by hand", () => {
    const typed = { ...body(), form: { ...body().form, roleId: "other", workType: "Phone shop helper" }, matchRole: "retail_sales" };
    expect(postingToJob("d1", typed, "2026-11-10T10:00:00.000Z").roles).toEqual(["retail_sales"]);
  });

  it("says nothing about pay that was not given", () => {
    expect(payText({ payMin: null, payMax: null, payPeriod: "month" })).toBeNull();
  });
});

describe("posting forms", () => {
  const form = body().form;
  it("refuse a kind of work Daari does not know, and pay that runs backwards", () => {
    expect(postingFormSchema.safeParse(form).success).toBe(true);
    expect(postingFormSchema.safeParse({ ...form, roleId: "astronaut" }).success).toBe(false);
    expect(postingFormSchema.safeParse({ ...form, payMin: 20000, payMax: 10000 }).success).toBe(false);
  });

  it("take work typed in by hand, as long as it is actually typed", () => {
    expect(postingFormSchema.safeParse({ ...form, roleId: "other", workType: "Cook" }).success).toBe(true);
    expect(postingFormSchema.safeParse({ ...form, roleId: "other", workType: " " }).success).toBe(false);
  });

  it("block fees, sensitive details and discrimination, and only caution about high pay", () => {
    const clean = { asks_payment: 0.1, asks_sensitive: 0.1, discriminates: 0.1, unrealistic: 0.1 };
    expect(screenVerdict(clean)).toEqual({ blocked: [], cautions: [] });
    expect(screenVerdict({ ...clean, asks_payment: 0.9, discriminates: 0.65 }).blocked).toEqual(["asks_payment", "discriminates"]);
    expect(screenVerdict({ ...clean, unrealistic: 0.9 })).toEqual({ blocked: [], cautions: ["unrealistic"] });
  });
});

describe("applicant cards", () => {
  it("keep a mobile number as ten digits however it was typed, and refuse one that is not a mobile", () => {
    expect(applicantCardSchema.parse({ ...card(), phone: "+91 88888 88888" }).phone).toBe("8888888888");
    expect(applicantCardSchema.safeParse({ ...card(), phone: "12345" }).success).toBe(false);
  });
});

describe("returning after sign-in", () => {
  it("goes back only to a page on this site", () => {
    expect(safeNext("/employer/new")).toBe("/employer/new");
    expect(safeNext("/jobs/d12?x=1")).toBe("/jobs/d12?x=1");
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/api/state", "/login"]) expect(safeNext(bad)).toBe("/");
  });
});
