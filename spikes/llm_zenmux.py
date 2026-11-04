"""Run the llm_eval tasks against ZenMux models, using live prices from its model list.

Reasoning tokens are reported separately because they are billed as output but never shown to the
user. Output is capped so one run cannot use a meaningful share of the $5 budget.

Usage: python3 spikes/llm_zenmux.py [model ...]
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from common import RAW, load_env, request
from llm_eval import TASKS, check

BASE = "https://zenmux.ai/api/v1"
MAX_OUTPUT = 1000
MODELS = [
    "openai/gpt-6.1-terra",
    "openai/gpt-6.1-sol",
    "openai/gpt-6-luna",
    "anthropic/claude-haiku-5.5",
    "deepseek/deepseek-v4.1-flash",
    "qwen/qwen3.8-flash",
    "z-ai/glm-5.3-flash",
    "xiaomi/mimo-v2.6-flash",
    "google/gemma-4-31b-it",
]


def base_prices(model):
    """Lowest listed (input, output) price per million tokens: short-prompt rates, discount applied."""
    pricing = model.get("pricings") or {}
    return tuple(min(p["value"] for p in pricing[key]) for key in ("prompt", "completion"))


def run_model(env, model, prices):
    rows = []
    for task, system, user in TASKS:
        start = time.perf_counter()
        status, payload = request(
            f"{BASE}/chat/completions",
            headers={"Authorization": f"Bearer {env['ZENMUX_API_KEY']}"},
            body={
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0.3,
                "max_tokens": MAX_OUTPUT,
            },
            timeout=120,
        )
        ms = (time.perf_counter() - start) * 1000
        if status != 200 or not isinstance(payload, dict) or not payload.get("choices"):
            rows.append({"task": task, "error": f"{status}: {str(payload)[:300]}", "ms": ms})
            continue
        text = (payload["choices"][0]["message"].get("content") or "").strip()
        usage = payload.get("usage") or {}
        details = usage.get("completion_tokens_details") or {}
        tokens_in, tokens_out = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
        rows.append(
            {
                "task": task,
                "ms": ms,
                "in": tokens_in,
                "out": tokens_out,
                "reasoning": details.get("reasoning_tokens", 0),
                "cost": (tokens_in * prices[0] + tokens_out * prices[1]) / 1e6,
                "check": check(task, text),
                "text": text,
            }
        )
    return model, rows


def main():
    env = load_env()
    status, listing = request(f"{BASE}/models", headers={"Authorization": f"Bearer {env['ZENMUX_API_KEY']}"})
    if status != 200:
        raise SystemExit(f"model list HTTP {status}")
    catalog = {m["id"]: m for m in listing["data"]}
    models = sys.argv[1:] or MODELS
    prices = {m: base_prices(catalog[m]) for m in models}

    with ThreadPoolExecutor(max_workers=len(models)) as pool:
        outcomes = list(pool.map(lambda m: run_model(env, m, prices[m]), models))

    out_path = RAW / "llm_zenmux.json"
    saved = json.loads(out_path.read_text()) if out_path.exists() else {}
    print(f"{'model':32} {'$/M in':>7} {'$/M out':>8} {'pass':>5} {'avg ms':>7} {'in':>6} {'out':>6} {'reason':>7} {'run $':>9}")
    for model, rows in outcomes:
        saved[model] = rows
        good = [r for r in rows if "error" not in r]
        passed = sum(r["check"] == "ok" for r in good)
        avg_ms = sum(r["ms"] for r in good) / max(1, len(good))
        print(
            f"{model:32} {prices[model][0]:>7.3f} {prices[model][1]:>8.3f} {f'{passed}/{len(TASKS)}':>5} {avg_ms:>7.0f} "
            f"{sum(r['in'] for r in good):>6} {sum(r['out'] for r in good):>6} {sum(r['reasoning'] for r in good):>7} "
            f"{sum(r['cost'] for r in good):>9.5f}"
        )
        for r in rows:
            if "error" in r:
                print(f"    {r['task']}: ERROR {r['error'][:160]}")
            elif r["check"] != "ok":
                print(f"    {r['task']}: {r['check']}")
    out_path.write_text(json.dumps(saved, ensure_ascii=False, indent=1))
    print("\ntotal estimated spend this run: $%.4f" % sum(r.get("cost", 0) for _, rows in outcomes for r in rows))

    print("\n--- Outputs to read by hand ---")
    for model, rows in outcomes:
        print(f"\n## {model}")
        for r in rows:
            if r.get("text") and r["task"] in ("counsel_hi", "counsel_kn", "resume_kn"):
                print(f"[{r['task']}] {r['text']}")


if __name__ == "__main__":
    main()
