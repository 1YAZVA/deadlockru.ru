import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Прокси-кэш картинок.
 *
 * Зачем: внешние CDN (assets-bucket.deadlock-api.com и др.) у части пользователей
 * не грузятся напрямую (блокировки/медленный роутинг). Здесь сервер сам скачивает
 * картинку один раз, складывает в дисковый кэш и дальше отдаёт мгновенно со своего
 * домена с долгим браузерным кэшем.
 *
 * Использование: /api/img?u=<encodeURIComponent(https://...)>
 * Разрешены только whitelisted-хосты — открытый прокси делать нельзя.
 */

const ALLOWED_SUFFIXES = [
  ".deadlock-api.com",
  ".steamstatic.com",
  ".akamaihd.net",
  ".steamcontent.com",
  ".steampowered.com",
];

const CACHE_DIR = path.join(process.cwd(), ".img-cache");
const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

function isAllowed(target: URL): boolean {
  if (target.protocol !== "https:") return false;
  const host = target.hostname.toLowerCase();
  return ALLOWED_SUFFIXES.some((s) => host === s.slice(1) || host.endsWith(s));
}

function contentTypeFor(ct: string, ext: string): string {
  if (ct.startsWith("image/")) return ct;
  switch (ext) {
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

function imageResponse(buf: Buffer, ct: string, status = 200): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    status,
    headers: {
      "Content-Type": ct,
      // картинки почти не меняются (меняются только с патчами) — долгий кэш
      "Cache-Control": "public, max-age=1209600, stale-while-revalidate=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!isAllowed(target)) {
    return new NextResponse("host not allowed", { status: 403 });
  }

  const key = createHash("sha1").update(raw).digest("hex");
  const ext = (path.extname(target.pathname).match(/^\.[a-z0-9]{1,5}$/i) ?? [""])[0].toLowerCase();
  const file = path.join(CACHE_DIR, key + ext);

  // 1) дисковый кэш
  try {
    const buf = await readFile(file);
    return imageResponse(buf, contentTypeFor("", ext));
  } catch {
    // нет в кэше — идём в сеть
  }

  // 2) скачиваем с оригинального CDN
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "User-Agent": "DeadlockRU-portal/1.0 (image cache)" },
    });
    if (!res.ok) {
      return new NextResponse(`upstream ${res.status}`, { status: 502 });
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) {
      return new NextResponse("not an image", { status: 502 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) {
      return new NextResponse("bad size", { status: 502 });
    }
    try {
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, buf);
    } catch {
      // не смогли закэшировать — всё равно отдаём картинку
    }
    return imageResponse(buf, ct);
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
