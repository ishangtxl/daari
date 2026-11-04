"""Shared helpers for the API spikes: env loading and a JSON HTTP call using only the stdlib."""
import json
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"


def load_env():
    env = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"')
    return env


def request(url, *, headers=None, body=None, timeout=60):
    """Return (status, parsed JSON or text). Never raises on HTTP errors, never logs the URL."""
    data = json.dumps(body).encode() if body is not None else None
    # Some APIs sit behind a WAF that rejects Python's default user agent.
    hdrs = {"Accept": "application/json", "User-Agent": "bobathon-spike/0.1", **(headers or {})}
    if data:
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            status, raw = res.status, res.read()
    except urllib.error.HTTPError as err:
        status, raw = err.code, err.read()
    except TimeoutError:
        return 0, "timed out"
    try:
        return status, json.loads(raw)
    except ValueError:
        return status, raw.decode("utf-8", "replace")[:500]
