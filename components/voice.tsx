"use client";

import { useEffect, useRef, useState } from "react";
import { errorKey, transcribe } from "@/lib/client/api";
import { stopSpeaking, unlockAudio } from "@/lib/client/audio";
import { useRecorder } from "@/lib/client/recorder";
import { useApp } from "./app-state";
import { Icon } from "./ui";

const COLUMNS = 22;
const ROWS = 5;

/** Live voice level drawn in yellow cells, read straight from the microphone's analyser. */
function Meter({ read }: { read: () => Uint8Array | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const cells = ref.current?.children;
    const draw = () => {
      const levels = read();
      if (levels && cells) {
        for (let column = 0; column < COLUMNS; column++) {
          const value = levels[Math.floor((column / COLUMNS) * levels.length * 0.7)] / 255;
          const height = Math.ceil(value * ROWS);
          for (let row = 0; row < ROWS; row++) {
            (cells[row * COLUMNS + column] as HTMLElement).dataset.on = ROWS - row <= height ? "1" : "0";
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [read]);
  return (
    <div className="meter" ref={ref} aria-hidden="true">
      {Array.from({ length: COLUMNS * ROWS }, (_, index) => <span key={index} />)}
    </div>
  );
}

/** Tap to talk, tap to finish. Speech is turned into text and handed to onText. */
export function VoiceInput({ onText, size = "large", label, autoStart = false }: { onText: (text: string) => void; size?: "large" | "small"; label?: string; autoStart?: boolean }) {
  const { t, effectiveLang } = useApp();
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const recorder = useRecorder(async (audio) => {
    setWorking(true);
    try {
      const text = await transcribe(audio, effectiveLang);
      if (text) onText(text);
      else setProblem(t("noSpeech"));
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setWorking(false);
    }
  });
  const { start } = recorder;
  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);
  const recorderProblem = recorder.error === "denied" ? t("micDenied") : recorder.error === "unsupported" ? t("micMissing") : null;

  return (
    <div className={`voice voice-${size}`}>
      {recorder.recording && (
        <div className="voice-live">
          <Meter read={recorder.readLevels} />
          <p>{t("listening")} {recorder.secondsLeft <= 10 ? `${recorder.secondsLeft} ${t("secondsLeft")}` : ""}</p>
        </div>
      )}
      <button
        type="button"
        className="mic"
        data-recording={recorder.recording || undefined}
        disabled={working}
        aria-label={recorder.recording ? t("stop") : label ?? t("tapToTalk")}
        onClick={() => {
          setProblem(null);
          unlockAudio();
          stopSpeaking();
          if (recorder.recording) recorder.stop();
          else recorder.start();
        }}
      >
        {working ? <span className="spinner" /> : <Icon name={recorder.recording ? "stop" : "mic"} size={size === "large" ? 38 : 24} />}
      </button>
      {!recorder.recording && <span className="mic-label">{working ? t("understanding") : label ?? t("tapToTalk")}</span>}
      {(problem || recorderProblem) && <p className="voice-problem" role="alert">{problem ?? recorderProblem}</p>}
    </div>
  );
}
