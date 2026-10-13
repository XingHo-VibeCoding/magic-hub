/**
 * 数据访问层 —— resources 表（Day 17 建；Day 19 抽出共享连接层后瘦身）
 *
 * 这个文件只负责「怎么把数据取出来」，不关心 HTTP、参数校验和错误码。
 * 上层 index.js 负责那些。
 *
 * 连接相关的代码（getRdb 等）在 Day 19 已搬到 _shared/rdb.js，
 * 这里不再自己建连接，只引用。
 */

/**
 * 加载共享模块（Day 23 起改用 loader）。
 *
 * 为什么要绕一层 loader：仓库布局是 ../_shared/rdb，打成 zip 后变成 ./_shared/rdb
 * （CloudBase 每个云函数各打一个 zip，_shared 会被复制进去、和入口同级），两种路径都在用。
 * "试哪个路径"这件事统一收在 _shared/loader.js 里 —— 它住在 _shared 内部，
 * 对同伴永远是同级的 ./xxx，不受打包影响。
 *
 * 好处：以后再加共享模块跟着写一句就行；否则每加一个，就要在每个入口重写一遍「两个路径各试一次」，
 * Day 19 已经为「同一份东西抄两遍」吃过亏（一处改了、一处没改，结果只有一半接口能用）。
 */
const { requireShared } = require('../_shared/loader');

const shared = requireShared('rdb');
const getRdb = shared.getRdb;
const setRdb = shared.setRdb;

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
