/* Пушит весь проект deadlockru-app в репозиторий 1YAZVA/deadlockru.ru (ветка main)
   через Git Trees API одним коммитом, с ретраями на сетевых сбоях. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REPO = "1YAZVA/deadlockru.ru";
const BRANCH = "main";
const TOKEN = process.env.GH_TOKEN;
const HDR = {
  Authorization: "Bearer " + TOKEN,
  Accept: "application/vnd.github+json",
  "User-Agent": "deadlockru-push",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gh(p, opts, tries = 6, tag = "") {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch("https://api.github.com" + p, { ...opts, headers: HDR });
      const body = await r.text();
      if (!r.ok) {
        if (r.status >= 500 || r.status === 429) { console.log("retryable", r.status, tag, p); await sleep(3000 * (i + 1)); continue; }
        throw new Error(r.status + " @ " + p + " :: " + body.slice(0, 300));
      }
      return body ? JSON.parse(body) : null;
    } catch (e) {
      const cause = e && e.cause ? " cause=" + String(e.cause).slice(0, 120) : "";
      console.log("fetch fail", i + 1, tag, p, String(e).slice(0, 80) + cause);
      if (i === tries - 1) throw e;
      await sleep(5000 * (i + 1));
    }
  }
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

  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseCommit = await gh(ref.object.url);
  const baseTreeSha = baseCommit.tree.sha;

  const entries = [];
  const queue = [...files];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const p = queue.shift();
      const rel = path.relative(ROOT, p).replace(/\\/g, "/");
      const buf = fs.readFileSync(p);
      const blob = await gh(`/repos/${REPO}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: buf.toString("base64"), encoding: "base64" }),
      }, 6, rel);
      entries.push({ path: rel, mode: "100644", type: "blob", sha: blob.sha });
      done++;
      if (done % 50 === 0) console.log("blobs:", done, "/", files.length);
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));

  const tree = await gh(`/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
  });
  const commit = await gh(`/repos/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
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
    }),
  });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  console.log("PUSHED", commit.sha);
})().catch((e) => { console.error("PUSH ERROR:", e.message); process.exit(1); });
