// 本地演示后端：不用任何账号，就能把“密钥校验 → 答题 → 出结果”全流程跑通
// 只用 Node 自带模块，零依赖。正式上线请改用 Supabase（见 backend/supabase/），不要把这个当正式后端用，
// 因为它的密钥数据就存在本机 data.json 里，任何人拿到服务器都能绕过。
// 用法：
//   node backend/local-server/server.mjs
//   然后打开 http://localhost:3000 （它同时会 serve ../frontend/）
// 默认自带一个演示密钥：DEMO-2026（第一次用完后会记为已用，重启后可到 data.json 里把 status 改回 unused，或删掉 data.json）
// API：
//   POST /api/keys/validate { code, redeemOnEntry } -> { ok, sessionToken } / { ok:false, error }
//   POST /api/submit-result { sessionToken, resultId, answers, scores } -> { ok }
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data.json");
const FRONTEND_DIR = join(__dirname, "..", "..", "frontend");
const PORT = process.env.PORT || 3000;

function hash(code) { return createHash("sha256").update(code.trim().toUpperCase()).digest("hex"); }

function load() {
  if (!existsSync(DATA_FILE)) {
    const init = { keys: [{ codeHash: hash("DEMO-2026"), prefix: "DEMO", status: "unused", usedAt: null }], sessions: [] };
    mkdirSync(__dirname, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf8"));
}
function save(db) { writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

function readBody(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (req.url.startsWith("/api/keys/validate") && req.method === "POST") {
    const { code, redeemOnEntry = true } = await readBody(req);
    const db = load();
    const key = db.keys.find((k) => k.codeHash === hash(String(code || "")));
    if (!key || key.status !== "unused") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "这个密钥已用过或不存在。" }));
    }
    const sessionToken = randomUUID();
    if (redeemOnEntry) {
      key.status = "used"; key.usedAt = new Date().toISOString();
      db.sessions.push({ id: sessionToken, keyHash: key.codeHash, startedAt: new Date().toISOString(), completedAt: null, resultId: null });
      save(db);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, sessionToken }));
  }

  if (req.url.startsWith("/api/submit-result") && req.method === "POST") {
    const body = await readBody(req);
    const db = load();
    const s = db.sessions.find((x) => x.id === body.sessionToken);
    if (s) { s.completedAt = new Date().toISOString(); s.resultId = body.resultId; s.answers = body.answers; s.scores = body.scores; save(db); }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  // 静态文件：serve frontend/
  let path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const file = readFileSync(join(FRONTEND_DIR, path));
    res.writeHead(200, { "Content-Type": MIME[extname(path)] || "text/plain" });
    return res.end(file);
  } catch {
    res.writeHead(404); return res.end("not found");
  }
});

server.listen(PORT, () => console.log(`本地演示后端已启动：http://localhost:${PORT} （演示密钥 DEMO-2026）`));
