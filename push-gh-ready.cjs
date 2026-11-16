/* Пушит стейджинг (deadlockru-github-ready) в 1YAZVA/deadlockru.ru (main).
   base_tree сохраняет старые файлы (index.html, css/, js/, data/, img/, heroes/,
   worker/ — источник отката) и замещает пересекающиеся пути.
   Удаляет устаревшие воркфлоу pages-deploy.yml / data-sync.yml (их заменяет
   авторский deploy.yml). deploy-legacy.yml остаётся для отката.
   Транспорт — curl.exe (node fetch нестабилен на этой машине). Ретраи. */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname); // стейджинг-папка, где лежит сам скрипт
const REPO = "1YAZVA/deadlockru.ru";
const BRANCH = "main";
const TOKEN = process.env.GH_TOKEN;
const TMP = path.join(os.tmpdir(), "dl-push2");
fs.mkdirSync(TMP, { recursive: true });
let seq = 0;

const DELETE = [
  ".github/workflows/pages-deploy.yml",
  ".github/workflows/data-sync.yml",
];
const MSG = [
  "feat: deadlockru-github-ready — author's GitHub Pages build",
  "",
  "- author-prepared static package: workflows/deploy.yml (sync -> JSON export +",
  "  image mirror -> next static build -> Pages artifact), db snapshot with data,",
  "  yandex-function/ for the account tab (serverless player-stats API)",
  "- replaces temporary pages-deploy.yml / data-sync.yml (deploy.yml supersedes them)",
  "- legacy static site files kept at repo root for instant rollback (deploy-legacy.yml)",
  "- favicon.ico / public leftovers kept from previous commit",
].join("\n");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gh(method, p, bodyObj, tries = 6, tag = "") {
  const bodyFile = path.join(TMP, "b" + (++seq) + ".json");
  const respFile = bodyFile + ".resp";
  const args = [
    "-s", "--max-time", "120", "-o", respFile, "-w", "%{http_code}",
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
      if (status >= 400 && status < 500 && status !== 429) {
        throw Object.assign(new Error("HTTP " + status + " @ " + p + " :: " + body.slice(0, 300)), { httpFatal: true });
      }
      console.log("retryable HTTP", status, tag);
    } catch (e) {
      if (e.httpFatal) { console.log("FAIL", tag, e.message); throw e; }
      console.log("curl fail", i + 1, tag, String(e.message).slice(0, 110));
    }
    try { fs.rmSync(respFile, { force: true }); } catch {}
    if (i < tries - 1) sleep(4000 * (i + 1));
  }
  throw new Error("curl: retries exhausted @ " + p + " (" + tag + ")");
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".next-export", "out", ".git", ".claude", ".z-ai-config", "skills", ".img-mirror", "img-cache"]);
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
  console.log("base:", baseCommit.sha);

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

  for (const p of DELETE) entries.push({ path: p, mode: "100644", type: "blob", sha: null });

  console.log("blobs done:", entries.length, "— creating tree…");
  const tree = gh("POST", `/repos/${REPO}/git/trees`,
    { base_tree: baseCommit.tree.sha, tree: entries }, 5, "tree");
  const commit = gh("POST", `/repos/${REPO}/git/commits`,
    { message: MSG, tree: tree.sha, parents: [baseCommit.sha] }, 5, "commit");
  gh("PATCH", `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false }, 5, "ref");
  console.log("PUSHED", commit.sha);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
})().catch((e) => { console.error("PUSH ERROR:", String(e.message || e).slice(0, 400)); process.exit(1); });
