"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Sarvam's synchronous speech endpoint is meant for short clips, so stop before it gets long.
export const MAX_SECONDS = 28;
export type RecorderError = "denied" | "unsupported" | null;

export function useRecorder(onFinished: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS);
  const [error, setError] = useState<RecorderError>(null);
  const levelsRef = useRef<Uint8Array | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const callback = useRef(onFinished);
  useEffect(() => {
    callback.current = onFinished;
  }, [onFinished]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("denied");
      return;
    }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 64;
    context.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;
    levelsRef.current = new Uint8Array(analyser.frequencyBinCount);

    // Chrome records webm and Safari records mp4, and the browser picks what it supports.
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const left = MAX_SECONDS - Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(left);
      if (left <= 0) stop();
    }, 250);

    cleanupRef.current = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      context.close().catch(() => {});
      analyserRef.current = null;
    };
    recorder.onstop = () => {
      cleanupRef.current();
      setRecording(false);
      setSecondsLeft(MAX_SECONDS);
      callback.current(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }, [stop]);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    cleanupRef.current();
  }, []);

  /** Current loudness per band, from 0 to 255, read by the meter on each frame. */
  const readLevels = useCallback(() => {
    if (!analyserRef.current || !levelsRef.current) return null;
    analyserRef.current.getByteFrequencyData(levelsRef.current as Uint8Array<ArrayBuffer>);
    return levelsRef.current;
  }, []);

  return { recording, secondsLeft, error, start, stop, readLevels };
}
