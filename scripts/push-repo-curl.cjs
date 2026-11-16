/* Пушит весь проект deadlockru-app в репозиторий 1YAZVA/deadlockru.ru (ветка main)
   через Git Trees API одним коммитом. Транспорт — curl.exe (node fetch на этой
   машине нестабилен: DNS-сбой "api.github.comhttps"). Ретраи на каждом вызове. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPO = "1YAZVA/deadlockru.ru";
const BRANCH = "main";
const TOKEN = process.env.GH_TOKEN;
const TMP = path.join(os.tmpdir(), "dl-push");
fs.mkdirSync(TMP, { recursive: true });
let seq = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Один REST-вызов GitHub API через curl.exe. Возвращает распарсенный JSON. */
function gh(method, p, bodyObj, tries = 6, tag = "") {
  const bodyFile = path.join(TMP, "body" + (++seq) + ".json");
  const respFile = bodyFile + ".resp";
  const args = [
    "-s", "--max-time", "120",
    "-o", respFile,
    "-w", "%{http_code}",
    "-X", method,
    "-H", "Authorization: Bearer " + TOKEN,
    "-H", "Accept: application/vnd.github+json",
    "-H", "Content-Type: application/json",
    "-H", "User-Agent: deadlockru-push",
  ];
  if (bodyObj !== undefined) {
    fs.writeFileSync(bodyFile, JSON.stringify(bodyObj));
    args.push("--data-binary", "@" + bodyFile);
  }
  args.push("https://api.github.com" + p);

  for (let i = 0; i < tries; i++) {
    try {
      const code = execFileSync("curl.exe", args, { encoding: "utf8", timeout: 130_000 });
      const status = Number(String(code).trim());
      let body = "";
      try { body = fs.readFileSync(respFile, "utf8"); } catch {}
      if (status >= 200 && status < 300) return body ? JSON.parse(body) : null;
      // HTTP-статус: 4xx (кроме 429) — фатально, 5xx/429 — ретрай
      if (status >= 400 && status < 500 && status !== 429) {
        throw Object.assign(new Error("HTTP " + status + " @ " + p + " :: " + body.slice(0, 300)), { httpFatal: true });
      }
      console.log("retryable HTTP", status, tag, p);
    } catch (e) {
      if (e.httpFatal) { console.log("FAIL", tag, e.message); throw e; }
      // здесь попадают сбои запуска curl (EPERM) и коды выхода curl
      // (28 = таймаут и т.п.) — сетевые проблемы, всегда ретраим
      console.log("curl fail", i + 1, tag, p, String(e.message).slice(0, 110));
    }
    try { fs.rmSync(respFile, { force: true }); } catch {}
    if (i < tries - 1) sleep(4000 * (i + 1));
  }
  throw new Error("curl: исчерпаны ретраи @ " + p + " (" + tag + ")");
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".next-export", ".git", ".claude", ".z-ai-config", "skills", "img-cache"]);
function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name.startsWith(".") && f.name !== ".github" && f.name !== ".gitignore" && f.name !== ".env") continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!SKIP_DIRS.has(f.name)) walk(p, out); continue; }
    if (/\.(log|out)$/i.test(f.name)) continue;
    out.push(p);
  }
  return out;
}

(async () => {
  const files = walk(ROOT, []);
  console.log("files to push:", files.length);

  const ref = gh("GET", `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseCommit = gh("GET", new URL(ref.object.url).pathname);
  const baseTreeSha = baseCommit.tree.sha;
  console.log("base:", baseCommit.sha);

  // blobs с малой конкурентностью (curl.exe надёжнее fetch)
  const entries = [];
  const queue = [...files];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      const buf = fs.readFileSync(p);
      const blob = gh("POST", `/repos/${REPO}/git/blobs`,
        { content: buf.toString("base64"), encoding: "base64" }, 6, rel);
      entries.push({ path: rel, mode: "100644", type: "blob", sha: blob.sha });
      done++;
      if (done % 25 === 0) console.log("blobs:", done, "/", files.length);
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));

  console.log("blobs done:", entries.length, "— creating tree…");
  const tree = gh("POST", `/repos/${REPO}/git/trees`,
    { base_tree: baseTreeSha, tree: entries }, 5, "tree");
  const commit = gh("POST", `/repos/${REPO}/git/commits`, {
    message: [
      "feat: site v2 — Next.js portal, static export for GitHub Pages",
      "",
      "- full Next.js 16 + Prisma/SQLite app from author's handoff (src/, public/, db/custom.db, scripts/)",
      "- GitHub Pages mode: NEXT_PUBLIC_GH_PAGES=1 static export (.next-export, no server needed)",
      "  * all /api/* GET responses replaced by static JSON snapshots in public/data/*",
      "    (client-side pagination/search for leaderboard + patches, hero pages as /data/hero/<id>.json)",
      "  * player stats ported to browser: race of routes (own /dlapi/ worker slot, direct, public CORS proxies)",
      "  * image proxy /api/img bypassed: direct CDN links in GH mode",
      "  * /api/sync admin replaced by GitHub Action (data-sync.yml, every 30 min: sync -> snapshots -> commit)",
      "- workflows: pages-deploy.yml (build export + deploy artifact), data-sync.yml (cron sync + snapshot commit)",
      "- favicon.ico restored (was missing in the package)",
      "- server build unchanged: output=standalone for VPS/self-host (HANDOFF.md)",
    ].join("\n"),
    tree: tree.sha,
    parents: [baseCommit.sha],
  }, 5, "commit");
  gh("PATCH", `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false }, 5, "ref");
  console.log("PUSHED", commit.sha);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
})().catch((e) => {
  console.error("PUSH ERROR:", String(e.message || e).slice(0, 400));
  process.exit(1);
});
