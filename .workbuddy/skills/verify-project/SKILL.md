---
name: verify-project
description: 对 magic-hub 项目跑一遍发布前检查，逐项输出 PASS/FAIL 报告——公网首页可访问、健康接口、读接口（数据库可连接）、写接口能写且写完自清、无硬编码密钥、.gitignore 完整、云函数打包依赖不缺、接口域名没和静态托管域名混用、页面脚本引用完整、线上文件与本地一致。当用户说「发布前检查」「检查一遍」「能上线吗」「部署完验证一下」「verify」时使用。
---

# verify-project —— 发布前检查（Day 25）

这个 Skill 解决一件事：**发布前要检查的东西太多，靠人记一定会漏**。
密钥有没有漏、接口通不通、数据库能不能写、域名有没有混用、改完到底部署了没……
把前几周踩过的坑固化成脚本，以后一句话就能过一遍。

## 怎么跑

在项目根目录执行：

```
node .workbuddy/skills/verify-project/verify.js
```

- 退出码 `0` = 十项全过
- 退出码 `1` = 有 FAIL，末尾会列出失败清单

需要联网（会真的去请求线上地址）。机器上 git 不在 PATH 时，设一下环境变量：
`set GIT_BIN=C:\Program Files\Git\cmd\git.exe`

## 十项检查与判定标准

判定标准全部写成**可判定的数字或字符串**，不允许"看起来正常"这种说法。

| # | 检查项 | 怎么算通过 | 来自哪个坑 |
| --- | --- | --- | --- |
| 1 | 公网首页可访问 | HTTP 200，且响应体里含 `<title` 和 `app.js` | 部署完从没验证过 |
| 2 | 健康接口正常 | `ok===true` 且 `data.status==="ok"` 且 `data.service==="magic-hub"`（网关一律 200，只看 body） | Day 15 |
| 3 | 读接口正常 = 数据库连得上 | `ok===true` 且返回的资料条数 > 0（查得到行才算连上库） | Day 17 |
| 4 | 写接口能写（写完自清） | 挑一条未收藏的资料 POST 成功拿到 id → DELETE 掉 → 再 GET 列表确认它不在。三步全成才 PASS | Day 18/20 anon 权限 42501 |
| 5 | 无硬编码密钥 | `secret-scan.js` 退出码 0 且报「0 命中」，**同时**阳性对照脚本必须报出命中 | Day 23 |
| 6 | .gitignore 完整 | `.env`、`*.zip`、`.workbuddy/tmp-*` 被忽略；`.env.example` 和 Skill 文件**没被**忽略（用 `git check-ignore` 不带 `-v` 判） | Day 23（`-v` 退出码会把意思读反）|
| 7 | 云函数打包依赖完整 | 每个 `cloudfunctions/*/index.js` 里 `require`/`requireShared` 的相对路径，目标文件真实存在 | Day 23 打包后 MODULE_NOT_FOUND 真 bug |
| 8 | 接口域名没混用 | `api.js` 的 BASE 必须以 `.ap-shanghai.app.tcloudbase.com` 结尾，且与静态托管域名不同源 | Day 20 跨域真坑 |
| 9 | 页面脚本引用完整 | HTML 里每个本地 `src`/`href` 指向的文件都存在；**有数据卡片容器 `.card-grid` 的页面必须引 `api.js`** | Day 25 定规则时查证：不带容器的页面缺 api.js 不产生实际影响 |
| 10 | 线上文件与本地一致 | 拉取线上 `app.js`/`styles.css`/`api.js`/`mock-data.js`/`index.html`，与本地逐字符比对，一致才 PASS | 静态托管不重传就不生效 |

第 5 项特意加了**阳性对照**：只跑扫描器、永远是 0 命中，不代表扫描器有效（可能规则写坏了）。
所以必须同时证明"塞进去的假密钥它抓得到"。

第 10 项回答的是"我改的东西到底上线了没"，比人肉搜某个变量名可靠。

第 9 项的判据为什么是 `.card-grid`：app.js 里 `window.MagicAPI` **只有一处**，而且是防御写法
（`function api(){ return window.MagicAPI || null; }`）。api.js 没加载时它会**静默降级成本地示例数据**——
不报错，页面上也看不出来。所以只有真正要渲染数据的页面（有 `.card-grid`）才强制要求引 api.js；
一刀切地要求"引了 app.js 就必须引 api.js"，会把登录、注册、分区首页 4 个页面全误报成 FAIL。

## 结果怎么读

每项输出三行：**结论 / 判定（标准是什么）/ 实测（实际观测到什么）**。
FAIL 一律附带下一步能做什么，例如留下脏数据时直接给出要手动执行的删除命令。

## 已知情况（不是 bug）

- **冷启动 504**：CloudBase 免费版云函数固定 3 秒超时，冷启动偶发
  `FUNCTIONS_TIME_LIMIT_EXCEEDED`。脚本对 504 自动**重试一次**，重试成功不算 FAIL，
  但会在实测行标注「冷启动重试一次后」。
- **本地改完还没部署**：第 10 项会 FAIL——这是对的，它在提醒你去部署静态托管。
- **git 调不起来**：第 5、6 项 FAIL 并提示设 `GIT_BIN`。注意 `GIT_BIN` 要写成 **Windows 路径**
  （如 `G:/Software/Git/cmd/git.exe`），写成 `/g/Software/...` 这种 Git Bash 形式 node 认不了，
  表现同样是"git 不可用"。

## 加检查项怎么加

1. 在 `verify.js` 里照现有检查项的样式加一个 `checkXxx()`，返回 `{pass, actual}`。
2. 判定标准必须能写成"等于什么 / 大于几 / 含不含某串"，写不出来的检查项不要加。
3. 加完在下面这张表里同步写一行，并且**故意弄坏一次**确认它真的会报 FAIL
   （一个永远 PASS 的检查项等于没有）。
