"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { speak, stopSpeaking, unlockAudio, usePlayback } from "@/lib/client/audio";
import { parsePay } from "@/lib/pay";
import { LANGS, type Lang, type StopStatus } from "@/lib/types";
import { useApp } from "./app-state";

const PATHS: Record<string, ReactNode> = {
  home: <path d="M3 11.5L12 4l9 7.5M5.5 9.5V20h13V9.5M10 20v-6h4v6" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  briefcase: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V5h6v3M3 13h18" /></>,
  book: <path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1zM20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z" />,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3 8-8 9-5-1-8-4-8-9V6zM12 8v5M12 16v.5" />,
  speaker: <><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
  send: <path d="M4 12l16-8-6 16-2-7z" />,
  warning: <path d="M12 4l9 16H3zM12 10v4M12 17v.5" />,
  back: <path d="M15 5l-7 7 7 7" />,
  external: <path d="M9 5H5v14h14v-4M13 5h6v6M19 5l-9 9" />,
  phone: <path d="M5 4h4l2 5-2.5 2a12 12 0 0 0 5 5l2-2.5 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 6a2 2 0 0 1 2-2z" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />,
  pin: <><path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  tool: <path d="M5 7l2 2 3-3.5M5 16l2 2 3-3.5M13 7.5h6M13 16.5h6" />,
  rupee: <path d="M7 5h10M7 9h10M7 5c6 0 6 8 0 8h-1l7 7" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
};

export function Icon({ name, size = 24 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

const NAV = [
  { href: "/", icon: "home", label: "navHome" },
  { href: "/talk", icon: "mic", label: "navTalk" },
  { href: "/jobs", icon: "briefcase", label: "navJobs" },
  { href: "/learn", icon: "book", label: "navLearn" },
  { href: "/check", icon: "shield", label: "navCheck" },
  { href: "/me", icon: "person", label: "navMe" },
] as const;

export const LANG_LABEL: Record<Lang, string> = { en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ" };

/**
 * Always in the corner of every screen, written in each language's own script, so a person can
 * find their language without being able to read the current one.
 */
export function LanguageSwitcher() {
  const { t, effectiveLang, update } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="lang-switch" ref={box}>
      <button type="button" className="lang-button" aria-expanded={open} aria-label={t("changeLanguage")} onClick={() => setOpen((value) => !value)}>
        <Icon name="globe" size={22} />
        <span lang={effectiveLang}>{LANG_LABEL[effectiveLang]}</span>
      </button>
      {open && (
        <div className="lang-menu" role="group" aria-label={t("changeLanguage")}>
          {LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              lang={lang}
              className="lang-option"
              aria-pressed={lang === effectiveLang}
              onClick={() => {
                update({ lang });
                setOpen(false);
              }}
            >
              {LANG_LABEL[lang]}
              {lang === effectiveLang && <Icon name="check" size={20} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthButton() {
  const { t, user, signOut } = useApp();
  const router = useRouter();

  if (!user) {
    return (
      <Link href="/login" className="btn btn-quiet auth-btn" aria-label={t("navLogin")}>
        <Icon name="person" size={20} />
        <span>{t("navLogin")}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-quiet auth-btn"
      aria-label={t("signOut")}
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
    >
      <Icon name="person" size={20} />
      <span>{t("signOut")}</span>
    </button>
  );
}

/** `fill` pins the page to the screen and lets the page scroll inside itself, as a chat needs. */
export function Shell({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const { t } = useApp();
  const pathname = usePathname();
  // Before sign-in every tab leads back to the sign-in page, so it shows none of them.
  const signingIn = pathname === "/login";
  return (
    <div className={["shell", signingIn && "shell-bare", fill && "shell-fill"].filter(Boolean).join(" ")}>
      {!signingIn && (
        <nav className="nav" aria-label="Daari">
          <Link href="/" className="nav-brand">Daari</Link>
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="nav-item" aria-current={active ? "page" : undefined}>
                <Icon name={item.icon} />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>
      )}
      <main className="main">
        <div className="topbar"><LanguageSwitcher />{!signingIn && <AuthButton />}</div>
        {children}
      </main>
    </div>
  );
}

/** Read any text aloud. People who do not read comfortably depend on this on every screen. */
export function ReadAloud({ id, text, label = true }: { id: string; text: string; label?: boolean }) {
  const { t, effectiveLang } = useApp();
  const playback = usePlayback();
  const active = playback.id === id;
  return (
    <button
      type="button"
      className="read-aloud"
      aria-label={active ? t("stop") : t("listen")}
      data-active={active || undefined}
      onClick={() => {
        if (active) return stopSpeaking();
        unlockAudio();
        speak(id, text, effectiveLang);
      }}
    >
      {active && playback.loading ? <span className="spinner" /> : <Icon name={active ? "stop" : "speaker"} size={20} />}
      {label && <span>{active ? t("stop") : t("listen")}</span>}
    </button>
  );
}

/**
 * The bus route: each requirement is a stop, filled when the person has it, and the job is the
 * terminus. Stops are sorted so the solid line shows how far along the way they already are.
 */
export function RouteLine({ stops, total }: { stops: { status: StopStatus }[]; total?: number }) {
  const order: Record<StopStatus, number> = { met: 0, unsure: 1, gap: 2 };
  const sorted = [...stops].sort((a, b) => order[a.status] - order[b.status]);
  const count = total ?? stops.length;
  const met = stops.filter((stop) => stop.status === "met").length;
  // Stops sit at i/count along the line with the terminus at the end, so stop on the last one met.
  const percent = !met ? 0 : met >= count ? 100 : ((met - 1) / count) * 100;
  return (
    <div className="route" aria-hidden="true">
      <div className="route-track">
        <span className="route-done" style={{ width: `${percent}%` }} />
      </div>
      <div className="route-stops">
        {sorted.map((stop, index) => (
          <span key={index} className={`route-stop is-${stop.status}`} />
        ))}
        <span className="route-end" />
      </div>
    </div>
  );
}

export function Loading({ text, stops = 5 }: { text: string; stops?: number }) {
  return (
    <div className="loading" role="status">
      <div className="loading-route" aria-hidden="true">
        {Array.from({ length: stops }, (_, index) => (
          <span key={index} style={{ animationDelay: `${index * 120}ms` }} />
        ))}
      </div>
      <p>{text}</p>
    </div>
  );
}

export function ErrorNote({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <div className="error-note" role="alert">
      <Icon name="warning" />
      <p>{text}</p>
      {onRetry && <button type="button" className="btn btn-quiet" onClick={onRetry}>{t("tryAgain")}</button>}
    </div>
  );
}

const PERIOD = { month: "perMonth", year: "perYear", day: "perDay" } as const;

export function PayText({ text, className }: { text: string | null; className: string }) {
  const { t } = useApp();
  const pay = parsePay(text);
  return <p className={className}>{pay ? `${pay.amount} / ${t(PERIOD[pay.period])}` : text ?? t("payUnknown")}</p>;
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={async () => {
        await navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? <Icon name="check" size={20} /> : null}
      {copied ? t("copied") : t("copy")}
    </button>
  );
}

// A small seeded generator keeps the art identical on server and client.
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

/**
 * A tabebuia tree drawn in small cells, the pink trees that line Bangalore's roads. A few petals
 * drift down. This is the one piece of art, and it appears only in headers and empty states.
 */
export function TabebuiaTree({ className, tall = false }: { className?: string; tall?: boolean }) {
  const random = seeded(11);
  const cell = 9;
  const columns = 40;
  // Tall trees run off the bottom of a header, and short ones stand on a strip of grass.
  const rows = tall ? 120 : 38;
  const blobs = [
    { x: 21, y: 13, r: 11 },
    { x: 11, y: 17, r: 8 },
    { x: 31, y: 17, r: 8 },
    { x: 16, y: 8, r: 7 },
    { x: 27, y: 8, r: 7 },
  ];
  const cells: { x: number; y: number; fill: string }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const distance = Math.min(...blobs.map((blob) => Math.hypot(x - blob.x, (y - blob.y) * 1.1) / blob.r));
      if (distance < 1 && random() < 1.08 - distance * 0.55) {
        const roll = random();
        cells.push({ x, y, fill: roll < 0.08 ? "var(--auto)" : roll < 0.3 ? "#FBD3E0" : "var(--pink)" });
      }
    }
  }
  const trunk: { x: number; y: number }[] = [];
  for (let y = 21; y < rows; y++) {
    for (let x = 20; x < 23; x++) trunk.push({ x, y });
  }
  for (let i = 0; i < 6; i++) {
    trunk.push({ x: 20 - i, y: 23 - i }, { x: 22 + i, y: 23 - i });
  }
  const grass = tall ? [] : Array.from({ length: columns - 8 }, (_, index) => ({ x: index + 4, y: rows - 1 }));
  const petals = Array.from({ length: 9 }, (_, index) => ({
    x: Math.floor(random() * columns),
    y: 22 + Math.floor(random() * 8),
    delay: index * 1.1,
    duration: 7 + random() * 5,
  }));
  return (
    <svg className={`tree ${className ?? ""}`} viewBox={`0 0 ${columns * cell} ${rows * cell}`} aria-hidden="true">
      {trunk.map((part, index) => (
        <rect key={index} x={part.x * cell} y={part.y * cell} width={cell - 1} height={cell - 1} fill="#0D1E63" />
      ))}
      {grass.map((part, index) => (
        <rect key={index} x={part.x * cell} y={part.y * cell} width={cell - 1} height={cell - 1} fill="#3E9E5B" />
      ))}
      {cells.map((part, index) => (
        <rect key={index} x={part.x * cell} y={part.y * cell} width={cell - 1} height={cell - 1} fill={part.fill} />
      ))}
      {petals.map((petal, index) => (
        <rect
          key={index}
          className="petal"
          x={petal.x * cell}
          y={petal.y * cell}
          width={cell - 2}
          height={cell - 2}
          fill="var(--pink)"
          style={{ animationDelay: `${petal.delay}s`, animationDuration: `${petal.duration}s` }}
        />
      ))}
    </svg>
  );
}
