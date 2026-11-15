"""Round-trip Kannada and Hindi through Sarvam: text -> speech -> text, timing each step.

The audio is synthesised, so this measures the API and its latency, not accuracy on real speakers
with background noise.
"""
import base64
import json
import time
import urllib.error
import urllib.request
import uuid

from common import RAW, load_env, request

SAMPLES = {
    "kn-IN": "ನಾನು ಎರಡು ವರ್ಷ ನಮ್ಮ ಮಾವನ ಅಂಗಡಿಯಲ್ಲಿ ಮೊಬೈಲ್ ರಿಪೇರಿ ಕೆಲಸ ಮಾಡಿದ್ದೇನೆ. ಸ್ಕ್ರೀನ್ ಮತ್ತು ಬ್ಯಾಟರಿ ಬದಲಾಯಿಸಲು ಬರುತ್ತೆ.",
    "hi-IN": "मैंने दो साल अपने मामा की दुकान में मोबाइल रिपेयर का काम किया है। स्क्रीन और बैटरी बदलना आता है।",
}


def tts(env, text, language):
    start = time.perf_counter()
    status, payload = request(
        "https://api.sarvam.ai/text-to-speech",
        headers={"api-subscription-key": env["SARVAM_API_KEY"]},
        body={"text": text, "language_code": language, "model": "bulbul:v3", "speaker": "kavya", "output_audio_codec": "wav"},
    )
    if status != 200:
        raise SystemExit(f"TTS HTTP {status}: {str(payload)[:300]}")
    return base64.b64decode(payload["audios"][0]), (time.perf_counter() - start) * 1000


def stt(env, audio, language, model="saaras:v3", mode=None):
    boundary = uuid.uuid4().hex
    fields = {"model": model, "language_code": language}
    if mode:
        fields["mode"] = mode
    body = b""
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
    body += audio + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        "https://api.sarvam.ai/speech-to-text",
        data=body,
        headers={
            "api-subscription-key": env["SARVAM_API_KEY"],
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "bobathon-spike/0.1",
        },
    )
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            payload = json.loads(res.read())
    except urllib.error.HTTPError as err:
        return f"HTTP {err.code}: {err.read()[:200]!r}", None, 0
    return payload.get("transcript"), payload.get("language_code"), (time.perf_counter() - start) * 1000


def main():
    env = load_env()
    for language, text in SAMPLES.items():
        audio, tts_ms = tts(env, text, language)
        path = RAW / f"sarvam_{language}.wav"
        path.write_bytes(audio)
        print(f"\n[{language}] TTS {tts_ms:.0f}ms, {len(audio) / 1024:.0f}KB -> {path.name}")
        print("  source :", text)
        for label, kwargs in (
            ("v4 fixed", {"language": language, "model": "saaras:v4"}),
            ("v4 auto ", {"language": "unknown", "model": "saaras:v4"}),
            ("v3 codemix", {"language": language, "model": "saaras:v3", "mode": "codemix"}),
        ):
            transcript, detected, ms = stt(env, audio, **kwargs)
            print(f"  {label}: {ms:.0f}ms detected={detected} | {transcript}")


if __name__ == "__main__":
    main()
