import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

type SearchResult = {
  account_id: number;
  personaname: string;
  profileurl?: string;
  avatar?: string;
  avatarfull?: string;
  realname?: string | null;
};

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const cacheKey = `steam_search_${q.toLowerCase()}`;
  const cached = cacheGet<{ results: SearchResult[] }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const url = `https://api.deadlock-api.com/v1/players/steam-search?search_query=${encodeURIComponent(q)}&limit=20`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "DeadlockRU-portal/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const results = (await res.json()) as SearchResult[];
    const out = {
      results: results.map((r) => ({
        account_id: r.account_id,
        personaname: r.personaname,
        profileurl: r.profileurl,
        avatar: r.avatarfull ?? r.avatar,
        realname: r.realname,
      })),
    };
    cacheSet(cacheKey, out, 5 * 60_000);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ results: [], error: e instanceof Error ? e.message : "ошибка поиска" });
  }
}
