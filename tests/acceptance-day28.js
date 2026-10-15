/*
 * acceptance-day28.js —— Day 28 结营验收：核心流程重复检测（零依赖，node 直接跑）
 *
 *   用法（在项目根目录）： node tests/acceptance-day28.js
 *   退出码： 0 = 验收项全 PASS；1 = 有 FAIL
 *
 * 这份脚本回答的是「核心流程能不能**重复**完成」，不是「首页能不能打开一次」。
 * 所以完整流程（收藏 → 刷新确认 → 改备注 → 再确认 → 取消 → 复查）**连跑两轮**，
 * 第二轮才是重复性的证据。
 *
 * 每项都输出：结论 / 判定（怎么算通过）/ 实测（真看到了什么）。
 * 结论只有三种：PASS、FAIL、未执行。不做「看起来正常」这种判断。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const API = (function () {
  const src = fs.readFileSync(path.join(ROOT, "api.js"), "utf8");
  const m = src.match(/var\s+BASE\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
})();
const SITE = process.env.SITE || "https://magic-hub-d7gt99c7waafb07ad-1501395198.tcloudbaseapp.com";
const TIMEOUT_MS = 20000;
const ROUNDS = 2;                       // 完整流程跑几轮（2 = 证明可重复，不只是碰巧一次）
const PERSIST_WAIT_MS = 1500;           // 「刷新确认」前等一下，模拟用户刷新页面的间隔

const results = [];

function say(n, name, verdict, criteria, actual) {
  results.push({ n: n, name: name, verdict: verdict });
  console.log("【" + n + "】" + name + " —— " + verdict);
  console.log("      判定：" + criteria);
  console.log("      实测：" + actual);
  console.log("");
}

// 504 是免费版云函数冷启动超时的正常现象，自动重试一次并标注
async function request(url, opts) {
  opts = opts || {};
  const send = async function () {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const text = await r.text();
      return { status: r.status, text: text, ms: 0 };
    } catch (e) {
      clearTimeout(timer);
      return { err: e.message, status: 0, text: "" };
    }
  };
  let r = await send();
  // POST 不是幂等操作：504 时再发一次，服务端会真的写入第二次，
  // 于是返回 DUPLICATE —— 看起来像「收藏失败」，实际第一次已经存进去了。
  // 所以只有幂等的 GET / PATCH / DELETE 才自动重试；
  // POST 遇到 504 由调用方改用「查一遍列表」来确认到底写没写进去。
  if (r.status === 504 && (opts.method || "GET") !== "POST") {
    const again = await send();
    if (again.status !== 504) {
      r = again;
      r.retried = true;
    }
  }
  return r;
}

function parse(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

function list(j) {
  if (!j || j.ok !== true) return [];
  return Array.isArray(j.data) ? j.data : (j.data && Array.isArray(j.data.items) ? j.data.items : []);
}

const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

// ---------------------------------------------------------------------------
// 完整流程一轮：收藏 → 刷新确认 → 改备注 → 再确认 → 取消 → 复查
// ---------------------------------------------------------------------------
async function oneRound() {
  // 拿列表失败必须直接停，不能当成「列表是空的」继续往下跑：
  // 那样会挑一条其实已经被收藏的资料去 POST，收到的 DUPLICATE 会被误读成写入失败。
  // （这一条是实跑时真踩到的：冷启动超时让 GET 返回 504，脚本把空列表当了真。）
  const favRes = await request(API + "/api/favorites");
  const fj = parse(favRes.text);
  if (!fj || fj.ok !== true) {
    return { fail: "取收藏列表失败（HTTP " + favRes.status + "），不能拿空列表当依据" };
  }
  const faved = list(fj).map(function (f) { return f.resource_id; });

  const resRes = await request(API + "/api/resources");
  const rj = parse(resRes.text);
  if (!rj || rj.ok !== true) {
    return { fail: "取资料列表失败（HTTP " + resRes.status + "）" };
  }
  const resources = list(rj);
  const target = resources.map(function (x) { return x.id; }).filter(function (id) { return faved.indexOf(id) < 0; })[0];
  if (!target) return { fail: "找不到未收藏的资料，无法做这一轮" };

  const steps = [];

  // ① 收藏
  const post = await request(API + "/api/favorites", { method: "POST", body: { resource_id: target } });
  const pj = parse(post.text);
  let id = null;
  if (pj && pj.ok === true && pj.data && pj.data.id) {
    id = pj.data.id;
    steps.push("收藏 resource_id=" + target + " 成功，得到 id=" + id);
  } else if (post.status === 504) {
    // 免费版云函数 3 秒超时：冷启动时请求可能已执行完、只是响应被网关掐断。
    // POST 不能重试（会写出第二条），改成查列表确认结果。
    await sleep(300);
    const confirm = await request(API + "/api/favorites");
    const row = list(parse(confirm.text)).filter(function (f) { return f.resource_id === target; })[0];
    if (!row) {
      return { target: target, fail: "收藏超时（504）且复查列表里也没有它（resource_id=" + target + "）" };
    }
    id = row.id;
    steps.push("收藏 resource_id=" + target + " 响应 504（冷启动超时），查列表确认已写入，id=" + id +
      " —— POST 未重试，避免写出第二条");
  } else {
    return { target: target, fail: "收藏写入失败（resource_id=" + target + "）：" + (post.text || post.err || "").slice(0, 160) };
  }

  // ② 刷新确认仍在（先等一下，模拟用户刷新）
  await sleep(PERSIST_WAIT_MS);
  const chk1 = await request(API + "/api/favorites");
  const inList1 = list(parse(chk1.text)).some(function (f) { return f.id === id; });
  if (!inList1) {
    steps.push("刷新后这条收藏不在了 —— 持久化失败");
    return { steps: steps, fail: "刷新确认失败", target: target, id: id };
  }
  steps.push("等待 " + PERSIST_WAIT_MS + "ms 后重新查询，id=" + id + " 仍在（刷新后数据还在）");

  // ③ 改备注
  const note = "验收-" + Date.now();
  const patch = await request(API + "/api/favorites/" + id, { method: "PATCH", body: { note: note } });
  const pat = parse(patch.text);
  if (!(pat && pat.ok === true)) {
    steps.push("改备注失败：" + (patch.text || "").slice(0, 160));
    return { steps: steps, fail: "改备注失败", id: id, target: target };
  }
  steps.push("改备注为「" + note + "」成功");

  // ④ 再确认备注真的存住了
  await sleep(PERSIST_WAIT_MS);
  const chk2 = await request(API + "/api/favorites");
  const row2 = list(parse(chk2.text)).filter(function (f) { return f.id === id; })[0];
  if (!row2 || row2.note !== note) {
    steps.push("备注改完再查，值对不上（存的可能是旧值）");
    return { steps: steps, fail: "备注持久化失败", id: id, target: target };
  }
  steps.push("再查一次，备注仍是「" + note + "」（修改已持久化）");

  // ⑤ 取消收藏
  const del = await request(API + "/api/favorites/" + id, { method: "DELETE" });
  const dj = parse(del.text);
  if (!(dj && dj.ok === true)) {
    steps.push("取消收藏失败：" + (del.text || "").slice(0, 160));
    return { steps: steps, fail: "取消收藏失败", id: id, target: target };
  }
  steps.push("取消收藏成功");

  // ⑥ 复查不在
  const chk3 = await request(API + "/api/favorites");
  const still = list(parse(chk3.text)).some(function (f) { return f.id === id; });
  if (still) {
    steps.push("取消返回成功但列表里还有 id=" + id + "（删除没真生效）");
    return { steps: steps, fail: "删除后仍能查到", target: target, id: id };
  }
  steps.push("复查列表，id=" + id + " 已不在（未留脏数据）");

  return { steps: steps, target: target, id: id, note: note };
}

(async function () {
  if (!API) {
    console.log("拿不到接口域名：api.js 里没找到 var BASE = \"...\"");
    process.exit(1);
  }
  console.log("=====================================================");
  console.log(" Day 28 结营验收 · 核心流程重复检测");
  console.log(" 接口：" + API);
  console.log(" 站点：" + SITE);
  console.log(" 完整流程跑 " + ROUNDS + " 轮（第二轮是「能重复完成」的证据）");
  console.log("=====================================================");
  console.log("");

  // 1. 公网首页
  const home = await request(SITE + "/");
  const hb = home.text || "";
  const homeOk = home.status === 200 && hb.indexOf("<title>") >= 0 && hb.indexOf("app.js") >= 0;
  say(1, "公网首页可访问", homeOk ? "PASS" : "FAIL",
    "HTTP 200，且返回内容里有 <title> 和 app.js",
    "HTTP " + home.status + "，含 <title>：" + (hb.indexOf("<title>") >= 0) + "，含 app.js：" + (hb.indexOf("app.js") >= 0) +
    (home.retried ? "（冷启动 504 后重试成功）" : ""));

  // 2. 三个视图页面都在（首页 + 两个资料库页）
  const pages = ["index.html", "shumo/library.html", "edian/library.html"];
  const pageRes = [];
  for (const p of pages) {
    const r = await request(SITE + "/" + p);
    pageRes.push({ p: p, status: r.status });
  }
  const pagesOk = pageRes.every(function (x) { return x.status === 200; });
  say(2, "三个视图页面可打开", pagesOk ? "PASS" : "FAIL",
    "首页与两个分区资料库页都返回 HTTP 200",
    pageRes.map(function (x) { return x.p + "=" + x.status; }).join("、"));

  // 3. 健康接口
  const health = await request(API + "/api/health");
  const hj = parse(health.text);
  const healthOk = health.status === 200 && hj && hj.ok === true && hj.data && hj.data.status === "ok";
  say(3, "健康接口正常", healthOk ? "PASS" : "FAIL",
    "HTTP 200 且 ok===true 且 data.status===\"ok\"",
    "HTTP " + health.status + "，ok=" + (hj ? hj.ok : "?") + "，status=" + (hj && hj.data ? hj.data.status : "?"));

  // 4. 能读到真实资料
  const res = await request(API + "/api/resources");
  const items = list(parse(res.text));
  say(4, "能读到真实资料", items.length > 0 ? "PASS" : "FAIL",
    "GET /api/resources 返回 ok 且条数 > 0",
    "HTTP " + res.status + "，资料 " + items.length + " 条" +
    (items.length ? "（首条：" + items[0].title + "）" : ""));

  // 5. 核心流程（连跑两轮）
  const rounds = [];
  for (let i = 1; i <= ROUNDS; i++) {
    rounds.push(await oneRound());
    await sleep(500);
  }
  const bad = rounds.filter(function (r) { return r.fail; });
  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    say(5 + i, "核心流程第 " + (i + 1) + " 轮", r.fail ? "FAIL" : "PASS",
      "收藏 → 刷新确认仍在 → 改备注 → 再确认 → 取消 → 复查不在，六步全成",
      r.fail
        ? "卡在：" + r.fail + "。已完成：" + (r.steps || []).join("；")
        : (r.steps || []).join("；"));
  }

  // 7. 错误响应：操作不存在的 id
  const ghost = await request(API + "/api/favorites/999999", { method: "DELETE" });
  const gj = parse(ghost.text);
  const ghostOk = ghost.status !== 200 || (gj && gj.ok === false);
  say(5 + ROUNDS + 1, "操作不存在的记录会明确报错", ghostOk ? "PASS" : "FAIL",
    "DELETE 一个不存在的 id，返回 ok=false 或非 200，而不是什么都不说",
    "HTTP " + ghost.status + "，ok=" + (gj ? gj.ok : "?") + "，code=" + (gj ? gj.code : "?") +
    "，message=" + (gj ? gj.message : "?"));
  // 接上一条，把 POST 重复收藏也测了
  // （放在 8）

  // 8. 重复收藏会被挡住（业务错误，不是崩溃）
  let dupOk = false, dupActual = "没测到（前面的流程没跑通，拿不到可重复的目标）";
  if (rounds[0] && !rounds[0].fail) {
    const t = rounds[0].target;
    const first = await request(API + "/api/favorites", { method: "POST", body: { resource_id: t } });
    const fj = parse(first.text);
    let dup = null;
    if (fj && fj.ok === true && fj.data && fj.data.id) {
      const second = await request(API + "/api/favorites", { method: "POST", body: { resource_id: t } });
      dup = { r: second, j: parse(second.text) };
      // 清理刚写入的这条
      await request(API + "/api/favorites/" + fj.data.id, { method: "DELETE" });
    }
    if (dup) {
      dupOk = dup.j && dup.j.ok === false && !!dup.j.code;
      dupActual = "同一条资料收藏两次，第二次 ok=" + (dup.j ? dup.j.ok : "?") +
        "，code=" + (dup.j ? dup.j.code : "?") + "，message=" + (dup.j ? dup.j.message : "?") +
        "（测试用的那条已删除）";
    } else {
      dupActual = "第一次收藏就失败了，没能测到重复：" + (first.text || "").slice(0, 120);
    }
  }
  say(5 + ROUNDS + 2, "重复收藏会被挡住", dupOk ? "PASS" : "FAIL",
    "同一条资料收藏两次，第二次返回业务错误码（不是崩、也不是静默成功）",
    dupActual);

  // 汇总
  const pass = results.filter(function (r) { return r.verdict === "PASS"; }).length;
  const fail = results.filter(function (r) { return r.verdict === "FAIL"; }).length;
  const skip = results.filter(function (r) { return r.verdict === "未执行"; }).length;

  console.log("=====================================================");
  console.log("汇总：" + results.length + " 项验收，PASS " + pass + "，FAIL " + fail + "，未执行 " + skip);
  console.log("=====================================================");
  if (fail === 0 && skip === 0) {
    console.log("退出码：0（核心流程可重复完成）");
  } else {
    console.log("退出码：1（有 FAIL 或未执行，先补齐再谈结营）");
  }
  process.exit(fail === 0 && skip === 0 ? 0 : 1);
})();
