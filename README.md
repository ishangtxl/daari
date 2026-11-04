# Daari

*Daari* (ದಾರಿ) means "the way" in Kannada. It's a job counsellor that job seekers in Bangalore can talk to in Kannada, Hindi or English. It's built for ITI and diploma holders and non-CS graduates, who are poorly served by English-first job portals.

## What it does

- **Talk:** a counsellor you speak or type to, which learns your experience from your own words. Informal work counts.
- **Jobs:** real Bangalore listings, ranked by fit. Each requirement is a stop on a route line, so "you meet 4 of 6" is checkable, not an invented percentage.
- **Places to ask:** many small shops never advertise online, so Daari finds local businesses and drafts a WhatsApp message and call script. These are labelled as not confirmed vacancies.
- **Learn:** a plan for your gaps, using a verified list of NPTEL and SWAYAM courses plus YouTube searches.
- **Apply:** a message for the employer, a call script, documents to carry, and spoken interview practice. You always apply yourself, and an application tracker follows up.
- **Resume:** written in English from what you said, with lines that your words don't support removed. You read it back in your own language before downloading the PDF.
- **Check a message:** paste or read out any job message for specific warnings, such as "asks you to pay money".

## How it fits together

| Job | Tool |
|---|---|
| Speech to text, text to speech | Sarvam (`saaras:v3` codemix, `bulbul:v3`) |
| Conversation, writing, translation | GPT-6 Luna via ZenMux, with GPT-6.1 Terra for resumes |
| Fast yes/no decisions: fit, each requirement, scam signals, resume claims | Jev (TypeSafe) |
| Job listings | JSearch, prepared ahead of time in `data/jobs.json` |
| Local businesses | Google Places, or a Google Maps search when no key is set |
| Resume PDF | Fixed templates filled from JSON with `@react-pdf/renderer` |

Profiles stay in the browser's local storage, and text is only sent to the server when a feature needs it.

## Running it

Create `.env` with:

```
ZENMUX_API_KEY=
JEV_API_KEY=
SARVAM_API_KEY=
X_RAPIDAPI_KEY=
X_RAPIDAPI_HOST=jsearch.p.rapidapi.com
GOOGLE_PLACES_API_KEY=   # optional
```

```
pnpm install
pnpm dev
```

| Command | What it does |
|---|---|
| `pnpm catalog` | Refreshes the job listings, using cached responses where it can |
| `pnpm test` | Runs the unit tests |
| `pnpm scam-eval` | Runs the scam signals over hand-written examples and real listings |
| `node scripts/e2e.mjs <url> <screenshot dir> <wav>` | Drives the whole app in a browser with real APIs, using a WAV file as the microphone |

The job catalog is a snapshot, so run `pnpm catalog` to refresh it. `spikes/` holds the throwaway scripts behind the early API and model choices.
