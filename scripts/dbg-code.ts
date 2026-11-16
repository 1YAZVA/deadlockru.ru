import { buildPayload, encodeBuildCode, decodeBuildCode } from "../src/lib/buildroll";
const p = buildPayload({ heroId: 1, name: "X", desc: "", categories: [{ name: "C", items: [100, 200] }], abilityChanges: [{ ability_id: 42, currency_type: 2, delta: -1 }] });
console.log("payload hex:", Array.from(p).map((x) => x.toString(16).padStart(2, "0")).join(" "));
console.log("payload len:", p.length);
const code = encodeBuildCode({ heroId: 1, name: "X", desc: "", categories: [{ name: "C", items: [100, 200] }], abilityChanges: [{ ability_id: 42, currency_type: 2, delta: -1 }] });
console.log("code:", code.slice(0, 40));
// вручную: распакуем base64 и посмотрим на protobuf
const bin = atob(code);
const raw = Uint8Array.from(bin, (c) => c.charCodeAt(0));
const fhd = raw[4];
const headLen = fhd === 0x20 ? 2 : fhd === 0x60 ? 3 : 0;
const body = raw.subarray(4 + headLen + 3);
console.log("body hex:", Array.from(body).map((x) => x.toString(16).padStart(2, "0")).join(" "));
try {
  console.log("decode:", JSON.stringify(decodeBuildCode(code)));
} catch (e) {
  console.log("decode error:", String(e));
}
