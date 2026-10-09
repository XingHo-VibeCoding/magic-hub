/**
 * 共享连接层 —— 数据库连接 + 通用错误工具（Day 19 从两个 db.js 里抽出来）
 *
 * 这个文件只管两件事：
 *   1. 怎么拿到数据库对象（getRdb）
 *   2. 数据库返回的错误对象怎么描述、怎么分类（describeError / throwKind /
 *      isUniqueViolation）
 * 它不认识任何业务：既不知道「资料」是什么，也不知道「收藏」是什么。
 *
 * 为什么要有这一层：
 * getRdb() 原本在 resources/db.js 和 favorites/db.js 里一字不差地抄了两份，
 * 两份文件的注释里都写着「改一处就要改另一处」。Day 17 修 DATABASE_PGRST106 那个
 * 报错时，同一段改动真的做了两遍；漏改一处的结果就是「一半接口能用、一半报错」，
 * 而且只在云上暴露，本地测不出来。抽成一份后，连接相关的改动只有一个地方要改。
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
 * 仅供本地测试用：注入一个假的数据库对象，这样不连真库也能验证查询逻辑。
 * 部署到云上不会调用它。
 */
function setRdb(rdb) {
  _rdb = rdb;
}

/**
 * 把 PostgREST 风格的错误对象拼成一句话，只用于内部日志（不返回给前端）。
 * 前端永远只拿中文 message，英文原始错误不出去。
 */
function describeError(error) {
  if (!error) return '未知错误';
  return [error.message, error.code, error.details].filter(Boolean).join(' | ');
}

/**
 * 抛一个带 kind 的错误，让上层能区分「重复」和「别的数据库故障」。
 * kind 取值：DUPLICATE / DB
 */
function throwKind(kind, message, error) {
  const err = new Error(message + (error ? '：' + describeError(error) : ''));
  err.kind = kind;
  throw err;
}

/**
 * 判定「是不是重复」：PostgreSQL 唯一约束冲突（SQLSTATE 23505）。
 * 多路判定是因为 SDK 不同版本可能只给 message、也可能给结构化 code，两条都认，
 * 避免线上换版本后突然认不出来，把「重复」当成「数据库故障」报出去。
 */
function isUniqueViolation(error) {
  if (String(error.code) === '23505') return true;
  const msg = String(error.message || '') + ' ' + String(error.details || '');
  return /duplicate key/i.test(msg) || /unique constraint/i.test(msg);
}

module.exports = { getRdb, setRdb, describeError, throwKind, isUniqueViolation };
