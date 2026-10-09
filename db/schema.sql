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

-- 写权限授权（Day 18 排错实测所得，别删） ------------------------------------
-- 现象：云函数读库一切正常，一写入就报
--         permission denied for table favorites | DATABASE_42501
--       典型表现就是「读得通、写不进」。
-- 根因：用 SQL 手工 CREATE TABLE 不会自动给应用角色写权限。云函数不登录，
--       实际身份是 anon（查法见本段末尾），而 anon 默认只有 SELECT。
--       应用流量只会落到 anon / authenticated / service_role 三者之一。
-- 两个易踩的点：
--   1. SERIAL 主键背后是序列对象，GRANT INSERT ON TABLE 不会连带授权序列，
--      漏了下面的序列授权会换一个新错：
--         permission denied for sequence favorites_id_seq
--   2. 报错措辞是 "for table xxx" 而不是
--      "new row violates row-level security policy for table xxx"，
--      说明不是 RLS 拦的（本库 pg_tables.rowsecurity 两表均为 false），别去改策略。
-- 执行时控制台可能弹「检测到 Supabase 内置角色，TCB 不包含这些预置角色」——
--   那是提示不是报错：角色确实存在（下面的核查语句能列出来），确认仍执行即可。
GRANT USAGE ON SCHEMA public TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.favorites TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.favorites_id_seq TO anon;

-- 核查语句（只读，随时可跑）：
--   谁对 favorites 有什么权限 —— 谁有 SELECT 谁就是云函数实际使用的身份
--     SELECT grantee, privilege_type FROM information_schema.role_table_grants
--      WHERE table_schema='public' AND table_name='favorites'
--      ORDER BY grantee, privilege_type;
--   两张表有没有开 RLS（rowsecurity 为 f 表示没开）
--     SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
