/**
 * 数据访问层 —— favorites 表（Day 17 读接口；Day 18 会在这里加写入方法）
 *
 * 注意：getRdb() 这段与 resources/db.js 里的完全一样，改一处就要改另一处。
 */

const ENV_ID = process.env.TCB_ENV || 'magic-hub-d7gt99c7waafb07ad';

let _rdb = null;

/**
 * 拿到数据库对象。云函数里 SDK 走平台内部通道，不需要主机/端口/密码。
 *
 * 为什么必须传 { database: 'public' }（Day 17 排错实测所得）：
 * @cloudbase/node-sdk 的 dist/cloudbase.js 里是这样写的——
 *   const { instance = 'default', database = envId } = options || {}
 *   headers: { 'Accept-Profile': database, 'Content-Profile': database }
 * 也就是说「database」这个参数实际被当成 PostgREST 用来选 schema 的 header，
 * 而且它的**默认值就是环境 ID**。而 CloudBase 的 PostgreSQL REST API 只支持
 * public schema，于是默认写法必然报：
 *   DATABASE_PGRST106  Invalid schema: magic-hub-d7gt99c7waafb07ad
 * 显式写 public 才能命中我们建表所在的 schema。别把这个参数删掉。
 */
function getRdb() {
  if (_rdb) return _rdb;
  const cloudbase = require('@cloudbase/node-sdk');
  const app = cloudbase.init({ env: ENV_ID });
  _rdb = app.rdb({ database: 'public' });
  return _rdb;
}

/** 仅供本地测试：注入假的数据库对象。 */
function setRdb(rdb) {
  _rdb = rdb;
}

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

module.exports = { queryFavorites, setRdb, getRdb };
