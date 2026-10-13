/*
 * scan-positive-check.js —— 给 secret-scan.js 的历史检索做「阳性对照」
 *
 * 目的：证明收紧后的历史规则不是"永远返回 0"。
 * 做法：在一个临时目录里另起一个 git 仓库（绝不动主仓库），提交一份装着假密钥的文件，
 *       然后用和 secret-scan.js 完全相同的命令去查，看它抓不抓得到。
 *
 *   用法： node tests/scan-positive-check.js
 *   退出码：0 = 六种密钥全被抓到（扫描器有效）；1 = 有漏网的
 */

"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

// 直接复用产品里的规则表，避免两边规则写歪
const src = fs.readFileSync(path.join(ROOT, "secret-scan.js"), "utf8");
const block = src.match(/const HISTORY_RULES = \[([\s\S]*?)\];/);
if (!block) {
  console.log("没能从 secret-scan.js 里读出 HISTORY_RULES，脚本中止");
  process.exit(1);
}
const HISTORY_RULES = eval("[" + block[1] + "]");

// 假密钥样本：形态和真的一模一样，但值全是编的
const FAKE = [
  "DATABASE_URL=postgres://magicuser:Passw0rd123@db.example.com:5432/magicdb",
  "AI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789",
  "GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  'password = "hunter2233"',   // 故意带空格：顺便验证 [[:space:]] 真的生效
  "secret='abc12345678'",
  "-----BEGIN RSA PRIVATE KEY-----",
].join("\n") + "\n";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "secret-positive-"));
function git(args, cwd) {
  const r = spawnSync("git", args, { cwd: cwd, encoding: "utf8", maxBuffer: 1e8 });
  return { code: r.status, out: ((r.stdout || "") + (r.stderr || "")).trim() };
}

git(["init", "-q"], tmp);
git(["-c", "user.name=tester", "-c", "user.email=tester@example.com", "commit", "--allow-empty", "-q", "-m", "init"], tmp);
fs.writeFileSync(path.join(tmp, "config.local.js"), FAKE);
git(["add", "config.local.js"], tmp);
git(["-c", "user.name=tester", "-c", "user.email=tester@example.com", "commit", "-q", "-m", "add config"], tmp);

console.log("=========== 阳性对照：扫描器到底会不会报警 ===========\n");
console.log("临时仓库：" + tmp + "（与主仓库无关，跑完可删）\n");

let missed = 0;
for (const [name, needle] of HISTORY_RULES) {
  const r = git(["log", "--all", "--oneline", "--pickaxe-regex", "-S", needle], tmp);
  const lines = (r.out ? r.out.split(/\r?\n/).filter(Boolean) : [])
    // 坑：git 正则写错时它不报错退出，而是把 fatal 打印到输出里、退出码仍然非 0，
    // 只看「有没有输出」会把报错当成命中（第一次就是这么骗过自己的）
    .filter(function (l) { return !/^fatal:|^error:|invalid regex/i.test(l); });
  if (r.code === 0 && lines.length > 0) {
    console.log("  ✓ " + name.padEnd(12) + " 抓到了（" + lines.length + " 处）");
  } else {
    missed++;
    console.log("  ✗ " + name.padEnd(12) + " 没抓到" + (r.code !== 0 ? "（git 报错：" + r.out.split(/\r?\n/)[0] + "）" : " —— 规则太松或太紧，需要修"));
  }
}

console.log("\n对照结论：" + (missed === 0
  ? "六种密钥形态全部被抓到，历史检索是有效的（主仓库报 0 命中 = 真没有，不是查不出）"
  : "有 " + missed + " 种漏网，扫描器不可信"));
console.log("=====================================================");

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 删不掉就算了 */ }
process.exit(missed === 0 ? 0 : 1);
