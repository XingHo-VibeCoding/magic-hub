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
