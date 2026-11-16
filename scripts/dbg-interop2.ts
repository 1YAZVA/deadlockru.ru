import * as rl from "/tmp/rl-buildcode.js";
console.log("module keys:", Object.keys(rl));
console.log("typeof decodeBuildCode:", typeof (rl as { decodeBuildCode?: unknown }).decodeBuildCode);
const d = (rl as { decodeBuildCode: (c: string) => unknown }).decodeBuildCode("KLUv/SA3uQEACAEQASoBWDIAOABAAFIoChMKAghk");
console.log("direct decode:", JSON.stringify(d));
