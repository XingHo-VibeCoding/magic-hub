/**
 * 数据访问层 —— favorites 表（Day 17 读接口；Day 18 写入；Day 19 抽出共享连接层后瘦身）
 *
 * 这个文件只负责「怎么读写 favorites 表」，不关心 HTTP、参数校验和错误码。
 * 上层 index.js 负责那些。
 *
 * 连接相关的代码（getRdb）和通用错误工具（describeError / throwKind /
 * isUniqueViolation）在 Day 19 已搬到 _shared/rdb.js，这里不再各存一份。
 */

/**
 * 拿到共享模块加载器（Day 23 补）。
 *
 * 坑：仓库里 loader 在上一级（../_shared/loader），打成 zip 后 _shared 和本文件同级
 * （./_shared/loader）——CloudBase 每个函数各打一个 zip，_shared 会被复制进去。
 * 写死任何一个，另一种布局下就是 MODULE_NOT_FOUND，函数启动直接崩。
 *
 * 所以两个路径各试一次，只吞「找不到模块」这一种错，其它错误照常往上抛，免得真出错被藏起来。
 * loader 自己再往下找 rdb / log 时永远是同级 ./xxx，不受打包影响。
 */
function requireLoader() {
  for (const p of ['../_shared/loader', './_shared/loader']) {
    try {
      return require(p);
    } catch (e) {
      if (!e || e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error('找不到共享模块 _shared/loader.js');
}
const { requireShared } = requireLoader();

const shared = requireShared('rdb');
const getRdb = shared.getRdb;
const setRdb = shared.setRdb;
const throwKind = shared.throwKind;
const isUniqueViolation = shared.isUniqueViolation;

/**
 * 查收藏列表，顺带把资料标题和分区一起取回来，
 * 前端拿到就能直接显示，不用再发第二次请求（契约 3.3）。
 *
 * 这里分两次查而不是用联表查询：
 * 外键联表的写法在 SDK 文档里依赖外键约束名，容易踩坑；
 * 两次查询对十几条数据没有任何性能问题，结果一样可靠。
 *
 * @param {{limit:number}} opts
 */
async function queryFavorites({ limit }) {
  const { data: favs, error: err1 } = await getRdb()
    .from('favorites')
    .select('id,resource_id,note,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (err1) throw new Error('查询 favorites 失败：' + (err1.message || JSON.stringify(err1)));
  if (!favs || favs.length === 0) return [];

  const { data: resList, error: err2 } = await getRdb()
    .from('resources')
    .select('id,title,zone')
    .limit(100);

  if (err2) throw new Error('查询 resources 失败：' + (err2.message || JSON.stringify(err2)));

  const byId = {};
  (resList || []).forEach((r) => {
    byId[r.id] = r;
  });

  return favs.map((f) => ({
    id: f.id,
    resource_id: f.resource_id,
    note: f.note || '',
    title: byId[f.resource_id] ? byId[f.resource_id].title : '',
    zone: byId[f.resource_id] ? byId[f.resource_id].zone : '',
    created_at: f.created_at,
  }));
}

/**
 * 判断一条资料是否真实存在（Day 18：写收藏前必须先确认 id 有效，
 * 否则外键会直接报错，而我们想给前端的是「这条资料不存在」这句人话）。
 */
async function resourceExists(resourceId) {
  const { data, error } = await getRdb()
    .from('resources')
    .select('id')
    .eq('id', resourceId)
    .limit(1);

  if (error) throwKind('DB', '查询 resources 失败', error);
  return Array.isArray(data) && data.length > 0;
}

/**
 * 写入一条收藏。
 *
 * 防重复的做法（契约 3.4 写死）：靠 favorites(resource_id) 上的数据库唯一约束兜底，
 * 不做「先查一次再插入」。理由是并发下两次请求可能同时查到「没有」，然后都插进去，
 * 那时就跟没防一样。这里的做法是：直接插，数据库说重复就认。
 *
 * @param {number} resourceId
 * @returns {Promise<{id:number, resource_id:number, created_at:string}>}
 */
async function insertFavorite(resourceId) {
  const { data, error } = await getRdb()
    .from('favorites')
    .insert({ resource_id: resourceId })
    .select('id,resource_id,created_at');

  if (error) {
    if (isUniqueViolation(error)) {
      throwKind('DUPLICATE', '插入收藏撞上唯一约束', error);
    }
    throwKind('DB', '写入 favorites 失败', error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throwKind('DB', '写入成功但没有返回记录', null);

  return { id: row.id, resource_id: row.resource_id, created_at: row.created_at };
}

/**
 * 改一条收藏的备注（Day 22 的 PATCH）。
 *
 * 为什么用「更新后回读」判断存在性，而不是先查一次再更新：
 *   先查再更新在并发下可能是「查到有 → 另一个请求删掉了 → 更新落空」，
 *   那时返回「成功」其实没改到任何东西。直接更新、看数据库返回了几行最准。
 *
 * @param {number} id    收藏记录自身的 id（不是 resource_id）
 * @param {string} note  新的备注内容
 * @returns {Promise<object|null>} 更新后的记录；**null 表示这条收藏不存在**
 */
async function updateFavoriteNote(id, note) {
  const { data, error } = await getRdb()
    .from('favorites')
    .update({ note: note })
    .eq('id', id)
    .select('id,resource_id,note,created_at');

  if (error) throwKind('DB', '更新收藏备注失败', error);

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    resource_id: row.resource_id,
    note: row.note || '',
    created_at: row.created_at,
  };
}

/**
 * 删一条收藏（Day 22 的 DELETE）。
 *
 * 难点：删除不可逆，所以「到底删没删掉」必须判断准，绝不能一条不存在的
 * 记录也回「成功」。这里分两步确认：
 *
 *   ① 先删，并要求数据库把删掉的那行返回来（.select）；
 *      拿到行 = 确实删掉了，直接返回。
 *   ② 没拿到行时，有两种可能：「这条本来就不存在」和「删掉了但接口没回内容」。
 *      这时回查一次就能分清：还在 = 删除没生效（按数据库错误处理，让用户重试）；
 *      不在 = 这条本来就没有（返回 null，上层报 NOT_FOUND）。
 *
 * 为什么不「先查一次，存在再删」：并发下两次请求可能都查到「在」、然后都去删，
 * 第二次删除落空却回「成功」，等于假报。用删除本身返回的行数判断最准。
 *
 * @param {number} id 收藏记录自身的 id（不是 resource_id）
 * @returns {Promise<object|null>} 被删掉的那条记录；**null 表示这条收藏不存在**
 */
async function deleteFavorite(id) {
  const { data, error } = await getRdb()
    .from('favorites')
    .delete()
    .eq('id', id)
    .select('id,resource_id,note,created_at');

  if (error) throwKind('DB', '删除收藏失败', error);

  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 0) {
    const row = rows[0];
    return {
      id: row.id,
      resource_id: row.resource_id,
      note: row.note || '',
      created_at: row.created_at,
    };
  }

  // 没拿到返回内容：回查一次，分清「本来没有」还是「删了没生效」
  const { data: still, error: err2 } = await getRdb()
    .from('favorites')
    .select('id')
    .eq('id', id)
    .limit(1);

  if (err2) throwKind('DB', '确认删除结果时查询失败', err2);
  if (Array.isArray(still) && still.length > 0) {
    throwKind('DB', '删除没有生效，请稍后重试', null);
  }
  return null;
}

module.exports = {
  queryFavorites,
  resourceExists,
  insertFavorite,
  updateFavoriteNote,
  deleteFavorite,
  setRdb,
  getRdb,
};
