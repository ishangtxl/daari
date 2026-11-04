/**
 * Runs the scam signals over hand-written examples and the real job catalog, and prints accuracy.
 * The examples are written by us, so this is a regression check, not a real-world accuracy figure.
 */
import { readFileSync } from "node:fs";
import { scamSignals } from "../lib/server/jev";
import type { Job } from "../lib/types";
import { SCAM_EXAMPLES } from "./scam-examples";

const WARN_AT = 0.6;
const flagged = async (text: string) => Object.values(await scamSignals(text)).some((score) => score >= WARN_AT);

async function main() {
  let caught = 0;
  let falseAlarms = 0;
  const scams = SCAM_EXAMPLES.filter((item) => item.scam);
  for (const item of SCAM_EXAMPLES) {
    const result = await flagged(item.text);
    if (result && item.scam) caught++;
    if (result && !item.scam) {
      falseAlarms++;
      console.log("FALSE ALARM:", item.text.slice(0, 100));
    }
    if (!result && item.scam) console.log("MISSED:", item.text.slice(0, 100));
  }
  console.log(`examples: caught ${caught}/${scams.length} scams, ${falseAlarms}/${SCAM_EXAMPLES.length - scams.length} false alarms`);

  const jobs: Job[] = JSON.parse(readFileSync("data/jobs.json", "utf8"));
  const sample = jobs.slice(0, 80);
  let realFlags = 0;
  for (const job of sample) {
    if (await flagged(`${job.title.en} at ${job.employer}\n${job.description}`)) {
      realFlags++;
      console.log("real listing flagged:", job.title.en, "|", job.employer, "|", job.publisher);
    }
  }
  console.log(`real listings: ${realFlags}/${sample.length} flagged`);
}

main();
