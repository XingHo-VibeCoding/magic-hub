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
 * 加载共享模块。
 *
 * 为什么要试两个路径：仓库里的布局是 cloudfunctions/_shared/rdb.js，
 * 对本文件来说是「上一级目录」（../_shared/rdb）；而 CloudBase 是**每个云函数
 * 各打一个 zip 单独上传**，打包时 _shared 会被复制到 zip 里、和 db.js 同级，
 * 那时路径就变成 ./_shared/rdb。两种布局都在用，所以按顺序各试一次。
 *
 * 只吞「找不到模块」这一种错，模块里的其它错误照常往上抛，免得真出错被藏起来。
 */
function requireShared() {
  const candidates = ['../_shared/rdb', './_shared/rdb'];
  for (const p of candidates) {
    try {
      return require(p);
    } catch (e) {
      if (!e || e.code !== 'MODULE_NOT_FOUND') throw e;
    }
  }
  throw new Error('找不到共享模块 _shared/rdb.js');
}

const shared = requireShared();
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
    .select('id,resource_id,created_at')
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

module.exports = { queryFavorites, resourceExists, insertFavorite, setRdb, getRdb };
