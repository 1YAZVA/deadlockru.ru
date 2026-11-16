/**
 * Аватарки игроков Steam для лидерборда — без ключа Steam Web API.
 *
 * Как работает: deadlock-api отдаёт `possible_account_ids` (steamid3).
 * По ним строим steamid64 и читаем публичный XML профиля steamcommunity
 * (эндпоинт доступен и из РФ, Steam не заблокирован). Из XML берём
 * avatarMedium и кэшируем в SQLite на 14 дней (промахи — на 3 дня).
 * Картинки пользователю отдаём через собственный прокси /api/img,
 * поэтому блокировки CDN у посетителей роли не играют.
 */

const STEAMID64_BASE = 76_561_197_960_265_728; // < 2^53 — безопасно в number
const FETCH_TIMEOUT_MS = 8_000;
/** сколько свежих XML-запросов разрешено за один вызов (страница = 25 строк) */
const MAX_LOOKUP_PER_CALL = 14;
/** кэш удачных аватарок */
const TTL_OK_MS = 14 * 24 * 3600_000;
/** кэш «профиля нет» — чтобы не долбить steamcommunity каждый запрос */
const TTL_MISS_MS = 3 * 24 * 3600_000;

type PrismaDb = {
  playerAvatar: {
    findMany: (args: { where: { accountId: { in: number[] } } }) => Promise<{ accountId: number; avatarUrl: string; fetchedAt: Date }[]>;
    upsert: (args: { where: { accountId: number }, create: { accountId: number; avatarUrl: string }, update: { avatarUrl: string } }) => Promise<unknown>;
  };
};

function toSteamId64(accountId: number): string {
  return String(STEAMID64_BASE + accountId);
}

function extractAvatar(xml: string): string {
  const m = xml.match(/<avatarMedium>\s*<!\[CDATA\[([^\]]+)\]\]>/i) ?? xml.match(/<avatarMedium>([^<]+)<\/avatarMedium>/i);
  const url = m ? m[1].trim() : "";
  // дефолтная аватарка Steam («?» на сером фоне) — считаем промахом и ищем дальше:
  // у части кандидатов профиль есть, но аватар не установлен
  if (url.includes("fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb")) return "";
  return url;
}

async function fetchProfileAvatar(accountId: number): Promise<string> {
  const url = `https://steamcommunity.com/profiles/${toSteamId64(accountId)}?xml=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return "";
    const xml = await res.text();
    return extractAvatar(xml);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Возвращает map accountId -> avatarUrl для запрошенных игроков.
 * Всё, что найдено в кэше, отдаётся мгновенно; недостающие добираются
 * парой параллельных XML-запросов (с лимитом за вызов).
 */
export async function resolveSteamAvatars(
  db: PrismaDb,
  players: { key: string; candidateIds: number[] }[]
): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();

  // 1) кандидаты всех игроков в один пул
  const allIds = [...new Set(players.flatMap((p) => p.candidateIds))];
  const cached = allIds.length
    ? await db.playerAvatar.findMany({ where: { accountId: { in: allIds } } })
    : [];
  const freshCache = new Map<number, string>();
  for (const c of cached) {
    const ttl = c.avatarUrl ? TTL_OK_MS : TTL_MISS_MS;
    if (now - new Date(c.fetchedAt).getTime() < ttl) freshCache.set(c.accountId, c.avatarUrl);
  }

  // 2) мгновенно отдаём тех, у кого кэш свежий
  const needLookup: { key: string; ids: number[] }[] = [];
  for (const p of players) {
    const hit = p.candidateIds.find((id) => freshCache.get(id) !== undefined);
    if (hit !== undefined) {
      const url = freshCache.get(hit) ?? "";
      // нашлась запись-промах у первого кандидата — пробуем следующие кандидаты из свежего кэша
      if (url) result.set(p.key, url);
      else {
        const alt = p.candidateIds.find((id) => (freshCache.get(id) ?? "") !== "");
        if (alt !== undefined) result.set(p.key, freshCache.get(alt) ?? "");
        else needLookup.push({ key: p.key, ids: p.candidateIds });
      }
    } else {
      needLookup.push({ key: p.key, ids: p.candidateIds });
    }
  }
  if (needLookup.length === 0) return result;

  // 3) добираем XML по каждому игроку, но не больше лимита за вызов.
  // Кандидаты с «свежим» кэшем (в т.ч. промахи) пропускаем — так за несколько
  // загрузок страницы постепенно проверяются следующие кандидаты из списка.
  let budget = MAX_LOOKUP_PER_CALL;
  const lookupTasks: Promise<void>[] = [];

  const tryPlayer = async (p: { key: string; ids: number[] }) => {
    const candidates = p.ids.filter((id) => !freshCache.has(id)).slice(0, 3);
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
        return;
      }
    }
  };

  for (const p of needLookup) {
    if (budget <= 0) break;
    lookupTasks.push(tryPlayer(p));
  }
  // до 4 параллельных запросов — вежливо к steamcommunity
  const workers = Array.from({ length: Math.min(4, lookupTasks.length) }, async () => {
    while (lookupTasks.length) {
      const t = lookupTasks.shift();
      if (!t) break;
      await t;
    }
  });
  if (workers.length) await Promise.all(workers);

  return result;
}
