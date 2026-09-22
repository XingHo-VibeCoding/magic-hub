# magic-hub

数学建模 & 电子设计竞赛"保姆式"辅助平台——把散落的资料、评分标准和练习反馈收进一个网站，两个比赛完全分区。

> vibe coding 课程第 1 周作品 · 当前阶段：Day 7 MVP（三页骨架 + 本地启动）

---

## 如何在本地运行

**前提**：电脑已装 Node.js（本课程 Day 1 已装好，v22+）。

```bash
# 1. 进入项目目录
cd /d D:\vibecoding

# 2. 启动本地服务器（零依赖，无需 npm install）
npm start

# 3. 浏览器打开
#    http://localhost:3000

# 4. 停止服务器：在终端按 Ctrl + C
```

也可以不用 npm，直接：`node server.js`，效果相同。

---

## 网站结构

| 地址 | 页面 | 说明 |
| --- | --- | --- |
| `/` | 首页 | 项目名 + 标语 + 双区入口卡片 |
| `/shumo/` | 数学建模区 | 4 个功能入口（资料库/资源导航/AI 分析/Skill 下载），均"建设中" |
| `/edian/` | 电子设计区 | 3 个功能入口，本期只搭结构 |

规则：两个分区从首页起完全隔离，跨区只能经首页（PRD AC3）。

---

## 目录说明

```
D:\vibecoding\
├── index.html      首页
├── styles.css      全站共用样式（颜色变量集中在 :root，换主题只改这里）
├── shumo\          数学建模区
│   └── index.html  数模区首页
├── edian\          电子设计区
│   └── index.html  电赛区首页
├── server.js       本地开发服务器（零依赖；后续 /api/ 接口也加在这里）
├── package.json    项目声明 + npm start 命令（无任何依赖）
├── .gitignore      忽略规则（.env、node_modules 等永不进仓库）
├── AGENTS.md       项目协作规则（最高优先级）
├── research.md     需求研究（Day 3）
├── PRD.md          产品需求与验收标准（Day 4）
└── TECH_DESIGN.md  技术设计（Day 5）
```

---

## 开发路线（接下来做什么）

按 TECH_DESIGN.md 1.3 的最小落地顺序，React 是"升级而非前提"：

1. ~~静态页面骨架 + 本地启动~~（Day 7 已完成）
2. 资料库 / 资源导航页填充真实内容（AC4/AC5/AC6）
3. Skill 下载页（AC11）
4. AI 赛题分析页 + `/api/analyze` 后端接口（AC7–AC10，密钥只存 `.env` / 云函数环境变量）
5. 引入 React + Vite 重写（工程化升级）
6. Day 23 起接入 CloudBase 云数据库，进入阶段二

---

## 相关文档

- 产品验收看 [PRD.md](PRD.md) 第 8 节（AC1–AC15）
- 技术方案看 [TECH_DESIGN.md](TECH_DESIGN.md)
- 协作规则看 [AGENTS.md](AGENTS.md)
