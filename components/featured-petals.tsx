"use client";

import { useEffect, useRef } from "react";

/**
 * A few spring petals drifting across a featured card. The petal shape and the sway/flip/rotate motion
 * follow the spring effect of vue-seasons-falling (MIT, Tom Sin), ported to a React canvas so it can sit
 * inside a card: few petals, tuned for card size, paused off-screen, and still when motion is reduced.
 * Put it as the first child of a card that has `position: relative; isolation: isolate`.
 */
type Petal = { x: number; y: number; r: number; vy: number; step: number; stepSize: number; rot: number; rotSpeed: number; flip: number; flipSpeed: number; alpha: number; color: string };

const COLORS = ["244,166,192", "255,192,203", "233,125,166", "255,205,222"];
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

function spawn(width: number, height: number, anywhere: boolean): Petal {
  return {
    x: rand(0, width),
    y: anywhere ? rand(0, height) : rand(-16, -4),
    r: rand(2.6, 4.6),
    vy: rand(0.3, 0.5),
    step: rand(0, Math.PI * 2),
    stepSize: rand(0.015, 0.025),
    rot: rand(0, 360),
    rotSpeed: rand(-0.8, 0.8),
    flip: rand(0, Math.PI * 2),
    flipSpeed: rand(-0.12, 0.12),
    alpha: rand(0.55, 0.9),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function draw(ctx: CanvasRenderingContext2D, p: Petal) {
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = `rgba(${p.color}, ${p.alpha})`;
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rot * Math.PI) / 180);
  ctx.scale(Math.abs(Math.cos(p.flip)) * 0.3 + 0.7, 1);
  const n = p.r * 1.1;
  const i = p.r * 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -n);
  ctx.bezierCurveTo(-i, -n * 0.3, -i * 0.8, n * 0.8, 0, n);
  ctx.bezierCurveTo(i * 0.8, n * 0.8, i, -n * 0.3, 0, -n);
  ctx.fill();
  ctx.restore();
}

export function FeaturedPetals({ count = 7 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !host || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let petals: Petal[] = [];
    let frame = 0;
    let last = 0;
    let visible = true;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of petals) draw(ctx, p);
    };

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const next = host.getBoundingClientRect();
      if (!next.width || !next.height) return;
      if (Math.abs(width - next.width) < 0.5 && Math.abs(height - next.height) < 0.5) return;
      width = next.width;
      height = next.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      petals = Array.from({ length: count }, () => spawn(width, height, true));
      render();
    };

    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      const scale = last ? Math.min((now - last) / 16.7, 3) : 1;
      last = now;
      for (let k = 0; k < petals.length; k++) {
        const p = petals[k];
        p.y += p.vy * scale;
        p.step += p.stepSize * scale;
        p.x += (Math.sin(p.step) * 0.55 + Math.cos(p.flip) * 0.35 - 0.12) * scale;
        p.flip += p.flipSpeed * scale;
        p.rot += p.rotSpeed * scale;
        if (p.y > height + 12 || p.x < -12 || p.x > width + 12) petals[k] = spawn(width, height, false);
      }
      render();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (reduced || frame || !visible || document.hidden) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    const sizeObserver = new ResizeObserver(() => {
      resize();
      start();
    });
    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    const onVisibility = () => start();

    sizeObserver.observe(host);
    viewObserver.observe(host);
    document.addEventListener("visibilitychange", onVisibility);
    resize();
    start();

    return () => {
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      viewObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [count]);

  return (
    <canvas
      ref={ref}
      className="featured-petals"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        display: "block",
      }}
    />
  );
}
