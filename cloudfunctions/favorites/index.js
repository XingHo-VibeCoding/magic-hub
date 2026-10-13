/**
 * GET   /api/favorites     —— 收藏列表（Day 17）
 * POST  /api/favorites     —— 新增一条收藏（Day 18：校验 + 防重复 + 中文报错）
 * PATCH  /api/favorites/:id —— 改一条收藏的备注（Day 22：含「改不存在的 id」防呆）
 * DELETE /api/favorites/:id —— 取消收藏（Day 22：删不到就报「不存在」，绝不假报成功）
 *
 * 对外形状按 api-contract.md 3.3 / 3.4：
 *   成功 { ok:true, data:... }
 *   失败 { ok:false, code:'...', message:'...' }  message 必须是中文
 */

const {
  queryFavorites,
  resourceExists,
  insertFavorite,
  updateFavoriteNote,
  deleteFavorite,
} = require('./db');

// 请求日志（Day 23 余力加练）：每一次请求留下一行「时间、路径、结果」。
// 加载方式和 db.js 一样走 loader —— 仓库布局和打成 zip 后的布局都能找到它。
const { requireShared } = require('../_shared/loader');
const logRequest = requireShared('log').logRequest;

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

/** 备注长度上限。超过就拒绝，避免有人把整篇文章塞进来撑爆字段。 */
const NOTE_MAX_LEN = 200;

/**
 * 校验收藏记录 id（Day 22：PATCH / DELETE 都要用）。
 * 规则和 resource_id 一致：必须是正整数，布尔值单独挡掉。
 */
function parseId(raw) {
  if (raw === undefined || raw === null) return { kind: 'MISSING' };
  if (typeof raw === 'string' && raw.trim() === '') return { kind: 'MISSING' };
  if (typeof raw === 'boolean') return { kind: 'BAD' };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { kind: 'BAD' };
  return { kind: 'OK', value: n };
}

/**
 * 取出「要操作哪一条」的 id。
 *
 * 两种写法都支持：
 *   1. 路径里的 id —— PATCH /api/favorites/12（契约里写的是这种）
 *   2. 查询参数   —— PATCH /api/favorites?id=12（实测更稳，前端也好拼）
 * 先试路径，取不到再看查询参数。取不到就返回 null，由上层报「缺少编号」。
 */
function readTargetId(event) {
  const e = event || {};

  // ① 路径：取末尾那一段数字。网关给的可能是 /api/favorites/12 或 /favorites/12
  const rawPath = e.path || (e.requestContext && e.requestContext.path) || e.url || '';
  const m = String(rawPath).match(/\/(\d+)\s*$/);
  if (m) return Number(m[1]);

  // ①b 路径里带了东西但不是数字（如 /api/favorites/abc）：把这段原样交出去，
  //     由上层判成「编号不合法」，而不是「缺少编号」—— 用户是给了的，只是给错了。
  const seg = String(rawPath).match(/\/favorites\/([^/?]+)/);
  if (seg) return seg[1];

  // ② 查询参数
  const q = readQuery(event);
  if (q.id !== undefined && q.id !== null && q.id !== '') return q.id;

  // ③ 身体里也允许带（有些调用方喜欢把 id 放 body）
  const body = readBody(event);
  if (body && body !== BAD_JSON && body.id !== undefined) return body.id;

  return null;
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

/**
 * PATCH /api/favorites/:id —— 改一条收藏的备注（Day 22）
 *
 *  今天的重点是「防呆」：改一条不存在的收藏不能报成功。
 * 所以顺序是 先认出改哪一条 → 再看改什么 → 最后写；
 *  写的时候如果数据库说「没有这条」，就返回明确的中文 NOT_FOUND。
 */
async function handlePatch(event) {
  const parsed = readBody(event);
  if (parsed === BAD_JSON) {
    return fail('BAD_PARAM', '请求体不是合法的 JSON 格式');
  }
  const body = parsed || {};

  // ① 先确定改哪一条
  const idParsed = parseId(readTargetId(event));
  if (idParsed.kind === 'MISSING') {
    return fail('MISSING_FIELD', '缺少要修改的收藏编号');
  }
  if (idParsed.kind === 'BAD') {
    return fail('BAD_PARAM', '收藏编号必须是正整数');
  }
  const id = idParsed.value;

  // ② 再看改成什么
  if (body.note === undefined || body.note === null) {
    return fail('MISSING_FIELD', '缺少要修改的内容：note');
  }
  if (typeof body.note !== 'string') {
    return fail('BAD_PARAM', '备注内容必须是文字');
  }
  const note = body.note.trim();
  if (note.length > NOTE_MAX_LEN) {
    return fail(
      'BAD_PARAM',
      '备注最多 ' + NOTE_MAX_LEN + ' 个字，现在有 ' + note.length + ' 个字'
    );
  }

  // ③ 写入
  try {
    const row = await updateFavoriteNote(id, note);
    if (!row) {
      return fail('NOT_FOUND', '这条收藏不存在，可能已经取消收藏了');
    }
    return ok(row);
  } catch (e) {
    console.error('[favorites] 更新备注失败:', e && e.message ? e.message : e);
    return fail('DB_ERROR', '保存失败，请稍后重试');
  }
}

/**
 * DELETE /api/favorites/:id —— 取消收藏（Day 22）
 *
 * 删除不可逆，所以这里只做一件事：确认删的是哪一条，删不到就如实说没有。
 * 前端在点星标时会先弹确认框（二次确认），那道防线在页面上，不在这里。
 */
async function handleDelete(event) {
  const idParsed = parseId(readTargetId(event));
  if (idParsed.kind === 'MISSING') {
    return fail('MISSING_FIELD', '缺少要取消的收藏编号');
  }
  if (idParsed.kind === 'BAD') {
    return fail('BAD_PARAM', '收藏编号必须是正整数');
  }
  const id = idParsed.value;

  try {
    const row = await deleteFavorite(id);
    if (!row) {
      return fail('NOT_FOUND', '这条收藏不存在，可能已经取消收藏了');
    }
    return ok(row);
  } catch (e) {
    console.error('[favorites] 取消收藏失败:', e && e.message ? e.message : e);
    return fail('DB_ERROR', '取消收藏失败，请稍后重试');
  }
}

/**
 * 入口：只做三件事 —— 认出预热、掐表、把结果原样返回（顺手记一行日志）。
 *
 * 处理过程抽到下面的 route()：入口保持这么薄，是为了让「计时和记日志」
 * 不会被某个分支漏掉 —— 走哪条分支都从同一处出去。
 */
exports.main = async (event) => {
  // 预热调用：什么都不做，只把实例拉起来就返回。
  // 也不写日志：它每分钟都来一次，写了会把真正有用的用户请求日志淹掉。
  if (isTimerWarmUp(event)) {
    return { ok: true, warmed: true };
  }

  const startedAt = Date.now();
  const result = await route(event);
  logRequest(event, result, startedAt);
  return result;
};

/** 按请求方法分流到对应的处理函数。 */
async function route(event) {
  const method = readMethod(event);

  if (method === 'POST') return handlePost(event);
  if (method === 'PATCH') return handlePatch(event);
  if (method === 'DELETE') return handleDelete(event);
  if (method === 'GET' || method === 'HEAD') return handleGet(event);

  return fail('BAD_PARAM', '不支持的请求方法：' + method);
}
