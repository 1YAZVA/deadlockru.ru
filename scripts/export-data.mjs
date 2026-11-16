/**
 * Экспорт статических данных для GitHub Pages-версии сайта.
 *
 * Что делает:
 *  1) генерирует public/api/*.json с ТОЧНО теми же фигурами ответов, что и серверные
 *     роуты (клиентский код сайта ничего не знает о разнице);
 *  2) зеркалирует внешние картинки (иконки героев/предметов, аватарки Steam,
 *     изображения патчей, ранги) в public/img-mirror/<hash>.<ext> и переписывает
 *     ссылки в JSON на локальные пути — посетителю не нужен доступ к чужим CDN;
 *  3) кэш скачиваний хранится в .img-mirror/ (в Actions кэшируется между запусками).
 *
 * Запуск: DATABASE_URL="file:<абсолютный путь>/db/custom.db" node scripts/export-data.mjs
 * Опции:  MIRROR=0 — не зеркалировать картинки.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

process.env.DATABASE_URL ??= "file:" + path.resolve("db/custom.db");
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ log: ["error"] });

const ROOT = process.cwd();
const PUB_API = path.join(ROOT, "public", "api");
const PUB_IMG = path.join(ROOT, "public", "img-mirror");
const CACHE_IMG = path.join(ROOT, ".img-mirror");
const MIRROR = process.env.MIRROR !== "0";
const UA = "DeadlockRU-export/1.0";

const REGIONS = ["Europe", "NAmerica", "SAmerica", "Asia", "Oceania"];
const LB_REGIONS = ["Global", ...REGIONS];

const API_DEADLOCK = "https://api.deadlock-api.com/v1";

// ---------- общие утилиты (копия логики из src, чтобы фигуры ответов совпадали 1:1) ----------

const composeDescription = (d) => {
  try {
    const o = JSON.parse(d);
    if (o && typeof o === "object") {
      const lore = typeof o.lore === "string" ? o.lore : "";
      const text = [typeof o.role === "string" ? o.role : "", typeof o.playstyle === "string" ? o.playstyle : ""]
        .filter(Boolean)
        .join(". ");
      return { text: text || lore, lore };
    }
  } catch {
    /* обычная строка */
  }
  return { text: d, lore: "" };
};

const isRealRu = (s) => Boolean(s) && !/[a-z]_[a-z]/.test(s);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scrub(text, heroNameRu, heroName) {
  let s = text.replace(/\{s:hero_name\}/g, "герой");
  for (const nm of [heroNameRu, heroName]) {
    if (!nm) continue;
    s = s.replace(new RegExp(escapeRe(nm), "gi"), "герой");
  }
  return s;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickOptions(correct, pool) {
  const others = shuffle(pool.filter((o) => o.id !== correct.id)).slice(0, 3);
  return shuffle([correct, ...others]);
}

async function fetchJson(url, timeoutMs = 20_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function writeJson(rel, data) {
  const file = path.join(PUB_API, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  const kb = Math.round((await (await import("node:fs/promises")).stat(file)).size / 1024);
  console.log(`  ✓ ${rel} (${kb} KB)`);
}

// ---------- активные матчи (для state.json и live.json) ----------

async function getActiveMatches(limit) {
  try {
    const raw = await fetchJson(`${API_DEADLOCK}/matches/active`, 20_000);
    const now = Date.now() / 1000;
    const matches = raw.slice(0, limit).map((m) => ({
      id: m.match_id,
      min: Math.max(0, Math.round((now - m.start_time) / 60)),
      a: m.players.filter((p) => p.team === 0).map((p) => p.hero_id),
      b: m.players.filter((p) => p.team === 1).map((p) => p.hero_id),
    }));
    return { count: raw.length, matches };
  } catch (e) {
    console.warn(`  ! активные матчи недоступны: ${e.message}`);
    return { count: 0, matches: [] };
  }
}

// ---------- аватарки Steam (порт src/lib/steam-avatar.ts без лимита «страницы») ----------

const STEAMID64_BASE = 76_561_197_960_265_728n;
const TTL_OK_MS = 14 * 24 * 3600_000;
const TTL_MISS_MS = 3 * 24 * 3600_000;
const FETCH_TIMEOUT_MS = 8_000;
/** бюджет XML-запросов за один запуск экспорта (кэш копится между запусками Actions) */
const AVATAR_BUDGET = Number(process.env.AVATAR_BUDGET ?? 400);

function extractAvatar(xml) {
  const m =
    xml.match(/<avatarMedium>\s*<!\[CDATA\[([^\]]+)\]\]>/i) ?? xml.match(/<avatarMedium>([^<]+)<\/avatarMedium>/i);
  const url = m ? m[1].trim() : "";
  if (url.includes("fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb")) return "";
  return url;
}

async function fetchProfileAvatar(accountId) {
  const url = `https://steamcommunity.com/profiles/${String(STEAMID64_BASE + BigInt(accountId))}?xml=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
    });
    if (!res.ok) return "";
    return extractAvatar(await res.text());
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAvatarsForRows(rows) {
  const result = new Map();
  const entries = rows.map((e) => {
    let ids = [];
    try {
      ids = JSON.parse(e.accountIdsJson || "[]");
    } catch {
      ids = [];
    }
    return { key: `${e.region}-${e.rank}`, ids };
  });
  const allIds = [...new Set(entries.flatMap((p) => p.ids))];
  const cached = allIds.length ? await db.playerAvatar.findMany({ where: { accountId: { in: allIds } } }) : [];
  const fresh = new Map();
  const now = Date.now();
  for (const c of cached) {
    const ttl = c.avatarUrl ? TTL_OK_MS : TTL_MISS_MS;
    if (now - new Date(c.fetchedAt).getTime() < ttl) fresh.set(c.accountId, c.avatarUrl);
  }

  let budget = AVATAR_BUDGET;
  const queue = [];
  for (const p of entries) {
    const hit = p.ids.find((id) => (fresh.get(id) ?? "") !== "");
    if (hit !== undefined) {
      result.set(p.key, fresh.get(hit));
      continue;
    }
    queue.push(p);
  }
  console.log(`  аватарки: ${entries.length - queue.length} из кэша, в очереди ${queue.length}, бюджет ${budget}`);

  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length && budget > 0) {
      const p = queue.shift();
      const candidates = p.ids.filter((id) => !fresh.has(id)).slice(0, 3);
      for (const id of candidates) {
        if (budget <= 0) return;
        budget--;
        const url = await fetchProfileAvatar(id);
        await db.playerAvatar.upsert({
          where: { accountId: id },
          create: { accountId: id, avatarUrl: url },
          update: { avatarUrl: url },
        });
        if (url) {
          result.set(p.key, url);
          break;
        }
      }
    }
  });
  await Promise.all(workers);
  return result;
}

// ---------- генераторы (реплики роутов) ----------

async function genHeroes() {
  const heroes = await db.hero.findMany({
    where: { playerSelectable: true, disabled: false, inDevelopment: false },
    orderBy: { name: "asc" },
  });
  const stats = await db.heroStat.findMany();
  const extras = await db.heroExtra.findMany({ select: { heroId: true, topItemsJson: true, countersJson: true } });
  const statMap = new Map(stats.map((s) => [s.heroId, s]));
  const extraSet = new Set(extras.map((e) => e.heroId));
  return {
    heroes: heroes.map((h) => {
      const { text, lore } = composeDescription(h.description);
      const tagsRu = JSON.parse(h.tagsRuJson || "[]");
      const tags = JSON.parse(h.tagsJson || "[]");
      return {
        id: h.id, name: h.name, nameRu: h.nameRu, className: h.className,
        description: h.descriptionRu || text, descriptionEn: text, lore,
        heroRole: h.heroRole,
        tags: tagsRu.length ? tagsRu : tags,
        heroType: h.heroType, complexity: h.complexity,
        colorHex: h.colorHex, iconCard: h.iconCard, iconSmall: h.iconSmall,
        startingStats: JSON.parse(h.startingStats || "{}"),
        levelInfo: JSON.parse(h.levelInfo || "{}"),
        stat: statMap.get(h.id) ?? null,
        hasExtras: extraSet.has(h.id),
      };
    }),
  };
}

async function genHeroDetail(heroId) {
  const hero = await db.hero.findUnique({ where: { id: heroId } });
  if (!hero) return null;
  const [stat, history, extra] = await Promise.all([
    db.heroStat.findUnique({ where: { heroId } }),
    db.heroStatHistory.findMany({ where: { heroId }, orderBy: { at: "asc" }, take: 200 }),
    db.heroExtra.findUnique({ where: { heroId } }),
  ]);
  const { text: descText, lore } = composeDescription(hero.description);
  const tagsRu = JSON.parse(hero.tagsRuJson || "[]");
  const tags = JSON.parse(hero.tagsJson || "[]");
  const abilitiesRaw = extra
    ? JSON.parse(extra.abilitiesJson || "[]")
    : [];
  const abilityIds = abilitiesRaw.map((a) => a.id).filter(Boolean);
  const ruAbilities = abilityIds.length
    ? await db.item.findMany({ where: { id: { in: abilityIds }, type: "ability" }, select: { id: true, nameRu: true, descriptionRu: true } })
    : [];
  const ruById = new Map(ruAbilities.map((i) => [i.id, i]));
  const abilitiesRu = abilitiesRaw.map((a) => {
    const ru = ruById.get(a.id ?? "");
    return {
      ...a,
      nameRu: isRealRu(ru?.nameRu) ? ru.nameRu : undefined,
      descriptionRu: ru?.descriptionRu || undefined,
    };
  });
  return {
    hero: {
      id: hero.id, name: hero.name, nameRu: hero.nameRu, className: hero.className,
      description: hero.descriptionRu || descText, descriptionEn: descText, lore,
      heroRole: hero.heroRole,
      tags: tagsRu.length ? tagsRu : tags,
      heroType: hero.heroType, complexity: hero.complexity,
      colorHex: hero.colorHex, iconCard: hero.iconCard, iconSmall: hero.iconSmall,
      startingStats: JSON.parse(hero.startingStats || "{}"),
      levelInfo: JSON.parse(hero.levelInfo || "{}"),
    },
    stat,
    history: history.map((h) => ({ winRate: h.winRate, pickRate: h.pickRate, matches: h.matches, at: h.at })),
    extra: extra
      ? {
          topItems: JSON.parse(extra.topItemsJson || "[]"),
          counters: JSON.parse(extra.countersJson || "[]"),
          builds: JSON.parse(extra.buildsJson || "[]"),
          abilities: abilitiesRu,
          updatedAt: extra.updatedAt,
        }
      : null,
  };
}

async function genItems() {
  const items = await db.item.findMany({
    where: { shopable: true, disabled: false },
    orderBy: [{ tier: "asc" }, { cost: "asc" }, { name: "asc" }],
  });
  const stats = await db.itemStat.findMany();
  const statMap = new Map(stats.map((s) => [s.itemId, s]));
  return {
    items: items.map((i) => ({
      id: i.id, name: i.name, nameRu: i.nameRu, className: i.className,
      type: i.type, slotType: i.slotType, tier: i.tier, cost: i.cost,
      description: i.descriptionRu || i.description, descriptionEn: i.description,
      shopImage: i.shopImage, image: i.image, isActive: i.isActive,
      components: JSON.parse(i.componentsJson || "[]"),
      props: (JSON.parse(i.propsRuJson || "[]")).length
        ? JSON.parse(i.propsRuJson || "[]")
        : JSON.parse(i.propsJson || "[]"),
      stat: statMap.get(i.id) ?? null,
    })),
  };
}

async function genMeta() {
  const [stats, heroes, badgeDist, rankTiers] = await Promise.all([
    db.heroStat.findMany(),
    db.hero.findMany({ where: { playerSelectable: true, disabled: false, inDevelopment: false } }),
    db.badgeDist.findMany({ orderBy: { badge: "asc" } }),
    db.rankTier.findMany({ orderBy: { id: "asc" } }),
  ]);
  const heroMap = new Map(heroes.map((h) => [h.id, h]));
  const rows = stats
    .filter((s) => heroMap.has(s.heroId))
    .map((s) => {
      const h = heroMap.get(s.heroId);
      return {
        heroId: s.heroId, name: h.name, colorHex: h.colorHex, iconCard: h.iconCard,
        heroType: h.heroType, complexity: h.complexity,
        winRate: s.winRate, pickRate: s.pickRate, matches: s.matches, kda: s.kda,
        avgNetWorth: s.avgNetWorth, kills: s.kills, deaths: s.deaths, assists: s.assists,
        playerDamage: s.playerDamage, damageTaken: s.damageTaken, lastHits: s.lastHits, netWorth: s.netWorth,
        updatedAt: s.updatedAt,
      };
    });
  return {
    rows,
    totalMatches: Math.round(rows.reduce((a, r) => a + r.matches, 0) / 12),
    badgeDist,
    rankTiers,
    updatedAt: rows[0]?.updatedAt ?? null,
  };
}

async function genMetaHistory(hours) {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db.heroStatHistory.findMany({
    where: { at: { gte: since } },
    orderBy: { at: "asc" },
    select: { heroId: true, winRate: true, pickRate: true, matches: true, at: true },
  });
  const stamps = [...new Set(rows.map((r) => r.at.toISOString()))].sort();
  return {
    stamps,
    points: rows.map((r) => ({ heroId: r.heroId, winRate: r.winRate, pickRate: r.pickRate, matches: r.matches, at: r.at })),
  };
}

async function onlineSnapshot(take) {
  const [online, history, states] = await Promise.all([
    db.onlinePoint.findFirst({ orderBy: { at: "desc" } }),
    db.onlinePoint.findMany({ orderBy: { at: "asc" }, take }),
    db.syncState.findMany({ where: { key: { in: ["online_live", "online_peak"] } } }),
  ]);
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const peakRaw = Number(stateByKey.get("online_peak")?.value);
  const liveRaw = Number(stateByKey.get("online_live")?.value);
  const peak24 = Number.isFinite(peakRaw) ? peakRaw : null;
  let onlineOut = online ? { count: online.count, at: online.at, peak: peak24 } : null;
  if (!onlineOut && Number.isFinite(liveRaw) && liveRaw > 0) {
    onlineOut = { count: liveRaw, at: stateByKey.get("online_live")?.updatedAt ?? new Date(), peak: peak24 };
  }
  return { onlineOut, history: history.map((p) => ({ count: p.count, at: p.at })) };
}

async function syncMap() {
  const last = await db.syncState.findMany();
  const map = {};
  for (const s of last) {
    if (s.key.startsWith("last_")) {
      try {
        map[s.key.slice(5)] = JSON.parse(s.value);
      } catch {
        map[s.key.slice(5)] = null;
      }
    }
  }
  return map;
}

async function genState(active) {
  const [heroCount, itemCount, patchCount, lbCount, tournamentCount, snap, latest, topMeta, sync] = await Promise.all([
    db.hero.count({ where: { playerSelectable: true, disabled: false, inDevelopment: false } }),
    db.item.count({ where: { shopable: true } }),
    db.patch.count(),
    db.leaderboardEntry.count(),
    db.tournament.count(),
    onlineSnapshot(4400),
    db.patch.findFirst({ orderBy: { pubDate: "desc" }, select: { id: true, title: true, titleRu: true, pubDate: true, source: true, isPatch: true } }),
    db.heroStat.findMany({ orderBy: { winRate: "desc" }, take: 8, select: { heroId: true, winRate: true, pickRate: true, matches: true } }),
    syncMap(),
  ]);
  return {
    counts: { heroes: heroCount, items: itemCount, patches: patchCount, leaderboardPlayers: lbCount, tournaments: tournamentCount, activeMatches: active.count },
    online: snap.onlineOut,
    onlineHistory: snap.history,
    latestPatch: latest ? { ...latest, title: latest.titleRu || latest.title } : null,
    topMeta,
    sync,
    activeMatches: active.matches,
  };
}

async function genLive(active) {
  const snap = await onlineSnapshot(300);
  return { active, online: snap.onlineOut, onlineHistory: snap.history };
}

async function genEsports() {
  const [tournaments, teams, matches] = await Promise.all([
    db.tournament.findMany({ orderBy: { sortOrder: "asc" } }),
    db.esportsTeam.findMany({ orderBy: { name: "asc" } }),
    db.esportsMatch.findMany({ orderBy: { scheduledAt: "asc" } }),
  ]);
  return { tournaments, teams, matches };
}

async function genPatches() {
  const patches = await db.patch.findMany({
    orderBy: { pubDate: "desc" },
    select: {
      id: true, title: true, titleRu: true, pubDate: true, source: true, link: true,
      category: true, author: true, content: true, contentRu: true, imageUrl: true, isPatch: true,
    },
  });
  return { total: patches.length, items: patches };
}

async function genLeaderboard(region) {
  const where = region === "Global" ? {} : { region };
  const [all, regionCountsRaw] = await Promise.all([
    db.leaderboardEntry.findMany({ where, orderBy: { rank: "asc" } }),
    db.leaderboardEntry.groupBy({ by: ["region"], _count: { _all: true } }),
  ]);
  // сортировка как на сервере: Global — по rank, затем по алфавиту региона
  const sorted =
    region === "Global"
      ? [...all].sort((a, b) => a.rank - b.rank || a.region.localeCompare(b.region))
      : all;
  const heroAgg = new Map();
  for (const e of all) {
    let ids = [];
    try {
      ids = JSON.parse(e.topHeroIdsJson || "[]");
    } catch {
      ids = [];
    }
    for (const id of ids) heroAgg.set(id, (heroAgg.get(id) ?? 0) + 1);
  }
  const topHeroes = [...heroAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([heroId, count]) => ({ heroId, count }));
  const updatedAt = all.reduce((acc, e) => (!acc || e.updatedAt > acc ? e.updatedAt : acc), null);
  const avatarMap = await resolveAvatarsForRows(all);
  const rows = sorted.map((e) => {
    let ids = [];
    try {
      ids = JSON.parse(e.accountIdsJson || "[]");
    } catch {
      ids = [];
    }
    const avatar = avatarMap.get(`${e.region}-${e.rank}`) ?? "";
    const profileId = ids[0] ? String(76_561_197_960_265_728 + ids[0]) : "";
    return {
      region: e.region,
      rank: e.rank,
      accountName: e.accountName,
      topHeroIds: JSON.parse(e.topHeroIdsJson || "[]"),
      avatar,
      profileUrl: profileId ? `https://steamcommunity.com/profiles/${profileId}` : "",
      updatedAt: e.updatedAt,
    };
  });
  return {
    rows,
    total: rows.length,
    regionCounts: Object.fromEntries(regionCountsRaw.map((r) => [r.region, r._count._all])),
    topHeroes,
    updatedAt,
  };
}

const ABILITY_TYPE_RU = { signature: "особая", ultimate: "ультимейт", passive: "пассивная" };

async function genQuiz() {
  const heroes = await db.hero.findMany({ select: { id: true, name: true, nameRu: true, colorHex: true, iconCard: true, iconSmall: true } });
  const extras = await db.heroExtra.findMany({ select: { heroId: true, abilitiesJson: true } });
  const optionPool = heroes
    .filter((h) => h.iconCard || h.iconSmall)
    .map((h) => ({ id: h.id, name: h.name, nameRu: h.nameRu ?? undefined, icon: h.iconSmall || h.iconCard, color: h.colorHex }));

  const abilityIds = new Set();
  const abilByHero = new Map();
  for (const ex of extras) {
    let list = [];
    try {
      list = JSON.parse(ex.abilitiesJson || "[]");
    } catch {
      continue;
    }
    abilByHero.set(ex.heroId, list);
    for (const a of list) if (a.id) abilityIds.add(a.id);
  }
  const ruRows = abilityIds.size
    ? await db.item.findMany({ where: { id: { in: [...abilityIds] }, type: "ability" }, select: { id: true, nameRu: true, descriptionRu: true } })
    : [];
  const ruById = new Map(ruRows.map((r) => [r.id, r]));
  const heroById = new Map(heroes.map((h) => [h.id, h]));
  const abilityQs = [];
  for (const [heroId, list] of abilByHero) {
    const hero = heroById.get(heroId);
    if (!hero || !hero.nameRu) continue;
    const correct = { id: hero.id, name: hero.name, nameRu: hero.nameRu ?? undefined, icon: hero.iconSmall || hero.iconCard, color: hero.colorHex };
    if (!correct.icon) continue;
    for (const a of list) {
      if (!["signature", "ultimate", "passive"].includes(a.abilityType)) continue;
      const ru = a.id ? ruById.get(a.id) : undefined;
      const desc = ru?.descriptionRu || "";
      if (desc.length < 30) continue;
      const nameRu = isRealRu(ru?.nameRu) ? ru.nameRu : undefined;
      abilityQs.push({
        kind: a.abilityType === "ultimate" ? "ultimate" : "ability",
        prompt: "Чья эта способность?",
        ability: { name: nameRu || a.name, typeRu: ABILITY_TYPE_RU[a.abilityType] ?? a.abilityType, descHtml: scrub(desc, hero.nameRu, hero.name), image: a.image },
        options: pickOptions(correct, optionPool),
        answerId: hero.id,
      });
    }
  }
  const iconQs = shuffle(optionPool).map((o) => ({
    kind: "icon",
    prompt: "Кто этот герой?",
    heroIcon: o.icon,
    options: pickOptions(o, optionPool),
    answerId: o.id,
  }));
  // отдаём весь банк — клиент сам выбирает 12 случайных вопросов на партию
  const questions = shuffle([...abilityQs, ...iconQs]);
  return { bank: { abilities: abilityQs.length, heroes: optionPool.length }, questions };
}

// ---------- зеркалирование картинок ----------

const EXT_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/gif": "gif",
  "image/avif": "avif",
};

async function downloadImage(url) {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 20);
  // ищем в кэше
  for (const ext of Object.values(EXT_BY_TYPE)) {
    const cached = path.join(CACHE_IMG, `${hash}.${ext}`);
    if (existsSync(cached)) return { file: cached, ext };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = EXT_BY_TYPE[type];
    if (!ext) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    await mkdir(CACHE_IMG, { recursive: true });
    const file = path.join(CACHE_IMG, `${hash}.${ext}`);
    await writeFile(file, buf);
    return { file, ext };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mirrorImages() {
  const fs = await import("node:fs/promises");

  // собираем все JSON-файлы рекурсивно
  const jsonFiles = [];
  const walk = async (dir) => {
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of list) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.name.endsWith(".json")) jsonFiles.push(full);
    }
  };
  await walk(PUB_API);

  // уникальные https-URL из всех JSON (+ список файлов, где встречается каждый)
  const urls = new Map(); // url -> Set<file>
  for (const f of jsonFiles) {
    const text = await readFile(f, "utf8");
    const re = /https:\/\/[^"\\<> ]+/g;
    for (const url of text.match(re) ?? []) {
      if (/steamcommunity\.com\/profiles/.test(url)) continue;
      if (/api\.deadlock-api\.com|api\.steampowered\.com|functions\.yandexcloud|apigw\.yandexcloud/.test(url)) continue;
      if (!urls.has(url)) urls.set(url, new Set());
      urls.get(url).add(f);
    }
  }
  console.log(`зеркалирование: уникальных URL-кандидатов ${urls.size}`);
  let ok = 0, fail = 0;
  const list = [...urls.keys()];
  const queue = [...list];
  const concurrency = 10;
  await fs.mkdir(PUB_IMG, { recursive: true });

  // фаза 1: скачивание всех картинок (в кэш и в public/img-mirror)
  const urlToLocal = new Map(); // url -> локальный путь
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const url = queue.shift();
        const res = await downloadImage(url);
        if (!res) {
          fail++;
          continue;
        }
        ok++;
        // копия в public — именно она уедет в билд сайта
        await fs.copyFile(res.file, path.join(PUB_IMG, path.basename(res.file)));
        urlToLocal.set(url, `/img-mirror/${path.basename(res.file)}`);
      }
    })
  );

  // фаза 2: однопоточное переписывание JSON — без гонок записей.
  // Игла — голый URL без кавычек: внутри HTML-строк URL окружён экранированными
  // кавычками (\"url\"), и паттерн с кавычками там не совпадает.
  // Сортировка по убыванию длины — чтобы короткий URL не подменил кусок длинного.
  const ordered = [...urlToLocal.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const f of jsonFiles) {
    const original = await readFile(f, "utf8");
    let text = original;
    for (const [url, local] of ordered) {
      if (text.includes(url)) text = text.split(url).join(local);
    }
    if (text !== original) await writeFile(f, text);
  }
  console.log(`зеркалирование: скачано ${ok}, пропущено ${fail} (не картинки/ошибки — остаются прямыми ссылками)`);
}

// ---------- основная функция ----------

async function main() {
  await mkdir(PUB_API, { recursive: true });
  console.log("1) генерация JSON…");

  const heroes = await genHeroes();
  await writeJson("heroes.json", heroes);
  const details = [];
  for (const h of heroes.heroes) {
    const d = await genHeroDetail(h.id);
    if (d) await writeJson(`hero/${h.id}.json`, d);
    details.push(h.id);
  }
  await writeJson("items.json", await genItems());
  await writeJson("meta.json", await genMeta());
  await writeJson("meta-history-168.json", await genMetaHistory(168));
  await writeJson("meta-history-336.json", await genMetaHistory(336));
  await writeJson("esports.json", await genEsports());
  await writeJson("patches.json", await genPatches());
  await writeJson("quiz.json", await genQuiz());

  console.log("2) активные матчи…");
  const active = await getActiveMatches(60);
  await writeJson("live.json", await genLive(active));
  await writeJson("state.json", await genState({ count: active.count, matches: active.matches.slice(0, 40) }));

  console.log("3) лидерборд (6 регионов, с аватарками)…");
  for (const r of LB_REGIONS) {
    await writeJson(`leaderboard/${r}.json`, await genLeaderboard(r));
  }

  if (MIRROR) {
    console.log("4) зеркалирование картинок…");
    await mirrorImages();
  } else {
    console.log("4) зеркалирование пропущено (MIRROR=0)");
  }

  await db.$disconnect();
  console.log("готово.");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
