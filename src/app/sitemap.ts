import type { MetadataRoute } from "next";
import { getHeroes, getItems, getPatches } from "@/lib/pages-data";
import { heroSlug, itemSlug, patchSlug } from "@/lib/slugs";

export const dynamic = "force-static";

const BASE = "https://deadlockru.ru";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/heroes/`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/items/`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/patches/`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];

  for (const hero of getHeroes()) {
    entries.push({
      url: `${BASE}/heroes/${heroSlug(hero)}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  for (const item of getItems()) {
    entries.push({
      url: `${BASE}/items/${itemSlug(item)}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  for (const patch of getPatches()) {
    const d = new Date(patch.pubDate);
    entries.push({
      url: `${BASE}/patches/${patchSlug(patch)}/`,
      lastModified: Number.isNaN(d.getTime()) ? now : d,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  return entries;
}
