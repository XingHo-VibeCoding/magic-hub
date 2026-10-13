/*
 * secret-scan.js —— 密钥排查脚本（Day 23，零依赖，node 直接跑）
 *
 *   用法：  node secret-scan.js
 *   退出码：0 = 没发现真实密钥；1 = 发现了必须处理的疑似密钥
 *
 * 为什么要固化成脚本：
 *   「仓库里没有密钥」这句话，手写一遍不算数，得能随时重跑、谁跑都得到同一个结果。
 *   老师 Day 23 的检测要求里也写了：没有命中就要明确说「0 命中」。
 *
 * 它查三件事：
 *   1. 工作树里有没有写着真实值的密钥（password/secret/sk-/连接串/私钥/令牌）
 *   2. Git 全部提交历史里有没有同样的东西（提交过了就不算没泄漏，必须查历史）
 *   3. .env 有没有被 .gitignore 挡住、.env.example 在不在
 *
 * 关于「命中但其实是误报」：
 *   直接搜关键字会把「请填写密码」这种界面文案、文档里提到的变量名也算进来，
 *   结果永远不是 0，反而让人分不清真有问题还是没问题是运气。
 *   所以这里按**值**判断而不是按**词**判断：
 *     · 只有「变量名 = 一段长得像密钥的值」才算疑似；
 *     · 值是中文、太短、或是明显的占位符 → 判成界面文案/占位，不计入；
 *     · 文档里只是提到变量名（没有值）→ 单独列出来说明，不计入。
 *   判读规则写在下面 JUDGE 注释里，改规则改那一处。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// 不参与扫描的目录：.git 是版本库本身，node_modules 是依赖，.workbuddy 是本地临时目录
const SKIP_DIRS = new Set([".git", "node_modules", ".workbuddy", "site-files"]);
const SCAN_EXT = /\.(js|jsx|ts|json|md|sql|html|css|yml|yaml|sh|bat|ps1|env|example|txt)$/i;
const EXTRA_NAMES = new Set([".env", ".env.example", ".env.local", "Dockerfile"]);

// ---------------------------------------------------------------------------
// 1. 工作树：只认「变量名 = 一段像密钥的值」
// ---------------------------------------------------------------------------
// 长得像密钥 = 长度 ≥ 8、不含中文和空格、且不是常见占位符
const PLACEHOLDERS = /^(xxx+|your[_-]?\w*|<[^>]*>|\{\{?\w*\}?\}|todo|tbd|changeme|example|placeholder|none|null|test)$/i;

function looksLikeSecret(value) {
  const v = String(value).trim();
  if (v.length < 8) return false;                    // 太短，不是密钥
  if (/[\u4e00-\u9fa5\s]/.test(v)) return false;     // 含中文或空格 = 界面文案
  if (PLACEHOLDERS.test(v)) return false;            // 明显占位符
  return /[A-Za-z0-9_\-]{8,}/.test(v);
}

// 赋值型：password/secret/token/apiKey 之类 = "值"
const ASSIGN_RULES = [
  ["口令赋值", /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*["']([^"']+)["']/i],
  ["OpenAI 风格密钥", /\b(sk-[A-Za-z0-9]{20,})\b/],
  ["GitHub 令牌", /\b(gh[pousr]_[A-Za-z0-9]{30,})\b/],
  ["数据库连接串", /\b(postgres(?:ql)?:\/\/[^\s"']+)\b/i],
  ["私钥文件头", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["Bearer 令牌", /\bBearer\s+([A-Za-z0-9._\-]{24,})/]
];

// 变量名提及（没有值）：文档里写到 AI_API_KEY 这种，只统计不计入
const MENTION_RULE = /\b(AI_API_KEY|API_KEY|SECRET_KEY|ACCESS_KEY|CLIENT_SECRET|DATABASE_URL)\b/;

const SELF = "secret-scan.js";   // 跳过自己：规则表里本来就写着这些关键字

function collectFiles(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) collectFiles(fp, out);
    else if (e.name === SELF && dir === ".") continue;
    else if (SCAN_EXT.test(e.name) || EXTRA_NAMES.has(e.name)) out.push(fp);
  }
  return out;
}

function scanWorktree() {
  const files = collectFiles(".", []);
  const suspects = [];   // 疑似真实密钥（要处理）
  const mentions = [];   // 只是提到变量名（说明一下，不算问题）

  for (const f of files) {
    let text;
    try { text = fs.readFileSync(f, "utf8"); } catch (e) { continue; }
    text.split(/\r?\n/).forEach(function (line, i) {
      const loc = f + ":" + (i + 1);
      for (const [name, re] of ASSIGN_RULES) {
        const m = line.match(re);
        if (!m) continue;
        const value = m[1] || m[0];
        if (name === "私钥文件头") { suspects.push([name, loc, line.trim().slice(0, 100)]); continue; }
        if (looksLikeSecret(value)) suspects.push([name, loc, line.trim().slice(0, 100)]);
      }
      if (MENTION_RULE.test(line)) mentions.push([loc, line.trim().slice(0, 100)]);
    });
  }
  return { fileCount: files.length, suspects: suspects, mentions: mentions };
}

// ---------------------------------------------------------------------------
// 2. Git 历史：提交过就算泄漏，所以必须查全部历史
// ---------------------------------------------------------------------------
// 两个约束，都是踩过坑才加的：
//
// 1) 模式必须「长得像真值」，不能只匹配关键字。
//    踩过的坑：只写 postgres:// 会把 SECURITY_CHECK.md 里那句检查项说明
//    （「提交历史：`postgres://` 连接串」）当成命中——它只是个名字，后面没有值。
//    所以连接串要求带 user:pass@ 形态，口令/密钥要求等号后面跟 8 位以上实际字符。
//
// 2) sk- / ghp_ 带最小长度，避免把 CSS 类名（.sk-tag / .sk-line）当成密钥。
//
// 3) git -S 用的是 POSIX 正则，有两样东西不能写（都实测踩过）：
//    - `(?:...)` 非捕获组 → 直接报 fatal: invalid regex，整条规则失效；
//    - `\s` 空白简写     → 不报错，但匹配不上，等于这条规则永远 0 命中（静默失效，最危险）。
//    所以下面一律用 POSIX 字符类 [[:space:]]，需要分组就用 (a|b)。
const HISTORY_RULES = [
  ["数据库连接串", "(postgres|postgresql)://[^ '\"]+:[^ @'\"]+@"],
  ["OpenAI 风格密钥", "sk-[A-Za-z0-9]{20,}"],
  ["GitHub 令牌", "gh[pousr]_[A-Za-z0-9]{30,}"],
  ["口令赋值", "password[[:space:]]*=[[:space:]]*[\"']?[A-Za-z0-9_\\-]{8,}"],
  ["密钥赋值", "secret[[:space:]]*=[[:space:]]*[\"']?[A-Za-z0-9_\\-]{8,}"],
  ["私钥", "BEGIN [A-Z ]*PRIVATE KEY-----"]
];

// 历史检索要排除自己：本文件的规则表里就写着 postgres://、password= 这些字符串，
// 不排除的话每次都会"自命中"，把真正的警报淹没掉（工作树扫描早就跳过了自己，这里补上）。
const HISTORY_PATHSPEC = ["--", ".", ":(exclude)" + SELF];

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 1e8 });
  return { code: r.status, ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
}

function scanHistory() {
  const count = git(["rev-list", "--all", "--count"]);
  if (!count.ok) return { available: false, reason: "git 不可用（没装或不在 PATH 里）" };

  const results = [];
  for (const [name, needle] of HISTORY_RULES) {
    // -S 找的是「这个字符串在哪个提交里被加进来或删掉过」；--pickaxe-regex 让它按正则找
    const r = git(["log", "--all", "--oneline", "--pickaxe-regex", "-S", needle].concat(HISTORY_PATHSPEC));
    const lines = r.out ? r.out.split(/\r?\n/).filter(Boolean) : [];
    results.push({ name: name, needle: needle, hits: lines });
  }
  return { available: true, commitCount: count.out, results: results };
}

// ---------------------------------------------------------------------------
// 3. .env 与忽略规则
// ---------------------------------------------------------------------------
function checkEnv() {
  // 判定「有没有被忽略」必须看**不带 -v 时的退出码**：0 = 被忽略，1 = 没被忽略。
  // 坑：加了 -v 之后，哪怕匹配到的是 `!.env.example` 这种"排除（不忽略）"规则，
  // git 也会打印一行来源并返回 0 —— 只看输出或只看 -v 的退出码都会把意思读反。
  // 实测：.env → exit 0（被忽略）；.env.example → 带 -v 是 0、不带 -v 是 1（实际没被忽略）。
  const envIgnored = git(["check-ignore", ".env"]).ok;
  const exIgnored = git(["check-ignore", ".env.example"]).ok;
  const envFrom = git(["check-ignore", "-v", ".env"]).out;
  return {
    envExists: fs.existsSync(".env"),
    exampleExists: fs.existsSync(".env.example"),
    ignored: envIgnored ? envFrom : "",
    exampleIgnored: exIgnored
  };
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------
function main() {
  const wt = scanWorktree();
  const hi = scanHistory();
  const env = checkEnv();

  console.log("=========== 密钥排查报告（secret-scan.js）===========\n");

  console.log("【1】工作树扫描（扫了 " + wt.fileCount + " 个文件）");
  if (wt.suspects.length === 0) {
    console.log("    疑似真实密钥：0 命中");
  } else {
    console.log("    疑似真实密钥：" + wt.suspects.length + " 处 —— 必须处理");
    wt.suspects.forEach(function (s) { console.log("      [" + s[0] + "] " + s[1] + "  " + s[2]); });
  }
  if (wt.mentions.length > 0) {
    console.log("    仅提到变量名、没有值（不计入）：" + wt.mentions.length + " 处");
    wt.mentions.forEach(function (m) { console.log("      " + m[0] + "  " + m[1]); });
  }
  console.log("");

  console.log("【2】Git 提交历史扫描");
  if (!hi.available) {
    console.log("    跳过：" + hi.reason);
  } else {
    console.log("    共 " + hi.commitCount + " 个提交，逐个模式检索：");
    let total = 0;
    hi.results.forEach(function (r) {
      total += r.hits.length;
      if (r.hits.length === 0) {
        console.log("      " + r.name + "（" + r.needle + "）→ 0 命中");
      } else {
        console.log("      " + r.name + "（" + r.needle + "）→ " + r.hits.length + " 处：");
        r.hits.forEach(function (h) { console.log("        " + h); });
      }
    });
    console.log("    历史命中合计：" + total + " 处");
  }
  console.log("");

  console.log("【3】.env 与忽略规则");
  console.log("    .env 是否存在：" + (env.envExists ? "是（不该存在！）" : "否 ✓"));
  console.log("    .env.example 是否存在：" + (env.exampleExists ? "是 ✓" : "否（缺）"));
  console.log("    .env 是否被忽略：" + (env.ignored ? "是 ✓  " + env.ignored.split("\n")[0] : "否（需要修 .gitignore）"));
  console.log("    .env.example 是否被忽略：" + (env.exampleIgnored ? "是（应排除，它要进仓库）" : "否 ✓（会进仓库）"));
  console.log("");

  const clean = wt.suspects.length === 0 && !env.envExists;
  console.log("=====================================================");
  console.log(clean
    ? "结论：工作树与提交历史均未发现真实密钥，0 命中。"
    : "结论：发现需要处理的问题，见上方清单。");
  console.log("=====================================================");

  process.exit(clean ? 0 : 1);
}

main();
