import { NextRequest, NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Статистика аккаунта Steam — серверный прокси к открытым API.
 *
 * Почему через сервер: 1) браузер пользователя (особенно из РФ) может не иметь
 * прямого пути к api.deadlock-api.com / steamcommunity.com — сервер же их видит;
 * 2) ответы кэшируются на 10 минут, повторные запросы летают мгновенно;
 * 3) match-history весит ~2 МБ — сервер отдаёт клиенту уже посчитанные итоги.
 *
 * phase=resolve : ввод (ник / ссылка / Steam ID) → профиль + ранг
 * phase=stats   : account_id → агрегаты по матчам, герои, история матчей
 */

const API = "https://api.deadlock-api.com/v1";
const STEAM64_BASE = 76561197960265728n;
const UA = "DeadlockRU-portal/1.0 (player stats)";
const CACHE_TTL = 10 * 60_000;

type Profile = {
  account_id: number;
  personaname?: string;
  realname?: string;
  avatarfull?: string;
  avatarmedium?: string;
  profileurl?: string;
  countrycode?: string;
  matches_played_last_30d?: number;
};

type RankInfo = { tier: number; subrank: number; badge: number } | null;

type MatchRow = {
  match_id: number;
  start_time: number;
  match_duration_s: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
  player_match_outcome: number; // 1 = победа, 2 = поражение, 5 = «не учёт»
  net_worth: number;
  last_hits: number;
  denies: number;
  hero_id: number;
  ranked_delta?: number | null;
};

async function fetchJson<T>(url: string, timeoutMs = 20_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Steam ID / ссылка / ник → { accountId } или { nick } */
function parseSteamInput(raw: string): { accountId?: number; nick?: string } | null {
  const s = raw.trim();
  if (!s) return null;
  // ссылки на профиль: /profiles/<steamid64> или /profiles/<account_id> (Steam принимает оба вида)
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
  // любую другую ссылку искать как ник бессмысленно — просим корректный ввод
  if (/^https?:\/\//i.test(s)) return null;
  return { nick: s };
}

/** vanity → steamID64 через открытый профиль Steam (steamcommunity доступен из РФ) */
async function resolveVanity(vanity: string): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": UA },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const xml = await res.text();
    const m = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
    return m ? Number(BigInt(m[1]) - STEAM64_BASE) : null;
  } catch {
    return null;
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const phase = sp.get("phase") ?? "resolve";

  try {
    if (phase === "resolve") {
      const input = (sp.get("input") ?? "").trim();
      const directId = Number(sp.get("account_id"));
      const parsed = parseSteamInput(input);
      if ((!input || !parsed) && !(Number.isFinite(directId) && directId > 0)) {
        return NextResponse.json({ error: "Введи Steam ID, ссылку на профиль или никнейм." }, { status: 400 });
      }

      let accountId = parsed?.accountId;
      if (accountId == null && Number.isFinite(directId) && directId > 0) accountId = directId;
      let resolvedBy: "id" | "vanity" | "search" = "id";

      if (accountId == null && parsed?.nick) {
        const vanity = parsed.nick;
        const viaVanity = await resolveVanity(vanity);
        if (viaVanity != null) {
          accountId = viaVanity;
          resolvedBy = "vanity";
        } else {
          // точный ник не совпал с адресом профиля — ищем игроков по базе
          const found = await fetchJson<Profile[]>(
            `${API}/players/steam-search?search_query=${encodeURIComponent(vanity)}&limit=8`,
            25_000
          );
          return NextResponse.json({
            mode: "candidates",
            candidates: found.map((p) => ({
              account_id: p.account_id,
              personaname: p.personaname,
              avatarmedium: p.avatarmedium,
              matches_played_last_30d: p.matches_played_last_30d ?? 0,
            })),
            query: vanity,
            plural: plural(found.length, "игрок", "игрока", "игроков"),
          });
        }
      }

      if (accountId == null) {
        return NextResponse.json({ error: "Не удалось разобрать ввод." }, { status: 400 });
      }

      const cacheKey = `player:resolve:${accountId}`;
      const hit = cacheGet<{ accountId: number; profile: Profile | null; rank: RankInfo; resolvedBy: string }>(cacheKey);
      if (hit) return NextResponse.json(hit);

      const [profRes, rankRes] = await Promise.allSettled([
        fetchJson<Profile[]>(`${API}/players/steam?account_ids=${accountId}`),
        fetchJson<{ tier?: number; subrank?: number; badge?: number }>(`${API}/players/${accountId}/rank`),
      ]);
      const profArr = profRes.status === "fulfilled" ? profRes.value : null;
      const profile = Array.isArray(profArr) ? profArr.find((p) => p.account_id === accountId) ?? profArr[0] ?? null : null;
      let rank: RankInfo = null;
      if (rankRes.status === "fulfilled" && typeof rankRes.value?.badge === "number") {
        rank = { tier: rankRes.value.tier ?? 0, subrank: rankRes.value.subrank ?? 0, badge: rankRes.value.badge };
      }

      const out = { accountId, profile, rank, resolvedBy };
      cacheSet(cacheKey, out, CACHE_TTL);
      return NextResponse.json(out);
    }

    // phase=stats
    const accountId = Number(sp.get("account_id"));
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return NextResponse.json({ error: "Некорректный account_id" }, { status: 400 });
    }
    const cacheKey = `player:stats:${accountId}`;
    const hit = cacheGet<Record<string, unknown>>(cacheKey);
    if (hit) return NextResponse.json(hit);

    const [histRes, hsRes] = await Promise.allSettled([
      fetchJson<MatchRow[]>(`${API}/players/${accountId}/match-history`, 40_000),
      fetchJson<{ hero_id: number; matches_played: number; wins: number; networth_per_min?: number; time_played?: number }[]>(
        `${API}/players/hero-stats?account_ids=${accountId}`,
        40_000
      ),
    ]);

    const hist = histRes.status === "fulfilled" && Array.isArray(histRes.value) ? histRes.value : null;
    const hs = hsRes.status === "fulfilled" && Array.isArray(hsRes.value) ? hsRes.value : null;

    if (!hist && !hs) {
      return NextResponse.json(
        { error: "Аккаунт есть, но матчей Deadlock в открытой базе нет — игрок скрыл статистику или ещё не играл." },
        { status: 404 }
      );
    }

    const sum = (arr: MatchRow[], k: keyof MatchRow) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

    let tiles: { n: string; t: string; s?: string; hot?: boolean; cls?: string }[] = [];
    let rankMovement: number[] = [];
    let historyRows: {
      matchId: number; heroId: number; date: string; outcome: "w" | "l" | "u";
      kda: string; souls: number; duration: string; delta: number | null;
    }[] = [];

    if (hist && hist.length) {
      const known = hist.filter((x) => x.player_match_outcome === 1 || x.player_match_outcome === 2);
      const knownW = known.filter((x) => x.player_match_outcome === 1).length;
      const wr = known.length >= 10 ? Math.round((knownW / known.length) * 100) : null;

      const recent = hist.slice(0, 50);
      const valid = recent.filter((x) => x.match_duration_s > 60 && x.net_worth > 0);
      const spmN = valid.slice(0, 20);
      const spm = spmN.length
        ? Math.round(spmN.reduce((a, x) => a + x.net_worth / (x.match_duration_s / 60), 0) / spmN.length)
        : null;
      const k50 = sum(recent, "player_kills");
      const d50 = sum(recent, "player_deaths");
      const a50 = sum(recent, "player_assists");
      const kda = d50 ? ((k50 + a50) / d50).toFixed(2) : null;
      const avgDur = recent.length ? Math.round(recent.reduce((a, x) => a + x.match_duration_s, 0) / recent.length) : null;

      let streak = 0;
      let streakType = "";
      for (let i = 0; i < hist.length; i++) {
        const o = hist[i].player_match_outcome;
        if (o !== 1 && o !== 2) continue;
        streakType = o === 1 ? "w" : "l";
        streak = 1;
        for (let j = i + 1; j < hist.length; j++) {
          if (hist[j].player_match_outcome !== o) break;
          streak++;
        }
        break;
      }

      const deltas = hist
        .slice(0, 50)
        .slice()
        .reverse()
        .filter((x) => x.ranked_delta != null)
        .map((x) => x.ranked_delta as number);
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
        matchId: m.match_id,
        heroId: m.hero_id,
        date: new Date(m.start_time * 1000).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
        outcome: m.player_match_outcome === 1 ? "w" : m.player_match_outcome === 2 ? "l" : "u",
        kda: `${m.player_kills}/${m.player_deaths}/${m.player_assists}`,
        souls: m.net_worth,
        duration: dur(m.match_duration_s),
        delta: m.ranked_delta ?? null,
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
      heroId: h.hero_id,
      matches: h.matches_played,
      wr: h.matches_played ? Math.round((h.wins / h.matches_played) * 100) : 0,
      soulsPerMin: Math.round(h.networth_per_min ?? 0),
    }));

    const qualified = heroAgg.filter((h) => h.matches >= 5);
    const fav = heroAgg.slice().sort((a, b) => b.matches - a.matches).slice(0, 5);
    const best = (qualified.length ? qualified : heroAgg).slice().sort((a, b) => b.wr - a.wr).slice(0, 5);

    const out = {
      accountId,
      tiles,
      rankMovement,
      historyRows,
      favHeroes: fav,
      bestHeroes: best,
      heroesWithStats: heroAgg.length,
      generatedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, out, CACHE_TTL);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Сеть недоступна";
    const friendly = /429/.test(msg)
      ? "Слишком много запросов к API — подожди минуту и попробуй снова"
      : /5\d\d/.test(msg) || /timeout|abort/i.test(msg)
        ? "API не ответил за отведённое время — попробуй ещё раз через минуту"
        : msg;
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
