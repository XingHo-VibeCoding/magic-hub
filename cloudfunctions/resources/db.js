/**
 * 数据访问层 —— resources 表（Day 17）
 *
 * 这个文件只负责「怎么把数据取出来」，不关心 HTTP、参数校验和错误码。
 * 上层 index.js 负责那些。
 *
 * 注意：getRdb() 这段与 favorites/db.js 里的完全一样，改一处就要改另一处，
 * 等 Day 19 会把它们抽成共享模块，现在先不提前做。
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

/**
 * 仅供本地测试用：注入一个假的数据库对象，这样不连真库也能验证排序、筛选、拼接逻辑。
 * 部署到云上不会调用它。
 */
function setRdb(rdb) {
  _rdb = rdb;
}

/**
 * 查资料列表。
 * @param {{zone?:string, category?:string, keyword?:string, limit:number}} opts
 * @returns {Promise<Array>} 资料数组，字段与 api-contract.md 3.2 一致
 */
async function queryResources({ zone, category, keyword, limit }) {
  let query = getRdb()
    .from('resources')
    .select('id,zone,category,year,title,summary,link,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (zone) query = query.eq('zone', zone);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw new Error('查询 resources 失败：' + (error.message || JSON.stringify(error)));

  let rows = data || [];

  // 关键词匹配标题和说明，放在应用层做。
  // 原因：SDK 的 or / ilike 组合写法在文档里没写清楚，硬用容易部署即报错；
  // 现在数据量只有十几条，先取全量再过滤，结果和 SQL 里做是一样的。
  // 已知限制：数据超过 100 条时，关键词只会在这 100 条里匹配。数据量变大时要换成数据库端过滤。
  if (keyword) {
    const k = String(keyword);
    rows = rows.filter(
      (r) => String(r.title || '').includes(k) || String(r.summary || '').includes(k)
    );
  }

  return rows.slice(0, limit);
}

module.exports = { queryResources, setRdb, getRdb };
