"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp, type ChatMessage } from "@/components/app-state";
import { Composer, type ComposerHandle } from "@/components/composer";
import { RoadMap } from "@/components/road-map";
import { ErrorNote, Icon, Loading, ReadAloud, Shell } from "@/components/ui";
import { mergeProfile } from "@/lib/profile";
import { errorKey, postJson, postRaw } from "@/lib/client/api";
import { speak } from "@/lib/client/audio";
import { roadText, transcriptOf } from "@/lib/client/road";
import type { StringKey } from "@/lib/i18n";
import { GOALS, type Goal, type Profile, type Roadmap } from "@/lib/types";

const newId = () => Math.random().toString(36).slice(2);
// Close enough to the bottom that new messages should keep the view pinned there.
const PINNED_PX = 120;

const GOAL_CHOICES: { goal: Goal; icon: string; label: StringKey; say: StringKey }[] = [
  { goal: "job", icon: "briefcase", label: "goalJob", say: "goalSayJob" },
  { goal: "learn", icon: "book", label: "goalLearn", say: "goalSayLearn" },
  { goal: "resume", icon: "person", label: "goalResume", say: "goalSayResume" },
  { goal: "unsure", icon: "compass", label: "goalUnsure", say: "goalSayUnsure" },
];

function greetingKey(goal: Profile["goal"], hasArea: boolean, fromResume: boolean): StringKey {
  if (fromResume) return "greetingResume";
  if (goal === "job") return hasArea ? "greeting" : "greetingJob";
  if (goal === "learn") return "greetingLearn";
  if (goal === "resume") return "greetingResumeStart";
  if (goal === "unsure") return "greetingUnsure";
  return "greetingStart";
}

export default function Talk() {
  const { ready, t, effectiveLang, messages, profile, update } = useApp();
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [lastText, setLastText] = useState<{ text: string; spoken: boolean } | null>(null);
  const [roadBusy, setRoadBusy] = useState(false);
  const [roadProblem, setRoadProblem] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const roadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [params] = useState(() => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)));
  const autoListen = params.has("listen");
  const fromResume = params.get("from") === "resume";
  const goalParam = params.get("goal");

  // Arriving from a choice on Home means the goal is already known.
  useEffect(() => {
    if (!ready || !goalParam || !(GOALS as readonly string[]).includes(goalParam) || profile.goal === goalParam) return;
    update((current) => ({ profile: { ...current.profile, goal: goalParam as Goal } }));
  }, [ready, goalParam, profile.goal, update]);

  useEffect(() => {
    if (ready && params.has("type")) composerRef.current?.focus();
  }, [ready, params]);

  // Keep the newest message in view, unless the person has scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, streaming, busy, roadBusy, ready]);

  const hasPlan = messages.some((message) => message.roadmap);
  const greeting = t(greetingKey(profile.goal, Boolean(profile.area.trim()), fromResume));

  const makeRoad = useCallback(
    async (forProfile: Profile, history: ChatMessage[]) => {
      setRoadProblem(false);
      setRoadBusy(true);
      try {
        const { roadmap } = await postJson<{ roadmap: Roadmap }>("/api/roadmap", {
          lang: effectiveLang,
          profile: forProfile,
          transcript: transcriptOf(history),
        });
        update((current) => ({
          roadmap,
          messages: [...current.messages, { id: newId(), role: "assistant", content: roadText(roadmap), roadmap }],
        }));
        // A plan is taller than the screen, so show where it starts rather than where it ends.
        pinnedRef.current = false;
        requestAnimationFrame(() => roadRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
      } catch {
        setRoadProblem(true);
      } finally {
        setRoadBusy(false);
      }
    },
    [effectiveLang, update],
  );

  const send = useCallback(
    async (text: string, spoken: boolean, retrying = false) => {
      setProblem(null);
      setLastText({ text, spoken });
      setBusy(true);
      setStreaming(null);
      pinnedRef.current = true;
      // `words` holds only what the person said: resumes are checked against it.
      const words = retrying ? profile.words : `${profile.words}\n${text}`.trim().slice(-12000);
      // The greeting becomes part of the conversation once they answer it, so the counsellor knows what was asked.
      const opening: ChatMessage[] = messages.length ? messages : [{ id: newId(), role: "assistant", content: greeting }];
      const withUser: ChatMessage[] = retrying ? opening : [...opening, { id: newId(), role: "user", content: text }];
      const current = { ...profile, words };
      if (!retrying) update({ messages: withUser, profile: current });
      try {
        const res = await postRaw("/api/chat", {
          lang: effectiveLang,
          profile: current,
          hasPlan,
          messages: withUser.slice(-30).map(({ role, content }) => ({ role, content })),
        });
        const planNow = res.headers.get("X-Daari-Plan") === "make";
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        let reply = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          reply += value;
          setStreaming(reply);
        }
        const id = newId();
        const history: ChatMessage[] = [...withUser, { id, role: "assistant", content: reply }];
        update({ messages: history });
        setStreaming(null);
        if (spoken) speak(id, reply, effectiveLang);
        // Learn from the conversation in the background, so that replies are never delayed by it.
        postJson<{ profile: Partial<Profile> }>("/api/profile", { words: transcriptOf(history) })
          .then(({ profile: found }) => update((latest) => ({ profile: mergeProfile(latest.profile, found) })))
          .catch(() => {});
        if (planNow) void makeRoad(current, history);
      } catch (error) {
        setProblem(t(errorKey(error)));
      } finally {
        setBusy(false);
      }
    },
    [effectiveLang, greeting, hasPlan, makeRoad, messages, profile, t, update],
  );

  if (!ready) return <Shell fill><span /></Shell>;

  const answers = messages.filter((message) => message.role === "user").length;
  const showGoals = !fromResume && messages.length === 0 && !profile.goal;
  const showJobsLink = !hasPlan && !roadBusy && !busy && answers >= 4 && (profile.experience.length > 0 || profile.skills.length > 0);
  const lastRoad = [...messages].reverse().find((message) => message.roadmap);
  const lastRoadId = lastRoad?.id;
  // What they want changed since the plan was made, so offer to make it again.
  const roadStale = Boolean(lastRoad?.roadmap?.goal && profile.goal && lastRoad.roadmap.goal !== profile.goal);

  return (
    <Shell fill>
      <div className="talk">
        <div
          className="chat"
          ref={scrollRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_PX;
          }}
        >
          <div className="chat-inner" aria-live="polite">
            {messages.length === 0 && (
              <div className="bubble bubble-assistant">
                <p>{greeting}</p>
                <ReadAloud id="greeting" text={greeting} />
              </div>
            )}
            {showGoals && (
              <div className="goal-replies">
                {GOAL_CHOICES.map((choice) => (
                  <button
                    key={choice.goal}
                    type="button"
                    className="chip goal-reply"
                    disabled={busy}
                    onClick={() => {
                      update((current) => ({ profile: { ...current.profile, goal: choice.goal } }));
                      void send(t(choice.say), false);
                    }}
                  >
                    <Icon name={choice.icon} size={20} />
                    {t(choice.label)}
                  </button>
                ))}
              </div>
            )}
            {messages.map((message) =>
              message.roadmap ? (
                <div key={message.id} ref={message.id === lastRoadId ? roadRef : undefined} className="chat-road">
                  <RoadMap roadmap={message.roadmap} id={message.id} onTalk={() => composerRef.current?.focus()} />
                </div>
              ) : message.role === "assistant" ? (
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
            {roadBusy && <Loading text={t("roadMaking")} stops={5} />}
            {problem && lastText && <ErrorNote text={problem} onRetry={() => send(lastText.text, lastText.spoken, true)} />}
            {roadProblem && <ErrorNote text={t("roadFailed")} onRetry={() => makeRoad(profile, messages)} />}
            {roadStale && !busy && !roadBusy && !roadProblem && (
              <button type="button" className="btn btn-quiet chat-remake" onClick={() => makeRoad(profile, messages)}>
                <Icon name="compass" size={20} />
                {t("roadAgain")}
              </button>
            )}
            {fromResume && !busy && (
              <Link href="/me" className="ready-link">
                <Icon name="person" />
                <span>{t("resumeBack")}</span>
                <strong>{t("navMe")}</strong>
              </Link>
            )}
            {showJobsLink && (
              <Link href="/jobs" className="ready-link">
                <Icon name="briefcase" />
                <span>{t("readyForJobs")}</span>
                <strong>{t("seeJobs")}</strong>
              </Link>
            )}
          </div>
        </div>
        <div className="dock">
          <Composer ref={composerRef} onSend={(text, spoken) => void send(text, spoken)} busy={busy} autoListen={autoListen} hint={messages.length === 0} />
        </div>
      </div>
    </Shell>
  );
}
