/**
 * GET /api/favorites —— 收藏列表（Day 17）
 *
 * 对外形状按 api-contract.md 3.3：
 *   成功 { ok:true, data:[{id, resource_id, title, zone, created_at}] }
 *   失败 { ok:false, code:'DB_ERROR', message:'数据库读取失败，请稍后重试' }
 *
 * Day 18 会在这里加 POST 分支（新增收藏）。
 */

const { queryFavorites } = require('./db');

function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, code, message };
}

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

/**
 * 判断这次调用是不是「定时触发器」的预热调用（Day 17 冷启动对策）。
 *
 * 背景：免费版云函数执行超时固定 3 秒、内存不可调，冷启动（加载 Node + SDK）实测
 * 就要 2.26 秒。为免用户撞上 504，给函数配了定时触发器定期自唤，让实例保持热着。
 *
 * 预热调用必须先短路：它自己也是冷启动，再走一遍查库很容易超过 3 秒而超时失败，
 * 那就白预热了。这里认出定时器事件就直接返回，不查库。
 *
 * 判断刻意保守：只有确认「不是 HTTP 触发」且「带定时器标记」才算预热，
 * 避免把正常 HTTP 请求误判掉（误判会让前端拿到空数据，比超时更糟）。
 */
function isTimerWarmUp(event) {
  const e = event || {};
  if (e.Type === 'Timer' || e.type === 'Timer') return true;
  const looksHttp = !!(
    e.httpMethod ||
    e.headers ||
    e.requestContext ||
    e.queryStringParameters ||
    e.body
  );
  if (looksHttp) return false;
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
    const rows = await queryFavorites({ limit });
    return ok(rows);
  } catch (e) {
    console.error('[favorites] 查询失败:', e && e.message ? e.message : e);
    return fail('DB_ERROR', '数据库读取失败，请稍后重试');
  }
};
