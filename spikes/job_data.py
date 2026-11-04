"""Measure how many usable Bangalore listings JSearch and Adzuna return for our target roles.

Quotas are tight (Adzuna 25 calls, JSearch 200/month), so every response is cached in data/raw
and a cached query never spends another call.

Usage: python3 spikes/job_data.py [query ...]   (no args = all target roles)
"""
import json
import sys
import urllib.parse

from common import RAW, load_env, request

# Search query -> words a relevant job title should contain. Adzuna's full-text `what` search is
# useless here ("electrician" returned 1,500 mostly senior engineering roles), so filter on title.
ROLES = {
    "electrician": ["electrician"],
    "ITI fitter": ["fitter"],
    "mobile repair technician": ["mobile"],
    "welder": ["welder"],
    "CNC operator": ["cnc"],
    "AC technician": ["ac ", "hvac", "air condition"],
    "diploma mechanical engineer": ["diploma", "mechanical"],
    "accounts assistant": ["account"],
}


def cached(name, fetch):
    path = RAW / f"{name}.json"
    if path.exists():
        return json.loads(path.read_text()), True
    status, payload = fetch()
    if status != 200:
        print(f"  {name}: HTTP {status}: {str(payload)[:200]}")
        return None, False
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1))
    return payload, False


def jsearch(env, role):
    params = urllib.parse.urlencode(
        {"query": f"{role} in Bangalore", "country": "in", "page": 1, "num_pages": 1, "date_posted": "month"}
    )
    headers = {"x-rapidapi-key": env["X_RAPIDAPI_KEY"], "x-rapidapi-host": env["X_RAPIDAPI_HOST"]}
    return request(f"https://{env['X_RAPIDAPI_HOST']}/search-v2?{params}", headers=headers)


def adzuna(env, role):
    params = urllib.parse.urlencode(
        {
            "app_id": env["ADZUNA_APP_ID"],
            "app_key": env["ADZUNA_APP_KEY"],
            "title_only": ROLES[role][0].strip(),
            "where": "Bangalore",
            "results_per_page": 50,
            "max_days_old": 30,
            "content-type": "application/json",
        }
    )
    return request(f"https://api.adzuna.com/v1/api/jobs/in/search/1?{params}")


def relevant(titles, words):
    return [t for t in titles if any(w in f"{t} ".lower() for w in words)]


def main():
    env = load_env()
    RAW.mkdir(parents=True, exist_ok=True)
    roles = sys.argv[1:] or list(ROLES)
    print(f"{'role':30} {'jsearch rel/all':>16} {'adzuna rel/all':>15} {'adzuna total':>13}")
    for role in roles:
        slug = role.lower().replace(" ", "_")
        js, _ = cached(f"jsearch_{slug}", lambda: jsearch(env, role))
        az, _ = cached(f"adzuna_title_{slug}", lambda: adzuna(env, role))
        js_jobs = js["data"]["jobs"] if js else []
        az_jobs = az["results"] if az else []
        js_titles = [j.get("job_title", "") for j in js_jobs]
        az_titles = [j.get("title", "") for j in az_jobs]
        js_rel = relevant(js_titles, ROLES[role])
        az_rel = relevant(az_titles, ROLES[role])
        az_total = az.get("count", "-") if az else "-"
        print(f"{role:30} {f'{len(js_rel)}/{len(js_titles)}':>16} {f'{len(az_rel)}/{len(az_titles)}':>15} {az_total:>13}")


if __name__ == "__main__":
    main()
