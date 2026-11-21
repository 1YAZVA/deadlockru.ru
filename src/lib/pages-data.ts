/**
 * Серверные загрузчики данных для статических SEO-страниц.
 *
 * В CI `scripts/export-data.mjs` создаёт `public/api/*.json` ДО `next build`,
 * поэтому на этапе сборки файлы доступны и страницы прегенерируются целиком.
 * В локальной разработке без экспорта загрузчики просто вернут пустые списки.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const API_DIR = path.join(process.cwd(), "public", "api");

export type HeroStat = {
  winRate: number;
  pickRate: number;
  matches: number;
  kda: number;
  avgNetWorth: number;
  kills: number;
  deaths: number;
  assists: number;
} | null;

export type Hero = {
  id: number;
  name: string;
  nameRu?: string;
  className: string;
  description: string;
  descriptionEn?: string;
  lore?: string;
  heroRole?: string;
  tags: string[];
  heroType: string;
  complexity: number;
  colorHex: string;
  iconCard: string;
  iconSmall: string;
  startingStats: Record<string, number>;
  stat: HeroStat;
};

export type ItemStat = { winRate: number; matches: number; players: number; buyTimeRel: number } | null;

export type Item = {
  id: string;
  name: string;
  nameRu?: string;
  className: string;
  type: string;
  slotType: string;
  tier: number;
  cost: number;
  description: string;
  descriptionEn?: string;
  shopImage: string;
  image: string;
  isActive: boolean;
  components?: string[];
  props: { label: string; value: string; postfix?: string; cssClass?: string }[];
  stat: ItemStat;
};

export type Patch = {
  id: string;
  title: string;
  titleRu?: string;
  pubDate: string;
  source: string;
  link: string;
  category: string;
  author: string;
  content: string;
  contentRu?: string;
  imageUrl?: string;
  isPatch: boolean;
};

function readJson<T>(file: string): T | null {
  const p = path.join(API_DIR, file);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

let heroesCache: Hero[] | null = null;
let itemsCache: Item[] | null = null;
let patchesCache: Patch[] | null = null;

export function getHeroes(): Hero[] {
  if (heroesCache) return heroesCache;
  const data = readJson<{ heroes: Hero[] }>("heroes.json");
  heroesCache = (data?.heroes ?? []).filter((h) => h && h.id != null);
  return heroesCache;
}

export function getItems(): Item[] {
  if (itemsCache) return itemsCache;
  const data = readJson<{ items: Item[] }>("items.json");
  itemsCache = (data?.items ?? []).filter((i) => i && i.id);
  return itemsCache;
}

export function getPatches(): Patch[] {
  if (patchesCache) return patchesCache;
  const data = readJson<{ items: Patch[] }>("patches.json");
  patchesCache = (data?.items ?? []).filter((p) => p && p.id);
  return patchesCache;
}

/** Текст из API размечен HTML-фрагментами (<br>, <span class="highlight">…). */
export function htmlToParagraphs(html?: string | null): string[] {
  if (!html) return [];
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Минимальная очистка HTML от Steam-новостей: убираем скрипты и обработчики,
 * остальную разметку (абзацы, картинки, ссылки) оставляем — это официальный
 * контент Valve, но подстраховка от инъекций нужна всегда.
 */
export function sanitizeHtml(html?: string | null): string {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*("|')/gi, '$1="#"');
}
