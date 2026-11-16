/**
 * Рулетка билдов Deadlock: сидированный рандом, правила сборки, порядок прокачки
 * и генерация кода билда для импорта прямо в игру.
 *
 * Формат игрового кода: base64( zstd-кадр( protobuf-сообщение сборки ) ).
 * Valve формат не документирует; схема полей взята из открытого проекта
 * Deadlock Browser Build Maker (MIT, github.com/JoniSmiff/Deadlock-Browser-Build-Maker),
 * как и на randomlock.com. Игра принимает zstd-кадр без сжатия (raw block),
 * поэтому настоящий компрессор не нужен — достаточно заголовка кадра.
 *
 * Сообщение сборки (protobuf):
 *   1 build_id (varint)  2 hero_id  5 name (string)  6 description  7 language  8 version
 *   10 details { 1 category* { 1 mod* { 1 item_id  2 annotation  4 ?  5 imbue_target }
 *                              2 name  3 description  4 width (float)  5 height (float)  6 optional }
 *                2 ability_order { 1 change* { 1 ability_id  2 currency_type  3 delta } } }
 *   11 tag (varint)
 * currency_type 2 — очко открытия способности (delta −1), 1 — очки улучшения (−1, −2, −5).
 */

// ---------- типы ----------

export type BItem = {
  id: number; // числовой ID предмета из игры (идёт в код билда)
  slug: string; // class_name (upgrade_clip_size)
  name: string; // отображаемое имя (русское, если есть)
  tier: number; // 1..4
  cost: number; // цена в душах
  cat: string; // weapon | spirit | vitality
  active: boolean; // активируемый предмет
  from: string[]; // class_name компонентов, из которых собирается
  img: string; // картинка из витрины магазина
};

export type BAbility = {
  id: number; // числовой ID способности из игры (идёт в код билда)
  name: string;
  image: string;
  ult: boolean;
};

export type Lane = { key: string; name: string; color: string };

// 4 линии карты Deadlock: цвета линий-«трасс»
export const LANES: Lane[] = [
  { key: "blue", name: "Синяя", color: "#5C9BD6" },
  { key: "yellow", name: "Жёлтая", color: "#D6B15C" },
  { key: "green", name: "Зелёная", color: "#5CD67C" },
  { key: "purple", name: "Фиолетовая", color: "#9B5CD6" },
];

export const SLOT_N = 12;
export const MAX_ACTIVE = 4; // в игре всего 4 слота под активные предметы
export const CATS = ["weapon", "spirit", "vitality"] as const;

export type RollOrder = "curve" | "loose" | "chaos"; // умный / случайный / полный
export type Invest = "chaos" | "even" | "mono"; // хаос / поровну / всё в один

export const ORDER_LABEL: Record<RollOrder, string> = {
  curve: "Умный",
  loose: "Случайный",
  chaos: "Полный",
};
export const ORDER_HINT: Record<RollOrder, string> = {
  curve: "дешёвые предметы в начале, дорогие в конце, апгрейды на своих местах",
  loose: "разумный билд без правил: покупка примерно по цене",
  chaos: "без правил: любые предметы в любом порядке",
};
export const INVEST_LABEL: Record<Invest, string> = {
  chaos: "Хаос",
  even: "Поровну",
  mono: "Всё в один",
};
export const INVEST_HINT: Record<Invest, string> = {
  chaos: "оружие, спиритизм и живучесть — как выпадет",
  even: "4 предмета из каждой категории",
  mono: "все 12 предметов одной категории",
};

// ---------- сидированный ГПСЧ: одинаковый сид = одинаковый результат ----------

function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function rng(seed: string) {
  let a = xmur3(String(seed))();
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

type Rnd = () => number;
const pick = <T,>(r: Rnd, arr: T[]): T => arr[Math.floor(r() * arr.length)];

function shuffle<T>(r: Rnd, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedPick<T>(r: Rnd, arr: T[], wf: (x: T) => number): T {
  const w = arr.map(wf);
  let x = r() * w.reduce((s, v) => s + v, 0);
  for (let k = 0; k < arr.length; k++) if ((x -= w[k]) <= 0) return arr[k];
  return arr[arr.length - 1];
}

// ---------- совместимость предметов ----------

/** все компоненты предмета по цепочке (A <- B <- C) */
export function deepFrom(item: BItem, bySlug: Map<string, BItem>, cache: Map<string, Set<string>>): Set<string> {
  const hit = cache.get(item.slug);
  if (hit) return hit;
  const out = new Set<string>();
  const stack = [...item.from];
  while (stack.length) {
    const s = stack.pop()!;
    if (out.has(s)) continue;
    out.add(s);
    const it = bySlug.get(s);
    if (it) stack.push(...it.from);
  }
  cache.set(item.slug, out);
  return out;
}

/** можно ли поставить предмет в текущую сборку (без дубликатов, «съеденных» компонентов и лишних активок) */
export function compatible(item: BItem, build: BItem[], bySlug: Map<string, BItem>, cache: Map<string, Set<string>>): boolean {
  if (build.some((b) => b.slug === item.slug)) return false;
  // апгрейд «съедает» свой компонент, поэтому вместе их иметь нельзя
  for (const b of build) {
    if (deepFrom(item, bySlug, cache).has(b.slug) || deepFrom(b, bySlug, cache).has(item.slug)) return false;
  }
  // у игрока всего 4 слота под активные предметы
  if (item.active && build.filter((b) => b.active).length >= MAX_ACTIVE) return false;
  return true;
}

// ---------- кривая покупки («Умный» режим) ----------
// У каждого слота своя ценовая полка: дешёвый старт без накоплений, дорогое — в конце.
// Часть слотов «прыгает» на апгрейд, который собирается из дешёвого компонента.
const CURVE: { t: number[]; up?: { t: number[]; from: number; p: number } }[] = [
  { t: [1] },
  { t: [1], up: { t: [2], from: 1, p: 0.3 } },
  { t: [1, 2] },
  { t: [2] },
  { t: [2], up: { t: [3], from: 2, p: 0.3 } },
  { t: [3], up: { t: [4], from: 2, p: 0.35 } },
  { t: [3] },
  { t: [3, 4] },
  { t: [4] },
  { t: [4] },
  { t: [4] },
  { t: [4] },
];

const makeFromCheap = (maxTier: number) => (i: BItem) => i.from.length > 0 && i.from.every((s) => byTierOf(s) <= maxTier);
// тир компонента по его class_name — нужна карта слаг->предмет, поэтому pred делаем фабрикой ниже
let slugTier: Map<string, number> = new Map();
function byTierOf(slug: string): number {
  return slugTier.get(slug) ?? 99;
}

function curveSlot(r: Rnd, idx: number) {
  const c = CURVE[Math.min(idx, CURVE.length - 1)];
  const useUp = c.up && r() < c.up.p;
  return { tiers: useUp ? c.up!.t : c.t, pred: useUp ? makeFromCheap(c.up!.from) : null };
}

// слоты 1, 5 и 6: если у выпавшего предмета есть апгрейд на тир выше — показываем сразу апгрейд
// (дешёвую часть покупают на старте, доводят позже). Потолок: слот 1 — до тира II, слот 5 — до III, слот 6 — до IV.
const CURVE_UPGRADE_MAX: Record<number, number> = { 0: 2, 4: 3, 5: 4 };

// ---------- план категорий (инвестиции) ----------

function categoryPlan(r: Rnd, invest: Invest): (string | null)[] {
  if (invest === "even") {
    const order = shuffle(r, [...CATS]);
    return Array.from({ length: SLOT_N }, (_, i) => order[i % 3]);
  }
  if (invest === "mono") {
    const c = pick(r, [...CATS]);
    return Array(SLOT_N).fill(c);
  }
  return Array(SLOT_N).fill(null); // хаос
}

// ---------- выбор предмета для слота ----------

export type PickCtx = {
  items: BItem[];
  bySlug: Map<string, BItem>;
  cache: Map<string, Set<string>>;
  // веса популярности предметов на этом герое (из нашей статистики матчей)
  tune?: Map<number, number>;
};

function rollItem(
  r: Rnd,
  ctx: PickCtx,
  build: BItem[],
  cat: string | null,
  want: boolean | null,
  tiers: number[] | null,
  pred: ((i: BItem) => boolean) | null,
  widen = false
): BItem | null {
  const ok = (i: BItem, c: string | null, w: boolean | null, t: number[] | null, pr: ((i: BItem) => boolean) | null) =>
    (!c || i.cat === c) && (w === null || i.active === w) && (!t || t.includes(i.tier)) && (!pr || pr(i)) && compatible(i, build, ctx.bySlug, ctx.cache);
  // сначала строго, потом ослабляем: условие слота → тир → категория → тип слота
  const wide = widen && tiers ? [...new Set(tiers.flatMap((x) => [x - 1, x, x + 1]))].filter((x) => x >= 1 && x <= 4) : null;
  const steps: [string | null, boolean | null, number[] | null][] = wide
    ? [
        [cat, want, tiers], [cat, want, wide], [cat, null, tiers], [cat, null, wide],
        [null, want, tiers], [null, null, tiers], [cat, want, null], [null, want, null], [null, null, null],
      ]
    : [
        [cat, want, tiers], [null, want, tiers], [cat, null, tiers],
        [null, null, tiers], [cat, want, null], [null, want, null], [null, null, null],
      ];
  const predSteps: [string | null, boolean | null, number[] | null][] = pred
    ? (widen ? [[cat, want, tiers], [cat, null, tiers]] : [[cat, want, tiers], [null, want, tiers], [cat, null, tiers]])
    : [];
  for (const [c, w, t] of [...predSteps, ...steps]) {
    const p = ctx.items.filter((i) => ok(i, c, w, t, pred));
    if (p.length) {
      return ctx.tune ? weightedPick(r, p, (i) => ctx.tune!.get(i.id) || 1) : pick(r, p);
    }
  }
  return null;
}

// ---------- сборка целиком ----------

export function rollBuild(r: Rnd, ctx: PickCtx, order: RollOrder, invest: Invest, actives: number): BItem[] {
  const plan = categoryPlan(r, invest);
  const curve = order === "curve";
  const slotRule = curve ? plan.map((_, i) => curveSlot(r, i)) : null;
  // в «Умном» режиме активки — с 3-го слота: активных предметов за 800 душ в игре всего несколько
  const activeFrom = curve ? 2 : 0;
  const activeSlots = new Set(
    shuffle(r, plan.map((_, i) => i).filter((i) => i >= activeFrom)).slice(0, actives)
  );
  // активки выбираем первыми: их меньше, и им важнее не упереться в запреты
  const orderIdx = [...activeSlots, ...plan.map((_, i) => i).filter((i) => !activeSlots.has(i))];
  const build: BItem[] = [];
  const bySlot: (BItem | null)[] = Array(SLOT_N).fill(null);
  for (const idx of orderIdx) {
    const tiers = curve ? slotRule![idx].tiers : null;
    let it: BItem | null = null;
    if (curve && slotRule![idx].pred) {
      it = rollItem(r, ctx, build, plan[idx], activeSlots.has(idx), tiers, slotRule![idx].pred, true);
    }
    if (!it) it = rollItem(r, ctx, build, plan[idx], activeSlots.has(idx), curve ? slotRule![idx].tiers : tiers, null, curve);
    if (it) {
      build.push(it);
      bySlot[idx] = it;
    }
  }
  if (!curve) {
    // «Случайный»: порядок покупки примерно по цене (дешёвые раньше, но не всегда — взвешенно 1/цена)
    if (order === "loose") {
      const b = build.slice();
      const out: BItem[] = [];
      while (b.length) {
        const it = weightedPick(r, b, (i) => 1 / Math.max(1, i.cost));
        out.push(b.splice(b.indexOf(it), 1)[0]);
      }
      return out;
    }
    return shuffle(r, build); // «Полный»: любой порядок
  }
  // «Умный»: предметы стоят в слотах своей полки — порядок покупки уже готов.
  // Слоты 1, 5 и 6: если есть апгрейд на тир выше — показываем сразу апгрейд.
  for (const idxS of Object.keys(CURVE_UPGRADE_MAX)) {
    const idx = Number(idxS);
    const cur = bySlot[idx];
    if (!cur || cur.tier + 1 > CURVE_UPGRADE_MAX[idx]) continue;
    const rest = bySlot.filter(Boolean).filter((b) => b !== cur) as BItem[];
    const ups = ctx.items.filter(
      (u) => u.tier === cur.tier + 1 && u.from.includes(cur.slug) && u.active === cur.active && u.cat === cur.cat && compatible(u, rest, ctx.bySlug, ctx.cache)
    );
    if (ups.length) {
      const up = ctx.tune ? weightedPick(r, ups, (u) => ctx.tune!.get(u.id) || 1) : pick(r, ups);
      bySlot[idx] = up;
    }
  }
  return bySlot.filter(Boolean) as BItem[];
}

/** переролл одного слота: сохраняем категорию/тип слота и цену-полку, с учётом активок и компонентов */
export function rerollOne(
  r: Rnd,
  ctx: PickCtx,
  build: BItem[],
  idx: number,
  order: RollOrder,
  invest: Invest
): BItem | null {
  const cur = build[idx];
  const others = build.filter((_, i) => i !== idx);
  // в «Поровну» и «Всё в один» слот держит свою категорию; в «Хаосе» — любая
  const cat = invest === "chaos" ? null : cur?.cat ?? null;
  // полка слота: в «Умном» — кривая + тир текущего предмета; в остальных — рядом с текущим
  const shelf = cur ? [Math.max(1, cur.tier - 1), cur.tier, Math.min(4, cur.tier + 1)] : null;
  const tiers =
    order === "curve"
      ? [...new Set([...(CURVE[Math.min(idx, CURVE.length - 1)].t ?? []), ...(CURVE[Math.min(idx, CURVE.length - 1)].up?.t ?? []), ...(cur ? [cur.tier] : [])])]
      : shelf;
  // тип слота (активка/пассивка) сохраняем, если он был
  const want: boolean | null = cur ? cur.active : null;
  let it = rollItem(r, ctx, others, cat, want, tiers, null, true);
  if (!it) it = rollItem(r, ctx, others, cat, want, null, null, false);
  if (!it) it = rollItem(r, ctx, others, cat, null, null, null, false);
  return it;
}

// ---------- порядок прокачки ----------
// У каждой способности 4 шага — открытие и 3 улучшения (за 1, 2 и 5 очков).
// Ульту можно открыть только после того, как открыты три базовые способности.
// Возвращает индексы способностей, длина = способность × 4 (16 для стандартного героя).

export function rollSkillOrder(r: Rnd, abilityCount: number, ultIndex: number): number[] {
  const steps = 4;
  const left = Array(abilityCount).fill(steps) as number[];
  const out: number[] = [];
  const basesOpen = () => left.every((v, i) => i === ultIndex || v < steps);
  while (out.length < abilityCount * steps) {
    const avail: number[] = [];
    for (let i = 0; i < abilityCount; i++) {
      if (left[i] <= 0) continue;
      if (i === ultIndex && left[i] === steps && !basesOpen()) continue;
      avail.push(i);
    }
    if (!avail.length) break;
    const i = pick(r, avail);
    left[i]--;
    out.push(i);
  }
  return out;
}

/** cost улучшения способности: −1 очко на открытие (currency 2), затем −1/−2/−5 (currency 1) */
export function skillChanges(order: number[], abilityIds: number[]): { ability_id: number; currency_type: number; delta: number }[] {
  const seen: number[] = abilityIds.map(() => 0);
  const UPGRADE_COST = [1, 2, 5];
  const out: { ability_id: number; currency_type: number; delta: number }[] = [];
  for (const idx of order) {
    const k = seen[idx]++;
    const change = k === 0 ? [2, -1] : [1, -UPGRADE_COST[k - 1]];
    out.push({ ability_id: abilityIds[idx] >>> 0, currency_type: change[0], delta: change[1] });
  }
  return out;
}

// ---------- код билда для игры ----------

const te = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

class Writer {
  private a: number[] = [];
  varint(v: number | bigint) {
    let x = BigInt.asUintN(64, BigInt(v));
    while (x > 0x7fn) {
      this.a.push(Number(x & 0x7fn) | 0x80);
      x >>= 7n;
    }
    this.a.push(Number(x));
    return this;
  }
  V(f: number, v: number | bigint) {
    return this.varint(f << 3).varint(v);
  }
  B(f: number, bytes: Uint8Array) {
    this.varint((f << 3) | 2).varint(bytes.length);
    for (const b of bytes) this.a.push(b);
    return this;
  }
  S(f: number, str: string) {
    return this.B(f, te!.encode(str || ""));
  }
  F(f: number, x: number) {
    this.varint((f << 3) | 5);
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, x, true);
    for (const v of b) this.a.push(v);
    return this;
  }
  bytes() {
    return Uint8Array.from(this.a);
  }
}

/** zstd-кадр с одним несжатым блоком — игра принимает его как есть */
export function zstdRaw(p: Uint8Array): Uint8Array {
  const n = p.length;
  let head: number[];
  if (n <= 255) head = [0x20, n];
  else if (n <= 65791) head = [0x60, (n - 256) & 255, (n - 256) >> 8];
  else throw new Error("build too large");
  const bh = (n << 3) | 1; // last block, raw
  const out = new Uint8Array(4 + head.length + 3 + n);
  out.set([0x28, 0xb5, 0x2f, 0xfd], 0);
  out.set(head, 4);
  out.set([bh & 255, (bh >> 8) & 255, (bh >> 16) & 255], 4 + head.length);
  out.set(p, 7 + head.length);
  return out;
}

// размеры раздела как в редакторе игры: до 13 предметов в ряд
const PER_ROW = 13;
const ROW_H = 112.125;
const fitWidth = (n: number) => 12 + 81.75 * Math.min(Math.max(n, 1), PER_ROW);
const fitHeight = (n: number) => {
  const rows = Math.ceil(n / PER_ROW);
  return rows > 1 ? 178.5 + ROW_H * (rows - 1) : 0;
};

export type BuildPayloadInput = {
  heroId: number;
  name: string;
  desc?: string;
  categories: { name: string; desc?: string; items: number[] }[];
  abilityChanges?: { ability_id: number; currency_type: number; delta: number }[];
};

export function buildPayload(b: BuildPayloadInput): Uint8Array {
  const details = new Writer();
  for (const c of b.categories) {
    const cw = new Writer();
    for (const id of c.items) {
      const mw = new Writer().V(1, id >>> 0);
      cw.B(1, mw.bytes());
    }
    cw.S(2, c.name).S(3, c.desc || "").F(4, fitWidth(c.items.length));
    const h = fitHeight(c.items.length);
    if (h) cw.F(5, h);
    details.B(1, cw.bytes());
  }
  if (b.abilityChanges?.length) {
    const aw = new Writer();
    for (const c of b.abilityChanges) {
      aw.B(1, new Writer().V(1, c.ability_id >>> 0).V(2, c.currency_type).V(3, c.delta).bytes());
    }
    details.B(2, aw.bytes());
  }
  return new Writer().V(1, 1).V(2, b.heroId).S(5, b.name).S(6, b.desc || "").V(7, 0).V(8, 0).B(10, details.bytes()).bytes();
}

export function encodeBuildCode(b: BuildPayloadInput): string {
  const p = buildPayload(b);
  if (p.length > 16000) throw new Error("build too large");
  const bytes = zstdRaw(p);
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}

// ---------- обратное чтение (для самопроверки) ----------

export function decodeBuildCode(code: string): { heroId: number; name: string; items: number[]; changes: { ability_id: number; currency_type: number; delta: number }[] } {
  const bin = atob(code);
  const raw = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (raw[0] !== 0x28 || raw[1] !== 0xb5 || raw[2] !== 0x2f || raw[3] !== 0xfd) throw new Error("not zstd");
  const fhd = raw[4];
  const headLen = fhd === 0x20 ? 2 : fhd === 0x60 ? 3 : 0;
  const p = raw.subarray(4 + headLen + 3);
  const td = new TextDecoder();
  const rv = (d: Uint8Array, pos: { i: number }) => {
    let v = 0n, sh = 0n, c;
    do {
      c = d[pos.i++];
      v |= BigInt(c & 0x7f) << sh;
      sh += 7n;
    } while (c & 0x80);
    return v;
  };
  const fields = (d: Uint8Array) => {
    const pos = { i: 0 };
    const out: { f: number; v: Uint8Array | bigint }[] = [];
    while (pos.i < d.length) {
      const key = Number(rv(d, pos));
      const f = key >>> 3, w = key & 7;
      if (w === 0) out.push({ f, v: rv(d, pos) });
      else if (w === 2) {
        const l = Number(rv(d, pos));
        out.push({ f, v: d.subarray(pos.i, pos.i + l) });
        pos.i += l;
      } else if (w === 5) {
        out.push({ f, v: d.subarray(pos.i, pos.i + 4) });
        pos.i += 4;
      } else throw new Error("wire " + w);
    }
    return out;
  };
  const res = { heroId: 0, name: "", items: [] as number[], changes: [] as { ability_id: number; currency_type: number; delta: number }[] };
  for (const x of fields(p)) {
    if (x.f === 2) res.heroId = Number(x.v);
    else if (x.f === 5) res.name = td.decode(x.v as Uint8Array);
    else if (x.f === 10) {
      for (const y of fields(x.v as Uint8Array)) {
        if (y.f === 1) {
          for (const z of fields(y.v as Uint8Array)) {
            if (z.f === 1) {
              const m = fields(z.v as Uint8Array).find((mm) => mm.f === 1);
              if (m) res.items.push(Number(m.v));
            }
          }
        } else if (y.f === 2) {
          for (const z of fields(y.v as Uint8Array)) {
            const m = Object.fromEntries(fields(z.v as Uint8Array).map((q2) => [q2.f, q2.v]));
            res.changes.push({ ability_id: Number(m[1]), currency_type: Number(m[2]), delta: Number(BigInt.asIntN(64, m[3] as bigint)) });
          }
        }
      }
    }
  }
  return res;
}

// ---------- подготовка контекста из наших данных ----------

/** предметы /api/items -> пул для рулетки */
export function itemsToPool(rows: { id: string; className: string; nameRu?: string; name: string; tier: number; cost: number; slotType: string; isActive: boolean; components?: string[]; shopImage?: string; image?: string }[]): BItem[] {
  const pool: BItem[] = [];
  for (const it of rows) {
    if (it.tier < 1 || it.tier > 4) continue;
    if (!"weapon spirit vitality".split(" ").includes(it.slotType)) continue;
    pool.push({
      id: Number(it.id),
      slug: it.className,
      name: it.nameRu || it.name,
      tier: it.tier,
      cost: it.cost,
      cat: it.slotType,
      active: it.isActive,
      from: it.components ?? [],
      img: it.shopImage || it.image || "",
    });
  }
  return pool;
}

/** способности героя из HeroExtra: только прокачиваемые (signature + ultimate) */
export function heroSkillAbilities(abilities: { id?: string; abilityType: string; name: string; image: string }[] | undefined | null): BAbility[] {
  return (abilities ?? [])
    .filter((a) => a.id && (a.abilityType === "signature" || a.abilityType === "ultimate"))
    .map((a) => ({ id: Number(a.id), name: a.name, image: a.image, ult: a.abilityType === "ultimate" }));
}

/** карта «предмет -> вес популярности на этом герое» из топ-предметов (matches) */
export function tuneFromTopItems(topItems: { itemId: string; matches: number }[] | undefined | null): Map<number, number> | undefined {
  if (!topItems?.length) return undefined;
  const m = new Map<number, number>();
  const max = Math.max(...topItems.map((t) => t.matches), 1);
  for (const t of topItems) m.set(Number(t.itemId), 1 + (t.matches / max) * 3); // 1..4
  return m;
}

/** подготовка ctx: slug-карты и кэш компонентов */
export function makeCtx(items: BItem[], tune?: Map<number, number>): PickCtx {
  slugTier = new Map(items.map((i) => [i.slug, i.tier]));
  return {
    items,
    bySlug: new Map(items.map((i) => [i.slug, i])),
    cache: new Map(),
    tune,
  };
}

/** одна крутка билда целиком */
export function roll(
  seed: string,
  items: BItem[],
  opts: { order: RollOrder; invest: Invest; actives?: number | "random" },
  tune?: Map<number, number>,
  lane: boolean = true
): { seed: string; build: BItem[]; skillsPlan: null; actives: number; lane: Lane | null } {
  const r = rng(seed);
  const act = opts.actives === undefined || opts.actives === "random" ? Math.floor(r() * (MAX_ACTIVE + 1)) : Math.max(0, Math.min(MAX_ACTIVE, opts.actives));
  const ctx = makeCtx(items, tune);
  const build = rollBuild(r, ctx, opts.order, opts.invest, act);
  return { seed, build, skillsPlan: null, actives: act, lane: lane ? pick(r, LANES) : null };
}
