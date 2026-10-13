/**
 * 请求日志 —— 每一次请求留下「时间、路径、结果」一行（Day 23 余力加练）
 *
 *   用法：在云函数入口的开头记下开始时间，拿到结果后调 logRequest()。
 *         const startedAt = Date.now();
 *         const result = await 处理(event);
 *         logRequest(event, result, startedAt);
 *
 * 为什么要留日志：
 *   线上出了问题，用户只会说"刚才打不开"。没有日志就只能猜；
 *   有一行「几点、哪个接口、结果是什么、花了多久」，就能当场判断是网络、
 *   是数据库，还是某个参数一直被人传错。
 *
 * 三条边界（安全考虑，别越线）：
 *   1. **只记路径，不记查询参数**。像 ?keyword=xxx 这种是用户敲进去的内容，
 *      写进日志等于把用户输入存了下来 —— 没必要，也不安全。
 *   2. **不记请求体**。收藏备注、以后可能的文章内容都不进日志，同理。
 *   3. **不记给用户的中文提示原文**。区分成败看错误码就够了，
 *      日志里堆文案只会让真正有用的那一行被淹没。
 */

'use strict';

/** 取请求方法；取不到按 GET 记（和 index.js 里的处理保持一致）。 */
function pickMethod(event) {
  const e = event || {};
  const m = e.httpMethod || (e.requestContext && e.requestContext.httpMethod) || '';
  return String(m).toUpperCase() || 'GET';
}

/**
 * 取请求路径，并且**掐掉查询参数**。
 * 只留 /api/favorites 这种干干净净的路径（理由见文件头第 1 条）。
 */
function pickPath(event) {
  const e = event || {};
  const raw =
    e.path ||
    (e.requestContext && e.requestContext.path) ||
    e.url ||
    '';
  const noQuery = String(raw).split('?')[0];
  return noQuery || '(未知路径)';
}

/** 结果：成功记 ok，失败记错误码（不再抄一遍中文提示）。 */
function outcomeOf(result) {
  if (!result) return 'NO_RESULT';
  return result.ok === true ? 'ok' : String(result.code || 'UNKNOWN');
}

/**
 * 打一行请求日志。
 *
 * 形如：  [2026-10-13T04:52:10.123Z] POST /api/favorites DUPLICATE 65ms
 *
 * @param {object} event      云函数收到的原始事件
 * @param {object} result     准备返回给前端的那个对象
 * @param {number} startedAt  开始处理的时间戳（Date.now()）
 */
function logRequest(event, result, startedAt) {
  const took = Date.now() - startedAt;
  const line =
    '[' + new Date().toISOString() + '] ' +
    pickMethod(event) + ' ' +
    pickPath(event) + ' ' +
    outcomeOf(result) + ' ' +
    took + 'ms';
  console.log('[请求日志] ' + line);
  return line;
}

module.exports = { logRequest, pickMethod, pickPath, outcomeOf };
