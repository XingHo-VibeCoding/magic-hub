# magic-hub v1.0 发布清单

**版本号**：v1.0
**对应提交**：`f0b2530`（Day 25｜新增发布前检查 Skill）
**发布日期**：2026-10-15
**版本标记**：`git tag v1.0`（annotated tag，指向 f0b2530）

这是 magic-hub（数学建模 + 电子设计竞赛资料站）的第一个正式版本。
第 15 天打通云端链路只是"能打开"，v1.0 是把它固化成一个**可复现、可回退**的发布状态。

---

## 一、公网地址

| 用途 | 地址 |
| --- | --- |
| 网站（静态托管） | https://magic-hub-d7gt99c7waafb07ad-1501395198.tcloudbaseapp.com |
| 接口（云函数网关） | https://magic-hub-d7gt99c7waafb07ad-1501395198.ap-shanghai.app.tcloudbase.com |

两个域名**不是同一个**（一个 `tcloudbaseapp.com`、一个 `ap-shanghai.app.tcloudbase.com`），
混用会跨域失败——这是 Day 20 踩过的坑，发布前检查第 8 项专门盯它。

## 二、这次发布包含什么

### 静态托管（11 个文件）

根目录：`index.html`、`login.html`、`register.html`、`app.js`、`api.js`、`mock-data.js`、`styles.css`
子目录：`shumo/index.html`、`shumo/library.html`、`edian/index.html`、`edian/library.html`

部署包：`magic-hub-site-v1.0.zip`（从工作树直接打包，与本地文件逐字符一致）。

### 云函数（3 个）

| 函数 | 本次版本对应提交 | 说明 |
| --- | --- | --- |
| `health` | `ed64682`（Day 15） | 健康检查，Day 15 上线后代码未再改动 |
| `favorites` | `6aebc2d`（Day 23） | 收藏的增删改查，含请求日志 |
| `resources` | `6aebc2d`（Day 23） | 资料列表查询，含请求日志 |

## 三、发布前检查结果（10 / 10 全过）

跑法与判定标准见 `.workbuddy/skills/verify-project/SKILL.md`，脚本 `verify.js` 退出码 0。
以下为 2026-10-15 发布时的实测记录：

| # | 检查项 | 实测 |
| --- | --- | --- |
| 1 | 公网首页可访问 | HTTP 200，含 `<title>` 与 `app.js` |
| 2 | 健康接口正常 | 200（706ms），`ok=true`、`status=ok`、`service=magic-hub` |
| 3 | 读接口正常（连得上库） | 200（1951ms），返回资料 16 条 |
| 4 | 写接口能写（写完自清） | `resource_id=5` 写入得 id=23 → 删除 → 复查列表里没有它，**未留脏数据** |
| 5 | 无硬编码密钥 | 工作树与提交历史 0 命中；阳性对照 6 种假密钥全部被抓到 |
| 6 | .gitignore 完整 | 6 条规则判定全部符合预期 |
| 7 | 云函数打包依赖完整 | 8 个云函数文件的相对引用全部能解析 |
| 8 | 接口域名没混用 | 两个域名不同源，符合预期 |
| 9 | 页面脚本引用完整 | 7 个页面本地引用全部存在；需要真实数据的页面都引了 `api.js` |
| 10 | 线上文件与本地一致 | 5 个静态文件线上与本地逐字符相同 |

## 四、怎么复现这次发布

```
cd G:\vibecoding
$env:GIT_BIN="G:/Software/Git/cmd/git.exe"
node .workbuddy/skills/verify-project/verify.js     # 十项全过（退出码 0）才继续
node .workbuddy/tmp-day26/make-site-zips-day26.js   # 生成部署包到桌面
```

然后把 `magic-hub-site-v1.0.zip` 上传到 CloudBase 静态托管**根目录**
（不能套一层父目录，否则全站 404）。

## 五、已知限制（v1.0 没做到的，不隐瞒）

1. **云函数冷启动偶发 504**：CloudBase 免费版执行超时固定 3 秒不可调，冷启动要 2–5 秒。
   应对是定时触发器预热 + 前端失败自动重试一次，不是彻底解决。
2. **登录注册页只做界面，未接后端**：账号系统属后续阶段，现在点登录不会真的登录。
3. **主视图资料为示例数据 + 云端资料两部分**：资料库共 16 条真实记录，
   AI 技能与评委点评等仍是示例数据。
4. **数据库写权限靠显式授权**：`anon` 角色默认只有读，写表需要显式 GRANT
   （含自增序列的 USAGE/SELECT），换环境重建库时要重新执行，否则报 42501。

## 六、出事怎么办

见 `ROLLBACK.md`（回滚手册）：静态托管怎么退回上一版、云函数怎么回退、数据误删怎么恢复，
以及本次回滚演练的耗时记录。
