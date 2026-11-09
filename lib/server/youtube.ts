/**
 * Picks real YouTube videos and playlists for a learning step, instead of sending people to a search
 * page they have to sort through. Results are filtered (no Shorts, nothing barely watched), then Jev
 * checks that each title actually teaches the step. Without YOUTUBE_API_KEY this returns nothing and
 * the plan falls back to a search link.
 */

import type { Lang, Video } from "../types";
import { nouls } from "./jev";

const API = "https://www.googleapis.com/youtube/v3";
const LANGUAGE: Record<Lang, string> = { en: "English", hi: "Hindi", kn: "Kannada" };
const MIN_SECONDS = 120; // anything shorter is a Short or a teaser, not a lesson
const MIN_VIEWS = 1000;
const MIN_SCORE = 0.6;
const CACHE_MS = 24 * 60 * 60 * 1000; // a search costs 100 of the 10,000 daily quota units

const cache = new Map<string, { at: number; videos: Video[] }>();

type SearchItem = {
  id: { kind: string; videoId?: string; playlistId?: string };
  snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } };
};

async function get<T>(endpoint: string, params: Record<string, string>, key: string): Promise<T> {
  const res = await fetch(`${API}/${endpoint}?${new URLSearchParams({ ...params, key })}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`YouTube ${endpoint} ${res.status}`);
  return res.json() as Promise<T>;
}

/** YouTube returns titles with HTML entities, like "Don&#39;t". */
export function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Languages a lesson can be in for each person: their own, or English, which most can follow.
const UNDERSTOOD: Record<Lang, string> = { en: "English", hi: "Hindi or English", kn: "Kannada or English" };

/**
 * Whether a title is plainly in a language the person cannot follow. A Hindi lesson suits a Hindi
 * speaker but not a Kannada speaker, and search results from India are mostly Hindi.
 */
export function wrongLanguage(title: string, lang: Lang) {
  if (lang !== "hi" && (/[\u0900-\u097F]/.test(title) || /\bhindi\b/i.test(title))) return true;
  if (lang !== "kn" && (/[\u0C80-\u0CFF]/.test(title) || /\bkannada\b/i.test(title))) return true;
  return /[\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F\u0980-\u09FF]|\b(tamil|telugu|malayalam|bengali|bangla|marathi|urdu)\b/i.test(title);
}

/** ISO 8601 duration, like PT1H2M5S, to seconds. */
export function durationSeconds(iso: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

export function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Up to two videos and one playlist that teach `topic`, best first. Good Kannada or Hindi lessons
 * are not there for every skill, so an empty result falls back to English ones.
 */
export async function findVideos(query: string, topic: string, lang: Lang): Promise<Video[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !query.trim()) return [];
  const picked = await search(query, topic, lang, key);
  return picked.length || lang === "en" ? picked : search(query, topic, "en", key);
}

async function search(query: string, topic: string, lang: Lang, key: string): Promise<Video[]> {
  const cacheKey = `${lang}|${query.trim().toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.videos;

  try {
    // relevanceLanguage is only a hint, so name the language in the search too.
    const q = query.toLowerCase().includes(LANGUAGE[lang].toLowerCase()) ? query : `${query} in ${LANGUAGE[lang]}`;
    const results = await get<{ items: SearchItem[] }>("search", {
      part: "snippet",
      q,
      type: "video,playlist",
      maxResults: "10",
      // Searching from India returns mostly Hindi lessons, even for an English search.
      ...(lang === "en" ? {} : { regionCode: "IN" }),
      relevanceLanguage: lang,
      safeSearch: "strict",
    }, key);
    const items = results.items ?? [];
    const videoIds = items.flatMap((item) => (item.id.videoId ? [item.id.videoId] : []));
    const playlistIds = items.flatMap((item) => (item.id.playlistId ? [item.id.playlistId] : []));

    const [videoInfo, playlistInfo] = await Promise.all([
      videoIds.length
        ? get<{ items: { id: string; contentDetails: { duration: string }; statistics: { viewCount?: string } }[] }>(
            "videos", { part: "contentDetails,statistics", id: videoIds.join(",") }, key)
        : { items: [] },
      playlistIds.length
        ? get<{ items: { id: string; contentDetails: { itemCount: number } }[] }>(
            "playlists", { part: "contentDetails", id: playlistIds.join(",") }, key)
        : { items: [] },
    ]);
    const videoById = new Map(videoInfo.items.map((v) => [v.id, v]));
    const playlistById = new Map(playlistInfo.items.map((p) => [p.id, p]));

    const candidates: Video[] = items.flatMap((item): Video[] => {
      if (wrongLanguage(decodeEntities(item.snippet.title), lang)) return [];
      const base = {
        title: decodeEntities(item.snippet.title),
        channel: decodeEntities(item.snippet.channelTitle),
        thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? "",
      };
      if (item.id.videoId) {
        const info = videoById.get(item.id.videoId);
        const seconds = info ? durationSeconds(info.contentDetails.duration) : 0;
        if (seconds < MIN_SECONDS || Number(info?.statistics.viewCount ?? 0) < MIN_VIEWS) return [];
        return [{ ...base, kind: "video", url: `https://www.youtube.com/watch?v=${item.id.videoId}`, length: clock(seconds) }];
      }
      if (item.id.playlistId) {
        const count = playlistById.get(item.id.playlistId)?.contentDetails.itemCount ?? 0;
        if (count < 2) return [];
        return [{ ...base, kind: "playlist", url: `https://www.youtube.com/playlist?list=${item.id.playlistId}`, length: String(count) }];
      }
      return [];
    });
    if (!candidates.length) return [];

    // Search relevance is loose, so check each title against what the step is meant to teach.
    const scores = await nouls(
      `Someone who speaks ${LANGUAGE[lang]} wants to learn this practical skill for a job: ${topic}`,
      Object.fromEntries(candidates.map((video, index) => [
        `c${index}`,
        `"${video.title}" (a YouTube ${video.kind} by ${video.channel}) would help them learn this skill, is in ${UNDERSTOOD[lang]}, and is a lesson rather than an advert for a product`,
      ])),
    );
    const ranked = candidates
      .map((video, index) => ({ video, score: scores[`c${index}`] ?? 0 }))
      .filter(({ score }) => score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .map(({ video }) => video);
    const picked = [
      ...ranked.filter((video) => video.kind === "video").slice(0, 2),
      ...ranked.filter((video) => video.kind === "playlist").slice(0, 1),
    ];
    cache.set(cacheKey, { at: Date.now(), videos: picked });
    return picked;
  } catch (error) {
    console.error("[youtube]", error instanceof Error ? error.message : error);
    return [];
  }
}
