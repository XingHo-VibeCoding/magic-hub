/*
 * verify.js —— 发布前检查脚本（Day 25，零依赖，node 直接跑）
 *
 *   用法（在项目根目录）： node .workbuddy/skills/verify-project/verify.js
 *   退出码： 0 = 十项全过；1 = 有 FAIL
 *   环境变量： GIT_BIN（git 不在 PATH 时指定 git.exe 全路径）
 *              SITE（静态托管域名，默认 magic-hub 现网地址）
 *
 * 每项都输出三行：结论 / 判定（怎么算通过）/ 实测（实际观测到什么）。
 * 判定标准全部是可判定的数字或字符串，不允许「看起来正常」。
 * 检查项来自本项目真实踩过的坑，不是通用模板。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..", "..");
const GIT = process.env.GIT_BIN || "git";
const TIMEOUT_MS = 20000;
const SITE = process.env.SITE || "https://magic-hub-d7gt99c7waafb07ad-1501395198.tcloudbaseapp.com";

// 接口域名从 api.js 里读出来，不在两个地方各写一遍（写两遍迟早对不上）
function readApiBase() {
  const src = fs.readFileSync(path.join(ROOT, "api.js"), "utf8");
  const m = src.match(/var\s+BASE\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}
const API = readApiBase();

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
async function request(url, opts) {
  opts = opts || {};
  const send = async function () {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal
      });
      const text = await res.text();
      clearTimeout(timer);
      return { ok: true, status: res.status, ms: Date.now() - t0, text: text };
    } catch (e) {
      clearTimeout(timer);
      return { ok: false, ms: Date.now() - t0, error: String((e && e.message) || e) };
    }
  };

  let r = await send();
  // CloudBase 免费版云函数固定 3 秒超时，冷启动偶发 504。
  // 这是环境特性不是代码问题，所以自动重试一次；重试成功不算 FAIL，但会标注出来。
  const cold = r.ok && (r.status === 504 || /FUNCTIONS_TIME_LIMIT_EXCEEDED/.test(r.text));
  if (cold) {
    r = await send();
    r.retried = true;
  }
  return r;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

function dataList(j) {
  if (!j || !j.data) return [];
  if (Array.isArray(j.data)) return j.data;
  if (Array.isArray(j.data.items)) return j.data.items;
  if (Array.isArray(j.data.list)) return j.data.list;
  return [];
}

// 从 secret-scan.js 的输出里挑出「命中清单」那几行，形如：
//   [口令赋值] cloudfunctions\favorites\index.js:13  var AI_API_KEY = "sk-...";
// 只贴输出尾部的话，截图里看不出到底哪儿有问题，等于白报。
function hitLines(sOut) {
  return String(sOut || "").split(/\r?\n/).filter(function (l) {
    return /^\s+\[[^\]]+\]\s+\S+:\d+/.test(l);
  }).map(function (l) { return l.trim(); });
}

function tail(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? "……" + t.slice(-n) : t;
}

function readIfExists(p) {
  try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// 第 1 项：公网首页可访问
// ---------------------------------------------------------------------------
async function checkHome() {
  const criteria = "HTTP 200，且响应体里含 <title 与 app.js（两个都在才算真的拿到了首页）";
  const r = await request(SITE + "/");
  if (!r.ok) return { pass: false, actual: "请求失败：" + r.error };
  const hasTitle = r.text.indexOf("<title") >= 0;
  const hasApp = r.text.indexOf("app.js") >= 0;
  const pass = r.status === 200 && hasTitle && hasApp;
  return {
    pass: pass,
    actual: "HTTP " + r.status + "（" + r.ms + "ms，响应 " + r.text.length + " 字符），含 <title：" +
      (hasTitle ? "是" : "否") + "，含 app.js：" + (hasApp ? "是" : "否")
  };
}

// ---------------------------------------------------------------------------
// 第 2 项：健康接口正常
// ---------------------------------------------------------------------------
async function checkHealth() {
  const criteria = "body 里 ok===true 且 data.status===\"ok\" 且 data.service===\"magic-hub\"（网关一律 200，只看 body）";
  const r = await request(API + "/api/health");
  if (!r.ok) return { pass: false, actual: "请求失败：" + r.error };
  const j = parseJson(r.text);
  if (!j) return { pass: false, actual: "返回不是合法 JSON：" + tail(r.text, 120) };
  const ok = j.ok === true && j.data && j.data.status === "ok" && j.data.service === "magic-hub";
  return {
    pass: ok,
    actual: "HTTP " + r.status + "（" + r.ms + "ms" + (r.retried ? "，冷启动重试一次后" : "") +
      "），ok=" + j.ok + "，status=" + (j.data && j.data.status) + "，service=" + (j.data && j.data.service)
  };
}

// ---------------------------------------------------------------------------
// 第 3 项：读接口正常（= 数据库连得上）
// ---------------------------------------------------------------------------
async function checkRead(ctx) {
  const criteria = "ok===true 且返回的资料条数 > 0（查得到行才算真的连上库）";
  const r = await request(API + "/api/resources");
  if (!r.ok) return { pass: false, actual: "请求失败：" + r.error };
  const j = parseJson(r.text);
  if (!j) return { pass: false, actual: "返回不是合法 JSON：" + tail(r.text, 120) };
  const list = dataList(j);
  ctx.resources = list;
  return {
    pass: j.ok === true && list.length > 0,
    actual: "HTTP " + r.status + "（" + r.ms + "ms" + (r.retried ? "，冷启动重试一次后" : "") +
      "），ok=" + j.ok + "，资料 " + list.length + " 条"
  };
}

// ---------------------------------------------------------------------------
// 第 4 项：写接口能写（写完自清，不留脏数据）
// ---------------------------------------------------------------------------
async function checkWrite(ctx) {
  const criteria = "挑一条未收藏的资料 POST 成功拿到 id → DELETE 掉 → 再 GET 列表确认它不在。三步全成才算过";
  const list = ctx.resources || [];
  if (!list.length) return { pass: false, actual: "读接口没拿到资料，没法做写入测试" };

  const fav = await request(API + "/api/favorites");
  const fj = parseJson(fav.text);
  if (!fj || fj.ok !== true) {
    return { pass: false, actual: "先拉收藏列表失败，无法挑未收藏的目标：" + tail(fav.text, 120) };
  }
  const faved = new Set(dataList(fj).map(function (f) { return f.resource_id; }));
  const target = list.map(function (x) { return x.id; }).filter(function (id) { return !faved.has(id); })[0];
  if (!target) {
    return { pass: false, actual: "所有资料都已被收藏，找不到可写入的目标（先取消一条收藏再跑）" };
  }

  const post = await request(API + "/api/favorites", { method: "POST", body: { resource_id: target } });
  const pj = parseJson(post.text);
  if (!(pj && pj.ok === true && pj.data && pj.data.id)) {
    return { pass: false, actual: "POST 写入失败：" + tail(post.text, 160) };
  }
  const newId = pj.data.id;

  const del = await request(API + "/api/favorites/" + newId, { method: "DELETE" });
  const dj = parseJson(del.text);
  if (!(dj && dj.ok === true)) {
    return {
      pass: false,
      actual: "写入成功但删除失败，数据库里留下了一条测试收藏（id=" + newId +
        "）。请手动清理：DELETE " + API + "/api/favorites/" + newId + "；返回：" + tail(del.text, 160)
    };
  }

  const after = await request(API + "/api/favorites");
  const aj = parseJson(after.text);
  const still = (aj ? dataList(aj) : []).some(function (f) { return f.id === newId; });
  if (still) {
    return { pass: false, actual: "删除返回成功，但列表里还能查到 id=" + newId + "（删除没真生效）" };
  }
  return {
    pass: true,
    actual: "resource_id=" + target + " 写入成功（id=" + newId + "，用时 " + post.ms + "ms）→ 删除成功 → 列表里查不到它，未留脏数据"
  };
}

// ---------------------------------------------------------------------------
// 第 5 项：无硬编码密钥（含阳性对照，防「永远 0 命中」的假绿）
// ---------------------------------------------------------------------------
function checkSecrets(gitOk, gitHint) {
  const criteria = "secret-scan.js 退出码 0 且报 0 命中；同时阳性对照脚本必须真的抓到假密钥";
  if (!gitOk) {
    return { pass: false, actual: "git 调不起来，密钥扫描里的提交历史检索跑不了。设 GIT_BIN 后重跑 " + gitHint };
  }
  const s = spawnSync(process.execPath, ["secret-scan.js"], { cwd: ROOT, encoding: "utf8" });
  const sOut = (s.stdout || "") + (s.stderr || "");
  const hits = hitLines(sOut);
  if (s.status !== 0) {
    return {
      pass: false,
      actual: "扫出 " + hits.length + " 处疑似密钥（退出码 " + s.status + "）" +
        (hits.length ? "：" + hits.slice(0, 4).join(" ｜ ") : "，但没解析出命中行，原文尾部：" + tail(sOut, 200))
    };
  }
  if (!/0 命中/.test(sOut)) {
    return { pass: false, actual: "扫描退出码是 0，但输出里没有「0 命中」，规则可能被改坏了。原文尾部：" + tail(sOut, 200) };
  }
  const p = spawnSync(process.execPath, ["tests/scan-positive-check.js"], { cwd: ROOT, encoding: "utf8" });
  if (p.status !== 0) {
    return {
      pass: false,
      actual: "扫描器自己报 0 命中，但阳性对照没抓到假密钥 —— 规则可能已经失效（假绿）。输出尾部：" +
        tail((p.stdout || "") + (p.stderr || ""), 200)
    };
  }
  return { pass: true, actual: "工作树与提交历史 0 命中；阳性对照 6 种假密钥全部被抓到（规则有效）" };
}

// ---------------------------------------------------------------------------
// 第 6 项：.gitignore 完整
// ---------------------------------------------------------------------------
function checkGitignore(gitOk, gitHint) {
  const criteria = ".env / *.env / *.zip / .workbuddy 临时目录被忽略；.env.example 和 Skill 文件没被忽略";
  if (!gitOk) return { pass: false, actual: "git 调不起来，忽略规则判不了。设 GIT_BIN 后重跑 " + gitHint };
  const cases = [
    { p: ".env", want: true },
    { p: "secret.env", want: true },
    { p: "pack.zip", want: true },
    { p: ".workbuddy/tmp-day24/probe.js", want: true },
    { p: ".env.example", want: false },
    { p: ".workbuddy/skills/verify-project/SKILL.md", want: false }
  ];
  const bad = [];
  cases.forEach(function (c) {
    // git check-ignore 不带 -v：找到匹配返回 0（被忽略），没匹配返回 1（会入库）。
    // 带 -v 时 git 也会打印一行来源并返回 0，只看退出码会把意思读反（Day 23 踩过）。
    const ignored = spawnSync(GIT, ["check-ignore", c.p], { cwd: ROOT }).status === 0;
    if (ignored !== c.want) bad.push(c.p + "（期望" + (c.want ? "被忽略" : "入库") + "，实际" + (ignored ? "被忽略" : "入库") + "）");
  });
  return {
    pass: bad.length === 0,
    actual: bad.length === 0
      ? "6 条忽略规则判定全部符合预期（.env / *.env / *.zip / 临时目录已忽略，.env.example 与 Skill 文件会入库）"
      : "不符合的：" + bad.join("；")
  };
}

// ---------------------------------------------------------------------------
// 第 7 项：云函数打包依赖完整
// ---------------------------------------------------------------------------
function resolveModule(file, spec) {
  const base = path.resolve(path.dirname(file), spec);
  const cands = [base, base + ".js", path.join(base, "index.js")];
  for (let i = 0; i < cands.length; i++) {
    if (fs.existsSync(cands[i]) && fs.statSync(cands[i]).isFile()) return cands[i];
  }
  return null;
}

function checkFnDeps() {
  const criteria = "每个 cloudfunctions 下的 js，require / requireShared 写的相对路径，目标文件真实存在";
  const fnRoot = path.join(ROOT, "cloudfunctions");
  const files = [];
  ["favorites", "resources", "health", "_shared"].forEach(function (d) {
    const dir = path.join(fnRoot, d);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(function (f) {
      if (/\.js$/.test(f)) files.push(path.join(dir, f));
    });
  });
  const missing = [];
  files.forEach(function (f) {
    const src = fs.readFileSync(f, "utf8");
    let m;
    const reRequire = /require\(\s*["']([^"']+)["']\s*\)/g;
    while ((m = reRequire.exec(src))) {
      const spec = m[1];
      if (spec.indexOf(".") !== 0) continue; // 只查相对路径，npm 包不在检查范围
      if (!resolveModule(f, spec)) missing.push(path.relative(ROOT, f) + " → " + spec);
    }
    // requireShared 是 Day 23 的双路径写法：仓库里是 ../_shared/x，打进 zip 后是 ./_shared/x，
    // 两个位置只要有一个能解析到就算过（两个都找不到才是真缺文件）。
    // 传进来的还可能是裸名（requireShared('rdb')），loader.js 内部会自己拼前缀，
    // 所以裸名要按 ../_shared/<名> 和 ./_shared/<名> 两个位置都试一遍。
    const reShared = /requireShared\(\s*["']([^"']+)["']\s*\)/g;
    while ((m = reShared.exec(src))) {
      const spec = m[1];
      if (resolveModule(f, spec)) continue;
      const alts = [];
      if (spec.indexOf("../_shared/") === 0) alts.push("./_shared/" + spec.slice("../_shared/".length));
      else if (spec.indexOf("./_shared/") === 0) alts.push("../_shared/" + spec.slice("./_shared/".length));
      else alts.push("../_shared/" + spec, "./_shared/" + spec);
      let found = false;
      for (let i = 0; i < alts.length; i++) {
        if (resolveModule(f, alts[i])) { found = true; break; }
      }
      if (found) continue;
      missing.push(path.relative(ROOT, f) + " → " + spec + "（能解析的位置一个都没有）");
    }
  });
  return {
    pass: missing.length === 0,
    actual: missing.length === 0
      ? files.length + " 个云函数文件的相对引用全部能解析到真实文件"
      : "解析不到的引用：" + missing.join("；")
  };
}

// ---------------------------------------------------------------------------
// 第 8 项：接口域名没和静态托管域名混用
// ---------------------------------------------------------------------------
function checkDomains() {
  const criteria = "api.js 的 BASE 主机名以 .ap-shanghai.app.tcloudbase.com 结尾，且与静态托管域名不同源";
  if (!API) return { pass: false, actual: "没从 api.js 里读出 BASE，检查脚本的读取规则要更新了" };
  let apiHost = "", siteHost = "";
  try {
    apiHost = new URL(API).hostname;
    siteHost = new URL(SITE).hostname;
  } catch (e) {
    return { pass: false, actual: "域名解析失败：" + e.message };
  }
  const pass = apiHost.indexOf(".ap-shanghai.app.tcloudbase.com") > 0 &&
    siteHost.indexOf(".tcloudbaseapp.com") > 0 &&
    apiHost !== siteHost;
  return {
    pass: pass,
    actual: "接口域名 " + apiHost + "，静态托管域名 " + siteHost +
      "（" + (apiHost === siteHost ? "两者相同，请求会跨域失败" : "不同源，符合预期") + "）"
  };
}

// ---------------------------------------------------------------------------
// 第 9 项：页面脚本引用完整
// ---------------------------------------------------------------------------
function checkHtmlRefs() {
  const criteria = "本地 src/href 指向的文件都存在；有数据卡片容器 .card-grid 的页面必须引 api.js";
  const dirs = ["", "shumo", "edian"];
  const htmls = [];
  dirs.forEach(function (d) {
    const dir = path.join(ROOT, d);
    fs.readdirSync(dir).forEach(function (f) {
      if (/\.html$/.test(f)) htmls.push(path.join(dir, f));
    });
  });
  const problems = [];
  htmls.forEach(function (f) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const src = fs.readFileSync(f, "utf8");
    const refs = [];
    let m;
    const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
    while ((m = re.exec(src))) {
      const u = m[1];
      if (/^(https?:|#|mailto:|javascript:|\/\/)/.test(u)) continue;
      refs.push(u.split("#")[0].split("?")[0]);
    }
    refs.forEach(function (u) {
      if (!u) return;
      const target = path.resolve(path.dirname(f), u);
      if (!fs.existsSync(target)) problems.push(rel + " 引用的 " + u + " 不存在");
    });
    const usesApi = refs.some(function (u) { return /(^|\/)api\.js$/.test(u); });
    // 只有真正要渲染数据的页面才需要 api.js，判据是页面里有没有 .card-grid
    //（app.js 就是往这个容器里塞资料卡片的）。
    // 不带容器的页面（登录、注册、分区首页）缺 api.js 目前不产生实际影响：
    // app.js 里 window.MagicAPI 只有一处且是防御写法（api() 拿不到就降级本地示例数据），
    // 所以不能一刀切地要求「引了 app.js 就必须引 api.js」——那会误报。
    const needsData = src.indexOf("card-grid") >= 0;
    if (needsData && !usesApi) {
      problems.push(rel + " 有 .card-grid 却没引 api.js（会静默降级成本地示例数据，页面上看不出来）");
    }
  });
  return {
    pass: problems.length === 0,
    actual: problems.length === 0
      ? htmls.length + " 个页面的本地引用全部存在，且需要数据的页面都引了 api.js"
      : "共 " + problems.length + " 处：" + problems.join("；")
  };
}

// ---------------------------------------------------------------------------
// 第 10 项：线上文件与本地一致（回答「我改的东西到底部署了没」）
// ---------------------------------------------------------------------------
async function checkDeployed() {
  const criteria = "线上拉取的 app.js / styles.css / api.js / mock-data.js / index.html，与本地文件逐字符相同";
  const files = ["index.html", "app.js", "styles.css", "api.js", "mock-data.js"];
  const diffs = [];
  let sameCount = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const local = readIfExists(path.join(ROOT, f));
    if (local === null) { diffs.push(f + " 本地不存在"); continue; }
    const r = await request(SITE + "/" + f);
    if (!r.ok) { diffs.push(f + " 线上拉取失败：" + r.error); continue; }
    if (r.status !== 200) { diffs.push(f + " 线上返回 HTTP " + r.status); continue; }
    const norm = function (s) { return s.replace(/\r\n/g, "\n"); };
    if (norm(r.text) === norm(local)) {
      sameCount++;
    } else {
      diffs.push(f + " 不一致（线上 " + r.text.length + " 字符，本地 " + local.length + " 字符）");
    }
  }
  return {
    pass: diffs.length === 0,
    actual: diffs.length === 0
      ? "5 个文件线上与本地逐字符相同（说明本地改动都已经部署到静态托管）"
      : sameCount + " 个相同，其余不一致：" + diffs.join("；") + "。提醒：改完前端要重新部署静态托管才会生效"
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  // git 调不起来时把原因说清楚：最常见的坑是 GIT_BIN 写成 /g/... 这种 Git Bash 路径，
  // node 的 spawnSync 只认 Windows 形式（G:/... 或 G:\...），认不出来会静默失败。
  const gitProbe = spawnSync(GIT, ["--version"], { encoding: "utf8" });
  const gitOk = gitProbe.status === 0;
  const gitHint = gitOk ? "" : "（" + GIT + " 调不起来" +
    (gitProbe.error && gitProbe.error.code === "ENOENT"
      ? "：路径要写成 Windows 形式，例如 G:/Software/Git/cmd/git.exe；/g/... 这种 Git Bash 写法 node 认不了"
      : "") + "）";
  const ctx = {};
  const results = [];

  const run = async function (no, name, criteria, fn) {
    let out;
    try {
      out = await fn();
    } catch (e) {
      out = { pass: false, actual: "检查脚本自身出错：" + String((e && e.message) || e) };
    }
    results.push({ no: no, name: name, criteria: criteria, pass: !!out.pass, actual: out.actual });
    console.log("【" + no + "】" + name + " —— " + (out.pass ? "PASS" : "FAIL"));
    console.log("      判定：" + criteria);
    console.log("      实测：" + out.actual);
    console.log("");
  };

  console.log("");
  console.log("=====================================================");
  console.log(" 发布前检查 verify-project（magic-hub）");
  console.log(" 接口域名：" + (API || "（未读出）"));
  console.log(" 静态托管：" + SITE);
  console.log("=====================================================");
  console.log("");

  await run(1, "公网首页可访问", "HTTP 200 且响应体含 <title 与 app.js", checkHome);
  await run(2, "健康接口正常", "ok===true 且 data.status===\"ok\" 且 data.service===\"magic-hub\"", checkHealth);
  await run(3, "读接口正常（数据库连得上）", "ok===true 且资料条数 > 0", function () { return checkRead(ctx); });
  await run(4, "写接口能写（写完自清）", "POST 拿到 id → DELETE → 再查列表确认不在，三步全成", function () { return checkWrite(ctx); });
  await run(5, "无硬编码密钥（含阳性对照）", "扫描 0 命中，且阳性对照抓得到假密钥", function () { return checkSecrets(gitOk, gitHint); });
  await run(6, ".gitignore 完整", ".env/*.zip/临时目录被忽略，.env.example 与 Skill 文件入库", function () { return checkGitignore(gitOk, gitHint); });
  await run(7, "云函数打包依赖完整", "require 的相对路径目标文件真实存在", checkFnDeps);
  await run(8, "接口域名没混用", "BASE 以 .ap-shanghai.app.tcloudbase.com 结尾且与静态托管域名不同源", checkDomains);
  await run(9, "页面脚本引用完整", "本地引用都存在；有 .card-grid 的页面必须引 api.js", checkHtmlRefs);
  await run(10, "线上文件与本地一致", "5 个静态文件线上与本地逐字符相同", checkDeployed);

  const fails = results.filter(function (r) { return !r.pass; });
  console.log("=====================================================");
  console.log("汇总：" + results.length + " 项检查，通过 " + (results.length - fails.length) + "，失败 " + fails.length);
  if (fails.length) {
    console.log("");
    console.log("失败清单：");
    fails.forEach(function (r) { console.log("  · 【" + r.no + "】" + r.name + " —— " + r.actual); });
  }
  console.log("=====================================================");
  console.log(fails.length ? "退出码：1（有 FAIL 项，先修再发布）" : "退出码：0（十项全过）");
  process.exit(fails.length ? 1 : 0);
}

main();
