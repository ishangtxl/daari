"use client";

import { useEffect, useState } from "react";
import type { Lang } from "../types";
import { postRaw } from "./api";

type Playback = { id: string | null; loading: boolean };

let player: HTMLAudioElement | null = null;
let state: Playback = { id: null, loading: false };
let requestToken = 0;
const listeners = new Set<(playback: Playback) => void>();
const urls = new Map<string, string>();

// A one-sample silent clip. Phones only allow later playback on an element first started by a tap.
const SILENCE = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqq";

function emit() {
  listeners.forEach((listener) => listener(state));
}

function ensurePlayer() {
  if (!player && typeof Audio !== "undefined") {
    player = new Audio();
    const clear = () => {
      state = { id: null, loading: false };
      emit();
    };
    player.onended = clear;
    player.onerror = () => {
      if (player?.src !== SILENCE) clear();
    };
  }
  return player;
}

/** Call from inside a tap, before any waiting, so that a later spoken reply is allowed to play. */
export function unlockAudio() {
  const audio = ensurePlayer();
  if (!audio || state.id) return;
  audio.src = SILENCE;
  audio.play().catch(() => {});
}

export function stopSpeaking() {
  requestToken++;
  player?.pause();
  state = { id: null, loading: false };
  emit();
}

export async function speak(id: string, text: string, lang: Lang) {
  const audio = ensurePlayer();
  if (!audio || !text.trim()) return;
  const token = ++requestToken;
  audio.pause();
  state = { id, loading: true };
  emit();
  try {
    const key = `${lang}:${text}`;
    let url = urls.get(key);
    if (!url) {
      const res = await postRaw("/api/tts", { text: text.slice(0, 1200), lang });
      url = URL.createObjectURL(await res.blob());
      urls.set(key, url);
    }
    if (token !== requestToken) return;
    audio.src = url;
    state = { id, loading: false };
    emit();
    await audio.play();
  } catch {
    if (token === requestToken) {
      state = { id: null, loading: false };
      emit();
    }
  }
}

export function usePlayback() {
  const [playback, setPlayback] = useState<Playback>(state);
  useEffect(() => {
    listeners.add(setPlayback);
    return () => void listeners.delete(setPlayback);
  }, []);
  return playback;
}
