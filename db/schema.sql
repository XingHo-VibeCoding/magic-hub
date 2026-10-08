-- ============================================================================
-- db/schema.sql —— Day 16 建表脚本（可重复执行）
-- 依据：api-contract.md 第 5 节「两张表字段定稿」
--   resources  资料条目（主对象）
--   favorites  收藏记录（按时间累积的记录，唯一约束 resource_id）
-- 设计原则：
--   1. 全部 IF NOT EXISTS —— 跑第二遍不报错、不改坏已有数据；
--   2. 字段与前端 mock-data.js 对齐，Day 20 切真实接口时渲染逻辑不用改；
--   3. 密码、密钥一律不出现本文件。
-- ============================================================================

-- 资料条目表 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
  id          SERIAL PRIMARY KEY,             -- 自增编号
  zone        TEXT    NOT NULL  CHECK (zone IN ('shumo', 'edian')),  -- 分区：数模 / 电设
  category    TEXT    NOT NULL,                -- 类别：真题 / 优秀论文 / 国奖作品 …
  year        INTEGER,                         -- 年份（允许空：老资料可能没标年份）
  title       TEXT    NOT NULL,                -- 标题
  summary     TEXT    NOT NULL DEFAULT '',     -- 一句话说明
  link        TEXT    NOT NULL DEFAULT '',     -- 资料链接（暂空，后续补充）
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 筛选常用：按分区 + 类别过滤（GET /api/resources?zone=&category=）
CREATE INDEX IF NOT EXISTS resources_zone_category_idx
  ON resources (zone, category);

-- 收藏记录表 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id           SERIAL PRIMARY KEY,
  resource_id  INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 课程不做登录，收藏不区分用户；同一资料只允许收藏一次
  CONSTRAINT favorites_resource_id_key UNIQUE (resource_id)
);

-- 收藏列表按时间倒序查（GET /api/favorites）
CREATE INDEX IF NOT EXISTS favorites_created_at_idx
  ON favorites (created_at DESC);

-- 安全说明 -----------------------------------------------------------------
-- 控制台提示 public schema 走 PostgREST 需配 RLS。本项目数据访问只走云函数
-- （Day 17-19），不开 PostgREST 公网入口，因此暂不启用 RLS；
-- 若日后启用 REST API 访问，必须先补 RLS 策略再放开。
