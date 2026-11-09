# Daari

*Daari* (ದಾರಿ) means "the way" in Kannada. It's a job counsellor that job seekers in Bangalore can talk to in Kannada, Hindi or English. It's built for ITI and diploma holders and non-CS graduates, who are poorly served by English-first job portals.

## What it does

- **Talk:** a counsellor you speak or type to, which learns your experience from your own words. Informal work counts.
- **Jobs:** real Bangalore listings, ranked by fit, with optional road-distance/salary filters and distance/eligibility/salary sorting. Eligibility sorting ranks jobs with every listed requirement met first, then one unmet requirement, two unmet requirements, and so on. Each requirement is a stop on a route line, so "you meet 4 of 6" is checkable, not an invented percentage.
- **Places to ask:** many small shops never advertise online, so Daari finds local businesses and drafts a WhatsApp message and call script. These are labelled as not confirmed vacancies.
- **Learn:** a plan for your gaps, using a verified list of NPTEL and SWAYAM courses plus YouTube videos and playlists checked to teach each step.
- **Apply:** a message for the employer, a call script, documents to carry, and spoken interview practice. You always apply yourself, and an application tracker follows up.
- **Resume:** written in English from what you said, with lines that your words don't support removed. You read it back in your own language before downloading the PDF.
- **Check a message:** paste or read out any job message for specific warnings, such as "asks you to pay money".

## How it fits together

| Job | Tool |
|---|---|
| Speech to text, text to speech | Sarvam (`saaras:v3` codemix, `bulbul:v3`) |
| Conversation, writing, translation | IBM Bob (`premium` conversational API) / GPT-6 Luna via ZenMux, with GPT-6.1 Terra for resumes |
| Fast yes/no decisions: fit, each requirement, scam signals, resume claims | Jev (TypeSafe) |
| Job listings | JSearch, prepared ahead of time in `data/jobs.json` |
| Local businesses | Google Places, or a Google Maps search when no key is set |
| Resume PDF | Fixed templates filled from JSON with `@react-pdf/renderer` |

Profiles stay in the browser's local storage, and text is only sent to the server when a feature needs it.

## Running it

Copy `.env.example` to `.env` in this project root, then add your server-side keys:

```
IBM_BOB_API_KEY=        # conversational & resume API (or ZENMUX_API_KEY)
ZENMUX_API_KEY=
JEV_API_KEY=
SARVAM_API_KEY=
X_RAPIDAPI_KEY=
X_RAPIDAPI_HOST=jsearch.p.rapidapi.com
GOOGLE_PLACES_API_KEY=   # optional; used by Places to ask
GOOGLE_ROUTES_API_KEY= # optional; server-side Routes API key, enables road-distance filters
YOUTUBE_API_KEY=       # optional; picks real videos and playlists for learning plans
```

Every page needs sign-in, by phone through Firebase or with Google, so `AUTH_SECRET` and the Firebase and Google keys in `.env.example` are needed too. Firebase test numbers sign in with a fixed code and send no SMS. The Google button stays hidden until `GOOGLE_SIGNIN=on`, which should be set only after `GOOGLE_REDIRECT_URI` is added as an authorised redirect URI in Google Cloud.

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

The job catalog is a snapshot, so run `pnpm catalog` to refresh it. A job search evaluates at most 24 candidate listings. Road distances are fetched only after a customer selects a distance filter or nearest-first sorting. Within one request, the server groups jobs by normalized locality and sends each distinct destination only once. The browser keeps the returned distances in the current Jobs page state, so changing distance thresholds or switching between distance sort and distance filters reuses the same response for that page view. The distances are not persisted in a server cache or shared across customers: Google Maps Platform policies prohibit storing or indexing Routes/Distance Matrix distance results; the listed caching exceptions cover other specific values such as Place IDs and latitude/longitude, not road-distance results. The Routes API accepts address strings and resolves them internally, so this feature does not call the separate Geocoding API. Distances are approximate road distances between localities, not exact door-to-door commute distances. Salary thresholds require the listing's stated minimum monthly pay to be strictly above the selected amount; salary sorting uses that minimum pay as the comparable starting-salary figure. Keep the Routes API key server-side, restrict it to the Routes API, and apply an IP restriction for the production server where practical. `spikes/` holds the throwaway scripts behind the early API and model choices.

## Deployment

The live app is at https://145-223-23-79.sslip.io. The VPS checks GitHub every minute, and a new commit on `main` goes live after its unit tests and build pass. If the new version fails any of those or will not start, the site stays on the last working one.

The app runs as the `daari` service behind Caddy, from `~/daari/current`. Its keys are in `~/daari/shared/.env`, which is not in git, and changing them needs `sudo systemctl restart daari`. `~/daari/deploy.log` shows each deploy, `readlink ~/daari/current` shows which commit is live, and `journalctl -u daari -f` shows the app's logs. `deploy/` holds the deploy script, services and Caddy config.
