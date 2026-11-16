const p = Uint8Array.from([0x08,0x01,0x10,0x01,0x2a,0x01,0x58,0x32,0x00,0x38,0x00,0x40,0x00,0x52,0x28,0x0a,0x13,0x0a,0x02,0x08,0x64,0x0a,0x03,0x08,0xc8,0x01,0x12,0x01,0x43,0x1a,0x00,0x25,0x00,0x80,0x2f,0x43,0x12,0x11,0x0a,0x0f,0x08,0x2a,0x10,0x02,0x18,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x01]);
const rv = (pos: { i: number }) => { let v = 0n, sh = 0n, c; do { c = p[pos.i++]; v |= BigInt(c & 0x7f) << sh; sh += 7n; } while (c & 0x80); return v; };
// ВАЖНО: rv должен читать из d, а не из p!
const fields = (d: Uint8Array) => {
  const pos = { i: 0 };
  const out: { f: number; w: number; v: Uint8Array | bigint }[] = [];
  while (pos.i < d.length) {
    const key = Number(rv(pos));
    const f = key >>> 3, w = key & 7;
    if (w === 0) out.push({ f, w, v: rv(pos) });
    else if (w === 2) { const l = Number(rv(pos)); out.push({ f, w, v: d.subarray(pos.i, pos.i + l) }); pos.i += l; }
    else if (w === 5) { out.push({ f, w, v: d.subarray(pos.i, pos.i + 4) }); pos.i += 4; }
    else throw new Error("wire " + w);
  }
  return out;
};
console.log("L1:", fields(p).map(x => `${x.f}/w${x.w}(${x.v instanceof Uint8Array ? x.v.length : x.v})`).join(" "));
const d10 = (fields(p).find(x => x.f === 10)!.v as Uint8Array);
console.log("L2:", fields(d10).map(x => `${x.f}/w${x.w}(${x.v instanceof Uint8Array ? x.v.length : x.v})`).join(" "));
const cat = (fields(d10).find(x => x.f === 1)!.v as Uint8Array);
console.log("L3:", fields(cat).map(x => `${x.f}/w${x.w}(${x.v instanceof Uint8Array ? x.v.length : x.v})`).join(" "));
const mod = (fields(cat).find(x => x.f === 1)!.v as Uint8Array);
console.log("L4:", fields(mod).map(x => `${x.f}/w${x.w}(${x.v instanceof Uint8Array ? x.v.length : x.v})`).join(" "));
