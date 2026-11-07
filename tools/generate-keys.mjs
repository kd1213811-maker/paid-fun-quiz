// 批量生成密钥（卖家工具，在自己电脑上跑，不要上传生成结果）
// 用法：node tools/generate-keys.mjs --count 100 --batch "第一批"
// 输出：
//   - 控制台打印 CSV（code 明文）：交给店铺手动发货用，发完请妥善保存，不要提交到 GitHub
//   - tools/keys-<batch>.sql：只含 SHA-256 哈希的 INSERT 语句，拿到 Supabase SQL Editor 里执行
// 密钥格式：XXXX-XXXX-XXXX（每组 4 位大写字母数字，去掉容易混淆的 0/O、1/I）
import { randomBytes, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const count = Number((args[args.indexOf("--count") + 1]) || 50);
const batch = args[args.indexOf("--batch") + 1] || "batch-1";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function oneCode() {
  const bytes = randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}
function hash(code) { return createHash("sha256").update(code).digest("hex"); }

const codes = new Set();
while (codes.size < count) codes.add(oneCode());
const list = [...codes];

console.log("code");
list.forEach((c) => console.log(c));
console.log(`\n# 共 ${list.length} 个密钥，明文只显示这一次。请保存好 CSV，不要提交到 GitHub。`);

const sql = [
  `-- 先在 Supabase SQL Editor 里建一批次，拿到 batch_id 后替换下面这一行`,
  `-- insert into key_batches (name) values ('${batch}') returning id;`,
  ...list.map((c) => `insert into access_keys (batch_id, code_hash, code_prefix) values ('<batch_id>', '${hash(c)}', '${c.slice(0, 4)}');`),
].join("\n");
writeFileSync(`tools/keys-${batch}.sql`, sql);
console.log(`# 哈希版 SQL 已写入 tools/keys-${batch}.sql（可安全执行，里面没有明文密钥）`);
