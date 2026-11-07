"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type ChatMessage } from "@/components/app-state";
import { mergeProfile } from "@/lib/profile";
import { ErrorNote, Icon, Loading, ReadAloud, Shell } from "@/components/ui";
import { VoiceInput } from "@/components/voice";
import { errorKey, postJson, postRaw } from "@/lib/client/api";
import { speak } from "@/lib/client/audio";
import type { Profile } from "@/lib/types";

const newId = () => Math.random().toString(36).slice(2);

export default function Talk() {
  const { ready, t, effectiveLang, messages, profile, update } = useApp();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastText, setLastText] = useState<{ text: string; spoken: boolean } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Arriving from the home screen's talk button should start listening right away.
  const [autoStart] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("listen"));
  const [fromResume] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "resume");

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streaming, busy]);

  const send = useCallback(
    async (text: string, spoken: boolean, retrying = false) => {
      setProblem(null);
      setLastText({ text, spoken });
      setBusy(true);
      setStreaming(null);
      const words = retrying ? profile.words : `${profile.words}\n${text}`.trim().slice(-12000);
      const withUser: ChatMessage[] = retrying ? messages : [...messages, { id: newId(), role: "user", content: text }];
      if (!retrying) update({ messages: withUser, profile: { ...profile, words } });
      try {
        const res = await postRaw("/api/chat", {
          lang: effectiveLang,
          profile: { ...profile, words },
          messages: withUser.map(({ role, content }) => ({ role, content })),
        });
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        let reply = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          reply += value;
          setStreaming(reply);
        }
        const id = newId();
        update({ messages: [...withUser, { id, role: "assistant", content: reply }] });
        setStreaming(null);
        if (spoken) speak(id, reply, effectiveLang);
        // Learn from the conversation in the background, so that replies are never delayed by it.
        postJson<{ profile: Partial<Profile> }>("/api/profile", { words })
          .then(({ profile: found }) => update((current) => ({ profile: mergeProfile(current.profile, found) })))
          .catch(() => {});
      } catch (error) {
        setProblem(t(errorKey(error)));
      } finally {
        setBusy(false);
      }
    },
    [effectiveLang, messages, profile, t, update],
  );

  if (!ready) return <Shell><span /></Shell>;

  const readyForJobs = profile.experience.length > 0 || profile.skills.length > 0;
  const greeting = fromResume ? t("greetingResume") : profile.area.trim() ? t("greeting") : t("greetingLocation");
  return (
    <Shell>
      <div className="talk">
        <div className="chat">
          <div className="bubble bubble-assistant">
            <p>{greeting}</p>
            <ReadAloud id="greeting" text={greeting} />
          </div>
          {messages.map((message) =>
            message.role === "assistant" ? (
              <div key={message.id} className="bubble bubble-assistant">
                <p>{message.content}</p>
                <ReadAloud id={message.id} text={message.content} />
              </div>
            ) : (
              <div key={message.id} className="bubble bubble-user"><p>{message.content}</p></div>
            ),
          )}
          {streaming !== null && <div className="bubble bubble-assistant"><p>{streaming}</p></div>}
          {busy && streaming === null && <Loading text={t("thinking")} stops={3} />}
          {problem && lastText && <ErrorNote text={problem} onRetry={() => send(lastText.text, lastText.spoken, true)} />}
          {fromResume && !busy && (
            <Link href="/me" className="ready-link">
              <Icon name="person" />
              <span>{t("resumeBack")}</span>
              <strong>{t("navMe")}</strong>
            </Link>
          )}
          {readyForJobs && !busy && (
            <Link href="/jobs" className="ready-link">
              <Icon name="briefcase" />
              <span>{t("readyForJobs")}</span>
              <strong>{t("seeJobs")}</strong>
            </Link>
          )}
          <div ref={endRef} />
        </div>
        <div className="dock">
          {typing ? (
            <form
              className="dock-form"
              onSubmit={(event) => {
                event.preventDefault();
                const text = draft.trim();
                if (!text || busy) return;
                setDraft("");
                send(text, false);
              }}
            >
              <input aria-label={t("typeHere")} placeholder={t("typeHere")} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
              <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()} aria-label={t("send")}>
                <Icon name="send" />
              </button>
            </form>
          ) : (
            <VoiceInput autoStart={autoStart} onText={(text) => send(text, true)} />
          )}
          <button type="button" className="dock-switch" onClick={() => setTyping((value) => !value)}>
            <Icon name={typing ? "mic" : "keyboard"} size={20} />
            {typing ? t("talkInstead") : t("typeInstead")}
          </button>
        </div>
      </div>
    </Shell>
  );
}
