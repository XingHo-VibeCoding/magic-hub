/**
 * GET  /api/favorites —— 收藏列表（Day 17）
 * POST /api/favorites —— 新增一条收藏（Day 18：校验 + 防重复 + 中文报错）
 *
 * 对外形状按 api-contract.md 3.3 / 3.4：
 *   成功 { ok:true, data:... }
 *   失败 { ok:false, code:'...', message:'...' }  message 必须是中文
 */

const { queryFavorites, resourceExists, insertFavorite } = require('./db');

function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, code, message };
}

// readBody 的两种特殊返回值
const EMPTY_BODY = null;
const BAD_JSON = Symbol('bad-json');

/**
 * 取出请求方法。拿不到时按 GET 处理 —— 这样控制台的「函数测试」、
 * 不带 HTTP 头的内部调用都还能拿到列表，不会因为多了 POST 分支就把老调用方打断。
 */
function readMethod(event) {
  const e = event || {};
  const m = e.httpMethod || (e.requestContext && e.requestContext.httpMethod) || '';
  return String(m).toUpperCase() || 'GET';
}

/**
 * 取出并解析请求体。
 * 返回：对象（解析成功）/ EMPTY_BODY（没传或空）/ BAD_JSON（不是合法 JSON）
 *
 * 必须区分「空」和「解析失败」：空要给 MISSING_FIELD，格式错才是 BAD_PARAM，
 * 两种提示不一样，用户要改的动作也不一样。
 */
function readBody(event) {
  const e = event || {};
  let raw = e.body;
  if (raw === undefined || raw === null) return EMPTY_BODY;
  if (typeof raw === 'object') return raw;

  let text = String(raw).trim();
  if (!text) return EMPTY_BODY;

  // 网关可能把 body 做了 base64 编码（二进制内容类型时常见）
  if (e.isBase64Encoded) {
    try {
      text = Buffer.from(text, 'base64').toString('utf8');
    } catch (err) {
      return BAD_JSON;
    }
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return EMPTY_BODY;
  } catch (err) {
    return BAD_JSON;
  }
}

/**
 * 校验 resource_id（契约 3.4）：
 *   不存在/空       -> MISSING（缺少必填字段）
 *   不是正整数      -> BAD（参数不合法）
 * 布尔值要单独挡掉：Number(true) === 1，不挡会被当成合法数字 1。
 */
function parseResourceId(raw) {
  if (raw === undefined || raw === null) return { kind: 'MISSING' };
  if (typeof raw === 'string' && raw.trim() === '') return { kind: 'MISSING' };
  if (typeof raw === 'boolean') return { kind: 'BAD' };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { kind: 'BAD' };
  return { kind: 'OK', value: n };
}

/** limit 校验：不传默认 20；必须是 1–100 的整数，否则返回 null 表示不合法。 */
function parseLimit(raw) {
  if (raw === undefined || raw === null || raw === '') return 20;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100) return null;
  return n;
}

/** 取出 query string 参数（GET 用）。网关可能给对象，也可能给原始字符串。 */
function readQuery(event) {
  const e = event || {};
  const raw = e.queryStringParameters || e.query || e.queryString || {};
  return typeof raw === 'string' ? Object.fromEntries(new URLSearchParams(raw)) : raw;
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

/** GET /api/favorites —— 收藏列表（Day 17 的老逻辑，原样保留） */
async function handleGet(event) {
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
}

/** POST /api/favorites —— 新增一条收藏（Day 18） */
async function handlePost(event) {
  const parsed = readBody(event);
  if (parsed === BAD_JSON) {
    return fail('BAD_PARAM', '请求体不是合法的 JSON 格式');
  }

  const body = parsed || {};

  // ① 必填校验
  const parsedId = parseResourceId(body.resource_id);
  if (parsedId.kind === 'MISSING') {
    return fail('MISSING_FIELD', '缺少必填字段：resource_id');
  }
  if (parsedId.kind === 'BAD') {
    return fail('BAD_PARAM', 'resource_id 必须是正整数');
  }
  const resourceId = parsedId.value;

  // ② 存在性校验：不能直接插，否则外键报错会暴露英文
  try {
    const exists = await resourceExists(resourceId);
    if (!exists) {
      return fail('NOT_FOUND', '这条资料不存在，可能已被删除');
    }
  } catch (e) {
    console.error('[favorites] 校验资料是否存在时失败:', e && e.message ? e.message : e);
    return fail('DB_ERROR', '数据库读取失败，请稍后重试');
  }

  // ③ 写入：重复由数据库唯一约束判定（见 db.js insertFavorite 的注释）
  try {
    const row = await insertFavorite(resourceId);
    return ok(row);
  } catch (e) {
    console.error('[favorites] 写入失败:', e && e.message ? e.message : e);
    if (e && e.kind === 'DUPLICATE') {
      return fail('DUPLICATE', '这条资料已经收藏过了');
    }
    return fail('DB_ERROR', '数据库写入失败，请稍后重试');
  }
}

exports.main = async (event) => {
  // 预热调用：什么都不做，只把实例拉起来就返回
  if (isTimerWarmUp(event)) {
    return { ok: true, warmed: true };
  }

  const method = readMethod(event);

  if (method === 'POST') return handlePost(event);
  if (method === 'GET' || method === 'HEAD') return handleGet(event);

  return fail('BAD_PARAM', '不支持的请求方法：' + method);
};
