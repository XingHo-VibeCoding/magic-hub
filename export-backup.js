/*
 * export-backup.js —— 从线上接口导出数据备份（Day 27，零依赖，node 直接跑）
 *
 *   用法（在项目根目录）： node export-backup.js
 *   产出： backup/YYYY-MM-DD-magic-hub.json   表级数据（便于查看与比对）
 *          backup/YYYY-MM-DD-magic-hub.sql    可直接回导 PostgreSQL 的语句
 *
 * 三条设计取舍（都是为了让这份东西真能用，而不是留个文件交差）：
 *   1. 接口域名从 api.js 里读，不在这个脚本里再写一遍（写两遍迟早对不上）。
 *   2. SQL 里**不写 DELETE / TRUNCATE / DROP**。恢复时该不该清表要人来判断，
 *      脚本替你决定删数据太危险；需要清空时自己加一句 TRUNCATE。
 *   3. 只有 favorites 表存的是原始字段（id / resource_id / note / created_at）。
 *      接口为了页面展示会额外返回 title、zone，那是 join 出来的，不属于 favorites 表，
 *      混进 INSERT 会直接报错。
 *
 * 备份只含业务数据，不含任何密钥、连接串、口令。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const API = (function () {
  const src = fs.readFileSync(path.join(ROOT, "api.js"), "utf8");
  const m = src.match(/var\s+BASE\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
})();
const OUT_DIR = path.join(ROOT, "backup");

// favorites 表真实字段（与 db/schema.sql 一致，不含接口 join 出来的列）
const FAV_FIELDS = ["id", "resource_id", "note", "created_at"];
const RES_FIELDS = ["id", "zone", "category", "year", "title", "summary", "link", "created_at"];

function today() {
  const d = new Date();
  const p = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

async function getJson(p) {
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, 20000);
  try {
    const r = await fetch(API + p, { signal: ctrl.signal });
    clearTimeout(timer);
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { /* 不是 JSON，下面按文本报错 */ }
    return { status: r.status, json: j, raw: txt.slice(0, 200) };
  } catch (e) {
    clearTimeout(timer);
    return { err: e.message };
  }
}

// PostgreSQL 字面量转义：单引号翻倍；null / undefined 写成 NULL
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function insertLines(table, fields, rows) {
  const cols = fields.join(", ");
  return rows.map(function (row) {
    return "INSERT INTO " + table + " (" + cols + ") VALUES (" +
      fields.map(function (f) { return lit(row[f]); }).join(", ") + ");";
  });
}

(async function () {
  if (!API) {
    console.log("拿不到接口域名：api.js 里没找到 var BASE = \"...\"");
    process.exit(1);
  }
  console.log("数据源：" + API);

  const res = await getJson("/api/resources");
  const fav = await getJson("/api/favorites");

  if (res.err) { console.log("取 /api/resources 失败：" + res.err); process.exit(1); }
  if (fav.err) { console.log("取 /api/favorites 失败：" + fav.err); process.exit(1); }
  if (res.status !== 200 || !res.json || res.json.ok !== true) {
    console.log("/api/resources 返回异常：HTTP " + res.status + " " + (res.raw || ""));
    process.exit(1);
  }
  if (fav.status !== 200 || !fav.json || fav.json.ok !== true) {
    console.log("/api/favorites 返回异常：HTTP " + fav.status + " " + (fav.raw || ""));
    process.exit(1);
  }

  const resources = res.json.data;
  const favorites = fav.json.data;
  if (!Array.isArray(resources) || !Array.isArray(favorites)) {
    console.log("数据结构不是数组，脚本的假设不成立，先去核对接口再改脚本。");
    process.exit(1);
  }

  // favorites 只留表字段，丢掉接口 join 出来的 title / zone
  const favRows = favorites.map(function (r) {
    const o = {};
    FAV_FIELDS.forEach(function (f) { o[f] = r[f] === undefined ? null : r[f]; });
    return o;
  });
  const resRows = resources.map(function (r) {
    const o = {};
    RES_FIELDS.forEach(function (f) { o[f] = r[f] === undefined ? null : r[f]; });
    return o;
  });

  const stamp = new Date().toISOString();
  const name = today();
  const json = {
    exported_at: stamp,
    source: API,
    note: "仅业务数据，不含密钥；favorites 只含该表真实字段（不含接口 join 的 title/zone）",
    counts: { resources: resRows.length, favorites: favRows.length },
    tables: { resources: resRows, favorites: favRows }
  };

  const sql = [];
  sql.push("-- magic-hub 数据备份   导出时间：" + stamp);
  sql.push("-- 来源：" + API);
  sql.push("-- 内容：resources " + resRows.length + " 条，favorites " + favRows.length + " 条");
  sql.push("--");
  sql.push("-- 用法（在 CloudBase 控制台的 SQL 编辑器或本地 psql 里执行）：");
  sql.push("--   1. 目标表如果是空的，直接整段执行即可。");
  sql.push("--   2. 目标表已有数据且要先用这份覆盖，自己加一句：");
  sql.push("--        TRUNCATE favorites, resources RESTART IDENTITY CASCADE;");
  sql.push("--      脚本不替你写删除语句——恢复时该不该清表由人判断。");
  sql.push("--   3. 末尾的 setval 会把自增序列拨到最大 id 之后，否则下次插入报重复主键。");
  sql.push("--   4. favorites 依赖 resources（外键 + ON DELETE CASCADE），所以先插 resources。");
  sql.push("");
  sql.push("BEGIN;");
  sql.push("");
  sql.push("-- resources（" + resRows.length + " 条）");
  sql.push.apply(sql, insertLines("resources", RES_FIELDS, resRows));
  sql.push("");
  sql.push("-- favorites（" + favRows.length + " 条，只含该表真实字段）");
  sql.push.apply(sql, insertLines("favorites", FAV_FIELDS, favRows));
  sql.push("");
  if (resRows.length > 0) {
    sql.push("SELECT setval(pg_get_serial_sequence('resources','id'), " +
      Math.max.apply(null, resRows.map(function (r) { return r.id; })) + ", true);");
  }
  if (favRows.length > 0) {
    sql.push("SELECT setval(pg_get_serial_sequence('favorites','id'), " +
      Math.max.apply(null, favRows.map(function (r) { return r.id; })) + ", true);");
  }
  sql.push("");
  sql.push("COMMIT;");
  sql.push("");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, name + "-magic-hub.json");
  const sqlPath = path.join(OUT_DIR, name + "-magic-hub.sql");
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  fs.writeFileSync(sqlPath, sql.join("\n"));

  // 自检一：产物必须不含密钥痕迹，否则这份备份本身就是个隐患
  const all = fs.readFileSync(jsonPath, "utf8") + fs.readFileSync(sqlPath, "utf8");
  const suspicious = /sk-[A-Za-z0-9]{16,}|api[_-]?key|secret|password|token\s*[:=]/i;
  const hit = all.match(suspicious);

  console.log("");
  console.log("resources：" + resRows.length + " 条");
  console.log("favorites：" + favRows.length + " 条（已剔除接口 join 出的 title/zone）");
  console.log("");
  console.log("  " + path.relative(ROOT, jsonPath) + "  " + fs.statSync(jsonPath).size + " 字节");
  console.log("  " + path.relative(ROOT, sqlPath) + "  " + fs.statSync(sqlPath).size + " 字节");
  console.log("");
  console.log("密钥自检：" + (hit ? "⚠ 命中「" + hit[0] + "」，先查清是什么再留档" : "未发现密钥痕迹 ✓"));

  const ok = resRows.length > 0 && !hit;
  console.log(ok
    ? "备份完成。回导方式见 SQL 文件头部注释。"
    : "备份没成立，别拿它当资产。");
  process.exit(ok ? 0 : 1);
})();
