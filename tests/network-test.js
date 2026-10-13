/*
 * 前端第三类错误取证（Day 23 板块③，长期回归测试，随仓库保留）
 *
 *   用法： node tests/network-test.js
 *
 * 第三类错误 = 网络/服务端这一层出问题：断网、超时、接口挂了返回 5xx。
 * 这类错不发生在后端代码里，所以不能用注入假数据库的方式测，
 * 得把浏览器发请求的那个动作（fetch）换成我们能控制的假实现。
 *
 * 三种假法：
 *   断网   —— fetch 直接失败（浏览器真断网就是这效果）
 *   超时   —— fetch 一直不回，并且在 100 毫秒后主动触发"取消"（不等真的 8 秒）
 *   5xx    —— 接口返回 502，而且内容不是 JSON（网关出错页常常是 HTML）
 *
 * 顺带验证两条规则：
 *   · 网络类失败要自动重试一次（所以 fetch 应该被调用 2 次）
 *   · 业务错误（比如"已经收藏过了"）不重试（只调用 1 次）
 */

"use strict";

const path = require("path");
const ROOT = path.join(__dirname, "..");

// 造一个最小的浏览器环境：api.js 只用到 window.location 和 window.MagicAPI
global.window = { location: { hostname: "magic-hub.example.com", protocol: "https:" } };

let calls = [];      // 记录每一次 fetch
let plan = null;     // 本次用哪种假法

// 把长等待压缩成 80 毫秒：产品里第一次 8 秒、重试 12 秒，真等要 20 秒。
// 只改"等多久"，不改用不用定时器 —— 走的还是产品那条超时分支。
const realSetTimeout = global.setTimeout;
global.setTimeout = function (fn, ms) {
  return realSetTimeout(fn, typeof ms === "number" && ms > 80 ? 80 : ms);
};

global.fetch = function (url, opts) {
  calls.push({ url: url, opts: opts });

  // 断网
  if (plan === "offline") {
    return Promise.reject(new TypeError("Failed to fetch"));
  }

  // 超时：请求一直不回，直到产品自己触发"取消"。
  // 关键：必须等**产品传进来的那个信号**（opts.signal），不能自己另造一个 ——
  // 自己造的话，取消的是假信号，产品这边永远等不到，测试就卡死了（写脚本时踩的坑）。
  if (plan === "timeout") {
    const realAbort = opts.signal;
    return new Promise(function (resolve, reject) {
      realAbort.addEventListener("abort", function () {
        const e = new Error("The operation was aborted");
        e.name = "AbortError";       // 产品靠 name 认出是超时
        reject(e);
      });
    });
  }

  // 网关 5xx：内容不是 JSON（.json() 会失败）
  if (plan === "badGateway") {
    return Promise.resolve({
      status: 502,
      json: function () { return Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")); }
    });
  }

  // 第一次 5xx、第二次成功（用来验证"重试一次"真的有用）
  if (plan === "flaky") {
    if (calls.length === 1) {
      return Promise.resolve({
        status: 500,
        json: function () { return Promise.reject(new SyntaxError("Unexpected token <")); }
      });
    }
    return Promise.resolve({
      status: 200,
      json: function () { return Promise.resolve({ ok: true, data: [{ id: 1, title: "数据回来了" }] }); }
    });
  }

  // 业务错误：HTTP 200，body 里 ok:false
  if (plan === "business") {
    return Promise.resolve({
      status: 200,
      json: function () {
        return Promise.resolve({ ok: false, code: "DUPLICATE", message: "这条资料已经收藏过了" });
      }
    });
  }

  throw new Error("未知的计划：" + plan);
};

// 加载要测的前端文件
require(path.join(ROOT, "api.js"));
const api = global.window.MagicAPI;

const LEAKS = [/Failed to fetch/i, /Unexpected token/i, /SyntaxError/i, /TypeError/i, /NetworkError/i, /undefined/i];

const CASES = [
  ["断网   查资料列表", "offline", function () { return api.getResources({ zone: "shumo" }); },
    "NETWORK", "网络连接失败", 2],
  ["断网   新增收藏",   "offline", function () { return api.addFavorite(1); },
    "NETWORK", "网络连接失败", 2],
  ["超时   查收藏列表", "timeout", function () { return api.getFavorites(); },
    "TIMEOUT", "请求超时", 2],
  ["网关挂 查资料列表", "badGateway", function () { return api.getResources({ zone: "edian" }); },
    "BAD_RESPONSE", "接口暂时没回应，请过一会儿再试", 2],
  ["重试后成功",       "flaky", function () { return api.getResources(); },
    null, null, 2],
  ["业务错误不重试",   "business", function () { return api.addFavorite(1); },
    "DUPLICATE", "这条资料已经收藏过了", 1]
];

async function main() {
  let pass = 0;
  const fails = [];

  for (const [name, mode, run, wantCode, wantMsg, wantCalls] of CASES) {
    plan = mode;
    calls = [];
    let body;
    try {
      body = await run();
    } catch (e) {
      fails.push([name, "没接住异常，直接抛出来了：" + e.message]);
      continue;
    }

    const reasons = [];
    if (wantCode !== null) {
      if (!body || body.code !== wantCode) reasons.push("错误码是 " + (body && body.code) + "，期望 " + wantCode);
      if (!body || body.message !== wantMsg) reasons.push("提示是「" + (body && body.message) + "」，期望「" + wantMsg + "」");
    } else if (!body || body.ok !== true) {
      reasons.push("期望重试后成功，实际 " + JSON.stringify(body));
    }
    // 泄漏检查只在"真的有提示文字"时做：成功响应没有 message，
    // 直接 String(undefined) 会得到 "undefined" 这个字符串，会被误判成泄漏（写脚本时踩的坑）。
    const msg = body && body.message ? String(body.message) : "";
    if (msg) {
      if (!/[\u4e00-\u9fa5]/.test(msg)) reasons.push("提示没有中文：" + msg);
      const leak = LEAKS.find(function (re) { return re.test(msg); });
      if (leak) reasons.push("提示里漏出英文原始报错：" + leak);
    }
    if (calls.length !== wantCalls) reasons.push("实际发了 " + calls.length + " 次请求，期望 " + wantCalls + " 次");

    if (reasons.length === 0) {
      pass++;
      console.log("  ✓ " + name.padEnd(16) + " → " + (body.ok ? "成功" : body.code) +
        "  请求 " + calls.length + " 次  「" + (body.message || (body.data ? "数据：" + JSON.stringify(body.data) : "")) + "」");
    } else {
      fails.push([name, reasons.join("；")]);
      console.log("  ✗ " + name.padEnd(16) + " → " + reasons.join("；"));
    }
  }

  console.log("\n=========== Day 23 前端网络类错误取证 ===========\n");
  console.log("用例总数：" + CASES.length + "   通过：" + pass + "   失败：" + fails.length);
  console.log("结论：" + (fails.length === 0
    ? "断网/超时/网关挂 三类都返回中文提示，且都按规则重试一次；业务错误不重试。"
    : "有 " + fails.length + " 条不合格。"));
  process.exit(fails.length === 0 ? 0 : 1);
}

main();
