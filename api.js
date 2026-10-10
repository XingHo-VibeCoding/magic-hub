/*
 * api.js —— 前端访问云端接口的唯一入口（Day 20，零依赖原生 JS）
 *
 * 为什么单独一个文件：
 *   接口地址、超时时间、"失败要不要重试"这些规则，只在这一处写。
 *   以后换环境、换域名、改超时，只改这里；页面代码不用碰。
 *
 * 三个约定（和后端 api-contract.md 对齐）：
 *   1. 接口成功返回 { ok:true, data }，失败返回 { ok:false, code, message }；
 *   2. CloudBase 网关不管成败一律 HTTP 200，所以"成不成"看 body 里的 ok，不看状态码；
 *   3. 云函数冷启动会慢，偶尔还会 504 —— 所以超时/网络/5xx 自动重试一次。
 *      但业务错误（比如「已经收藏过了」）不重试：再试一次结果也一样，白等两轮。
 */

(function () {
  "use strict";

  // 接口网关域名。注意：它和网页所在的静态托管域名**不是同一个**，
  // 两个域名混用会直接跨域失败，别改。
  var BASE = "https://magic-hub-d7gt99c7waafb07ad-1501395198.ap-shanghai.app.tcloudbase.com";

  // 本地预览（npm start → localhost:3000，或双击 html → file://）不在云端跨域白名单里，
  // 这些来源发出的请求一定会被浏览器拦掉。所以这三种情况继续用示例数据，页面不会一片空白。
  var host = window.location.hostname;
  var isLocal =
    host === "localhost" || host === "127.0.0.1" || window.location.protocol === "file:";

  var FIRST_TIMEOUT = 8000;    // 第一次尝试：8 秒没回来就当超时
  var RETRY_TIMEOUT = 12000;   // 重试那次给宽一点：冷启动可能正忙

  // 发一次请求。不抛异常：超时/断网/非 JSON 都翻译成统一的 { status, body }，
  // 让调用方只面对一种结构（失败时 status=0，body 是带 code 的对象）。
  function once(path, options, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    var opts = options || {};
    opts.signal = ctrl.signal;

    return fetch(BASE + path, opts).then(
      function (res) {
        clearTimeout(timer);
        return res
          .json()
          .catch(function () {
            // 网关出错页可能返回 HTML，不是 JSON —— 也翻译成结构化错误，不让调用方崩
            return { ok: false, code: "BAD_RESPONSE", message: "接口返回的内容不是合法数据" };
          })
          .then(function (body) {
            return { status: res.status, body: body };
          });
      },
      function (err) {
        clearTimeout(timer);
        var aborted = err && err.name === "AbortError";
        return {
          status: 0,
          body: {
            ok: false,
            code: aborted ? "TIMEOUT" : "NETWORK",
            message: aborted ? "请求超时" : "网络连接失败"
          }
        };
      }
    );
  }

  // 带一次重试的请求：只对" transport 层"的失败重试（断网、超时、服务端 5xx）。
  // 业务错误直接返回：DUPLICATE / BAD_PARAM / NOT_FOUND 再试也是同样结果。
  function request(path, options) {
    return once(path, options, FIRST_TIMEOUT).then(function (first) {
      var transportFailed = first.status === 0 || first.status >= 500;
      if (!transportFailed) return first.body;
      return once(path, options, RETRY_TIMEOUT).then(function (second) {
        return second.body;
      });
    });
  }

  function buildQuery(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  /**
   * 查资料列表
   * @param {{zone?:string, category?:string, keyword?:string, limit?:number}} opts
   * @returns {Promise<{ok:boolean, data?:Array, code?:string, message?:string}>}
   */
  function getResources(opts) {
    return request("/api/resources" + buildQuery(opts || {}));
  }

  /** 查收藏列表（后端已 join 出标题与分区） */
  function getFavorites(opts) {
    return request("/api/favorites" + buildQuery(opts || {}));
  }

  /** 新增一条收藏：成功 ok:true；重复返回 code=DUPLICATE */
  function addFavorite(resourceId) {
    return request("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource_id: resourceId })
    });
  }

  window.MagicAPI = {
    BASE: BASE,
    isLocal: isLocal,
    getResources: getResources,
    getFavorites: getFavorites,
    addFavorite: addFavorite
  };
})();
