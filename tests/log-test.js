/*
 * 请求日志取证（Day 23 余力加练的验收，长期回归测试，随仓库保留）
 *
 *   用法： node tests/log-test.js
 *
 * 老师要的是「一条简单请求日志：时间、路径、结果」。所以这里验证四件事：
 *   1. 每行日志确实有 时间 / 方法 / 路径 / 结果 / 耗时 这五样
 *   2. 成功记 ok、失败记错误码，一眼能分清
 *   3. 预热调用不写日志（它每分钟来一次，写了会把有用的淹掉）
 *   4. **用户输入不进日志** —— 查询词、备注正文都不许出现在日志里
 *      （日志会留存很久，把用户敲的内容写进去没必要也不安全）
 */

"use strict";

const path = require("path");
const ROOT = path.join(__dirname, "..");

const shared = require(path.join(ROOT, "cloudfunctions", "_shared", "rdb.js"));
const favorites = require(path.join(ROOT, "cloudfunctions", "favorites", "index.js"));
const resources = require(path.join(ROOT, "cloudfunctions", "resources", "index.js"));

// 和 inject-test.js 里同样的假数据库：数据都"有"，让请求能走到成功分支
function fakeRdb() {
  function builder(table) {
    const node = {
      select() { return node; },
      insert(v) { node._payload = v; return node; },
      update() { return node; },
      delete() { return node; },
      eq() { return node; },
      order() { return node; },
      limit() { return node; },
      then(res, rej) {
        const data =
          node._payload
            ? [{ id: 11, resource_id: node._payload.resource_id, created_at: "2026-10-13" }]
            : [{ id: 11, resource_id: 1, note: "这条备注不该出现在日志里", created_at: "2026-10-13" }];
        return Promise.resolve({ data: data, error: null }).then(res, rej);
      }
    };
    return node;
  }
  return { from: function () { return builder(); } };
}

const SECRET_WORD = "我的私密查询词";   // 故意放一个会被用户输入的内容
const SECRET_NOTE = "这条备注不该出现在日志里";

const CASES = [
  ["成功 GET 收藏列表",
    favorites,
    { httpMethod: "GET", path: "/api/favorites?limit=20", queryStringParameters: { limit: "20" } },
    "ok"],
  ["成功 GET 资料列表（带查询词）",
    resources,
    { httpMethod: "GET", path: "/api/resources?keyword=" + encodeURIComponent(SECRET_WORD), queryStringParameters: { keyword: SECRET_WORD } },
    "ok"],
  ["失败 PATCH 备注超长",
    favorites,
    { httpMethod: "PATCH", path: "/api/favorites/11", body: JSON.stringify({ note: "A".repeat(201) }) },
    "BAD_PARAM"],
  ["失败 不支持的方法",
    favorites,
    { httpMethod: "PUT", path: "/api/favorites" },
    "BAD_PARAM"],
  // 成功改备注：请求体里有正文，验证它不会漏进日志
  ["成功 PATCH 改备注",
    favorites,
    { httpMethod: "PATCH", path: "/api/favorites/11", body: JSON.stringify({ note: SECRET_NOTE }) },
    "ok"]
];

async function main() {
  const printed = [];
  const realLog = console.log;
  const realError = console.error;

  let pass = 0;
  const fails = [];

  // ---- 用例 1–5：每次请求要留一行合规日志 ----
  for (const [name, fn, event, wantOutcome] of CASES) {
    shared.setRdb(fakeRdb());
    printed.length = 0;
    console.log = function () { printed.push(Array.prototype.join.call(arguments, " ")); };
    console.error = function () { /* 错误日志不参与这次检查 */ };

    const res = await fn.main(event);

    console.log = realLog;
    console.error = realError;

    const line = printed.find(function (l) { return l.indexOf("[请求日志]") === 0; });
    const reasons = [];
    if (!line) {
      reasons.push("没有打出请求日志");
    } else {
      // 形如： [2026-10-13T04:52:10.123Z] POST /api/favorites DUPLICATE 65ms
      const m = line.match(/^\[请求日志\] \[(.+?)\] (\w+) (\S+) (\S+) (\d+)ms$/);
      if (!m) {
        reasons.push("格式不合规（应为 时间 方法 路径 结果 耗时）：" + line);
      } else {
        const time = m[1], method = m[2], p = m[3], outcome = m[4];
        if (!/^\d{4}-\d{2}-\d{2}T/.test(time)) reasons.push("时间不是标准格式：" + time);
        if (outcome !== wantOutcome) reasons.push("结果记的是 " + outcome + "，期望 " + wantOutcome);
        if (p.indexOf("?") !== -1) reasons.push("路径里混进了查询参数：" + p);
        if (line.indexOf(SECRET_WORD) !== -1) reasons.push("日志里泄漏了用户输入的查询词");
        if (line.indexOf(SECRET_NOTE) !== -1) reasons.push("日志里泄漏了请求正文（备注内容）");
      }
    }
    const shown = line ? line.replace("[请求日志] ", "") : "(没有日志)";
    if (reasons.length === 0) {
      pass++;
      console.log("  ✓ " + name.padEnd(26) + " → " + shown);
    } else {
      fails.push([name, reasons.join("；")]);
      console.log("  ✗ " + name.padEnd(26) + " → " + reasons.join("；"));
    }
  }

  // ---- 用例 6：预热调用不能写日志 ----
  shared.setRdb(fakeRdb());
  printed.length = 0;
  console.log = function () { printed.push(Array.prototype.join.call(arguments, " ")); };
  const warmRes = await favorites.main({ Type: "Timer", TriggerName: "warmup", Time: "2026-10-13" });
  console.log = realLog;
  const warmLine = printed.find(function (l) { return l.indexOf("[请求日志]") === 0; });
  const warmed = warmRes && warmRes.warmed === true;
  if (!warmLine && warmed) {
    pass++;
    console.log("  ✓ " + "预热调用不写日志".padEnd(26) + " → 无日志（返回值 warmed:true 正确）");
  } else {
    fails.push(["预热调用不写日志", warmLine ? "写了日志：" + warmLine : "返回值不对：" + JSON.stringify(warmRes)]);
    console.log("  ✗ " + "预热调用不写日志".padEnd(26) + " → " + fails[fails.length - 1][1]);
  }

  console.log("\n=========== Day 23 请求日志取证 ===========\n");
  console.log("用例总数：" + (CASES.length + 1) + "   通过：" + pass + "   失败：" + fails.length);
  console.log("结论：" + (fails.length === 0
    ? "每次请求都留下「时间/路径/结果/耗时」一行；成功记 ok、失败记错误码；预热不记；用户输入不进日志。"
    : "有 " + fails.length + " 条不合格。"));
  process.exit(fails.length === 0 ? 0 : 1);
}

main();
