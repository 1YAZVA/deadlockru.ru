"use client";

/**
 * Браузерная версия /api/player для GitHub Pages: сервера нет, поэтому браузер
 * сам ходит в api.deadlock-api.com через гонку маршрутов (свой Worker на /dlapi/,
 * прямой путь, публичные CORS-прокси — код перенсен из статики deadlockru.ru,
 * где он проработал месяцы). Ввод ник/ссылка/Steam ID разбирается как в роуте.
 * Ответы — те же формы, что у /api/player (ResolveResponse / StatsResponse).
 */

const API = "https://api.deadlock-api.com/v1";
const STEAM64_BASE = 76561197960265728n;

type Route = { tmo: number; url: (u: string) => string; text?: boolean; unwrap?: (j: unknown) => unknown };
const DL_ROUTES: Route[] = [
  { tmo: 15000, url: (u) => location.origin + "/dlapi/?url=" + encodeURIComponent(u) },
  { tmo: 12000, url: (u) => u },
  { tmo: 15000, url: (u) => "https://cors.eu.org/" + u },
  { tmo: 15000, url: (u) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u) },
  { tmo: 15000, url: (u) => "https://api.allorigins.win/get?url=" + encodeURIComponent(u), unwrap: (j) => (typeof (j as { contents?: unknown }).contents === "string" ? JSON.parse((j as { contents: string }).contents) : (j as { contents: string }).contents) },
  { tmo: 15000, url: (u) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(u) },
  { tmo: 15000, url: (u) => "https://api.cors.lol/?url=" + encodeURIComponent(u) },
  { tmo: 12000, text: true, url: (u) => "https://r.jina.ai/" + u, unwrap: (j) => JSON.parse(String(j).slice(String(j).indexOf("["))) },
];

function routeFetch<T>(path: string, tmo: number, r: Route, signal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), tmo);
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  return fetch(r.url(API + path), { signal: ctrl.signal, cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: unknown = r.text ? await res.text() : await res.json();
      return (r.unwrap ? r.unwrap(raw) : raw) as T;
    })
    .finally(() => clearTimeout(timer));
}

/** Гонка маршрутов: выигрывает первый ответивший, остальные обрываются. До 2 раундов. */
export async function dlFetch<T>(path: string): Promise<T> {
  let lastErr: unknown = null;
  for (let round = 0; round < 2; round++) {
    if (round) await new Promise((res) => setTimeout(res, 2000));
    try {
      return await Promise.any(DL_ROUTES.map((r) => routeFetch<T>(path, r.tmo, r)));
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Все маршруты недоступны");
}

function parseSteamInput(raw: string): { accountId?: number; nick?: string } | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/steamcommunity\.com\/profiles\/(\d{6,25})/i);
  if (m) {
    const num = BigInt(m[1]);
    if (m[1].length === 17) return { accountId: Number(num - STEAM64_BASE) };
    return { accountId: Number(num) };
  }
  m = s.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (m) return { nick: decodeURIComponent(m[1]) };
  m = s.match(/^STEAM_[01]:([01]):(\d+)$/i);
  if (m) return { accountId: Number(m[2]) * 2 + Number(m[1]) };
  if (/^\d{17}$/.test(s)) return { accountId: Number(BigInt(s) - STEAM64_BASE) };
  if (/^\d{1,10}$/.test(s)) return { accountId: Number(s) };
  if (/^https?:\/\//i.test(s)) return null;
  return { nick: s };
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export type ResolveResponse = {
  accountId?: number;
  profile?: { account_id: number; personaname?: string; realname?: string; avatarfull?: string; profileurl?: string; countrycode?: string; matches_played_last_30d?: number } | null;
  rank?: { tier: number; subrank: number; badge: number } | null;
  resolvedBy?: string;
  error?: string;
  mode?: "candidates";
  candidates?: { account_id: number; personaname?: string; avatarmedium?: string; matches_played_last_30d?: number }[];
  query?: string;
  plural?: string;
};

export async function ghResolve(input: string, directId?: number): Promise<ResolveResponse> {
  const parsed = parseSteamInput(input);
  if ((!input || !parsed) && !(Number.isFinite(directId) && directId > 0)) {
    return { error: "Введи Steam ID, ссылку на профиль или никнейм." };
  }
  let accountId = parsed?.accountId ?? (Number.isFinite(directId) && directId > 0 ? directId : undefined);
  let resolvedBy = "id";
  if (accountId == null && parsed?.nick) {
    // браузер не может прочитать steamcommunity.com/id/<nick> (нет CORS) —
    // ищем по открытому поиску deadlock-api: и точные ники, и похожие
    const found = await dlFetch<{ account_id: number; personaname?: string; avatarmedium?: string; matches_played_last_30d?: number }[]>(
      `/players/steam-search?search_query=${encodeURIComponent(parsed.nick)}&limit=8`
    );
    if (Array.isArray(found) && found.length) {
      const lower = parsed.nick.toLowerCase();
      const exact = found.find((p) => (p.personaname ?? "").toLowerCase() === lower);
      if (exact) return ghResolve("", exact.account_id);
      return {
        mode: "candidates",
        candidates: found.map((p) => ({ account_id: p.account_id, personaname: p.personaname, avatarmedium: p.avatarmedium, matches_played_last_30d: p.matches_played_last_30d ?? 0 })),
        query: parsed.nick,
        plural: plural(found.length, "игрок", "игрока", "игроков"),
      };
    }
    return { error: `Никого не нашёл по «${parsed.nick}». Введи Steam ID цифрами (узнать: steamid.io) или ссылку на профиль Steam.`, query: parsed.nick };
  }
  if (accountId == null) return { error: "Не удалось разобрать ввод." };

  const [profRes, rankRes] = await Promise.allSettled([
    dlFetch<{ account_id: number; personaname?: string; realname?: string; avatarfull?: string; profileurl?: string; countrycode?: string; matches_played_last_30d?: number }[]>(`/players/steam?account_ids=${accountId}`),
    dlFetch<{ tier?: number; subrank?: number; badge?: number }>(`/players/${accountId}/rank`),
  ]);
  const profArr = profRes.status === "fulfilled" ? profRes.value : null;
  const profile = Array.isArray(profArr) ? profArr.find((p) => p.account_id === accountId) ?? profArr[0] ?? null : null;
  let rank: ResolveResponse["rank"] = null;
  if (rankRes.status === "fulfilled" && typeof rankRes.value?.badge === "number") {
    rank = { tier: rankRes.value.tier ?? 0, subrank: rankRes.value.subrank ?? 0, badge: rankRes.value.badge };
  }
  if (profRes.status === "rejected" && rankRes.status === "rejected") {
    throw new Error("Маршруты загрузки сейчас недоступны — попробуй ещё раз через минуту");
  }
  return { accountId, profile, rank, resolvedBy };
}

type MatchRow = {
  match_id: number; start_time: number; match_duration_s: number;
  player_kills: number; player_deaths: number; player_assists: number;
  player_match_outcome: number; net_worth: number; last_hits: number; denies: number;
  hero_id: number; ranked_delta?: number | null;
};

const sum = (arr: MatchRow[], k: keyof MatchRow) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export type StatsResponse = {
  accountId: number;
  tiles: { n: string; t: string; s?: string; hot?: boolean; cls?: string }[];
  rankMovement: number[];
  historyRows: { matchId: number; heroId: number; date: string; outcome: "w" | "l" | "u"; kda: string; souls: number; duration: string; delta: number | null }[];
  favHeroes: { heroId: number; matches: number; wr: number; soulsPerMin: number }[];
  bestHeroes: { heroId: number; matches: number; wr: number; soulsPerMin: number }[];
  heroesWithStats: number;
  error?: string;
};

/** Та же агрегация, что в серверном /api/player?phase=stats */
export async function ghStats(accountId: number): Promise<StatsResponse> {
  const [histRes, hsRes] = await Promise.allSettled([
    dlFetch<MatchRow[]>(`/players/${accountId}/match-history`),
    dlFetch<{ hero_id: number; matches_played: number; wins: number; networth_per_min?: number; time_played?: number }[]>(`/players/hero-stats?account_ids=${accountId}`),
  ]);
  const hist = histRes.status === "fulfilled" && Array.isArray(histRes.value) ? histRes.value : null;
  const hs = hsRes.status === "fulfilled" && Array.isArray(hsRes.value) ? hsRes.value : null;
  if (!hist && !hs) {
    throw new Error("Аккаунт есть, но матчей Deadlock в открытой базе нет — игрок скрыл статистику или ещё не играл.");
  }

  let tiles: StatsResponse["tiles"] = [];
  let rankMovement: number[] = [];
  let historyRows: StatsResponse["historyRows"] = [];

  if (hist && hist.length) {
    const known = hist.filter((x) => x.player_match_outcome === 1 || x.player_match_outcome === 2);
    const knownW = known.filter((x) => x.player_match_outcome === 1).length;
    const wr = known.length >= 10 ? Math.round((knownW / known.length) * 100) : null;

    const recent = hist.slice(0, 50);
    const valid = recent.filter((x) => x.match_duration_s > 60 && x.net_worth > 0);
    const spmN = valid.slice(0, 20);
    const spm = spmN.length ? Math.round(spmN.reduce((a, x) => a + x.net_worth / (x.match_duration_s / 60), 0) / spmN.length) : null;
    const k50 = sum(recent, "player_kills");
    const d50 = sum(recent, "player_deaths");
    const a50 = sum(recent, "player_assists");
    const kda = d50 ? ((k50 + a50) / d50).toFixed(2) : null;
    const avgDur = recent.length ? Math.round(recent.reduce((a, x) => a + x.match_duration_s, 0) / recent.length) : null;

    let streak = 0, streakType = "";
    for (let i = 0; i < hist.length; i++) {
      const o = hist[i].player_match_outcome;
      if (o !== 1 && o !== 2) continue;
      streakType = o === 1 ? "w" : "l"; streak = 1;
      for (let j = i + 1; j < hist.length; j++) { if (hist[j].player_match_outcome !== o) break; streak++; }
      break;
    }

    const deltas = hist.slice(0, 50).slice().reverse().filter((x) => x.ranked_delta != null).map((x) => x.ranked_delta as number);
    let cum = 0;
    rankMovement = deltas.map((d) => (cum += d));

    tiles = [
      { n: String(hist.length), t: "матчей в базе API", s: "включая уличные стычки" },
      { n: wr != null ? `${wr}%` : "—", t: "винрейт", hot: true, s: known.length ? `по ${known.length} матчам с известным исходом` : "у API нет исходов матчей" },
      { n: spm != null ? String(spm) : "—", t: "душ/мин · последние 20" },
      { n: kda ?? "—", t: "KDA · последние 50" },
      { n: String(Math.round(sum(hist, "match_duration_s") / 3600)), t: "часов в матчах", s: "в Steam больше: + меню и лобби" },
      { n: streak ? `${streak} ${streakType === "w" ? plural(streak, "победа", "победы", "побед") : plural(streak, "поражение", "поражения", "поражений")}` : "—", t: "текущая серия", cls: streakType === "w" ? "up" : streakType === "l" ? "down" : "" },
      { n: avgDur ? dur(avgDur) : "—", t: "средний матч" },
      { n: String(Math.round(sum(hist, "net_worth"))), t: "душ собрано" },
      { n: String(sum(hist, "player_kills")), t: "убийств" },
      { n: String(sum(hist, "player_assists")), t: "помощи" },
      { n: String(Math.round(sum(hist, "last_hits"))), t: "добиваний" },
      { n: String(sum(hist, "denies")), t: "укр. шаров" },
    ];

    historyRows = hist.slice(0, 15).map((m) => ({
      matchId: m.match_id, heroId: m.hero_id,
      date: new Date(m.start_time * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      outcome: m.player_match_outcome === 1 ? "w" : m.player_match_outcome === 2 ? "l" : "u",
      kda: `${m.player_kills}/${m.player_deaths}/${m.player_assists}`,
      souls: m.net_worth, duration: dur(m.match_duration_s), delta: m.ranked_delta ?? null,
    }));
  } else if (hs) {
    const m = hs.reduce((a, x) => a + x.matches_played, 0);
    const w = hs.reduce((a, x) => a + x.wins, 0);
    tiles = [
      { n: String(m), t: "матчей в базе API", s: "по героям · история ещё считается" },
      { n: m ? `${Math.round((w / m) * 100)}%` : "—", t: "винрейт", hot: true, s: "по героям · уточнится по истории" },
      { n: String(Math.round(hs.reduce((a, x) => a + (x.time_played ?? 0), 0) / 3600)), t: "часов в матчах" },
    ];
  }

  const heroAgg = (hs ?? []).map((h) => ({
    heroId: h.hero_id, matches: h.matches_played,
    wr: h.matches_played ? Math.round((h.wins / h.matches_played) * 100) : 0,
    soulsPerMin: Math.round(h.networth_per_min ?? 0),
  }));
  const qualified = heroAgg.filter((h) => h.matches >= 5);
  const fav = heroAgg.slice().sort((a, b) => b.matches - a.matches).slice(0, 5);
  const best = (qualified.length ? qualified : heroAgg).slice().sort((a, b) => b.wr - a.wr).slice(0, 5);

  return { accountId, tiles, rankMovement, historyRows, favHeroes: fav, bestHeroes: best, heroesWithStats: heroAgg.length };
}
