# Running Daari locally

This takes about 15 minutes, most of it spent getting API keys. If you only want to see the app, the live site is at https://145-223-23-79.sslip.io.

## 1. Install

You need Node 23 or newer, because accounts are stored with Node's built-in `node:sqlite`, and [pnpm](https://pnpm.io/installation).

```
git clone https://github.com/ishangtxl/daari.git
cd daari
pnpm install
cp .env.example .env
```

## 2. Add the keys

Open `.env` and fill these in. Every key stays on the server and never reaches the browser.

| Key | What it's for | Needed? |
|---|---|---|
| `IBM_BOB_API_KEY` | IBM Bob, the language model that writes replies, plans and resumes | One of these two. With both, Bob is tried first and ZenMux answers when Bob fails |
| `ZENMUX_API_KEY` | GPT-6 Luna through [ZenMux](https://zenmux.ai), the fallback language model | |
| `JEV_API_KEY` | Jev (TypeSafe), which makes every yes/no decision: job fit, scam signals, posting screening | Yes |
| `SARVAM_API_KEY` | [Sarvam](https://dashboard.sarvam.ai), for speech to text and reading replies aloud | Yes, for voice. Typing works without it |
| `GOOGLE_PLACES_API_KEY` | Real local shops in **Places to ask** | No. Without it, Daari links to a Google Maps search |
| `GOOGLE_ROUTES_API_KEY` | Road-distance sorting and filters on Jobs | No. Without it, those options are hidden |
| `YOUTUBE_API_KEY` | YouTube Data API v3, for real videos in learning plans | No. Without it, a plan links to a YouTube search |
| `X_RAPIDAPI_KEY` | JSearch on RapidAPI | Only to refresh the job catalog with `pnpm catalog`. The app ships with 212 listings in `data/jobs.json` |

## 3. Set up Google sign-in

Every page needs sign-in, and sign-in is through Google.

1. Generate a session secret and put it in `AUTH_SECRET`:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type **Web application**.
3. Add `http://localhost:3000/api/auth/oauth/callback` as an authorised redirect URI. It must match `GOOGLE_REDIRECT_URI` in `.env` exactly.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Set `GOOGLE_SIGNIN=on`.

While the OAuth consent screen is in testing, only the Google accounts you add as test users can sign in.

## 4. Run it

```
pnpm dev
```

Open http://localhost:3000, pick a language and sign in. The database is created at `.data/daari.db` the first time the app starts. Delete that file to start from nothing.

To check that the language model keys work, run `pnpm llm-smoke`. It sends one request and one streamed reply, and prints which provider answered.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the app at http://localhost:3000 |
| `pnpm test` | Runs the unit tests. No keys needed |
| `pnpm typecheck` | Checks types |
| `pnpm build` and `pnpm start` | Builds and runs the production version |
| `pnpm catalog` | Refreshes the job listings, using cached responses where it can |
| `pnpm scam-eval` | Runs the scam signals over hand-written examples and real listings |
| `pnpm posting-eval` | Screens 100 test postings, half of them asking for money, and prints how many were blocked and how long each check took |
| `pnpm prompt-eval` | Runs every language-model prompt on hard cases and checks its rules: language and script, length, one question, no invented facts. Run it with `ZENMUX_API_KEY=` to test IBM Bob alone, or `IBM_BOB_API_KEY=` to test ZenMux alone |
| `pnpm llm-smoke` | Sends one request and one streamed reply, and prints which provider answered |
| `node --env-file=.env scripts/e2e.mjs <url> <screenshot dir> <wav>` | Drives the app in a browser with real APIs, using a WAV file as the microphone. It signs in with a session made from `AUTH_SECRET`, so that must match the server's |

## Spending limits

Each server process stops calling the language model after `SPEND_LIMIT_USD` (default $11, about ₹1,000), counted at listed prices. Each API route also has a per-address rate limit. YouTube search results are cached for a day, which keeps the daily quota of about 100 searches enough for a demo.

Restrict the Google keys in Google Cloud to the one API each is for. In production, also limit them to the server's IP address.

## Running it on a server

Set `APP_BASE_URL` to the site's public address, change `GOOGLE_REDIRECT_URI` to match it (and add it in Google Cloud), and set `DATABASE_PATH` to a file outside the release folder. Production refuses to start without `DATABASE_PATH`, so a deploy can never start from an empty database. The [Deployment](README.md#deployment) section of the README describes how the live site is run.

## If something goes wrong

- **The sign-in page says sign-in is not set up.** `GOOGLE_SIGNIN` is not `on`. Restart `pnpm dev` after changing `.env`.
- **Google says `redirect_uri_mismatch`.** The redirect URI in Google Cloud and `GOOGLE_REDIRECT_URI` differ, often by a trailing slash or `127.0.0.1` instead of `localhost`.
- **Google says access is blocked.** Your account isn't a test user on the consent screen.
- **An error about `node:sqlite` on start.** Node is older than 23. Check with `node -v`.
- **Replies never arrive.** Run `pnpm llm-smoke` to see whether Bob or ZenMux answers. The terminal running `pnpm dev` prints `[llm]` lines whenever a provider fails.
