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
