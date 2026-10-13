/**
 * 共享模块加载器（Day 23：给请求日志用，顺手把 db.js 里那段同样的逻辑收进来）
 *
 * 为什么需要它：
 *   仓库里的布局是 cloudfunctions/_shared/log.js，对 db.js / index.js 来说是「上一级目录」；
 *   而 CloudBase 是**每个云函数各打一个 zip 单独上传**，打包时 _shared 会被复制到 zip 里、
 *   和入口文件同级，那时路径就少一层。
 *
 *   两种布局同时在用，所以每个要用共享模块的入口都得「两个路径各试一次」。
 *   这段代码如果在 db.js 和每个 index.js 里各抄一份，将来改布局就要改好几个地方 ——
 *   Day 19 已经为「同一份东西抄两遍」吃过亏了（一个站点能用、一个站点报错）。
 *
 * 关键点：本文件本身就住在 _shared 目录里，所以它对同伴的路径**永远是同级 ./xxx**，
 *         不管外面怎么打包都不变。把路径的分歧关在这一处。
 */

'use strict';

/**
 * 加载一个共享模块。
 * @param {string} name 文件名，不含路径和后缀，例如 'rdb' / 'log'
 */
function requireShared(name) {
  return require('./' + name);
}

module.exports = { requireShared };
