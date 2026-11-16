/**
 * Deadlock//RU — движок синхронизации данных.
 * Все задачи тянут живые данные из открытых источников и складывают в SQLite.
 * Источники: api.deadlock-api.com (матчи, герои, предметы, лидерборды, ранги),
 *            Steam Store Charts + Steam Web API (онлайн), Steam RSS/форумы Valve (патчи).
 * Вызывается планировщиком (src/lib/scheduler.ts) и вручную через POST /api/sync.
 */
import { db } from "@/lib/db";

const API = "https://api.deadlock-api.com";
// ВАЖНО: Valve скрыла число игроков в GetNumberOfCurrentPlayers для Deadlock —
// эндпоинт отвечает {"response":{"result":42}} без player_count (баг «онлайн 42»).
// Поэтому живой «сейчас» берём с официальной страницы store.steampowered.com/charts/mostplayed
// (поле nConcurrentInGame — реальные одновременные игроки от Valve), пик за 24 ч —
// из ISteamChartsService/GetMostPlayedGames (peak_in_game), а классический Web API
// оставлен как запасной источник на случай, если Valve вернёт player_count.
const STEAM_COUNT_URL =
  "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1422450";
const STORE_CHARTS_URL = "https://store.steampowered.com/charts/mostplayed";
const STEAM_CHARTS_URL = "https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/";
const STEAM_APP_ID = 1422450;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export const REGIONS = ["Europe", "NAmerica", "SAmerica", "Asia", "Oceania"] as const;
export type Region = (typeof REGIONS)[number];

export const TASKS = [
  "catalog",
  "stats",
  "counters",
  "extras",
  "leaderboard",
  "patches",
  "online",
  "ranks",
  "esports-seed",
  "all",
] as const;
export type TaskName = (typeof TASKS)[number];

export const TASK_META: Record<Exclude<TaskName, "all">, { title: string; schedule: string; intervalMs: number; source: string }> = {
  catalog: { title: "Каталог героев и предметов", schedule: "раз в сутки", intervalMs: 24 * 3600_000, source: "deadlock-api.com /v1/assets" },
  stats: { title: "Винрейты героев и предметов", schedule: "раз в 2 часа", intervalMs: 2 * 3600_000, source: "deadlock-api.com /v1/analytics/hero-stats" },
  counters: { title: "Матрица контрпиков", schedule: "раз в 6 часов", intervalMs: 6 * 3600_000, source: "deadlock-api.com /v1/analytics/hero-counter-stats" },
  extras: { title: "Топ-предметы и автобилды героев", schedule: "раз в 6 часов", intervalMs: 6 * 3600_000, source: "deadlock-api.com /v1/analytics/item-stats" },
  leaderboard: { title: "Лидерборды 5 регионов", schedule: "раз в 30 минут", intervalMs: 30 * 60_000, source: "deadlock-api.com /v1/leaderboard" },
  patches: { title: "Патчи и новости Valve", schedule: "раз в час", intervalMs: 3600_000, source: "Steam RSS + playdeadlock.com" },
  online: { title: "Онлайн Steam (точки графика)", schedule: "раз в 10 минут", intervalMs: 10 * 60_000, source: "Steam Store Charts (nConcurrentInGame) + ISteamChartsService" },
  ranks: { title: "Ранги и распределение значков", schedule: "раз в сутки", intervalMs: 24 * 3600_000, source: "deadlock-api.com /v1/assets/ranks" },
  "esports-seed": { title: "Посев киберспортивных данных", schedule: "при пустой базе", intervalMs: 0, source: "collegedeadlock.com, Liquipedia" },
};

// ---------- утилиты ----------

async function fetchJson<T>(url: string, timeoutMs = 45_000, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "DeadlockRU-portal/1.0 (open data sync)" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function logRun(task: string, status: string, records: number, message: string, durationMs: number) {
  try {
    await db.syncLog.create({ data: { task, status, records, message: message.slice(0, 500), durationMs, at: new Date() } });
    await db.syncState.upsert({
      where: { key: `last_${task}` },
      create: { key: `last_${task}`, value: JSON.stringify({ status, records, message: message.slice(0, 300), durationMs, at: new Date().toISOString() }) },
      update: { value: JSON.stringify({ status, records, message: message.slice(0, 300), durationMs, at: new Date().toISOString() }) },
    });
  } catch {
    // лог не должен валить синк
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

const num = (v: unknown, d = 0): number => (typeof v === "number" && isFinite(v) ? v : d);

// ---------- задачи ----------

// 1. Каталог: герои + предметы (+ глобальная статистика предметов)
async function syncCatalog(): Promise<number> {
  let records = 0;

  type RawHero = {
    id: number; name: string; class_name: string; search_name?: string;
    description?: unknown; tags?: string[]; hero_type?: string | null;
    complexity?: number; colors?: { style_hex?: string };
    images?: Record<string, string>;
    starting_stats?: Record<string, unknown>; level_info?: Record<string, unknown>;
    player_selectable?: boolean; disabled?: boolean; in_development?: boolean;
  };
  const heroes = await fetchJson<RawHero[]>(`${API}/v1/assets/heroes`);
  // Официальная русская локализация того же API (?language=russian) —
  // сервер-сайд запрос, пользователю ничего заблокированного не отдаётся
  type RuHero = { id: number; name?: string; description?: unknown; tags?: string[] };
  const heroesRu = await fetchJson<RuHero[]>(`${API}/v1/assets/heroes?language=russian`, 45_000, 1).catch(() => [] as RuHero[]);
  const ruHeroMap = new Map(heroesRu.map((h) => [h.id, h]));
  /** из RU-описания достаём чистый лор-текст (объект или строка) */
  const ruLore = (d: unknown): string => {
    if (typeof d === "string") return d;
    if (d && typeof d === "object") {
      const o = d as { lore?: unknown; role?: unknown; playstyle?: unknown; desc?: unknown };
      if (typeof o.lore === "string") return o.lore;
      if (typeof o.desc === "string") return o.desc;
      const parts = [typeof o.role === "string" ? o.role : "", typeof o.playstyle === "string" ? o.playstyle : ""].filter(Boolean);
      if (parts.length) return parts.join(". ");
    }
    return "";
  };
  for (const h of heroes) {
    // description может быть строкой или объектом {lore, role, playstyle}
    const desc =
      typeof h.description === "string"
        ? h.description
        : JSON.stringify(h.description ?? {});
    const descObj = (typeof h.description === "object" && h.description) as
      | { lore?: string; role?: string; playstyle?: string }
      | null;
    // нормализуем starting_stats до простых чисел
    const stats: Record<string, number> = {};
    for (const [k, v] of Object.entries(h.starting_stats ?? {})) {
      const raw = (v as { value?: unknown })?.value;
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
      if (isFinite(n)) stats[k] = n;
    }
    const ru = ruHeroMap.get(h.id);
    const heroData = {
      name: h.name,
      className: h.class_name,
      searchName: h.search_name ?? "",
      description: desc,
      // RU-локализация: чистый лор на русском + русские теги и имя
      nameRu: typeof ru?.name === "string" && ru.name ? ru.name : "",
      descriptionRu: ru ? ruLore(ru.description) : "",
      tagsRuJson: JSON.stringify(Array.isArray(ru?.tags) ? ru.tags : []),
      heroRole: descObj?.role ?? "",
      tagsJson: JSON.stringify(h.tags ?? []),
      heroType: h.hero_type ?? "",
      complexity: num(h.complexity, 1),
      colorHex: h.colors?.style_hex ?? "#C8A96A",
      iconCard: h.images?.icon_hero_card ?? "",
      iconSmall: h.images?.icon_image_small ?? "",
      startingStats: JSON.stringify(stats),
      levelInfo: JSON.stringify(h.level_info ?? {}),
      playerSelectable: h.player_selectable ?? true,
      disabled: h.disabled ?? false,
      inDevelopment: h.in_development ?? false,
    };
    await db.hero.upsert({ where: { id: h.id }, create: { id: h.id, ...heroData }, update: heroData });
    records++;
  }

  type RawItem = {
    id: number; class_name: string; name: string; type: string;
    item_slot_type?: string | null; item_tier?: number | null; cost?: number | null;
    description?: unknown; image?: string; shop_image?: string;
    is_active_item?: boolean; shopable?: boolean; disabled?: boolean;
    heroes?: number[]; ability_type?: string | null;
    component_items?: string[];
    properties?: Record<string, { label?: string; value?: string; postfix?: string; css_class?: string }>;
  };
  const items = await fetchJson<RawItem[]>(`${API}/v1/assets/items`);
  // русская локализация предметов — из того же API
  type RuItem = { id: number; name?: string; description?: unknown; properties?: Record<string, { label?: string; value?: string; postfix?: string; css_class?: string }> };
  const itemsRu = await fetchJson<RuItem[]>(`${API}/v1/assets/items?language=russian`, 45_000, 1).catch(() => [] as RuItem[]);
  const ruItemMap = new Map(itemsRu.map((x) => [x.id, x]));
  const ruItemDesc = (d: unknown): string => {
    if (typeof d === "string") return d;
    if (d && typeof d === "object" && typeof (d as { desc?: unknown }).desc === "string") return (d as { desc: string }).desc;
    return "";
  };
  for (const i of items) {
    if (i.type !== "upgrade" && i.type !== "weapon" && i.type !== "ability") continue;
    // описание: строка или объект {desc: "<html>"}
    const itemDesc =
      typeof i.description === "string"
        ? i.description
        : i.description && typeof i.description === "object" && typeof (i.description as { desc?: unknown }).desc === "string"
          ? (i.description as { desc: string }).desc
          : "";
    // курируем свойства: только значимые (value != 0), максимум 8 штук
    const props: { label: string; value: string; postfix?: string; cssClass?: string }[] = [];
    for (const [, p] of Object.entries(i.properties ?? {})) {
      if (!p || typeof p !== "object") continue;
      const v = typeof p.value === "string" ? parseFloat(p.value) : NaN;
      if (!p.label || !isFinite(v) || v === 0) continue;
      props.push({ label: String(p.label), value: p.value ?? "", postfix: p.postfix, cssClass: p.css_class });
      if (props.length >= 8) break;
    }
    // те же свойства из русской локализации (совпадают по ключам)
    const ri = ruItemMap.get(i.id);
    const propsRu: { label: string; value: string; postfix?: string; cssClass?: string }[] = [];
    if (ri?.properties) {
      for (const [, p] of Object.entries(ri.properties)) {
        if (!p || typeof p !== "object") continue;
        const v = typeof p.value === "string" ? parseFloat(p.value) : NaN;
        if (!p.label || !isFinite(v) || v === 0) continue;
        propsRu.push({ label: String(p.label), value: p.value ?? "", postfix: p.postfix, cssClass: p.css_class });
        if (propsRu.length >= 8) break;
      }
    }
    const data = {
      className: i.class_name,
      name: i.name,
      nameRu: typeof ri?.name === "string" && ri.name ? ri.name : "",
      type: i.type,
      slotType: i.item_slot_type ?? "",
      tier: num(i.item_tier),
      cost: num(i.cost),
      description: itemDesc,
      descriptionRu: ri ? ruItemDesc(ri.description) : "",
      propsRuJson: JSON.stringify(propsRu),
      image: i.image ?? "",
      shopImage: i.shop_image ?? "",  // картинка из витрины магазина
      isActive: i.is_active_item ?? false,
      shopable: i.shopable ?? false,
      propsJson: JSON.stringify(props),
      componentsJson: JSON.stringify(i.component_items ?? []),
      heroesJson: JSON.stringify(i.heroes ?? []),
      abilityType: i.ability_type ?? "",
      disabled: i.disabled ?? false,
    };
    await db.item.upsert({ where: { id: String(i.id) }, create: { id: String(i.id), ...data }, update: data });
    records++;
  }
  return records;
}

// 2. Статистика: винрейты героев + глобальные винрейты предметов
async function syncStats(): Promise<number> {
  let records = 0;

  type HeroStatRow = {
    hero_id: number; bucket: number; wins: number; losses: number; matches: number;
    total_kills: number; total_deaths: number; total_assists: number; total_net_worth: number;
    total_player_damage: number; total_player_damage_taken: number; total_last_hits: number;
    total_denies: number;
  };
  const rows = await fetchJson<HeroStatRow[]>(`${API}/v1/analytics/hero-stats?min_matches=100`);
  const totalSlots = rows.reduce((s, r) => s + r.matches, 0);
  if (totalSlots === 0) throw new Error("hero-stats: пустой ответ");

  const now = new Date();
  const hourKey = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

  for (const r of rows) {
    const matches = Math.max(1, r.matches);
    const winRate = (r.wins / matches) * 100;
    const pickRate = (r.matches / (totalSlots / 12)) * 100; // ~12 героев-слотов на матч
    await db.heroStat.upsert({
      where: { heroId: r.hero_id },
      create: {
        heroId: r.hero_id,
        wins: r.wins, losses: r.losses, matches: r.matches,
        kills: r.total_kills, deaths: r.total_deaths, assists: r.total_assists,
        netWorth: r.total_net_worth, playerDamage: r.total_player_damage,
        damageTaken: r.total_player_damage_taken, lastHits: r.total_last_hits,
        winRate, pickRate, kda: (r.total_kills + r.total_assists) / Math.max(1, r.total_deaths),
        avgNetWorth: r.total_net_worth / matches,
        updatedAt: now,
      },
      update: {
        wins: r.wins, losses: r.losses, matches: r.matches,
        kills: r.total_kills, deaths: r.total_deaths, assists: r.total_assists,
        netWorth: r.total_net_worth, playerDamage: r.total_player_damage,
        damageTaken: r.total_player_damage_taken, lastHits: r.total_last_hits,
        winRate, pickRate, kda: (r.total_kills + r.total_assists) / Math.max(1, r.total_deaths),
        avgNetWorth: r.total_net_worth / matches,
        updatedAt: now,
      },
    });
    // снимок истории — один на час, для анализа патчей
    const existing = await db.heroStatHistory.findFirst({ where: { heroId: r.hero_id, at: hourKey } });
    if (!existing) {
      await db.heroStatHistory.create({ data: { heroId: r.hero_id, winRate, pickRate, matches: r.matches, at: hourKey } });
    }
    records++;
  }

  type ItemStatRow = { item_id: number; wins: number; matches: number; players: number; avg_buy_time_relative?: number };
  const itemRows = await fetchJson<ItemStatRow[]>(`${API}/v1/analytics/item-stats?min_matches=50`);
  for (const r of itemRows) {
    const itemId = String(r.item_id);
    const known = await db.item.findUnique({ where: { id: itemId } });
    if (!known) continue;
    await db.itemStat.upsert({
      where: { itemId },
      create: {
        itemId, wins: r.wins, matches: r.matches, players: r.players,
        winRate: (r.wins / Math.max(1, r.matches)) * 100, buyTimeRel: num(r.avg_buy_time_relative),
        updatedAt: now,
      },
      update: {
        wins: r.wins, matches: r.matches, players: r.players,
        winRate: (r.wins / Math.max(1, r.matches)) * 100, buyTimeRel: num(r.avg_buy_time_relative),
        updatedAt: now,
      },
    });
    records++;
  }
  return records;
}

// 3. Контрпики: полная матрица «герой против героя» одним запросом
async function syncCounters(): Promise<number> {
  type CounterRow = { hero_id: number; enemy_hero_id: number; wins: number; matches_played: number };
  const rows = await fetchJson<CounterRow[]>(`${API}/v1/analytics/hero-counter-stats?min_matches=100`);
  const byHero = new Map<number, CounterRow[]>();
  for (const r of rows) {
    if (!byHero.has(r.hero_id)) byHero.set(r.hero_id, []);
    byHero.get(r.hero_id)!.push(r);
  }
  let records = 0;
  for (const [heroId, list] of byHero) {
    const parsed = list.map((r) => ({
      enemyHeroId: r.enemy_hero_id,
      matches: r.matches_played,
      winRate: (r.wins / Math.max(1, r.matches_played)) * 100,
    }));
    const hardest = [...parsed].sort((a, b) => a.winRate - b.winRate).slice(0, 8);
    const easiest = [...parsed].sort((a, b) => b.winRate - a.winRate).slice(0, 8);
    await db.heroExtra.upsert({
      where: { heroId },
      create: { heroId, countersJson: JSON.stringify({ hardest, easiest }), updatedAt: new Date() },
      update: { countersJson: JSON.stringify({ hardest, easiest }), updatedAt: new Date() },
    });
    records++;
  }
  return records;
}

// 4. Топ-предметы и автобилды по каждому герою (65 запросов)
async function syncExtras(): Promise<number> {
  const heroes = await db.hero.findMany({
    where: { playerSelectable: true, disabled: false, inDevelopment: false },
    select: { id: true },
  });
  type ItemStatRow = { item_id: number; wins: number; matches: number; avg_buy_time_relative?: number };

  // способности берём из локального каталога (hero-привязка хранится в heroesJson)
  const abilities = await db.item.findMany({
    where: { type: "ability", disabled: false },
    select: { id: true, name: true, nameRu: true, image: true, className: true, description: true, descriptionRu: true, abilityType: true, heroesJson: true },
  });
  const abilityByHero = new Map<number, { id?: string; name: string; nameRu?: string; image: string; className: string; description: string; descriptionRu?: string; abilityType: string }[]>();
  for (const a of abilities) {
    let heroIds: number[] = [];
    try { heroIds = JSON.parse(a.heroesJson || "[]") as number[]; } catch { heroIds = []; }
    // nameRu вида "citadel_ability_..." — внутренний ключ, а не перевод
    const isRealRu = (s: string | null | undefined) => Boolean(s) && !/[a-z]_[a-z]/.test(s as string);
    for (const hid of heroIds) {
      if (!abilityByHero.has(hid)) abilityByHero.set(hid, []);
      abilityByHero.get(hid)!.push({
        id: a.id, name: a.name,
        nameRu: isRealRu(a.nameRu) ? a.nameRu : undefined,
        image: a.image, className: a.className, description: a.description,
        descriptionRu: a.descriptionRu || undefined,
        abilityType: a.abilityType, _len: heroIds.length,
      } as never);
    }
  }
  // сначала показываем уникальные способности героя, генеричные (типа зип-лайн) — в конце
  for (const [hid, list] of abilityByHero) {
    type A = { id?: string; name: string; nameRu?: string; image: string; className: string; description: string; descriptionRu?: string; abilityType: string; _len?: number };
    abilityByHero.set(hid, (list as unknown as A[]).sort((x, y) => (x._len ?? 99) - (y._len ?? 99)).slice(0, 14).map(({ _len, ...rest }) => rest));
  }

  let records = 0;
  await mapWithConcurrency(heroes, 6, async (h) => {
    try {
      const rows = await fetchJson<ItemStatRow[]>(
        `${API}/v1/analytics/item-stats?hero_id=${h.id}&min_matches=100`, 45_000, 1
      );
      const parsed = rows.map((r) => ({
        itemId: String(r.item_id),
        matches: r.matches,
        winRate: (r.wins / Math.max(1, r.matches)) * 100,
        buyTimeRel: num(r.avg_buy_time_relative),
      })).filter((p) => p.matches >= 200);

      const topItems = [...parsed].sort((a, b) => b.matches - a.matches).slice(0, 12);
      const byWin = [...parsed].sort((a, b) => b.winRate - a.winRate).slice(0, 12);
      const stage = (lo: number, hi: number) =>
        [...parsed].filter((p) => p.buyTimeRel >= lo && p.buyTimeRel < hi)
          .sort((a, b) => b.winRate - a.winRate).slice(0, 4);
      const builds = {
        early: stage(0, 0.26),
        mid: stage(0.26, 0.5),
        late: stage(0.5, 2),
        byWin,
      };
      await db.heroExtra.upsert({
        where: { heroId: h.id },
        create: {
          heroId: h.id,
          topItemsJson: JSON.stringify(topItems),
          buildsJson: JSON.stringify(builds),
          abilitiesJson: JSON.stringify(abilityByHero.get(h.id) ?? []),
          updatedAt: new Date(),
        },
        update: {
          topItemsJson: JSON.stringify(topItems),
          buildsJson: JSON.stringify(builds),
          abilitiesJson: JSON.stringify(abilityByHero.get(h.id) ?? []),
          updatedAt: new Date(),
        },
      });
      records++;
    } catch (e) {
      console.error(`extras hero ${h.id}:`, e instanceof Error ? e.message : e);
    }
  });
  return records;
}

// 5. Лидерборды пяти регионов
async function syncLeaderboard(): Promise<number> {
  let records = 0;
  type LbResponse = { entries?: { account_name: string; possible_account_ids?: number[]; rank: number; top_hero_ids?: number[] }[] };
  for (const region of REGIONS) {
    const data = await fetchJson<LbResponse>(`${API}/v1/leaderboard/${region}`, 45_000, 2);
    const entries = data.entries ?? [];
    const now = new Date();
    for (const e of entries) {
      await db.leaderboardEntry.upsert({
        where: { id: `${region}-${e.rank}` },
        create: {
          id: `${region}-${e.rank}`,
          region, rank: e.rank, accountName: e.account_name,
          accountIdsJson: JSON.stringify((e.possible_account_ids ?? []).slice(0, 12)),
          topHeroIdsJson: JSON.stringify(e.top_hero_ids ?? []),
          updatedAt: now,
        },
        update: {
          accountName: e.account_name,
          accountIdsJson: JSON.stringify((e.possible_account_ids ?? []).slice(0, 12)),
          topHeroIdsJson: JSON.stringify(e.top_hero_ids ?? []),
          updatedAt: now,
        },
      });
      records++;
    }
  }
  return records;
}

// 6. Патчи: Steam RSS (v2) + changelog форумов Valve (v1)

/** первая картинка из HTML-текста анонса — она станет превью новости/патча.
 *  У Steam-анонсов src может быть языковым вариантом (…/english.png) с 404,
 *  поэтому если есть data-fallback-src — берём его (базовый файл существует). */
function extractFirstImage(html: string): string {
  const fb = html.match(/<img[^>]+data-fallback-src=["']([^"']+)["']/i);
  if (fb) return fb[1];
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

/** Разбор RSS-фида Steam новостей (XML). Возвращает элементы с guid/title/description/pubDate. */
function parseSteamRss(xml: string): { guid: string; title: string; description: string; pubDate: string; link: string }[] {
  const out: { guid: string; title: string; description: string; pubDate: string; link: string }[] = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const it of items) {
    const pick = (tag: string): string => {
      // значение тега может быть в CDATA или с HTML-сущностями
      const m =
        it.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i")) ??
        it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };
    const unesc = (s: string): string =>
      s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&(?!amp;|#)/g, "&amp;");
    const rawDesc = pick("description");
    out.push({
      guid: pick("guid"),
      title: unesc(pick("title")),
      description: unesc(rawDesc),
      pubDate: pick("pubDate"),
      link: pick("link"),
    });
  }
  return out;
}

/** Заголовки-фолбэки для форумных записей, у которых нет русского RSS:
 *  короткий словарь частых слов Valve-анонсов. */
function ruTitleFallback(title: string): string {
  const map: [RegExp, string][] = [
    [/\bgameplay update\b/i, "Обновление геймплея"],
    [/\bminor update\b/i, "Небольшое обновление"],
    [/\bmajor update\b/i, "Крупное обновление"],
    [/\bupdate\b/i, "Обновление"],
    [/\bpatch\b/i, "Патч"],
    [/\bbalance\b/i, "Баланс"],
    [/\branked\b/i, "Ранговый"],
    [/\bseason\b/i, "сезон"],
    [/\bhalloween\b/i, "Хеллоуин"],
    [/\bhero\b/i, "герой"],
    [/\bheroes\b/i, "герои"],
  ];
  let out = title;
  let hit = false;
  for (const [re, ru] of map) {
    if (re.test(out)) {
      out = out.replace(re, ru);
      hit = true;
    }
  }
  return hit ? out : "";
}

async function syncPatches(): Promise<number> {
  let records = 0;
  type PatchRow = {
    source?: string; title: string; pub_date: string; link: string;
    guid?: { text?: string }; category?: { text?: string }; dc_creator?: string;
    content?: string; content_encoded?: string; author?: string;
  };
  // Русский фид Steam — официальные переводы Valve, guid совпадает с deadlock-api
  const ruRssText = await fetchSteamTextSafe("https://store.steampowered.com/feeds/news/app/1422450/?cc=ru&l=russian");
  const ruByGuid = new Map<string, { title: string; content: string }>();
  if (ruRssText) {
    for (const it of parseSteamRss(ruRssText)) {
      if (it.guid) ruByGuid.set(it.guid, { title: it.title, content: it.description });
    }
  }
  const [v2, v1] = await Promise.all([
    fetchJson<PatchRow[]>(`${API}/v2/patches`, 45_000, 1).catch(() => [] as PatchRow[]),
    fetchJson<PatchRow[]>(`${API}/v1/patches`, 45_000, 1).catch(() => [] as PatchRow[]),
  ]);
  const seen = new Set<string>();
  const all: PatchRow[] = [...v2, ...v1];
  for (const p of all) {
    const id = p.guid?.text || p.link || `${p.title}-${p.pub_date}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const source = p.source === "steam" || (p.link || "").includes("steampowered") ? "steam" : "forums";
    const category = p.category?.text ?? "";
    const isPatch =
      source === "forums" ||
      /changelog|patch|update|баланс/i.test(category) ||
      /\b(?:patch|update|баланс)\b/i.test(p.title);
    const content = p.content ?? p.content_encoded ?? "";
    // Русская версия: официальная с фида Steam, для форумных — словарный фолбэк заголовка
    const ru = ruByGuid.get(id);
    const titleRu = ru?.title || (source === "forums" ? ruTitleFallback(p.title) : "");
    await db.patch.upsert({
      where: { id },
      create: {
        id, title: p.title,
        pubDate: new Date(p.pub_date),
        source, link: p.link ?? "",
        category, author: p.dc_creator ?? p.author ?? "",
        content,
        titleRu, contentRu: ru?.content ?? "",
        imageUrl: extractFirstImage(ru?.content || content),
        isPatch,
      },
      update: {
        title: p.title,
        pubDate: new Date(p.pub_date),
        source, link: p.link ?? "",
        category, author: p.dc_creator ?? p.author ?? "",
        content,
        titleRu, contentRu: ru?.content ?? "",
        imageUrl: extractFirstImage(ru?.content || content),
        isPatch,
      },
    });
    records++;
  }
  return records;
}

/** Текстовый fetch для RSS: не валим синк патчей, если Steam недоступен */
async function fetchSteamTextSafe(url: string): Promise<string | null> {
  try {
    return await fetchSteamText(url, 25_000);
  } catch {
    return null;
  }
}

// 7. Онлайн Steam (живое «сейчас» + пик за 24 ч)
// Основной источник «сейчас» — страница store.steampowered.com/charts/mostplayed,
// где Valve сама публикует nConcurrentInGame по каждому приложению.
async function fetchSteamText(url: string, timeoutMs = 20_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal, cache: "no-store", headers: { "User-Agent": BROWSER_UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function syncOnline(): Promise<number> {
  let live: number | null = null;
  let peak: number | null = null;

  // 1) живое «сейчас» со страницы магазина Steam (nConcurrentInGame)
  try {
    const html = await fetchSteamText(STORE_CHARTS_URL);
    // кавычки в данных могут быть экранированы (\") — допускаем оба варианта
    const re = new RegExp(`${STEAM_APP_ID}.{0,280}?nConcurrentInGame\\\\?"?:\\s*(\\d+)`, "s");
    const m = html.match(re);
    if (m) live = parseInt(m[1], 10);
  } catch {
    // пробуем запасной источник ниже
  }

  // 2) пик за 24 часа из официального сервиса графиков Steam
  try {
    const data = JSON.parse(await fetchSteamText(STEAM_CHARTS_URL)) as {
      response?: { ranks?: { appid?: number; peak_in_game?: number }[] };
    };
    const row = data?.response?.ranks?.find((r) => r.appid === STEAM_APP_ID);
    if (typeof row?.peak_in_game === "number") peak = row.peak_in_game;
  } catch {
    // пик не критичен, живём без него
  }

  // 3) запасной источник — классический Steam Web API (валиден, только если есть player_count)
  if (live == null) {
    try {
      const data = JSON.parse(await fetchSteamText(STEAM_COUNT_URL)) as {
        response?: { player_count?: number };
      };
      const pc = data?.response?.player_count;
      if (typeof pc === "number" && pc > 0) live = pc;
    } catch {
      // отдаём последнее известное значение из SyncState
    }
  }

  if (live == null && peak == null) {
    throw new Error("steam: ни один из трёх источников онлайна не ответил");
  }

  if (peak != null) {
    await db.syncState.upsert({
      where: { key: "online_peak" },
      create: { key: "online_peak", value: String(peak) },
      update: { value: String(peak) },
    });
    // дневная серия пиков (официальный peak_in_game по датам) — контекст для недельного графика
    try {
      const day = new Date().toISOString().slice(0, 10);
      const raw = (await db.syncState.findUnique({ where: { key: "online_daily" } }))?.value ?? "{}";
      const map = JSON.parse(raw) as Record<string, number>;
      map[day] = Math.max(map[day] ?? 0, peak);
      // держим последние 40 дней
      const keys = Object.keys(map).sort().slice(-40);
      const trimmed: Record<string, number> = {};
      for (const k of keys) trimmed[k] = map[k];
      await db.syncState.upsert({
        where: { key: "online_daily" },
        create: { key: "online_daily", value: JSON.stringify(trimmed) },
        update: { value: JSON.stringify(trimmed) },
      });
    } catch {
      // дневные пики не критичны
    }
  }
  if (live != null) {
    await db.onlinePoint.create({ data: { count: live, at: new Date() } });
    // чистим точки старше 7 дней
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
    await db.onlinePoint.deleteMany({ where: { at: { lt: weekAgo } } });
    await db.syncState.upsert({
      where: { key: "online_live" },
      create: { key: "online_live", value: String(live) },
      update: { value: String(live) },
    });
  }
  return live != null ? 1 : 0;
}

// 8. Ранги (названия/иконки) + распределение значков
async function syncRanks(): Promise<number> {
  let records = 0;
  type RankRow = { tier: number; name: string; images?: { large?: string; large_webp?: string; small?: string; small_webp?: string } };
  const ranks = await fetchJson<RankRow[]>(`${API}/v1/assets/ranks?language=russian`, 30_000, 1);
  for (const r of ranks) {
    await db.rankTier.upsert({
      where: { id: r.tier },
      create: { id: r.tier, name: r.name, imageLarge: r.images?.large ?? "", imageSmall: r.images?.small ?? "" },
      update: { name: r.name, imageLarge: r.images?.large ?? "", imageSmall: r.images?.small ?? "" },
    });
    records++;
  }
  type DistRow = { badge: number; rank: number; subrank: number; players: number };
  const dist = await fetchJson<DistRow[]>(`${API}/v1/players/rank/distribution`, 30_000, 1);
  // badge = tier*10 + subrank → агрегируем ПО ТИРУ (rank из API: 1..11), а не по сырым бейджам,
  // иначе график превращается в кашу из 76 столбцов «Значок N».
  const byTier = new Map<number, number>();
  for (const d of dist) {
    const tier = Math.max(0, Math.min(11, Math.floor(d.badge / 10)));
    byTier.set(tier, (byTier.get(tier) ?? 0) + d.players);
  }
  const nameByTier = new Map(ranks.map((r) => [r.tier, r.name]));
  // пересобираем таблицу с нуля — старые сырые строки не должны оставаться в базе
  await db.badgeDist.deleteMany({});
  for (let tier = 0; tier <= 11; tier++) {
    const players = byTier.get(tier) ?? 0;
    if (players === 0 && tier === 0) continue; // Обскурус обычно не попадает в ранкед-распределение
    await db.badgeDist.create({
      data: { badge: tier, players, name: nameByTier.get(tier) ?? `Значок ${tier}` },
    });
    records++;
  }
  return records;
}

// 9. Киберспорт: первичный посев проверенными данными сцены (idempotent)
async function syncEsportsSeed(): Promise<number> {
  const existing = await db.tournament.count();
  if (existing > 0) return 0;

  const d = (iso: string) => new Date(iso);
  const tournaments = [
    {
      name: "Deadlock Collegiate Series — Season 3",
      organizer: "College Deadlock",
      region: "Северная Америка",
      status: "ongoing",
      format: "Групповой этап round-robin + double-elimination плей-офф",
      prizePool: "Стипендиальный фонд",
      startDate: d("2026-09-28T17:00:00Z"),
      endDate: d("2026-12-04T22:00:00Z"),
      teamsCount: 16,
      description:
        "Главный студенческий турнир Северной Америки. Матчи играются еженедельно и транслируются. Регистрация Season 3 закрыта, идут еженедельные матчи группового этапа.",
      source: "https://collegedeadlock.com",
      sortOrder: 1,
    },
    {
      name: "Guildlock Invitational 2026",
      organizer: "Guildhouse",
      region: "Международный",
      status: "completed",
      format: "Offline LAN, 8 команд",
      prizePool: "Призовой фонд LAN",
      startDate: d("2026-07-30T15:00:00Z"),
      endDate: d("2026-08-10T21:00:00Z"),
      teamsCount: 8,
      description:
        "Первый офлайн-LAN турнир по Deadlock в истории: 8 команд, организатор Guildhouse. Этап взросления сцены — переход от онлайн-кубков к студийным событиям.",
      source: "https://liquipedia.net/deadlock/Guildlock_Invitational/2026",
      sortOrder: 2,
    },
    {
      name: "Deadlock Collegiate Series — Season 2",
      organizer: "College Deadlock",
      region: "Северная Америка",
      status: "completed",
      format: "Групповой этап (февраль–апрель) + плей-офф",
      prizePool: "—",
      startDate: d("2026-02-06T17:00:00Z"),
      endDate: d("2026-04-30T22:00:00Z"),
      teamsCount: 14,
      description: "Второй сезон студенческой лиги: групповая стадия с февраля по конец апреля 2026, сразу за ней — плей-офф.",
      source: "https://collegedeadlock.com/news/deadlock-esports-collegiate-landscape",
      sortOrder: 3,
    },
    {
      name: "Deadlock Collegiate Draft Cup",
      organizer: "College Deadlock",
      region: "Все регионы",
      status: "completed",
      format: "Драфт, 3 команды на регион",
      prizePool: "$1,000 на регион",
      startDate: d("2026-08-13T16:00:00Z"),
      endDate: d("2026-08-13T23:00:00Z"),
      teamsCount: 15,
      description: "Драфт-турнир 13 августа: по три команды в каждом регионе, $1,000 призового фонда на регион.",
      source: "https://liquipedia.net/deadlock",
      sortOrder: 4,
    },
    {
      name: "Summer Community Cup",
      organizer: "Сообщество",
      region: "Международный",
      status: "completed",
      format: "8 команд, онлайн",
      prizePool: "$200",
      startDate: d("2026-08-07T15:00:00Z"),
      endDate: d("2026-08-24T21:00:00Z"),
      teamsCount: 8,
      description: "Летний коммьюнити-кубок: 8 команд, две недели игр, призовой фонд $200.",
      source: "https://liquipedia.net/deadlock",
      sortOrder: 5,
    },
    {
      name: "DCS Season 0",
      organizer: "College Deadlock",
      region: "Северная Америка",
      status: "completed",
      format: "16 команд, два дивизиона",
      prizePool: "$5,000",
      startDate: d("2025-02-01T17:00:00Z"),
      endDate: d("2025-04-15T22:00:00Z"),
      teamsCount: 16,
      description: "Нулевой сезон студенческой лиги в начале 2025 года: 16 команд, два дивизиона, $5,000 призового фонда. Точка отсчёта киберспортивной сцены Deadlock.",
      source: "https://collegedeadlock.com/news/deadlock-esports-collegiate-landscape",
      sortOrder: 6,
    },
  ];

  for (const t of tournaments) await db.tournament.create({ data: t });

  await db.esportsTeam.create({
    data: {
      name: "Festival Lanterns",
      tag: "FL",
      region: "Северная Америка",
      description:
        "Одна из самых заметных команд ранней сцены Deadlock — регулярно выступала в еженедельных коммьюнити-брекетах ещё до появления крупных лиг.",
    },
  });

  const matches = [
    { tournamentName: "Deadlock Collegiate Series — Season 3", stage: "Групповой этап · Неделя 8", teamA: "Участник группы A", teamB: "Участник группы B", status: "upcoming", format: "Bo1", scheduledAt: d("2026-11-18T23:00:00Z") },
    { tournamentName: "Deadlock Collegiate Series — Season 3", stage: "Групповой этап · Неделя 8", teamA: "Участник группы C", teamB: "Участник группы D", status: "upcoming", format: "Bo1", scheduledAt: d("2026-11-19T23:00:00Z") },
    { tournamentName: "Deadlock Collegiate Series — Season 3", stage: "Групповой этап · Неделя 9", teamA: "Участник группы A", teamB: "Участник группы C", status: "upcoming", format: "Bo1", scheduledAt: d("2026-11-25T23:00:00Z") },
    { tournamentName: "Deadlock Collegiate Series — Season 3", stage: "Плей-офф", teamA: "TBD", teamB: "TBD", status: "upcoming", format: "Bo3", scheduledAt: d("2026-12-01T22:00:00Z") },
  ];
  for (const m of matches) await db.esportsMatch.create({ data: m });

  return tournaments.length + 1 + matches.length;
}

// ---------- диспетчер ----------

export async function runTask(task: TaskName): Promise<{ task: string; records: number }> {
  const started = Date.now();
  const runner: Record<Exclude<TaskName, "all">, () => Promise<number>> = {
    catalog: syncCatalog,
    stats: syncStats,
    counters: syncCounters,
    extras: syncExtras,
    leaderboard: syncLeaderboard,
    patches: syncPatches,
    online: syncOnline,
    ranks: syncRanks,
    "esports-seed": syncEsportsSeed,
  };
  if (task === "all") {
    let total = 0;
    const order: Exclude<TaskName, "all">[] = [
      "catalog", "ranks", "stats", "counters", "leaderboard", "patches", "online", "extras", "esports-seed",
    ];
    for (const t of order) {
      try {
        const records = await runTask(t);
        total += records.records;
      } catch (e) {
        console.error(`sync ${t} failed:`, e instanceof Error ? e.message : e);
      }
    }
    await logRun("all", "ok", total, "полный цикл синхронизации", Date.now() - started);
    return { task, records: total };
  }
  try {
    const records = await runner[task]();
    await logRun(task, "ok", records, "", Date.now() - started);
    return { task, records };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logRun(task, "error", 0, msg, Date.now() - started);
    throw e;
  }
}

export async function isBootstrapped(): Promise<boolean> {
  const flag = await db.syncState.findUnique({ where: { key: "bootstrapped" } });
  return !!flag;
}

export async function markBootstrapped() {
  await db.syncState.upsert({
    where: { key: "bootstrapped" },
    create: { key: "bootstrapped", value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
}

export const STEAM_APP = STEAM_APP_ID;
