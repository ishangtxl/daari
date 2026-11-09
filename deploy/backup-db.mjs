// Copies the database to a dated file and keeps the newest few.
// Usage: node backup-db.mjs <database> <backup folder> [--keep=7] [--if-older-than-hours=24]
// VACUUM INTO writes a consistent copy even while the app is writing, unlike copying the file.
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [file, folder, ...flags] = process.argv.slice(2);
const option = (name, fallback) => Number(flags.find((flag) => flag.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const keep = option("keep", 7);
const minAgeHours = option("if-older-than-hours", 0);

if (!file || !folder) {
  console.error("usage: backup-db.mjs <database> <backup folder> [--keep=7] [--if-older-than-hours=24]");
  process.exit(2);
}
if (!existsSync(file)) process.exit(0); // Nothing saved yet.

mkdirSync(folder, { recursive: true });
const backups = () => readdirSync(folder).filter((name) => /^daari-.*\.db$/.test(name)).sort();
const newest = backups().at(-1);
if (minAgeHours && newest && Date.now() - statSync(path.join(folder, newest)).mtimeMs < minAgeHours * 3_600_000) process.exit(0);

const target = path.join(folder, `daari-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
const db = new DatabaseSync(file);
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();
console.log(`backed up the database to ${target}`);

for (const old of backups().slice(0, -keep)) rmSync(path.join(folder, old));
