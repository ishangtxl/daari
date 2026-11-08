/**
 * Builds data/jobs.json: real Bangalore listings, translated and scanned ahead of time so the app
 * is fast and works during a demo even if the job API is down.
 *
 * Every step is cached in data/raw, so reruns only pay for what is new. A JSearch call is spent only
 * for a role with no cached response.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { ROLES } from "../lib/roles";
import { chatJson } from "../lib/server/llm";
import { nouls } from "../lib/server/jev";
import type { Job } from "../lib/types";

const RAW = "data/raw";
const ENRICH = `${RAW}/enrich`;
mkdirSync(ENRICH, { recursive: true });

type RawJob = Record<string, unknown> & { job_id: string; job_title?: string; employer_name?: string; job_description?: string };

async function fetchRole(query: string): Promise<RawJob[]> {
  const path = `${RAW}/jsearch_${query.toLowerCase().replace(/\s+/g, "_")}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")).data.jobs;
  const params = new URLSearchParams({ query: `${query} in Bangalore`, country: "in", page: "1", num_pages: "1", date_posted: "month" });
  const res = await fetch(`https://${process.env.X_RAPIDAPI_HOST}/search-v2?${params}`, {
    headers: { "x-rapidapi-key": process.env.X_RAPIDAPI_KEY!, "x-rapidapi-host": process.env.X_RAPIDAPI_HOST! },
    signal: AbortSignal.timeout(60_000),
  }).catch(() => null);
  if (!res?.ok) {
    console.log(`  JSearch ${res?.status ?? "timeout"} for ${query}`);
    return [];
  }
  const payload = await res.json();
  writeFileSync(path, JSON.stringify(payload));
  return payload.data?.jobs ?? [];
}

const localized = z.object({ en: z.string(), hi: z.string(), kn: z.string() });
const enrichSchema = z.object({
  title: localized,
  summary: localized,
  area: z.string().nullable().default(null),
  salary_text: z.string().nullable().default(null),
  salary_min: z.number().nullable().default(null),
  gender_restriction: z.enum(["male", "female"]).nullable().default(null),
  requirements: z.array(localized.extend({ kind: z.string().default("other") })).max(6).default([]),
});

const ENRICH_PROMPT = `You prepare job listings for people with limited formal education in Bangalore. Return JSON with:
- title: {en, hi, kn}, the job title in plain words. hi in Devanagari, kn in Kannada script. Use everyday words that workers use. In Kannada use real Kannada words, never Hindi words.
- summary: {en, hi, kn}, one short simple sentence saying what the person will actually do.
- area: the Bangalore locality if stated, otherwise null.
- salary_text: pay as stated, like "Rs 15,000 to 25,000 a month", otherwise null. Never guess.
- salary_min: lowest monthly pay in rupees as a number, otherwise null. Divide yearly pay (including LPA) by 12.
- gender_restriction: "male" or "female" only if the listing explicitly restricts it, otherwise null.
- requirements: up to 6 concrete things the applicant must have, taken only from the listing, most important first. Each is {en, hi, kn, kind} where kind is education, experience, skill, licence or other. Write each so it can be checked against what a person says, like "Has an ITI qualification". Skip vague items like "hard working". Never invent a requirement.
Output JSON only.`;

function hash(text: string) {
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}

async function enrich(raw: RawJob) {
  const id = hash(raw.job_id);
  const path = `${ENRICH}/${id}.json`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const description = (raw.job_description ?? "").slice(0, 3500);
  const text = `${raw.job_title} at ${raw.employer_name}\n${description}`;
  const [details, signals] = await Promise.all([
    chatJson("catalog", enrichSchema, [
      { role: "system", content: ENRICH_PROMPT },
      { role: "user", content: text },
    ], { maxTokens: 2000 }),
    nouls(text, {
      asks_payment: "The listing requires the applicant to pay money, such as a fee or deposit, to get the job.",
      asks_sensitive: "The listing asks for an OTP, bank details or identity documents before any interview.",
      unrealistic: "The pay or promises are unrealistic for the work and qualifications described.",
      entry_level: "Someone without a four-year engineering degree and with under 5 years of experience could realistically get this job.",
    }),
  ]);
  const result = { id, details, signals };
  writeFileSync(path, JSON.stringify(result));
  return result;
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const item = items[next++];
        results.push(await work(item));
      }
    }),
  );
  return results;
}

async function main() {
  const byId = new Map<string, { raw: RawJob; roles: Set<string> }>();
  for (const role of ROLES) {
    for (const query of [role.query, ...(role.moreQueries ?? [])]) {
      const jobs = await fetchRole(query);
      console.log(`${query}: ${jobs.length}`);
      for (const raw of jobs) {
        const entry = byId.get(raw.job_id) ?? { raw, roles: new Set<string>() };
        entry.roles.add(role.id);
        byId.set(raw.job_id, entry);
      }
    }
  }
  const entries = [...byId.values()];
  console.log(`\n${entries.length} unique listings, enriching...`);

  let failed = 0;
  const built = await pool(entries, 6, async ({ raw, roles }) => {
    try {
      const { id, details, signals } = await enrich(raw);
      return { id, details, signals, raw, roles };
    } catch (error) {
      failed++;
      console.log(`  failed ${raw.job_title}: ${String(error).slice(0, 120)}`);
      return null;
    }
  });

  const seen = new Set<string>();
  const jobs: Job[] = [];
  let dropped = 0;
  for (const item of built) {
    if (!item) continue;
    const { id, details, signals, raw, roles } = item;
    // The same job is often posted on several boards, so keep one.
    const key = `${details.title.en}|${raw.employer_name}`.toLowerCase();
    if (seen.has(key) || signals.entry_level < 0.3 || details.requirements.length === 0) {
      dropped++;
      continue;
    }
    seen.add(key);
    jobs.push({
      id,
      roles: [...roles],
      title: details.title,
      summary: details.summary,
      employer: String(raw.employer_name ?? ""),
      area: details.area ?? String(raw.job_city ?? "Bengaluru"),
      publisher: String(raw.job_publisher ?? ""),
      applyLink: String(raw.job_apply_link ?? ""),
      postedAt: (raw.job_posted_at_datetime_utc as string) ?? null,
      salaryText: details.salary_text,
      salaryMin: details.salary_min,
      genderRestriction: details.gender_restriction,
      requirements: details.requirements.map((req: z.infer<typeof enrichSchema>["requirements"][number], index: number) => ({
        id: `r${index}`,
        kind: req.kind,
        en: req.en,
        hi: req.hi,
        kn: req.kn,
      })),
      signals: { asks_payment: signals.asks_payment, asks_sensitive: signals.asks_sensitive, unrealistic: signals.unrealistic },
      description: String(raw.job_description ?? "").slice(0, 3500),
    });
  }
  writeFileSync("data/jobs.json", JSON.stringify(jobs));
  console.log(`\nwrote ${jobs.length} jobs, dropped ${dropped} duplicates or senior roles, ${failed} failed`);
}

main();
