/**
 * GET /api/resources —— 资料列表（Day 17）
 *
 * 对外形状完全按 api-contract.md 3.2：
 *   成功 { ok:true, data:[...] }
 *   失败 { ok:false, code:'...', message:'中文说明' }
 */

const { queryResources } = require('./db');

function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, code, message };
}

/**
 * 取 URL 上的查询参数。
 * CloudBase 不同版本的 HTTP 触发把参数放在不同字段里，这里都兼容一下。
 */
function readQuery(event) {
  const e = event || {};
  const raw = e.queryStringParameters || e.query || e.queryString || {};
  return typeof raw === 'string' ? Object.fromEntries(new URLSearchParams(raw)) : raw;
}

/** limit 校验：不传默认 20；必须是 1–100 的整数，否则返回 null 表示不合法。 */
function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return 20;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) return null;
  return n;
}

function clean(v) {
  return typeof v === 'string' ? v.trim() : v;
}

/**
 * 判断这次调用是不是「定时触发器」的预热调用（Day 17 冷启动对策）。
 *
 * 背景：免费版云函数执行超时固定 3 秒、内存也不可调，而冷启动（加载 Node + SDK）
 * 实测就要 2.26 秒。为了不让用户撞上 504，给函数配了定时触发器定期自唤，
 * 让实例一直保持热着。
 *
 * 但预热调用**必须先短路掉**：它自己也是一次冷启动，如果再走一遍查库，
 * 2.26 秒 + 查询时间很容易超过 3 秒，预热反而自己超时失败，白搭。
 * 所以这里认出定时器事件就直接返回，不查库。
 *
 * 判断刻意保守：只有确认「不是 HTTP 触发」且「带定时器标记」才算预热，
 * 避免把正常的 HTTP 请求误判掉（误判会导致前端拿到空数据，比超时还糟）。
 */
function isTimerWarmUp(event) {
  const e = event || {};
  if (e.Type === 'Timer' || e.type === 'Timer') return true;
  // HTTP 访问服务的事件体一定会带下面这些字段之一
  const looksHttp = !!(
    e.httpMethod ||
    e.headers ||
    e.requestContext ||
    e.queryStringParameters ||
    e.body
  );
  if (looksHttp) return false;
  // 定时触发器事件体形如 { Type:'Timer', TriggerName:'...', Time:'...', Message:'...' }
  return !!(e.TriggerName || e.Time || e.Message);
}

exports.main = async (event) => {
  // 预热调用：什么都不做，只把实例拉起来就返回
  if (isTimerWarmUp(event)) {
    return { ok: true, warmed: true };
  }

  const q = readQuery(event);

  const limit = parseLimit(q.limit);
  if (limit === null) {
    return fail('BAD_PARAM', '参数不合法：limit 只能是 1 到 100 的数字');
  }

  try {
    const rows = await queryResources({
      zone: clean(q.zone) || undefined,
      category: clean(q.category) || undefined,
      keyword: clean(q.keyword) || undefined,
      limit,
    });
    return ok(rows);
  } catch (e) {
    // 原始错误只打到日志，不返回给前端（契约要求 message 必须是人能看懂的中文）
    console.error('[resources] 查询失败:', e && e.message ? e.message : e);
    return fail('DB_ERROR', '数据库读取失败，请稍后重试');
  }
};
