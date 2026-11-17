/**
 * DeadlockRU — живой моторчик для статической версии сайта (GitHub Pages).
 *
 * Сервис: Yandex Cloud Functions, runtime Node.js 20/22, entrypoint: index.handler
 * Эндпоинты:
 *   GET /api/player?phase=resolve&input=... | &account_id=...
 *   GET /api/player?phase=stats&account_id=...
 *   GET /api/search?q=...
 *   GET /health
 *
 * Почему функция: браузер посетителя из РФ не всегда дозванивается до
 * api.deadlock-api.com / steamcommunity.com, а Яндекс.Облако — дозванивается
 * всегда. Функция делает все внешние запросы на своей стороне и отдаёт сайту
 * готовый JSON с CORS. Кэш 10 минут в памяти экземпляра.
 *
 * Код — точный порт src/app/api/player/route.ts и /api/search (без Next.js).
 */

const API = "https://api.deadlock-api.com/v1";
const STEAM64_BASE = 76561197960265728n;
const UA = "DeadlockRU-portal/1.0 (player stats)";
const CACHE_TTL = 10 * 60_000;

// ---------- кэш в памяти экземпляра ----------

const cache = new Map(); // key -> { at, body }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheSet(key, body) {
  cache.set(key, { at: Date.now(), body });
  // грубая защита от разрастания: старейшие записи выкидываем
  while (cache.size > 600) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

// ---------- утилиты (порт route.ts) ----------

async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseSteamInput(raw) {
  const s = String(raw).trim();
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

async function resolveVanity(vanity) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`, {
      signal: ctrl.signal,
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

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

// ---------- phase=resolve ----------

async function handleResolve(sp) {
  const input = (sp.get("input") ?? "").trim();
  const directId = Number(sp.get("account_id"));
  const parsed = parseSteamInput(input);
  if ((!input || !parsed) && !(Number.isFinite(directId) && directId > 0)) {
    return { status: 400, body: { error: "Введи Steam ID, ссылку на профиль или никнейм." } };
  }

  let accountId = parsed?.accountId;
  if (accountId == null && Number.isFinite(directId) && directId > 0) accountId = directId;
  let resolvedBy = "id";

  if (accountId == null && parsed?.nick) {
    const vanity = parsed.nick;
    const viaVanity = await resolveVanity(vanity);
    if (viaVanity != null) {
      accountId = viaVanity;
      resolvedBy = "vanity";
    } else {
      const found = await fetchJson(
        `${API}/players/steam-search?search_query=${encodeURIComponent(vanity)}&limit=8`,
        25000
      );
      return {
        status: 200,
        body: {
          mode: "candidates",
          candidates: (found || []).map((p) => ({
            account_id: p.account_id,
            personaname: p.personaname,
            avatarmedium: p.avatarmedium,
            matches_played_last_30d: p.matches_played_last_30d ?? 0,
          })),
          query: vanity,
          plural: plural(found.length, "игрок", "игрока", "игроков"),
        },
      };
    }
  }

  if (accountId == null) {
    return { status: 400, body: { error: "Не удалось разобрать ввод." } };
  }

  const cacheKey = `player:resolve:${accountId}`;
  const hit = cacheGet(cacheKey);
  if (hit) return { status: 200, body: hit };

  const [profRes, rankRes] = await Promise.allSettled([
    fetchJson(`${API}/players/steam?account_ids=${accountId}`),
    fetchJson(`${API}/players/${accountId}/rank`),
  ]);
  const profArr = profRes.status === "fulfilled" ? profRes.value : null;
  const profile = Array.isArray(profArr)
    ? profArr.find((p) => p.account_id === accountId) ?? profArr[0] ?? null
    : null;
  let rank = null;
  if (rankRes.status === "fulfilled" && typeof rankRes.value?.badge === "number") {
    rank = { tier: rankRes.value.tier ?? 0, subrank: rankRes.value.subrank ?? 0, badge: rankRes.value.badge };
  }

  const out = { accountId, profile, rank, resolvedBy };
  cacheSet(cacheKey, out);
  return { status: 200, body: out };
}

// ---------- phase=stats ----------

async function handleStats(sp) {
  const accountId = Number(sp.get("account_id"));
  if (!Number.isFinite(accountId) || accountId <= 0) {
    return { status: 400, body: { error: "Некорректный account_id" } };
  }
  const cacheKey = `player:stats:${accountId}`;
  const hit = cacheGet(cacheKey);
  if (hit) return { status: 200, body: hit };

  const [histRes, hsRes] = await Promise.allSettled([
    fetchJson(`${API}/players/${accountId}/match-history`, 40000),
    fetchJson(`${API}/players/hero-stats?account_ids=${accountId}`, 40000),
  ]);

  const hist = histRes.status === "fulfilled" && Array.isArray(histRes.value) ? histRes.value : null;
  const hs = hsRes.status === "fulfilled" && Array.isArray(hsRes.value) ? hsRes.value : null;

  if (!hist && !hs) {
    return {
      status: 404,
      body: { error: "Аккаунт есть, но матчей Deadlock в открытой базе нет — игрок скрыл статистику или ещё не играл." },
    };
  }

  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const dur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

  let tiles = [];
  let rankMovement = [];
  let historyRows = [];

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
      .map((x) => x.ranked_delta);
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
  cacheSet(cacheKey, out);
  return { status: 200, body: out };
}

// ---------- /api/search (поиск по нику Steam) ----------

async function handleSearch(sp) {
  const q = (sp.get("q") ?? "").trim();
  if (q.length < 2) return { status: 200, body: { results: [] } };

  const cacheKey = `steam_search_${q.toLowerCase()}`;
  const hit = cacheGet(cacheKey);
  if (hit) return { status: 200, body: hit };

  try {
    const url = `${API}/players/steam-search?search_query=${encodeURIComponent(q)}&limit=20`;
    const results = await fetchJson(url);
    const out = {
      results: (results || []).map((r) => ({
        account_id: r.account_id,
        personaname: r.personaname,
        profileurl: r.profileurl,
        avatar: r.avatarfull ?? r.avatar,
        realname: r.realname,
      })),
    };
    cacheSet(cacheKey, out);
    return { status: 200, body: out };
  } catch (e) {
    return { status: 200, body: { results: [], error: e instanceof Error ? e.message : "ошибка поиска" } };
  }
}

// ---------- HTTP-обёртка Yandex Cloud Functions ----------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60",
};

function respond(status, bodyObj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
    body: JSON.stringify(bodyObj),
    isBase64Encoded: false,
  };
}

async function friendly(handler) {
  try {
    return await handler();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Сеть недоступна";
    const nice = /429/.test(msg)
      ? "Слишком много запросов к API — подожди минуту и попробуй снова"
      : /5\d\d/.test(msg) || /timeout|abort/i.test(msg)
        ? "API не ответил за отведённое время — попробуй ещё раз через минуту"
        : msg;
    return respond(502, { error: nice });
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "", isBase64Encoded: false };
  }

  // Прямые вызовы functions.yandexcloud.net/<id> не поддерживают подпути:
  // путь передаём через query-параметр ?path=/api/player (или /api/search, /health).
  const qp = event.queryStringParameters || {};
  const rawPath = (event.url ? new URL(event.url).pathname : event.path) || "";
  const path = qp.path
    ? "/" + String(qp.path).replace(/^\/+/, "")
    : (rawPath || "/");
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(event.queryStringParameters || {})) {
    if (v != null && k !== "path") sp.set(k, String(v));
  }

  if (path === "/health" || path === "/") {
    return respond(200, { ok: true, service: "deadlockru-remote-api", at: new Date().toISOString() });
  }
  if (path.endsWith("/player")) {
    const phase = sp.get("phase") ?? "resolve";
    const res = await friendly(() => (phase === "stats" ? handleStats(sp) : handleResolve(sp)));
    return respond(res.status, res.body);
  }
  if (path.endsWith("/search")) {
    const res = await friendly(() => handleSearch(sp));
    return respond(res.status, res.body);
  }
  return respond(404, { error: "неизвестный путь — используй /api/player или /api/search" });
};
