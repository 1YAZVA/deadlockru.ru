/**
 * Слаги для статических страниц (SEO).
 * Чистые функции без клиентского кода — используются и в серверных
 * страницах, и в клиентских секциях портала (для ссылок на карточках).
 */

export function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** /heroes/abrams/ — по английскому имени героя, оно уникально. */
export function heroSlug(hero: { id: number; name: string }): string {
  const base = slugify(hero.name);
  return base || `hero-${hero.id}`;
}

/** /items/close-quarters-1342610602/ — имя + id (имена предметов могут повторяться). */
export function itemSlug(item: { id: string; name: string }): string {
  const base = slugify(item.name);
  return `${base || "item"}-${item.id}`;
}

/** /patches/680766201707627248/ — последний сегмент ссылки Steam. */
export function patchSlug(patch: { id: string; pubDate: string }): string {
  const seg = String(patch.id).split("?")[0].replace(/\/+$/, "").split("/").pop() || "";
  const clean = slugify(seg);
  if (clean) return clean;
  return slugify(String(patch.pubDate).slice(0, 10)) || "patch";
}
