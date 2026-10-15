-- magic-hub 数据备份   导出时间：2026-10-15T13:29:57.635Z
-- 来源：https://magic-hub-d7gt99c7waafb07ad-1501395198.ap-shanghai.app.tcloudbase.com
-- 内容：resources 16 条，favorites 5 条
--
-- 用法（在 CloudBase 控制台的 SQL 编辑器或本地 psql 里执行）：
--   1. 目标表如果是空的，直接整段执行即可。
--   2. 目标表已有数据且要先用这份覆盖，自己加一句：
--        TRUNCATE favorites, resources RESTART IDENTITY CASCADE;
--      脚本不替你写删除语句——恢复时该不该清表由人判断。
--   3. 末尾的 setval 会把自增序列拨到最大 id 之后，否则下次插入报重复主键。
--   4. favorites 依赖 resources（外键 + ON DELETE CASCADE），所以先插 resources。

BEGIN;

-- resources（16 条）
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (2, 'shumo', '优秀论文', 2024, '国一论文精读 · 板凳龙运动轨迹', '螺旋线与碰撞检测的完整建模过程，附摘要写作结构批注。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (3, 'shumo', '评分标准', 2025, 'CUMCM 评审要点速览', '假设合理性、模型创新性、结果检验三大维度，评委视角逐条解读。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (4, 'shumo', '知识讲解', 2025, '三天入门常用模型', '线性规划 / 层次分析 / 回归预测的最小可用知识包与代码模板。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (5, 'shumo', '真题', 2024, '研究生数学建模 · F 题', '风电场功率预测：数据清洗流程与时序特征工程实战记录。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (6, 'shumo', '优秀论文', 2023, '美赛 MCM · O 奖论文', '共享单车调度问题：从问题重述到敏感性分析的全链条范文。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (7, 'shumo', 'AI skill', 2025, '线性规划求解 skill 模板', '输入题目自动拆解约束条件与目标函数，附 Python 求解代码框架。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (8, 'shumo', '评委点评', 2024, 'C 题获奖队伍评委点评实录', '评委逐队点评假设、模型与论文表达，标注高频失分点。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (9, 'edian', '国奖作品', 2024, 'H 题 · 自动行驶小车', '循迹 + 避障方案全解析：主控选型、PID 调参实录与实地测试数据。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (10, 'edian', '器件资料', 2025, '常用元器件速查手册', '电阻电容 / 运放 / 电源芯片选型要点与典型电路图合集。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (11, 'edian', '软件资源', 2025, '嵌入式开发环境搭建指南', 'Keil / STM32CubeMX / 烧录工具的安装配置与常见报错排查。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (12, 'edian', '国奖作品', 2023, 'E 题 · 运动目标控制', '视觉识别 + 云台控制方案，附激光笔瞄准的标定细节。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (13, 'edian', '器件资料', 2024, '电机驱动模块对比实测', 'TB6612 / L298N / DRV8833 效率、发热与接线复杂度横评。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (14, 'edian', '软件资源', 2023, '电路仿真工具入门', 'Multisim 与 LTspice 基础操作，赛前验证电路不再靠玄学。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (15, 'edian', 'AI skill', 2025, '电路方案速查 skill 模板', '描述功能需求即可检索参考电路、器件选型与常见坑。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (16, 'edian', '评委点评', 2024, 'H 题国赛评审现场点评', '小车类赛题评审要点：方案合理性、实测数据与现场答辩表现。', '', '2026-10-08T12:46:48.093957+08:00');
INSERT INTO resources (id, zone, category, year, title, summary, link, created_at) VALUES (1, 'shumo', '真题', 2025, '全国大学生数学建模竞赛 · C 题', '农作物种植策略优化：多目标线性规划 + 灵敏度分析思路拆解。', '', '2026-10-08T12:46:48.093957+08:00');

-- favorites（5 条，只含该表真实字段）
INSERT INTO favorites (id, resource_id, note, created_at) VALUES (8, 4, '测试-改', '2026-10-11T11:35:10.391033+08:00');
INSERT INTO favorites (id, resource_id, note, created_at) VALUES (7, 6, '', '2026-10-10T21:56:21.191544+08:00');
INSERT INTO favorites (id, resource_id, note, created_at) VALUES (6, 3, '', '2026-10-10T21:56:10.273636+08:00');
INSERT INTO favorites (id, resource_id, note, created_at) VALUES (5, 2, '', '2026-10-10T20:59:01.743461+08:00');
INSERT INTO favorites (id, resource_id, note, created_at) VALUES (1, 1, '测试-改', '2026-10-09T14:50:29.926442+08:00');

SELECT setval(pg_get_serial_sequence('resources','id'), 16, true);
SELECT setval(pg_get_serial_sequence('favorites','id'), 8, true);

COMMIT;
