"use client";

/**
 * Версия для GitHub Pages (NEXT_PUBLIC_GH_PAGES=1): сервера нет, поэтому все
 * ответы /api/... заменяются статическими JSON-снапшотами из /data/*.json,
 * которые обновляет GitHub Action. Пагинация/поиск по лидерборду и патчам
 * считаются в браузере — как в серверных роутах.
 * В серверной сборке ghFetch — просто fetch (ничего не меняется).
 */

export const GH_PAGES = process.env.NEXT_PUBLIC_GH_PAGES === "1";

const fileCache = new Map<string, Promise<unknown>>();

function file<T>(name: string): Promise<T> {
  if (!fileCache.has(name)) {
    fileCache.set(name, fetch("/data/" + name, { cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} @ /data/${name}`);
      return res.json() as Promise<T>;
    }).catch((e) => { fileCache.delete(name); throw e; }));
  }
  return fileCache.get(name) as Promise<T>;
}

type LbRow = {
  region: string; rank: number; accountName: string; topHeroIds: number[];
  avatar: string; profileUrl: string; updatedAt: string;
};
type LbFull = { rows: LbRow[]; total: number; pageSize: number; regionCounts?: Record<string, number>; topHeroes?: { heroId: number; count: number }[]; updatedAt: string | null };

let globalLb: Promise<LbFull> | null = null;
const globalRows = (): Promise<LbFull> => (globalLb ??= file<LbFull>("lb-Global.json"));

/** topHeroes — агрегат по всем регионам, считаем по Global-выборке как в серверном роуте */
async function computeTopHeroes() {
  const d = await globalRows();
  const agg = new Map<number, number>();
  for (const e of d.rows) for (const id of e.topHeroIds || []) agg.set(id, (agg.get(id) ?? 0) + 1);
  return [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([heroId, count]) => ({ heroId, count }));
}

/** пагинация+поиск по лидерборду — логика /api/leaderboard */
async function leaderboard<T>(q: URLSearchParams): Promise<T> {
  const region = q.get("region") ?? "Global";
  const page = Math.max(1, Number(q.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(q.get("pageSize") ?? "25") || 25));
  const search = (q.get("search") ?? "").trim().toLowerCase();
  const src = region === "Global" ? await globalRows() : await file<LbFull>(`lb-${region}.json`);
  // снапшоты снимались с живого сервера, где аватарки запечены как /api/img?u=...
  // — на Pages прокси нет, раскодируем обратно в прямую ссылку
  const unproxy = (u: string) => {
    const m = u && u.startsWith("/api/img?u=") ? u.slice("/api/img?u=".length) : "";
    try { return m ? decodeURIComponent(m) : u; } catch { return u || ""; }
  };
  const filtered = search ? src.rows.filter((e) => e.accountName.toLowerCase().includes(search)) : src.rows;
  const sorted = region === "Global"
    ? [...filtered].sort((a, b) => a.rank - b.rank || a.region.localeCompare(b.region))
    : filtered;
  const total = sorted.length;
  const startIdx = (page - 1) * pageSize;
  const pageRows = sorted.slice(startIdx, startIdx + pageSize).map((e) => ({ ...e, avatar: unproxy(e.avatar) }));
  const g = await globalRows();
  const regionCounts = g.regionCounts ?? {};
  const out = {
    rows: pageRows,
    total,
    page,
    pageSize,
    regionCounts,
    topHeroes: src.topHeroes ?? (await computeTopHeroes()),
    updatedAt: src.updatedAt,
  };
  return out as T;
}

/** пагинация+поиск по патчам/новостям — логика /api/patches */
async function patches<T>(q: URLSearchParams): Promise<T> {
  const page = Math.max(1, Number(q.get("page") ?? "1") || 1);
  const pageSize = Math.min(30, Math.max(5, Number(q.get("pageSize") ?? "8") || 8));
  const filter = q.get("filter") ?? "all";
  const search = (q.get("search") ?? "").trim().toLowerCase();
  const all = await file<{ total: number; items: Record<string, unknown>[] }>("patches-all.json");
  let list = all.items;
  if (filter === "patches") list = list.filter((x) => x.isPatch === true);
  if (filter === "news") list = list.filter((x) => x.isPatch === false);
  if (search) list = list.filter((x) => {
    const t = String(x.title ?? "").toLowerCase();
    const tr = String(x.titleRu ?? "").toLowerCase();
    return t.includes(search) || tr.includes(search);
  });
  const out = { total: list.length, page, pageSize, items: list.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize) };
  return out as T;
}

/** мета-история: только 168/336 часов снапшотятся — берём ближайший */
async function metaHistory<T>(q: URLSearchParams): Promise<T> {
  const hours = Number(q.get("hours") ?? "168") || 168;
  const name = hours <= 252 ? "meta-history-168.json" : "meta-history-336.json";
  return file<T>(name);
}

export async function ghFetch<T>(url: string, init?: RequestInit): Promise<T> {
  if (!GH_PAGES) {
    const res = await fetch(url, { cache: "no-store", ...init });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  const u = new URL(url, location.origin);
  const p = u.pathname;
  const q = u.searchParams;
  if (!p.startsWith("/api/")) {
    const res = await fetch(url, { cache: "no-store", ...init });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  switch (p) {
    case "/api/state": return file<T>("state.json");
    case "/api/heroes": return file<T>("heroes.json");
    case "/api/items": return file<T>("items.json");
    case "/api/meta": return file<T>("meta.json");
    case "/api/meta/history": return metaHistory<T>(q);
    case "/api/live": return file<T>("live.json");
    case "/api/quiz": return file<T>("quiz.json");
    case "/api/esports": return file<T>("esports.json");
    case "/api/patches": return patches<T>(q);
    case "/api/leaderboard": return leaderboard<T>(q);
    case "/api/hero/x": // break omitted intentionally — динамический путь
    default:
      const m = p.match(/^\/api\/hero\/(\d+)$/);
      if (m) return file<T>(`hero/${m[1]}.json`);
      const s = p.match(/^\/api\/search$/);
      if (s) {
        const qs = (q.get("q") ?? "").trim().toLowerCase();
        const d = await globalRows();
        const results = qs.length < 2 ? [] : d.rows
          .filter((e) => e.accountName.toLowerCase().includes(qs))
          .slice(0, 8)
          .map((e) => {
            const m = e.avatar && e.avatar.startsWith("/api/img?u=") ? e.avatar.slice("/api/img?u=".length) : "";
            let avatar = e.avatar;
            if (m) { try { avatar = decodeURIComponent(m); } catch { /* оставляем как есть */ } }
            return { account_id: Number(e.profileUrl.split("/").pop() ?? 0) || 0, personaname: e.accountName, profileurl: e.profileUrl, avatar };
          });
        return { results } as T;
      }
      throw new Error(`GitHub-версия: ${p} не поддерживается (нет сервера)`);
  }
}
