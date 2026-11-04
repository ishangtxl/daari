"""Does Jev hold up in English, Hindi and Kannada for our two jobs: scam flags and gap checks?

The labelled listings below are hand-written test cases, including deliberately hard legitimate
ones. They show whether the approach works but are not a measure of real-world scam accuracy.
"""
import glob
import json
import statistics
import time

from common import RAW, load_env, request

URL = "https://api.typesafe.ai/v1/systemone"

SCAM_QUESTIONS = {
    "scam": {
        "type": "noul",
        "instructions": "This job listing is likely a scam or fraud targeting job seekers.",
    },
    "asks_payment": {
        "type": "noul",
        "instructions": "The listing requires the applicant to pay money, such as a fee or deposit, to get the job.",
    },
    "asks_sensitive": {
        "type": "noul",
        "instructions": "The listing asks for an OTP, bank details or identity documents before any interview.",
    },
    "unrealistic": {
        "type": "noul",
        "instructions": "The pay or promises are unrealistic for the work and qualifications described.",
    },
}

# (is_scam, {language: listing})
LISTINGS = [
    (True, {
        "en": "Data entry work from home. Earn Rs 45,000 a month, no experience needed. Pay Rs 1,500 registration fee to confirm your seat. Contact on WhatsApp only.",
        "hi": "घर बैठे डेटा एंट्री का काम। बिना अनुभव के हर महीने 45,000 रुपये कमाएं। अपनी सीट पक्की करने के लिए 1,500 रुपये रजिस्ट्रेशन फीस दें। केवल व्हाट्सएप पर संपर्क करें।",
        "kn": "ಮನೆಯಿಂದಲೇ ಡೇಟಾ ಎಂಟ್ರಿ ಕೆಲಸ. ಅನುಭವ ಇಲ್ಲದೆ ತಿಂಗಳಿಗೆ 45,000 ರೂಪಾಯಿ ಗಳಿಸಿ. ನಿಮ್ಮ ಸೀಟು ಖಚಿತಪಡಿಸಲು 1,500 ರೂಪಾಯಿ ನೋಂದಣಿ ಶುಲ್ಕ ಪಾವತಿಸಿ. ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಮಾತ್ರ ಸಂಪರ್ಕಿಸಿ.",
    }),
    (True, {
        "en": "Urgent hiring for airport ground staff. 10th pass can apply. Salary Rs 38,000 plus free food. Pay Rs 2,500 for uniform and ID card before the interview.",
        "hi": "एयरपोर्ट ग्राउंड स्टाफ की तुरंत भर्ती। 10वीं पास आवेदन करें। वेतन 38,000 रुपये और मुफ्त खाना। इंटरव्यू से पहले वर्दी और आईडी कार्ड के लिए 2,500 रुपये जमा करें।",
        "kn": "ವಿಮಾನ ನಿಲ್ದಾಣದ ಗ್ರೌಂಡ್ ಸ್ಟಾಫ್ ತುರ್ತು ನೇಮಕಾತಿ. ಹತ್ತನೇ ತರಗತಿ ಪಾಸಾದವರು ಅರ್ಜಿ ಹಾಕಬಹುದು. ಸಂಬಳ 38,000 ರೂಪಾಯಿ ಮತ್ತು ಉಚಿತ ಊಟ. ಸಂದರ್ಶನಕ್ಕೆ ಮೊದಲು ಸಮವಸ್ತ್ರ ಮತ್ತು ಐಡಿ ಕಾರ್ಡ್‌ಗಾಗಿ 2,500 ರೂಪಾಯಿ ಪಾವತಿಸಿ.",
    }),
    (True, {
        "en": "Earn Rs 5,000 daily by liking YouTube videos. Join our Telegram group. Complete prepaid tasks to unlock bigger payouts.",
        "hi": "यूट्यूब वीडियो लाइक करके रोज 5,000 रुपये कमाएं। हमारे टेलीग्राम ग्रुप से जुड़ें। बड़ी कमाई के लिए प्रीपेड टास्क पूरे करें।",
        "kn": "ಯೂಟ್ಯೂಬ್ ವಿಡಿಯೋಗಳನ್ನು ಲೈಕ್ ಮಾಡಿ ದಿನಕ್ಕೆ 5,000 ರೂಪಾಯಿ ಗಳಿಸಿ. ನಮ್ಮ ಟೆಲಿಗ್ರಾಂ ಗುಂಪಿಗೆ ಸೇರಿ. ಹೆಚ್ಚಿನ ಹಣ ಪಡೆಯಲು ಪ್ರಿಪೇಯ್ಡ್ ಟಾಸ್ಕ್‌ಗಳನ್ನು ಪೂರ್ಣಗೊಳಿಸಿ.",
    }),
    (True, {
        "en": "Message from Amazon HR: you are selected without an interview. Send your Aadhaar, PAN and the bank OTP on WhatsApp to begin onboarding.",
        "hi": "अमेज़न एचआर का संदेश: आप बिना इंटरव्यू के चुने गए हैं। ऑनबोर्डिंग शुरू करने के लिए अपना आधार, पैन और बैंक ओटीपी व्हाट्सएप पर भेजें।",
        "kn": "ಅಮೆಜಾನ್ ಎಚ್‌ಆರ್ ಸಂದೇಶ: ಸಂದರ್ಶನವಿಲ್ಲದೆ ನೀವು ಆಯ್ಕೆಯಾಗಿದ್ದೀರಿ. ಕೆಲಸ ಆರಂಭಿಸಲು ನಿಮ್ಮ ಆಧಾರ್, ಪ್ಯಾನ್ ಮತ್ತು ಬ್ಯಾಂಕ್ ಒಟಿಪಿಯನ್ನು ವಾಟ್ಸಾಪ್‌ನಲ್ಲಿ ಕಳುಹಿಸಿ.",
    }),
    (True, {
        "en": "Electrician job in Gulf. Salary Rs 1,50,000. Visa guaranteed. Pay Rs 60,000 processing charge to the agent's personal account today.",
        "hi": "खाड़ी देश में इलेक्ट्रीशियन की नौकरी। वेतन 1,50,000 रुपये। वीजा की गारंटी। आज ही एजेंट के निजी खाते में 60,000 रुपये प्रोसेसिंग शुल्क जमा करें।",
        "kn": "ಗಲ್ಫ್‌ನಲ್ಲಿ ಎಲೆಕ್ಟ್ರಿಷಿಯನ್ ಕೆಲಸ. ಸಂಬಳ 1,50,000 ರೂಪಾಯಿ. ವೀಸಾ ಖಚಿತ. ಇಂದೇ ಏಜೆಂಟ್‌ನ ವೈಯಕ್ತಿಕ ಖಾತೆಗೆ 60,000 ರೂಪಾಯಿ ಪ್ರೊಸೆಸಿಂಗ್ ಶುಲ್ಕ ಪಾವತಿಸಿ.",
    }),
    (False, {
        "en": "Electrician needed for apartment maintenance in Whitefield. ITI Electrical and 1 year experience required. Salary Rs 18,000 to 22,000 with PF and ESI. Walk in with your resume.",
        "hi": "व्हाइटफील्ड में अपार्टमेंट मेंटेनेंस के लिए इलेक्ट्रीशियन चाहिए। आईटीआई इलेक्ट्रिकल और 1 साल का अनुभव जरूरी। वेतन 18,000 से 22,000 रुपये, पीएफ और ईएसआई के साथ। अपना रिज्यूमे लेकर आएं।",
        "kn": "ವೈಟ್‌ಫೀಲ್ಡ್‌ನಲ್ಲಿ ಅಪಾರ್ಟ್‌ಮೆಂಟ್ ನಿರ್ವಹಣೆಗೆ ಎಲೆಕ್ಟ್ರಿಷಿಯನ್ ಬೇಕಾಗಿದ್ದಾರೆ. ಐಟಿಐ ಎಲೆಕ್ಟ್ರಿಕಲ್ ಮತ್ತು 1 ವರ್ಷದ ಅನುಭವ ಅಗತ್ಯ. ಸಂಬಳ 18,000 ರಿಂದ 22,000 ರೂಪಾಯಿ, ಪಿಎಫ್ ಮತ್ತು ಇಎಸ್‌ಐ ಸಹಿತ. ನಿಮ್ಮ ರೆಸ್ಯೂಮೆಯೊಂದಿಗೆ ಬನ್ನಿ.",
    }),
    (False, {
        "en": "Mobile repair technician for a shop in Jayanagar. Should know screen and battery replacement. Salary Rs 15,000 to 20,000. Speak to the shop owner.",
        "hi": "जयनगर की दुकान के लिए मोबाइल रिपेयर टेक्नीशियन चाहिए। स्क्रीन और बैटरी बदलना आना चाहिए। वेतन 15,000 से 20,000 रुपये। दुकान मालिक से बात करें।",
        "kn": "ಜಯನಗರದ ಅಂಗಡಿಗೆ ಮೊಬೈಲ್ ರಿಪೇರಿ ತಂತ್ರಜ್ಞ ಬೇಕಾಗಿದ್ದಾರೆ. ಸ್ಕ್ರೀನ್ ಮತ್ತು ಬ್ಯಾಟರಿ ಬದಲಾಯಿಸಲು ತಿಳಿದಿರಬೇಕು. ಸಂಬಳ 15,000 ರಿಂದ 20,000 ರೂಪಾಯಿ. ಅಂಗಡಿ ಮಾಲೀಕರೊಂದಿಗೆ ಮಾತನಾಡಿ.",
    }),
    # Hard case: mentions a fee, but only to say there isn't one.
    (False, {
        "en": "CNC operator at a Peenya factory. Diploma or ITI. Salary Rs 20,000 to 28,000 plus shift allowance. No recruitment fee is charged at any stage.",
        "hi": "पीन्या की फैक्ट्री में सीएनसी ऑपरेटर। डिप्लोमा या आईटीआई। वेतन 20,000 से 28,000 रुपये और शिफ्ट भत्ता। भर्ती के किसी भी चरण में कोई शुल्क नहीं लिया जाता।",
        "kn": "ಪೀಣ್ಯದ ಕಾರ್ಖಾನೆಯಲ್ಲಿ ಸಿಎನ್‌ಸಿ ಆಪರೇಟರ್. ಡಿಪ್ಲೊಮಾ ಅಥವಾ ಐಟಿಐ. ಸಂಬಳ 20,000 ರಿಂದ 28,000 ರೂಪಾಯಿ ಮತ್ತು ಶಿಫ್ಟ್ ಭತ್ಯೆ. ನೇಮಕಾತಿಯ ಯಾವುದೇ ಹಂತದಲ್ಲಿ ಶುಲ್ಕ ಪಡೆಯುವುದಿಲ್ಲ.",
    }),
    (False, {
        "en": "Accounts assistant. B.Com freshers with Tally knowledge. Salary Rs 16,000. Office in Rajajinagar. Apply through the company careers page.",
        "hi": "अकाउंट्स असिस्टेंट। टैली की जानकारी वाले बी.कॉम फ्रेशर। वेतन 16,000 रुपये। कार्यालय राजाजीनगर में। कंपनी के करियर पेज से आवेदन करें।",
        "kn": "ಅಕೌಂಟ್ಸ್ ಸಹಾಯಕ. ಟ್ಯಾಲಿ ತಿಳಿದಿರುವ ಬಿ.ಕಾಂ ಹೊಸಬರು. ಸಂಬಳ 16,000 ರೂಪಾಯಿ. ಕಚೇರಿ ರಾಜಾಜಿನಗರದಲ್ಲಿ. ಕಂಪನಿಯ ವೃತ್ತಿ ಪುಟದ ಮೂಲಕ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ.",
    }),
    # Hard case: mentions documents, but at a normal stage of hiring.
    (False, {
        "en": "Apprentice trainee under the NAPS scheme. ITI pass. Stipend Rs 12,000. Documents will be verified at the company office on joining.",
        "hi": "नैप्स योजना के तहत अप्रेंटिस ट्रेनी। आईटीआई पास। स्टाइपेंड 12,000 रुपये। जॉइनिंग पर कंपनी कार्यालय में दस्तावेजों का सत्यापन होगा।",
        "kn": "ನ್ಯಾಪ್ಸ್ ಯೋಜನೆಯಡಿ ಅಪ್ರೆಂಟಿಸ್ ತರಬೇತಿ. ಐಟಿಐ ಪಾಸ್. ಸ್ಟೈಪೆಂಡ್ 12,000 ರೂಪಾಯಿ. ಸೇರುವಾಗ ಕಂಪನಿ ಕಚೇರಿಯಲ್ಲಿ ದಾಖಲೆಗಳನ್ನು ಪರಿಶೀಲಿಸಲಾಗುತ್ತದೆ.",
    }),
]

PROFILES = {
    "en": "I worked for two years repairing mobile phones at my uncle's shop. I can replace screens and batteries. I passed 10th standard and did not go to ITI. I do not have a driving licence.",
    "hi": "मैंने दो साल अपने मामा की दुकान में मोबाइल रिपेयर का काम किया है। स्क्रीन और बैटरी बदलना आता है। मैंने 10वीं पास की है और आईटीआई नहीं किया। मेरे पास ड्राइविंग लाइसेंस नहीं है।",
    "kn": "ನಾನು ಎರಡು ವರ್ಷ ನಮ್ಮ ಮಾವನ ಅಂಗಡಿಯಲ್ಲಿ ಮೊಬೈಲ್ ರಿಪೇರಿ ಕೆಲಸ ಮಾಡಿದ್ದೇನೆ. ಸ್ಕ್ರೀನ್ ಮತ್ತು ಬ್ಯಾಟರಿ ಬದಲಾಯಿಸಲು ಬರುತ್ತೆ. ಹತ್ತನೇ ತರಗತಿ ಪಾಸ್ ಆಗಿದ್ದೇನೆ, ಐಟಿಐ ಮಾಡಿಲ್ಲ. ನನ್ನ ಬಳಿ ಡ್ರೈವಿಂಗ್ ಲೈಸೆನ್ಸ್ ಇಲ್ಲ.",
}

# (requirement from a job ad, does this person meet it?)
REQUIREMENTS = [
    ("At least 1 year of mobile phone repair experience", True),
    ("Can replace phone screens", True),
    ("Has passed 10th standard", True),
    ("Has an ITI qualification", False),
    ("Has a valid driving licence", False),
    ("Can do chip-level motherboard repair", False),  # never mentioned, so not evidenced
]


def decide(env, state, questions):
    start = time.perf_counter()
    status, payload = request(
        URL,
        headers={"Authorization": f"Bearer {env['JEV_API_KEY']}"},
        body={"model": "jev-latest", "state": state, "questions": questions},
    )
    if status != 200:
        raise SystemExit(f"Jev HTTP {status}: {str(payload)[:300]}")
    return payload, (time.perf_counter() - start) * 1000


def scam_eval(env, latencies, tokens):
    print("\n=== Scam flags (flag at scam >= 0.5) ===")
    results = {}
    for lang in ("en", "hi", "kn"):
        tp = fp = tn = fn = 0
        for is_scam, texts in LISTINGS:
            payload, ms = decide(env, texts[lang], SCAM_QUESTIONS)
            latencies.append(ms)
            tokens.append(payload["usage"]["input_tokens"])
            answers = payload["answers"]
            score = answers["scam"]["noul"]
            flagged = score >= 0.5
            tp += flagged and is_scam
            fp += flagged and not is_scam
            tn += (not flagged) and (not is_scam)
            fn += (not flagged) and is_scam
            mark = "ok   " if flagged == is_scam else "WRONG"
            signals = " ".join(f"{k}={answers[k]['noul']:.2f}" for k in ("asks_payment", "asks_sensitive", "unrealistic"))
            print(f"{lang} {mark} truth={'scam ' if is_scam else 'legit'} scam={score:.2f} {signals} | {texts['en'][:48]}")
        results[lang] = (tp, fp, tn, fn)
    print("\nlang  caught_scams  false_alarms")
    for lang, (tp, fp, tn, fn) in results.items():
        print(f"{lang:5} {tp}/{tp + fn:<11} {fp}/{fp + tn}")


def gap_eval(env, latencies, tokens):
    print("\n=== Gap check: does this person meet the requirement? (English requirements) ===")
    questions = {
        f"r{i}": {
            "type": "noul",
            "instructions": f"The person clearly meets this job requirement: {req}",
            "criteria": {
                "true": "Their own words state or directly show that they meet it",
                "false": "They say they do not meet it, or they never mention it",
            },
        }
        for i, (req, _) in enumerate(REQUIREMENTS)
    }
    for lang, profile in PROFILES.items():
        payload, ms = decide(env, profile, questions)
        latencies.append(ms)
        tokens.append(payload["usage"]["input_tokens"])
        right = 0
        for i, (req, truth) in enumerate(REQUIREMENTS):
            score = payload["answers"][f"r{i}"]["noul"]
            ok = (score >= 0.5) == truth
            right += ok
            print(f"{lang} {'ok   ' if ok else 'WRONG'} truth={str(truth):5} p={score:.2f} | {req}")
        print(f"{lang}: {right}/{len(REQUIREMENTS)} correct, {ms:.0f}ms for {len(REQUIREMENTS)} questions")


def real_listings(env, latencies, tokens):
    print("\n=== Real JSearch listings ranked by scam score ===")
    seen, rows = set(), []
    for path in glob.glob(str(RAW / "jsearch_*.json")):
        for job in json.load(open(path))["data"]["jobs"]:
            job_id = job.get("job_id")
            if job_id in seen:
                continue
            seen.add(job_id)
            text = f"{job.get('job_title')} at {job.get('employer_name')}\n{(job.get('job_description') or '')[:3000]}"
            payload, ms = decide(env, text, SCAM_QUESTIONS)
            latencies.append(ms)
            tokens.append(payload["usage"]["input_tokens"])
            answers = {k: v["noul"] for k, v in payload["answers"].items()}
            rows.append((answers, job))
    rows.sort(key=lambda row: -row[0]["scam"])
    print(f"{len(rows)} unique listings; flagged >=0.5: {sum(a['scam'] >= 0.5 for a, _ in rows)}; middle band 0.3-0.7: {sum(0.3 <= a['scam'] <= 0.7 for a, _ in rows)}")
    for answers, job in rows[:10]:
        scores = " ".join(f"{k}={v:.2f}" for k, v in answers.items())
        print(f"{scores} | {job.get('job_title')} | {job.get('employer_name')} | {job.get('job_publisher')}")
        print(f"    {(job.get('job_description') or '')[:220]!r}")


def main():
    env = load_env()
    latencies, tokens = [], []
    probe, _ = decide(env, "hello", {"x": {"type": "noul", "instructions": "This is a greeting."}})
    print("model:", probe["model"])
    scam_eval(env, latencies, tokens)
    gap_eval(env, latencies, tokens)
    real_listings(env, latencies, tokens)
    quantiles = statistics.quantiles(latencies, n=20)
    cost = sum(tokens) / 1e6 * 0.042
    print(f"\ncalls={len(latencies)} p50={quantiles[9]:.0f}ms p95={quantiles[18]:.0f}ms tokens={sum(tokens)} est_cost=${cost:.5f}")


if __name__ == "__main__":
    main()
