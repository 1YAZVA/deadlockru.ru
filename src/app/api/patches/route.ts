import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(30, Math.max(5, Number(url.searchParams.get("pageSize") ?? "8") || 8));
  const filter = url.searchParams.get("filter") ?? "all"; // all | patches | news
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();

  const where: Record<string, unknown> = {};
  if (filter === "patches") where.isPatch = true;
  if (filter === "news") where.isPatch = false;
  if (search) where.OR = [{ title: { contains: search } }, { titleRu: { contains: search } }];

  const [total, patches] = await Promise.all([
    db.patch.count({ where }),
    db.patch.findMany({
      where,
      orderBy: { pubDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, title: true, titleRu: true, pubDate: true, source: true, link: true,
        category: true, author: true, content: true, contentRu: true, imageUrl: true, isPatch: true,
      },
    }),
  ]);

  return NextResponse.json({ total, page, pageSize, items: patches });
}
