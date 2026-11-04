"""Compare cheap chat models on the three jobs the product needs, in Hindi and Kannada.

Measures latency, real token usage (including reasoning tokens, which are billed as output) and
cost. Writes full outputs to data/raw/llm_eval.json for reading by hand: a passing automatic check
does not mean the language sounds natural.

Usage: python3 spikes/llm_eval.py [model ...]
"""
import json
import re
import sys
import time

from common import RAW, load_env, request
from jev_eval import PROFILES

URL = "https://api.sarvam.ai/v1/chat/completions"

# Rupees per million tokens (input, output), from docs.sarvam.ai/api/pricing, excluding GST.
PRICES = {
    "sarvam-105b": (15, 60),
    "sarvam-105b-conversations": (15, 60),
    "glm5.3-flash": (13.5, 45),
    "mimo-v2.6-flash": (12.5, 25),
    "deepseekv4.1-flash-1017": (25, 105),
    "gemma4": (35, 90),
}

COUNSELLOR = (
    "You are a warm job counsellor for job seekers in Bangalore who may have little formal education. "
    "Reply only in the language the user writes in, using simple everyday spoken words. Your reply is read aloud, "
    "so use at most two short sentences with no lists or symbols. Acknowledge what they said, then ask one question "
    "that helps you understand their work experience."
)
EXTRACT = (
    "Extract the person's details into JSON. Output JSON only, with these keys: skills (array of English strings), "
    "experience (array of objects with role, place, years), education (string), has_iti (boolean), "
    "has_driving_licence (boolean). Never invent anything they did not say."
)
RESUME = (
    "Write exactly 3 resume bullet points in professional English from this person's own words, starting each with "
    "a strong verb. Do not invent numbers, customers, tools, employers or skills they did not mention. "
    "Output only the bullets."
)

TASKS = [
    ("counsel_hi", COUNSELLOR, "मैंने दो साल मोबाइल रिपेयर का काम किया है, पर अब कोई नौकरी नहीं मिल रही।"),
    ("counsel_kn", COUNSELLOR, "ನಾನು ಎರಡು ವರ್ಷ ಮೊಬೈಲ್ ರಿಪೇರಿ ಕೆಲಸ ಮಾಡಿದ್ದೇನೆ, ಆದರೆ ಈಗ ಕೆಲಸ ಸಿಗುತ್ತಿಲ್ಲ."),
    ("extract_hi", EXTRACT, PROFILES["hi"]),
    ("extract_kn", EXTRACT, PROFILES["kn"]),
    ("resume_hi", RESUME, PROFILES["hi"]),
    ("resume_kn", RESUME, PROFILES["kn"]),
]


def check(task, text):
    """Automatic checks for the things that must not go wrong. Language quality is judged by hand."""
    if not text:
        return "EMPTY"
    if task.startswith("counsel"):
        script = {"hi": r"[ऀ-ॿ]", "kn": r"[ಀ-೿]"}[task[-2:]]
        share = len(re.findall(script, text)) / max(1, len(re.findall(r"\w", text)))
        problems = []
        if share < 0.6:
            problems.append(f"wrong script ({share:.0%})")
        if text.count("?") != 1:
            problems.append(f"{text.count('?')} questions")
        return ", ".join(problems) or "ok"
    if task.startswith("extract"):
        try:
            data = json.loads(re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M))
        except ValueError:
            return "BAD JSON"
        problems = []
        if data.get("has_iti") is not False:
            problems.append("wrong has_iti")
        if data.get("has_driving_licence") is not False:
            problems.append("wrong licence")
        experience = data.get("experience") or [{}]
        if "2" not in str(experience[0].get("years")) and "two" not in str(experience[0].get("years")).lower():
            problems.append("wrong years")
        return ", ".join(problems) or "ok"
    invented = [n for n in re.findall(r"\d+", text) if n not in ("2", "10", "3")]
    bullets = len([line for line in text.splitlines() if line.strip()])
    problems = []
    if invented:
        problems.append(f"invented numbers {invented}")
    if bullets != 3:
        problems.append(f"{bullets} lines")
    if re.search(r"[ऀ-ॿಀ-೿]", text):
        problems.append("not English")
    return ", ".join(problems) or "ok"


def main():
    env = load_env()
    models = sys.argv[1:] or list(PRICES)
    out_path = RAW / "llm_eval.json"
    results = json.loads(out_path.read_text()) if out_path.exists() else {}
    for model in models:
        rows = []
        print(f"\n## {model}")
        for task, system, user in TASKS:
            start = time.perf_counter()
            status, payload = request(
                URL,
                headers={"api-subscription-key": env["SARVAM_API_KEY"]},
                body={
                    "model": model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "temperature": 0.3,
                    "max_tokens": 1500,
                },
                timeout=120,
            )
            ms = (time.perf_counter() - start) * 1000
            if status != 200 or not isinstance(payload, dict):
                print(f"  {task}: HTTP {status}: {str(payload)[:200]}")
                rows.append({"task": task, "error": f"{status}: {str(payload)[:300]}"})
                continue
            message = payload["choices"][0]["message"]
            text = (message.get("content") or "").strip()
            usage = payload.get("usage") or {}
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            input_price, output_price = PRICES[model]
            cost = (prompt_tokens * input_price + completion_tokens * output_price) / 1e6
            verdict = check(task, text)
            print(f"  {task}: {ms:6.0f}ms in={prompt_tokens} out={completion_tokens} Rs{cost:.4f} [{verdict}]")
            print(f"    {text[:400]!r}")
            rows.append({"task": task, "ms": ms, "in": prompt_tokens, "out": completion_tokens, "cost_inr": cost, "check": verdict, "text": text})
        results[model] = rows
        out_path.write_text(json.dumps(results, ensure_ascii=False, indent=1))
        done = [r for r in rows if "error" not in r]
        if done:
            print(f"  TOTAL Rs{sum(r['cost_inr'] for r in done):.4f}, avg {sum(r['ms'] for r in done) / len(done):.0f}ms, passed {sum(r['check'] == 'ok' for r in done)}/{len(TASKS)}")


if __name__ == "__main__":
    main()
