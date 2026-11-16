"use client";

/** Общие типы и утилиты фронтенда Deadlock//RU */

export type HeroStatRow = {
  heroId: number; wins: number; losses: number; matches: number;
  kills: number; deaths: number; assists: number; netWorth: number;
  playerDamage: number; damageTaken: number; lastHits: number;
  winRate: number; pickRate: number; kda: number; avgNetWorth: number;
  updatedAt: string;
};

export type HeroRow = {
  id: number; name: string; nameRu?: string; className: string; description: string;
  descriptionEn?: string; lore?: string; heroRole?: string;
  tags: string[]; heroType: string; complexity: number; colorHex: string;
  iconCard: string; iconSmall: string;
  startingStats: Record<string, number>;
  levelInfo?: Record<string, { required_gold?: number }>;
  stat: HeroStatRow | null;
  hasExtras: boolean;
};

export type ItemProp = { label: string; value: string; postfix?: string; cssClass?: string };

export type ItemRow = {
  id: string; name: string; nameRu?: string; className: string; type: string;
  slotType: string; tier: number; cost: number; description: string;
  descriptionEn?: string;
  shopImage: string; image: string; isActive: boolean;
  /** class_name компонентов апгрейда — для правил рулетки билдов */
  components?: string[];
  props: ItemProp[];
  stat: { winRate: number; matches: number; players: number; buyTimeRel: number } | null;
};

export type HeroExtraData = {
  topItems: { itemId: string; matches: number; winRate: number; buyTimeRel: number }[];
  counters: {
    hardest: { enemyHeroId: number; matches: number; winRate: number }[];
    easiest: { enemyHeroId: number; matches: number; winRate: number }[];
  };
  builds: {
    early: ItemPick[]; mid: ItemPick[]; late: ItemPick[];
    byWin: ItemPick[];
  };
  abilities: { id?: string; name: string; nameRu?: string; image: string; className: string; description: string; descriptionRu?: string; abilityType: string }[];
  updatedAt: string;
};

export type ItemPick = { itemId: string; matches: number; winRate: number; buyTimeRel: number };

export type StateData = {
  counts: { heroes: number; items: number; patches: number; leaderboardPlayers: number; tournaments: number; activeMatches: number };
  online: { count: number; at: string; peak?: number | null } | null;
  onlineHistory: { count: number; at: string }[];
  latestPatch: { id: string; title: string; pubDate: string; source: string; isPatch: boolean } | null;
  topMeta: { heroId: number; winRate: number; pickRate: number; matches: number }[];
  sync: Record<string, { status: string; records: number; message: string; durationMs: number; at: string } | null>;
  activeMatches: { id: number; min: number; a: number[]; b: number[] }[];
};

export type LbRow = {
  region: string; rank: number; accountName: string; topHeroIds: number[]; updatedAt: string;
  avatar?: string; profileUrl?: string;
};

export type LbResponse = {
  rows: LbRow[]; total: number; page: number; pageSize: number;
  regionCounts: Record<string, number>;
  topHeroes: { heroId: number; count: number }[];
  updatedAt: string | null;
};

export type PatchRow = {
  id: string; title: string; pubDate: string; source: string; link: string;
  category: string; author: string; content: string; imageUrl?: string; isPatch: boolean;
  /** официальный русский перевод от Valve (RSS Steam), если он есть */
  titleRu?: string; contentRu?: string;
};

export type EsportsData = {
  tournaments: {
    id: string; name: string; organizer: string; region: string; status: string;
    format: string; prizePool: string; startDate: string | null; endDate: string | null;
    teamsCount: number; description: string; source: string;
  }[];
  teams: { id: string; name: string; tag: string; region: string; description: string }[];
  matches: {
    id: string; tournamentName: string; stage: string; teamA: string; teamB: string;
    scoreA: number; scoreB: number; status: string; format: string; scheduledAt: string | null; vodUrl: string;
  }[];
};

export type SyncStatus = {
  tasks: Record<string, { title: string; schedule: string; intervalMs: number; source: string }>;
  last: Record<string, { status: string; records: number; message: string; durationMs: number; at: string } | null>;
  running: string[];
  logs: { id: number; task: string; status: string; records: number; message: string; durationMs: number; at: string }[];
};

export type MetaResponse = {
  rows: {
    heroId: number; name: string; colorHex: string; iconCard: string;
    heroType: string; complexity: number;
    winRate: number; pickRate: number; matches: number; kda: number;
    avgNetWorth: number; kills: number; deaths: number; assists: number;
    playerDamage: number; damageTaken: number; lastHits: number; netWorth: number;
    updatedAt: string;
  }[];
  totalMatches: number;
  badgeDist: { badge: number; name: string; players: number }[];
  rankTiers: { id: number; name: string; imageLarge: string; imageSmall: string }[];
  updatedAt: string | null;
};

/**
 * Режимы работы сайта:
 *  - серверный (по умолчанию): все /api/* обслуживают роуты Next.js;
 *  - статический (NEXT_PUBLIC_STATIC=1, сборка для GitHub Pages): /api/* заменяются
 *    на заранее сгенерированные JSON-файлы в public/api (см. scripts/export-data.mjs),
 *    картинки идут напрямую (уже зеркалированы в /img-mirror экспортёром);
 *  - «живые» моторчики (поиск игрока и статистика аккаунта) в статике обслуживает
 *    бесплатная функция Яндекс.Облака — её адрес в NEXT_PUBLIC_API_BASE.
 */
export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC === "1";
export const REMOTE_API = process.env.NEXT_PUBLIC_API_BASE ?? "";

function mapStaticUrl(url: string): string {
  if (!url.startsWith("/api/")) return url;
  const qi = url.indexOf("?");
  const path = qi === -1 ? url : url.slice(0, qi);
  const params = new URLSearchParams(qi === -1 ? "" : url.slice(qi + 1));

  // живые моторчики — всегда на удалённом API (функция Яндекс.Облака)
  if (path === "/api/player") return `${REMOTE_API}/api/player${qi === -1 ? "" : url.slice(qi)}`;
  if (path === "/api/search") return `${REMOTE_API}/api/search${qi === -1 ? "" : url.slice(qi)}`;

  // /api/hero/123 → /api/hero/123.json
  if (path.startsWith("/api/hero/")) return `${path}.json`;
  // /api/meta/history?hours=168 → /api/meta-history-168.json
  if (path === "/api/meta/history") return `/api/meta-history-${params.get("hours") ?? "168"}.json`;
  // /api/leaderboard?region=X&… → /api/leaderboard/X.json (полный список региона —
  // пагинация и поиск делаются на клиенте)
  if (path === "/api/leaderboard") return `/api/leaderboard/${params.get("region") ?? "Global"}.json`;
  // /api/patches?filter=&page=&search= → /api/patches.json (полный список — фильтры на клиенте)
  if (path === "/api/patches") return "/api/patches.json";
  if (path === "/api/sync") return "/api/sync.json";

  return `${path}.json`;
}

export async function apiGet<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(STATIC_MODE ? mapStaticUrl(url) : url, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Картинки из внешних CDN (assets-bucket.deadlock-api.com, steamstatic и т.д.)
 * в серверном режиме отдаём через собственный прокси-кэш /api/img — иначе у части
 * пользователей (особенно из РФ) картинки с этих CDN не грузятся.
 * В статическом режиме все нужные картинки уже зеркалированы в /img-mirror
 * экспортёром (scripts/export-data.mjs), поэтому отдаём ссылку как есть.
 */
export function viaImgProxy(url?: string | null): string {
  const src = url ?? "";
  if (!src) return "";
  if (src.startsWith("/")) return src;
  if (/^https:\/\//i.test(src)) return STATIC_MODE ? src : `/api/img?u=${encodeURIComponent(src)}`;
  return src;
}

// ---------- словари ----------

export const HERO_TYPE_RU: Record<string, { label: string; color: string }> = {
  mystic: { label: "Мистик", color: "var(--spirit)" },
  marksman: { label: "Стрелок", color: "var(--weapon)" },
  brawler: { label: "Боец", color: "var(--vitality)" },
  assassin: { label: "Убийца", color: "var(--danger)" },
  "": { label: "Герой", color: "var(--accent)" },
};

/**
 * Локальные иконки героев — файлы из репозитория deadlockru.ru (img/heroes),
 * лежат в /public/img/heroes. Иконка грузится с собственного домена:
 * не зависит от внешних CDN (в т.ч. заблокированных у части пользователей РФ).
 * id героев — из api.deadlock-api.com; к id привязан файл-аватар.
 */
export const HERO_LOCAL_ICON: Record<number, string> = {
  1: "infernus.webp", 2: "seven.webp", 3: "vindicta.png", 4: "ghost.webp",
  6: "abrams.webp", 7: "wraith.webp", 8: "forge.webp", 10: "chrono.webp",
  11: "dynamo.webp", 12: "kelvin.webp", 13: "haze.webp", 14: "holliday.webp",
  15: "bebop.webp", 16: "calico.webp", 17: "grey-talon.webp", 18: "mo-krill.webp",
  19: "shiv.webp", 20: "ivy.webp", 21: "kali.webp", 25: "warden.webp",
  27: "yamato.webp", 31: "lash.webp", 35: "viscous.webp", 50: "synth.webp",
  52: "mirage.webp", 58: "viper.webp", 60: "sinclair.webp", 63: "mina.webp",
  64: "drifter.webp", 65: "venator.webp", 66: "victor.webp", 67: "paige.webp",
  69: "doorman.webp", 72: "billy.webp", 76: "graves.webp", 77: "apollo.webp",
  78: "deadman-danny.webp", 79: "rem.webp", 80: "silver.webp", 81: "celeste.webp",
  84: "ratking.webp", 85: "solomon.webp", 86: "violet.webp", 87: "nurse.webp",
  88: "baba.webp",
};

/** локальная иконка героя, если она есть в /img/heroes */
export function heroLocalIcon(heroId?: number | null): string {
  if (!heroId) return "";
  const f = HERO_LOCAL_ICON[heroId];
  return f ? `/img/heroes/${f}` : "";
}

/**
 * Цвета тиров рангов Deadlock (tier 0..11) — палитра из /v1/assets/ranks,
 * как на deadlockru.ru. Используется в графике распределения и в профиле.
 */
export const RANK_COLORS: string[] = [
  "#333333", "#6A3E1E", "#882355", "#5C6DAB", "#719C47", "#DDA326",
  "#EE4F57", "#B47FEB", "#955138", "#7C7C7C", "#C39751", "#5CE9A9",
];

export const RANK_TIER_COLORS: Record<number, string> = Object.fromEntries(
  RANK_COLORS.map((c, i) => [i, c])
);

/** локальная иконка ранга tier 0..11 — self-host в /img/ranks */
export function rankLocalIcon(tier: number): string {
  const t = Math.max(0, Math.min(11, Math.floor(tier)));
  return `/img/ranks/rank${String(t).padStart(2, "0")}_lg.webp`;
}

/** Названия тиров рангов (tier 0..11) — русские, как в API assets/ranks?language=russian */
export const RANK_NAMES: string[] = [
  "Обскурус", "Послушник", "Искатель", "Аколит", "Страж", "Мистик",
  "Ритуалист", "Эмиссар", "Оракул", "Фантом", "Владыка", "Этернус",
];

export const RANK_ROMAN = ["I", "II", "III", "IV", "V", "VI"];

export const SLOT_RU: Record<string, { label: string; color: string; key: string }> = {
  weapon: { label: "Оружие", color: "var(--weapon)", key: "weapon" },
  spirit: { label: "Спиритизм", color: "var(--spirit)", key: "spirit" },
  vitality: { label: "Живучесть", color: "var(--vitality)", key: "vitality" },
  "": { label: "Прочее", color: "var(--accent)", key: "other" },
};

export const REGION_RU: Record<string, string> = {
  Global: "Все регионы",
  Europe: "Европа",
  NAmerica: "Сев. Америка",
  SAmerica: "Юж. Америка",
  Asia: "Азия",
  Oceania: "Океания",
};

export const STAT_RU: Record<string, string> = {
  max_health: "Здоровье",
  max_move_speed: "Скорость бега",
  light_melee_damage: "Лёгкая атака",
  heavy_melee_damage: "Тяжёлая атака",
  weapon_power: "Сила оружия",
  stamina: "Выносливость",
  reload_speed: "Скорость перезарядки",
  base_health_regen: "Реген здоровья",
  sprint_speed: "Скорость рывка",
  move_acceleration: "Ускорение",
  air_dash_distance_in_meters: "Воздушный дэш, м",
  ground_dash_distance_in_meters: "Земляной дэш, м",
  stamina_regen_per_second: "Реген выносливости",
  ability_resource_max: "Макс. ресурс",
  ability_resource_regen_per_second: "Реген ресурса",
  tech_range: "Дальность способностей",
  tech_duration: "Длительность эффектов",
  ooc_health_regen: "Реген вне боя",
  proc_build_up_rate_scale: "Скорость накопления",
  crit_damage_received_scale: "Получаемый крит-урон",
  crouch_speed: "Скорость приседа",
};

const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : nf0.format(n));
export const fmt1 = (n: number | null | undefined) => (n == null ? "—" : nf1.format(n));
export const fmt2 = (n: number | null | undefined) => (n == null ? "—" : nf2.format(n));
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : `${nf1.format(n)}%`;
export const fmtSouls = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `${nf1.format(n / 1_000_000)} млн`;
  if (Math.abs(n) >= 1_000) return `${nf1.format(n / 1_000)} тыс.`;
  return nf0.format(n);
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "нет данных";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

/** винрейт -> цвет (как в киберспортивных дашбордах) */
export function wrColor(wr: number): string {
  if (wr >= 53) return "var(--ok)";
  if (wr >= 49) return "var(--accent)";
  if (wr >= 46) return "var(--weapon)";
  return "var(--danger)";
}

/** лор/описание героя содержит <br> из игровой локализации — превращаем в абзацы */
export function loreParagraphs(text?: string | null): string[] {
  if (!text) return [];
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** тир героя по винрейту: S/A/B/C/D */
export function wrTier(wr: number): { tier: string; color: string } {
  if (wr >= 53) return { tier: "S", color: "var(--ok)" };
  if (wr >= 50.5) return { tier: "A", color: "var(--accent)" };
  if (wr >= 48) return { tier: "B", color: "var(--weapon)" };
  if (wr >= 45) return { tier: "C", color: "var(--danger)" };
  return { tier: "D", color: "var(--danger)" };
}

/** Очистка HTML от Steam/форумов перед рендером: скрипты, обработчики, javascript:.
 *  Картинки внутри текста заворачиваем в собственный прокси /api/img —
 *  тогда они грузятся даже когда CDN Steam недоступен пользователю напрямую.
 *  Если у картинки есть Steam-вариант data-fallback-src — используем его как основной. */
const IMG_ALLOWED_HOSTS = [".steamstatic.com", ".steampowered.com", ".akamaihd.net", ".deadlock-api.com", ".steamcontent.com"];

function proxiedImgSrc(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!IMG_ALLOWED_HOSTS.some((s) => host.endsWith(s))) return null;
    return `/api/img?u=${encodeURIComponent(url)}`;
  } catch {
    return null;
  }
}

export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<img([^>]*)>/gi, (m0, attrs: string) => {
      const srcM = attrs.match(/src=["']([^"']+)["']/i);
      const fbM = attrs.match(/data-fallback-src=["']([^"']+)["']/i);
      let src = srcM?.[1] ?? "";
      // english-вариант картинки может 404 — надёжнее сразу брать базовый фолбэк Steam
      if (fbM?.[1]) src = fbM[1];
      const proxied = src ? proxiedImgSrc(src) : null;
      let out = attrs
        .replace(/\ssrc=["'][^"']*["']/i, "")
        .replace(/\sdata-fallback-src=["'][^"']*["']/gi, "");
      if (!proxied) return `<img${out}>`;
      return `<img src="${proxied}"${out} loading="lazy">`;
    });
}

export function matchDurationFmt(min: number): string {
  return `${min}:${String(0).padStart(2, "0")} мин`;
}
