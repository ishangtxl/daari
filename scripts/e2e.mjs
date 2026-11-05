// Drives the real app and real APIs in a browser, including the microphone using a recorded file.
// Usage: node scripts/e2e.mjs <base url> <screenshot dir> <wav file>
import { mkdirSync, statSync } from "node:fs";
import { chromium } from "playwright";

const [base, out, wav] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
});
const context = await browser.newContext({ viewport: { width: 375, height: 760 }, permissions: ["microphone", "clipboard-read", "clipboard-write"], acceptDownloads: true });
const page = await context.newPage();

const problems = [];
const timings = {};
page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text().slice(0, 200)}`); });
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message.slice(0, 200)}`));
page.on("response", (res) => {
  if (!res.url().includes("/api/")) return;
  const path = new URL(res.url()).pathname;
  const request = res.request();
  (timings[path] ??= []).push(Math.round(request.timing().responseStart));
  if (res.status() >= 400) problems.push(`${res.status()} ${path}`);
});
// Waits for the route lines to finish drawing, so a screenshot never shows them mid-animation.
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const step = (text) => console.log(`- ${text}`);

await page.goto(base);
await page.getByRole("button", { name: "हिन्दी" }).waitFor();
await shot("01-language");
await page.getByRole("button", { name: "हिन्दी" }).click();
await page.getByRole("heading", { name: "आपने क्या काम किया है?" }).waitFor();
await shot("02-home");
step("language chosen, home in Hindi");

await page.goto(`${base}/talk`);
await page.getByRole("button", { name: "दबाकर बोलिए" }).click();
await page.waitForTimeout(800);
await shot("03-recording");
await page.waitForTimeout(7000);
await page.getByRole("button", { name: "रोकें" }).first().click();
await page.locator(".bubble-user").first().waitFor({ timeout: 30000 });
step(`heard: ${await page.locator(".bubble-user").first().innerText()}`);
await page.waitForFunction(() => document.querySelectorAll(".bubble-assistant .read-aloud").length >= 2, null, { timeout: 40000 });
step(`reply: ${await page.locator(".bubble-assistant p").last().innerText()}`);
await shot("04-voice-reply");

await page.getByRole("button", { name: "लिखकर बताएँ" }).click();
for (const text of ["मैंने 10वीं पास की है, आईटीआई नहीं किया। मैं जयनगर में रहता हूँ।", "मुझे मोबाइल रिपेयर की नौकरी चाहिए। ड्राइविंग लाइसेंस नहीं है।"]) {
  const before = await page.locator(".bubble-assistant .read-aloud").count();
  await page.getByRole("textbox").fill(text);
  await page.getByRole("button", { name: "भेजें" }).click();
  await page.waitForFunction((count) => document.querySelectorAll(".bubble-assistant .read-aloud").length > count, before, { timeout: 40000 });
  step(`reply: ${await page.locator(".bubble-assistant p").last().innerText()}`);
}
await page.waitForTimeout(5000);
await shot("05-chat");

await page.locator("nav").getByRole("link", { name: "नौकरी" }).click();
await page.locator(".job-row").first().waitFor({ timeout: 60000 });
step(`jobs matched: ${await page.locator(".job-row").count()}, first: ${await page.locator(".job-row h3").first().innerText()} (${await page.locator(".job-meets").first().innerText()})`);
await shot("06-jobs");
await page.locator(".job-row").first().click();
await page.locator(".way-line").waitFor();
await shot("07-job");
const unsure = page.locator(".is-unsure .btn").first();
if (await unsure.count()) { await unsure.click(); step("answered an unsure stop"); }
const planButton = page.getByRole("button", { name: "कमी कैसे पूरी करें, बताइए" });
if (await planButton.count()) {
  await planButton.click();
  await page.locator(".plan-step").first().waitFor({ timeout: 60000 });
  step(`plan steps: ${await page.locator(".plan-step").count()}, first: ${await page.locator(".plan-step h3").first().innerText()}`);
}
await page.getByRole("button", { name: "मेरा आवेदन तैयार करें" }).click();
await page.locator(".question-list").waitFor({ timeout: 60000 });
step(`apply kit: ${await page.locator(".kit-block p").first().innerText()}`);
await page.getByRole("button", { name: "मैंने आवेदन कर दिया" }).click();
await shot("08-job-plan-kit");

await page.locator("nav").getByRole("link", { name: "नौकरी" }).click();
await page.getByRole("tab", { name: "यहाँ पूछिए" }).click();
await page.getByRole("button", { name: "जगहें ढूँढें और मैसेज लिखें" }).click();
await page.locator(".kit-block").first().waitFor({ timeout: 60000 });
step(`outreach message: ${await page.locator(".kit-block p").first().innerText()}`);
await shot("09-nearby");
await page.getByRole("tab", { name: "मेरे आवेदन" }).click();
step(`applications tracked: ${await page.locator(".application-list li").count()}`);
await shot("10-applications");

await page.locator("nav").getByRole("link", { name: "सीखें" }).click();
await page.getByRole("button", { name: "मेरी सीखने की योजना बनाएँ" }).click();
await page.locator(".plan-step").first().waitFor({ timeout: 60000 });
await shot("11-learn");
step("learning plan made");

await page.locator("nav").getByRole("link", { name: "जाँचें" }).click();
await page.getByRole("button", { name: "एक उदाहरण देखें" }).click();
await page.getByRole("button", { name: "यह मैसेज जाँचें" }).click();
await page.locator(".verdict").waitFor({ timeout: 30000 });
step(`scam result: ${await page.locator(".verdict h2").innerText()} | ${(await page.locator(".signal-list li").allInnerTexts()).join("; ")}`);
await shot("12-check");

await page.locator("nav").getByRole("link", { name: "रिज्यूमे" }).click();
await page.getByLabel("आपका नाम, अंग्रेज़ी अक्षरों में").fill("Ravi Kumar");
await page.getByLabel("फ़ोन नंबर").fill("9876543210");
await page.getByRole("button", { name: "मेरा रिज्यूमे लिखें" }).click();
await page.locator(".review-list").waitFor({ timeout: 90000 });
step(`resume review lines: ${await page.locator(".review-list li").count()}, removed: ${await page.locator(".removed li").count()}`);
await page.getByRole("checkbox").check();
const downloadPromise = page.waitForEvent("download", { timeout: 40000 });
await page.getByRole("button", { name: "रिज्यूमे PDF डाउनलोड करें" }).click();
const download = await downloadPromise;
await download.saveAs(`${out}/resume.pdf`);
step(`resume PDF: ${statSync(`${out}/resume.pdf`).size} bytes`);
await shot("13-me");

// Other widths and the other languages, for visual review.
for (const [width, height] of [[768, 1000], [1440, 900]]) {
  await page.setViewportSize({ width, height });
  await page.goto(base);
  await page.waitForTimeout(500);
  await shot(`w${width}-home`);
  await page.goto(`${base}/jobs`);
  await page.locator(".job-row").first().waitFor({ timeout: 60000 });
  await shot(`w${width}-jobs`);
}
await page.setViewportSize({ width: 375, height: 760 });
await page.evaluate(() => { const data = JSON.parse(localStorage.getItem("daari.v1")); data.lang = "kn"; localStorage.setItem("daari.v1", JSON.stringify(data)); });
for (const [name, path] of [["kn-home", "/"], ["kn-jobs", "/jobs"], ["kn-check", "/check"], ["kn-me", "/me"]]) {
  await page.goto(`${base}${path}`);
  await page.waitForTimeout(path === "/jobs" ? 2500 : 500);
  await shot(name);
}

console.log("\nresponse start ms by route:", JSON.stringify(timings));
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no console errors or failed requests");
await browser.close();
process.exit(problems.length ? 1 : 0);
