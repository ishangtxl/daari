"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { errorKey, transcribe } from "@/lib/client/api";
import { stopSpeaking, unlockAudio } from "@/lib/client/audio";
import { useRecorder } from "@/lib/client/recorder";
import { useApp } from "./app-state";
import { Icon } from "./ui";
import { Meter } from "./voice";

export type ComposerHandle = { focus: () => void };

/**
 * Typing and talking in one place, like a messaging app: the round button is the mic until there is
 * text to send. Speaking someone's answer sends it straight away, as tapping send would.
 */
export const Composer = forwardRef<ComposerHandle, {
  onSend: (text: string, spoken: boolean) => void;
  busy: boolean;
  autoListen?: boolean;
  hint?: boolean;
}>(function Composer({ onSend, busy, autoListen = false, hint = false }, ref) {
  const { t, effectiveLang } = useApp();
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const recorder = useRecorder(async (audio) => {
    setWorking(true);
    try {
      const text = await transcribe(audio, effectiveLang);
      if (text) onSend(text, true);
      else setProblem(t("noSpeech"));
    } catch (error) {
      setProblem(t(errorKey(error)));
    } finally {
      setWorking(false);
    }
  });
  const { start } = recorder;
  useEffect(() => {
    if (autoListen) start();
  }, [autoListen, start]);

  const recorderProblem = recorder.error === "denied" ? t("micDenied") : recorder.error === "unsupported" ? t("micMissing") : null;
  const text = draft.trim();
  const canSend = Boolean(text) && !busy && !working;

  const submit = () => {
    if (!canSend) return;
    setDraft("");
    onSend(text, false);
  };

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        data-recording={recorder.recording || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {recorder.recording ? (
          <div className="composer-live" role="status">
            <Meter read={recorder.readLevels} />
            <span>{t("listening")}{recorder.secondsLeft <= 10 ? ` · ${recorder.secondsLeft} ${t("secondsLeft")}` : ""}</span>
          </div>
        ) : working ? (
          <div className="composer-live" role="status">
            <span className="spinner" />
            <span>{t("understanding")}</span>
          </div>
        ) : (
          <textarea
            ref={inputRef}
            className="composer-input"
            rows={1}
            aria-label={t("typeHere")}
            placeholder={t("typeHere")}
            value={draft}
            enterKeyHint="send"
            onChange={(event) => {
              setDraft(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              // Enter sends, as in messaging apps. Shift+Enter, or a composing keyboard, adds a line.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
        )}
        {text && !recorder.recording ? (
          <button type="submit" className="composer-button composer-send" disabled={!canSend} aria-label={t("send")}>
            <Icon name="send" size={24} />
          </button>
        ) : (
          <button
            type="button"
            className="composer-button composer-mic"
            data-recording={recorder.recording || undefined}
            disabled={working || (busy && !recorder.recording)}
            aria-label={recorder.recording ? t("stop") : t("tapToTalk")}
            onClick={() => {
              setProblem(null);
              unlockAudio();
              stopSpeaking();
              if (recorder.recording) recorder.stop();
              else recorder.start();
            }}
          >
            <Icon name={recorder.recording ? "stop" : "mic"} size={26} />
          </button>
        )}
      </form>
      {(problem || recorderProblem) ? (
        <p className="composer-note composer-problem" role="alert">{problem ?? recorderProblem}</p>
      ) : hint ? (
        <p className="composer-note">{t("composerHint")}</p>
      ) : null}
    </div>
  );
});
