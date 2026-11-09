import { promises as fs } from "node:fs";
import path from "node:path";
import type { FullJob } from "../types";

const STORE_PATH = path.join(process.cwd(), "data", "posted_jobs.json");

let memoryCache: FullJob[] | null = null;

async function ensureStoreFile(): Promise<FullJob[]> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const data = JSON.parse(raw);
    memoryCache = Array.isArray(data) ? data : [];
    return memoryCache!;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      memoryCache = [];
      await fs.writeFile(STORE_PATH, JSON.stringify([], null, 2), "utf-8");
      return memoryCache;
    }
    console.error("[jobs-store] Failed to read posted jobs store:", err);
    return [];
  }
}

async function persist(jobs: FullJob[]): Promise<void> {
  memoryCache = jobs;
  await fs.writeFile(STORE_PATH, JSON.stringify(jobs, null, 2), "utf-8");
}

export async function getActiveJobs(): Promise<FullJob[]> {
  const all = await ensureStoreFile();
  const now = new Date().toISOString();
  return all.filter((job) => {
    if (job.metadata?.status !== "active") return false;
    if (job.metadata.expiresAt && job.metadata.expiresAt < now) return false;
    return true;
  });
}

export async function getJobById(id: string): Promise<FullJob | null> {
  const all = await ensureStoreFile();
  return all.find((job) => job.id === id) ?? null;
}

export async function saveJob(job: FullJob): Promise<void> {
  const all = await ensureStoreFile();
  const index = all.findIndex((j) => j.id === job.id);
  if (index >= 0) {
    all[index] = job;
  } else {
    all.unshift(job);
  }
  await persist(all);
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** An active listing by the same poster for the same business, role and locality. A different role or locality is not a duplicate. */
export async function findDuplicateActiveJob(
  posterId: string,
  businessName: string,
  roleCategory: string,
  locality: string,
): Promise<FullJob | null> {
  const active = await getActiveJobs();
  return (
    active.find(
      (j) =>
        j.metadata?.posterId === posterId &&
        norm(j.employer) === norm(businessName) &&
        norm(j.metadata.roleCategory) === norm(roleCategory) &&
        norm(j.area) === norm(locality),
    ) ?? null
  );
}

export async function closeJob(id: string, posterPhone: string): Promise<boolean> {
  const all = await ensureStoreFile();
  const job = all.find((j) => j.id === id);
  if (!job) return false;
  // Verify ownership
  if (job.metadata?.posterPhone !== posterPhone) return false;
  job.metadata.status = "paused";
  await persist(all);
  return true;
}

export async function listJobsByPoster(posterPhone: string): Promise<FullJob[]> {
  const all = await ensureStoreFile();
  return all.filter((j) => j.metadata?.posterPhone === posterPhone);
}
