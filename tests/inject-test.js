/*
 * 本地注入测试（Day 23 板块③取证用，长期回归测试，随仓库保留）
 *
 *   用法： node tests/inject-test.js
 *
 * 干什么：把两类错误真跑一遍，看后端到底返回什么。
 *   1. 用户输入错：参数缺/错/重复/改删不存在的记录
 *   2. 服务端错：用假数据库对象模拟「表名被改错」（PostgreSQL 42P01），
 *      这就是老师说的「临时改错表名」，不用真去动线上表。
 *
 * 怎么注入：cloudfunctions/_shared/rdb.js 里留了 setRdb()，传一个假对象进去，
 *          之后所有查询都走假对象，不连真库 —— 所以这些测试在任何机器上都能重跑。
 *
 * 断言三件事（每条都必须满足）：
 *   a. 返回体是 { ok:false, code, message }
 *   b. message 里有中文（用户看得懂）
 *   c. message 里没有英文原始报错（数据库原文不允许出口）
 */

"use strict";

const path = require("path");
const ROOT = path.join(__dirname, "..");

const shared = require(path.join(ROOT, "cloudfunctions", "_shared", "rdb.js"));
const favorites = require(path.join(ROOT, "cloudfunctions", "favorites", "index.js"));
const resources = require(path.join(ROOT, "cloudfunctions", "resources", "index.js"));

// ---------------------------------------------------------------------------
// 假数据库对象：链式调用（.from().select().eq()...）最后 await 得到 { data, error }
// ---------------------------------------------------------------------------
function makeFake(handler) {
  function builder(table) {
    const node = {
      _table: table,
      _op: "",
      // 注意：insert/update/delete 后面还会跟 .select()，不能被它覆盖掉操作标记，
      // 否则假库认不出这次是写操作 —— 这是写脚本时踩的坑，不是产品的问题。
      select() { if (!["insert", "update", "delete"].includes(node._op)) node._op = "select"; return node; },
      insert(v) { node._op = "insert"; node._payload = v; return node; },
      update(v) { node._op = "update"; node._payload = v; return node; },
      delete() { node._op = "delete"; return node; },
      eq(c, v) { node._eq = [c, v]; return node; },
      order() { return node; },
      limit(n) { node._limit = n; return node; },
      // 让它能被 await：await node 时调用 handler 拿结果
      then(res, rej) {
        return Promise.resolve()
          .then(function () { return handler(node); })
          .then(res, rej);
      }
    };
    return node;
  }
  return { from: function (t) { return builder(t); } };
}

// 场景 A：表都在，数据正常
function healthy(node) {
  if (node._table === "resources") {
    if (node._op === "select" && node._eq) {
      // resourceExists：只有 id=1 存在，其它都查不到
      return { data: node._eq[1] === 1 ? [{ id: 1 }] : [], error: null };
    }
    return {
      data: [
        { id: 1, title: "2023 年数模国赛优秀论文", zone: "shumo" },
        { id: 2, title: "电赛电源类题解析", zone: "edian" }
      ],
      error: null
    };
  }
  if (node._table === "favorites") {
    if (node._op === "insert") {
      return { data: [{ id: 11, resource_id: node._payload.resource_id, created_at: "2026-10-12" }], error: null };
    }
    if (node._op === "update" || node._op === "delete") {
      // id=11 存在；其它 id 一律"没这行"
      return node._eq && node._eq[1] === 11
        ? { data: [{ id: 11, resource_id: 1, note: "x", created_at: "2026-10-12" }], error: null }
        : { data: [], error: null };
    }
    if (node._op === "select" && node._eq) {
      // DELETE 落空后的回查：id=11 视为已删掉（不在），其它视为没这条
      return { data: [], error: null };
    }
    return { data: [{ id: 11, resource_id: 1, note: "", created_at: "2026-10-12" }], error: null };
  }
  return { data: [], error: null };
}

// 场景 B：写收藏时撞唯一约束（repeat）
const duplicate = {
  message: 'duplicate key value violates unique constraint "favorites_resource_id_key"',
  code: "23505",
  details: 'Key (resource_id)=(1) already exists.'
};
function healthyButDuplicate(node) {
  if (node._op === "insert") return { data: null, error: duplicate };
  return healthy(node);
}

// 场景 C：服务端错 —— 表名被改错（PostgreSQL 42P01）
const missingTable = {
  message: 'relation "public.favorites" does not exist',
  code: "42P01",
  details: null
};
function broken(node) {
  return { data: null, error: missingTable };
}

// ---------------------------------------------------------------------------
// 用例
// ---------------------------------------------------------------------------
function ev(method, opts) {
  return Object.assign({ httpMethod: method }, opts || {});
}

const CASES = [
  // ===== 第一类：用户输入错 =====
  ["输入错 GET limit=0",        healthy, favorites, ev("GET", { queryStringParameters: { limit: "0" } }), "BAD_PARAM"],
  ["输入错 GET limit=abc",      healthy, favorites, ev("GET", { queryStringParameters: { limit: "abc" } }), "BAD_PARAM"],
  ["输入错 GET limit=101",      healthy, favorites, ev("GET", { queryStringParameters: { limit: "101" } }), "BAD_PARAM"],
  ["输入错 资源列表 limit=0",   healthy, resources, ev("GET", { queryStringParameters: { limit: "0" } }), "BAD_PARAM"],
  ["输入错 POST 没带内容",      healthy, favorites, ev("POST"), "MISSING_FIELD"],
  ["输入错 POST 缺字段",        healthy, favorites, ev("POST", { body: JSON.stringify({}) }), "MISSING_FIELD"],
  ["输入错 POST id 负数",       healthy, favorites, ev("POST", { body: JSON.stringify({ resource_id: -1 }) }), "BAD_PARAM"],
  ["输入错 POST id 是布尔",     healthy, favorites, ev("POST", { body: JSON.stringify({ resource_id: true }) }), "BAD_PARAM"],
  ["输入错 POST 不是 JSON",     healthy, favorites, ev("POST", { body: "{不是json" }), "BAD_PARAM"],
  ["输入错 POST 资料不存在",    healthy, favorites, ev("POST", { body: JSON.stringify({ resource_id: 999 }) }), "NOT_FOUND"],
  ["输入错 POST 重复收藏",      healthyButDuplicate, favorites, ev("POST", { body: JSON.stringify({ resource_id: 1 }) }), "DUPLICATE"],
  ["输入错 PATCH 缺编号",       healthy, favorites, ev("PATCH", { body: JSON.stringify({ note: "a" }) }), "MISSING_FIELD"],
  ["输入错 PATCH 编号非数字",   healthy, favorites, ev("PATCH", { path: "/api/favorites/abc", body: JSON.stringify({ note: "a" }) }), "BAD_PARAM"],
  ["输入错 PATCH 缺内容",       healthy, favorites, ev("PATCH", { path: "/api/favorites/11", body: JSON.stringify({}) }), "MISSING_FIELD"],
  ["输入错 PATCH 备注非文字",   healthy, favorites, ev("PATCH", { path: "/api/favorites/11", body: JSON.stringify({ note: 123 }) }), "BAD_PARAM"],
  ["输入错 PATCH 备注超长",     healthy, favorites, ev("PATCH", { path: "/api/favorites/11", body: JSON.stringify({ note: "A".repeat(201) }) }), "BAD_PARAM"],
  ["输入错 PATCH 改不存在的",   healthy, favorites, ev("PATCH", { path: "/api/favorites/99999", body: JSON.stringify({ note: "a" }) }), "NOT_FOUND"],
  ["输入错 DELETE 没有编号",    healthy, favorites, ev("DELETE"), "MISSING_FIELD"],
  ["输入错 DELETE 编号非数字",  healthy, favorites, ev("DELETE", { queryStringParameters: { id: "abc" } }), "BAD_PARAM"],
  ["输入错 DELETE 删不存在的",  healthy, favorites, ev("DELETE", { path: "/api/favorites/99999" }), "NOT_FOUND"],
  ["输入错 不支持的方法 PUT",   healthy, favorites, ev("PUT"), "BAD_PARAM"],

  // ===== 第二类：服务端错（模拟表名被改错）=====
  ["服务端错 GET 列表",         broken, favorites, ev("GET"), "DB_ERROR"],
  ["服务端错 POST 新增",        broken, favorites, ev("POST", { body: JSON.stringify({ resource_id: 1 }) }), "DB_ERROR"],
  ["服务端错 PATCH 改备注",     broken, favorites, ev("PATCH", { path: "/api/favorites/11", body: JSON.stringify({ note: "a" }) }), "DB_ERROR"],
  ["服务端错 DELETE 取消",      broken, favorites, ev("DELETE", { path: "/api/favorites/11" }), "DB_ERROR"],
  ["服务端错 资源列表",         broken, resources, ev("GET"), "DB_ERROR"]
];

// 英文原始报错特征：这些串一个都不许出现在给用户的 message 里
const LEAKS = [/relation/i, /does not exist/i, /duplicate key/i, /constraint/i, /PGRST/i, /PSQLException/i, /undefined/i];

async function main() {
  // 把服务端的 console.error 收起来：证明"英文原文只留在服务端日志"
  const realError = console.error;
  const logs = [];
  console.error = function () { logs.push(Array.prototype.join.call(arguments, " ")); };

  let pass = 0;
  const fails = [];
  for (const [name, scen, fn, event, wantCode] of CASES) {
    shared.setRdb(makeFake(scen));
    let res;
    try {
      res = await fn.main(event);
    } catch (e) {
      fails.push([name, "函数抛异常没被接住：" + e.message]);
      continue;
    }
    const reasons = [];
    if (res && res.ok !== false) reasons.push("ok 不是 false（实际 " + JSON.stringify(res) + "）");
    if (!res || res.code !== wantCode) reasons.push("错误码是 " + (res && res.code) + "，期望 " + wantCode);
    const msg = res && res.message ? String(res.message) : "";
    if (!/[\u4e00-\u9fa5]/.test(msg)) reasons.push("提示没有中文：" + msg);
    // DUPLICATE / NOT_FOUND 这类业务提示允许出现英文字面量？不 —— 一律不许
    const leak = LEAKS.find(function (re) { return re.test(msg); });
    if (leak) reasons.push("提示里漏出了英文原始报错：" + leak);

    if (reasons.length === 0) {
      pass++;
      realError("  ✓ " + name.padEnd(24) + " → " + wantCode + "  「" + msg + "」");
    } else {
      fails.push([name, reasons.join("；")]);
      realError("  ✗ " + name.padEnd(24) + " → " + reasons.join("；"));
    }
  }

  console.error = realError;
  console.log("\n=========== Day 23 板块③ 本地注入取证 ===========\n");
  console.log("用例总数：" + CASES.length + "   通过：" + pass + "   失败：" + fails.length);
  console.log("\n服务端日志里留下的英文原文（console.error，不返回给用户）：" + logs.length + " 条，示例：");
  const dbLogs = logs.filter(function (l) { return /favorites|resources/.test(l); });
  dbLogs.slice(0, 5).forEach(function (l) { console.log("   " + l.slice(0, 110)); });
  console.log("\n结论：" + (fails.length === 0
    ? "两类错误全部返回中文提示，且无一条漏出英文原始报错。"
    : "有 " + fails.length + " 条不合格，见上面 ✗ 明细。"));
  process.exit(fails.length === 0 ? 0 : 1);
}

main();
