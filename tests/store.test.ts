import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, MIGRATIONS, openDatabase } from "../lib/server/db";
import { createStore, MAX_KEPT, type Store } from "../lib/server/store";
import type { Application, ChatMessage } from "../lib/state";
import { emptyProfile } from "../lib/types";

let dir: string;
let db: DatabaseSync;
let store: Store;
const ravi = { id: "phone:+918888888888", provider: "phone" as const };
const asha = { id: "google:1234567890", provider: "google" as const };

const message = (id: string, content = id): ChatMessage => ({ id, role: "user", content });
const application = (jobId: string, status: Application["status"] = "statusApplied"): Application => ({
  jobId, title: { en: "Technician", hi: "तकनीशियन", kn: "ತಂತ್ರಜ್ಞ" }, employer: "Shop", applyLink: "https://example.com", status, at: "2026-11-09T10:00:00.000Z",
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "daari-db-"));
  db = openDatabase(path.join(dir, "test.db"));
  store = createStore(db);
  store.touch(ravi);
  store.touch(asha);
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("bring a new database to the latest version, and running them again changes nothing", () => {
    const version = () => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    expect(version()).toBe(MIGRATIONS.length);
    migrate(db);
    expect(version()).toBe(MIGRATIONS.length);
  });

  it("remove the employer tables and settings from a database that had them, keeping everything else", () => {
    const old = new DatabaseSync(path.join(dir, "old.db"));
    old.exec(MIGRATIONS[0]);
    // What the briefly shipped version 2 created, cut down to what matters here.
    old.exec(`
      CREATE TABLE job_listings (id TEXT PRIMARY KEY, poster_id TEXT NOT NULL, body TEXT NOT NULL) STRICT;
      CREATE TABLE listing_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id TEXT NOT NULL REFERENCES job_listings (id)) STRICT;
      INSERT INTO job_listings VALUES ('job_shop_1', 'phone:+918888888888', '{}');
      INSERT INTO users (id, provider) VALUES ('phone:+918888888888', 'phone');
      INSERT INTO documents (user_id, kind, body) VALUES ('phone:+918888888888', 'lang', '"kn"'), ('phone:+918888888888', 'role', '"job_provider"');
      PRAGMA user_version = 2;
    `);
    migrate(old);
    const tables = (old.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((row) => row.name);
    expect(tables).not.toContain("job_listings");
    expect(tables).not.toContain("listing_applications");
    expect(createStore(old).load("phone:+918888888888").documents).toEqual({ lang: "kn" });
    expect((old.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number }).n).toBe(1);
    old.close();
  });

  it("refuse a database written by newer code", () => {
    db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    expect(() => migrate(db)).toThrow(/newer than this code/);
  });
});

describe("store", () => {
  it("keeps each account's data apart", () => {
    store.save(ravi.id, { profile: { ...emptyProfile(), area: "Jayanagar" }, lang: "kn" });
    store.appendMessages(ravi.id, [message("a")]);
    store.save(ravi.id, { applications: [application("job-1")] });

    const other = store.load(asha.id);
    expect(other.empty).toBe(true);
    expect(other.messages).toEqual([]);
    expect(store.load(ravi.id).documents.lang).toBe("kn");
  });

  it("saves only the parts sent, leaving the rest as they were", () => {
    store.save(ravi.id, { lang: "hi", roles: ["mobile_repair"] });
    store.save(ravi.id, { roles: ["electrician"] });
    const { documents } = store.load(ravi.id);
    expect(documents.lang).toBe("hi");
    expect(documents.roles).toEqual(["electrician"]);
  });

  it("keeps messages in order, and stores a resent message once", () => {
    store.appendMessages(ravi.id, [message("one"), message("two")]);
    store.appendMessages(ravi.id, [message("two"), message("three")]);
    expect(store.load(ravi.id).messages.map((m) => m.id)).toEqual(["one", "two", "three"]);
  });

  it("keeps a plan handed over in the conversation", () => {
    const roadmap = { understood: "You fix phones.", destination: "A repair job", steps: [{ title: "See jobs", why: "Shops are hiring.", action: "jobs" as const }], goal: "job" as const, at: "2026-11-09T10:00:00.000Z" };
    store.appendMessages(ravi.id, [{ id: "plan", role: "assistant", content: "Plan", roadmap }]);
    expect(store.load(ravi.id).messages[0].roadmap).toEqual(roadmap);
  });

  it("drops the oldest messages beyond the limit", () => {
    const many = Array.from({ length: MAX_KEPT + 5 }, (_, index) => message(`m${index}`));
    store.appendMessages(ravi.id, many);
    const count = (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?").get(ravi.id) as { n: number }).n;
    expect(count).toBe(MAX_KEPT);
  });

  it("treats the applications list as the whole set", () => {
    store.save(ravi.id, { applications: [application("a"), application("b")] });
    store.save(ravi.id, { applications: [application("b", "statusInterview")] });
    const { applications } = store.load(ravi.id);
    expect(applications.map((a) => [a.jobId, a.status])).toEqual([["b", "statusInterview"]]);
  });

  it("deletes everything an account owns, and nothing of anyone else's", () => {
    for (const account of [ravi, asha]) {
      store.save(account.id, { lang: "en", applications: [application("x")] });
      store.appendMessages(account.id, [message("hello")]);
    }
    store.remove(ravi.id);
    for (const table of ["users", "documents", "messages", "applications"]) {
      const column = table === "users" ? "id" : "user_id";
      const left = (id: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(id) as { n: number }).n;
      expect(left(ravi.id)).toBe(0);
      expect(left(asha.id)).toBeGreaterThan(0);
    }
  });

  it("refuses rows the schema does not allow, even if code tried to write one", () => {
    expect(() =>
      db.prepare("INSERT INTO applications (user_id, job_id, title, employer, apply_link, status, applied_at) VALUES (?, 'x', '{}', '', '', 'statusHired', '')").run(ravi.id),
    ).toThrow(/CHECK constraint/);
    expect(() => db.prepare("INSERT INTO documents (user_id, kind, body) VALUES ('nobody', 'lang', '\"en\"')").run()).toThrow(/FOREIGN KEY/);
  });
});
