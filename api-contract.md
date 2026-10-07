# api-contract.md —— 接口契约（Day 15）

> 这份文档是前后端的「合同」：路径、方法、请求参数、响应形状、错误形状都写死在这里。
> 后端照它实现，前端照它调用，谁也不用去猜谁的代码。
> 第 16 天建表、第 17–19 天写接口、第 20 天前端接线，全部以本文件为唯一依据。

## 1. 统一约定

- 传输格式：JSON（`Content-Type: application/json`）。
- 成功响应：`{ "ok": true, "data": ... }`
- 失败响应：`{ "ok": false, "code": "...", "message": "..." }`，`message` 必须是**中文、人能看懂**的话，不返回英文堆栈。
- 所有接口都不做登录鉴权（本课程不登录、不建用户表，表里也没有身份字段）。
- 时间字段统一 ISO 8601 字符串，如 `2026-10-07T15:00:00.000Z`。
- 参数化查询：SQL 一律用参数绑定，禁止字符串拼接。

## 2. 接口清单

| # | 方法 | 路径 | 作用 | 计划实现日 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | GET | `/api/health` | 健康检查，不连数据库 | Day 15 | 未实现 |
| 2 | GET | `/api/resources` | 资料列表（可按分区/类别/关键词筛选） | Day 17 | 未实现 |
| 3 | GET | `/api/favorites` | 收藏列表 | Day 17 | 未实现 |
| 4 | POST | `/api/favorites` | 新增一条收藏（含校验 + 防重复） | Day 18 | 未实现 |

实现完成后，把上表的「当前状态」改为「已实现」，并补上公网地址。

---

## 3. 接口详情

### 3.1 GET /api/health

不连数据库，只证明「云函数部署成功 + 公网可访问」。

**请求参数**：无

**成功响应 200**

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "service": "magic-hub",
    "db": false,
    "time": "2026-10-07T15:00:00.000Z"
  }
}
```

字段说明：`db` 表示本接口是否真的连了数据库，这里固定为 `false`（Day 15 不连库）。

**错误响应**：正常情况不会失败。若云函数本身起不来，按统一形状返回，前端照同一套逻辑处理：

```json
{
  "ok": false,
  "code": "SERVICE_UNAVAILABLE",
  "message": "服务暂时不可用，请稍后重试"
}
```

| code | HTTP | message | 触发条件 |
| --- | --- | --- | --- |
| `SERVICE_UNAVAILABLE` | 503 | 服务暂时不可用，请稍后重试 | 云函数未部署成功或冷启动失败 |

---

### 3.2 GET /api/resources

返回资料列表，字段与前端 `mock-data.js` 一一对应，前端切真实接口时渲染逻辑不用改。

**请求参数（全部可选，走 query string）**

| 参数 | 类型 | 说明 | 默认 |
| --- | --- | --- | --- |
| `zone` | string | 分区：`shumo`（数学建模）/ `edian`（电子设计）；不传 = 全部 | 全部 |
| `category` | string | 类别，如 `真题`、`优秀论文`、`评委点评`、`AI skill` | 全部 |
| `keyword` | string | 关键词，匹配标题和一句话说明 | 全部 |
| `limit` | number | 返回条数上限，1–100 | 20 |

**成功响应 200**

```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "zone": "shumo",
      "category": "真题",
      "year": "2025",
      "title": "全国大学生数学建模竞赛 · C 题",
      "summary": "农作物种植策略优化：多目标线性规划 + 灵敏度分析思路拆解。",
      "link": "",
      "created_at": "2026-10-07T15:00:00.000Z"
    }
  ]
}
```

**排序规则**：`created_at` 倒序（新资料在前）。

**错误响应**

| code | HTTP | message | 触发条件 |
| --- | --- | --- | --- |
| `BAD_PARAM` | 400 | 参数不合法：limit 只能是 1 到 100 的数字 | `limit` 不是数字或超范围 |
| `DB_ERROR` | 500 | 数据库读取失败，请稍后重试 | 查询抛异常 |

---

### 3.3 GET /api/favorites

返回已收藏的资料，带资料标题（前端不用再二次请求）。

**请求参数**

| 参数 | 类型 | 说明 | 默认 |
| --- | --- | --- | --- |
| `limit` | number | 返回条数上限，1–100 | 20 |

**成功响应 200**

```json
{
  "ok": true,
  "data": [
    {
      "id": 3,
      "resource_id": 1,
      "title": "全国大学生数学建模竞赛 · C 题",
      "zone": "shumo",
      "created_at": "2026-10-07T15:10:00.000Z"
    }
  ]
}
```

**排序规则**：`created_at` 倒序（最近收藏的在前）。

**错误响应**

| code | HTTP | message | 触发条件 |
| --- | --- | --- | --- |
| `DB_ERROR` | 500 | 数据库读取失败，请稍后重试 | 查询抛异常 |

---

### 3.4 POST /api/favorites

写入一条收藏。这是第一条业务写接口，必须同时做到**校验、防重复、中文报错**三件事。

**请求体**

```json
{ "resource_id": 1 }
```

| 字段 | 类型 | 必填 | 校验规则 |
| --- | --- | --- | --- |
| `resource_id` | number | 是 | 必须是正整数；必须在 `resources` 表里真实存在 |

**成功响应 200**

```json
{
  "ok": true,
  "data": {
    "id": 3,
    "resource_id": 1,
    "created_at": "2026-10-07T15:10:00.000Z"
  }
}
```

**错误响应**

| code | HTTP | message | 触发条件 |
| --- | --- | --- | --- |
| `MISSING_FIELD` | 400 | 缺少必填字段：resource_id | 请求体里没有 `resource_id` |
| `BAD_PARAM` | 400 | resource_id 必须是正整数 | 传了负数、小数或字符串数字以外的类型 |
| `NOT_FOUND` | 404 | 这条资料不存在，可能已被删除 | `resources` 表里查不到该 id |
| `DUPLICATE` | 409 | 这条资料已经收藏过了 | 同一 `resource_id` 已存在收藏记录 |
| `DB_ERROR` | 500 | 数据库写入失败，请稍后重试 | 写入抛异常 |

**防重复判定标准**：以 `resource_id` 为唯一键，靠数据库唯一约束兜底，不靠应用层先查后插（避免并发下重复）。

**三条必测命令**（Day 18 验收时逐条跑）：

1. 正常写入：传一个合法的 `resource_id` → 返回 `ok:true`，`favorites` 表多一行。
2. 重复提交：同一 `resource_id` 再发一次 → 返回 `DUPLICATE`，表行数不变。
3. 缺字段提交：请求体留空 → 返回 `MISSING_FIELD`，错误信息说清缺了什么。

---

## 4. 数据模型（Day 16 建表依据）

两张表，符合「一个主对象 + 一堆按时间累积的记录」：

### resources（资料条目，主对象）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial PK | 自增主键 |
| `zone` | text not null | `shumo` / `edian`，双区隔离的基础 |
| `category` | text not null | 真题 / 优秀论文 / 评分标准 / 知识讲解 / 国奖作品 / 器件资料 / 软件资源 / AI skill / 评委点评 |
| `year` | text not null | 年份，用文本存（如 `2025`），不做数值运算 |
| `title` | text not null | 标题 |
| `summary` | text not null | 一句话说明 |
| `link` | text default `''` | 原文链接，可为空字符串 |
| `created_at` | timestamptz default now() | 创建时间 |

### favorites（收藏记录，按时间累积）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | serial PK | 自增主键 |
| `resource_id` | integer not null references resources(id) | 关联哪条资料 |
| `created_at` | timestamptz default now() | 收藏时间 |

唯一约束：`favorites(resource_id)` —— 同一条资料只能被收藏一次。
（课程不登录、不建用户表，所以唯一约束只加业务字段，不加用户维度。）

---

## 5. 变更记录

| 日期 | 变更 | 涉及接口 |
| --- | --- | --- |
| 2026-10-07 | 初版：登记 4 个接口 + 两张表的字段，供 Day 16–20 使用 | 全部 |
