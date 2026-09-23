/*
 * mock-data.js —— 本地假数据（Day 8）
 * 字段对照 PRD 6.1：title（标题）/ year（年份）/ category（类别）/ summary（一句话说明）
 * 第 3 周接真实 API 时，只需让接口返回同结构数据，渲染逻辑不用改。
 * 注意：这里永远不放密钥、不放真实用户数据。
 */

window.MOCK_DATA = {
  // 主题一：数学建模
  shumo: [
    {
      category: "真题",
      year: "2025",
      title: "全国大学生数学建模竞赛 · C 题",
      summary: "农作物种植策略优化：多目标线性规划 + 灵敏度分析思路拆解。"
    },
    {
      category: "优秀论文",
      year: "2024",
      title: "国一论文精读 · 板凳龙运动轨迹",
      summary: "螺旋线与碰撞检测的完整建模过程，附摘要写作结构批注。"
    },
    {
      category: "评分标准",
      year: "2025",
      title: "CUMCM 评审要点速览",
      summary: "假设合理性、模型创新性、结果检验三大维度，评委视角逐条解读。"
    },
    {
      category: "知识讲解",
      year: "2025",
      title: "三天入门常用模型",
      summary: "线性规划 / 层次分析 / 回归预测的最小可用知识包与代码模板。"
    },
    {
      category: "真题",
      year: "2024",
      title: "研究生数学建模 · F 题",
      summary: "风电场功率预测：数据清洗流程与时序特征工程实战记录。"
    },
    {
      category: "优秀论文",
      year: "2023",
      title: "美赛 MCM · O 奖论文",
      summary: "共享单车调度问题：从问题重述到敏感性分析的全链条范文。"
    }
  ],

  // 主题二：电子设计
  edian: [
    {
      category: "国奖作品",
      year: "2024",
      title: "H 题 · 自动行驶小车",
      summary: "循迹 + 避障方案全解析：主控选型、PID 调参实录与实地测试数据。"
    },
    {
      category: "器件资料",
      year: "2025",
      title: "常用元器件速查手册",
      summary: "电阻电容 / 运放 / 电源芯片选型要点与典型电路图合集。"
    },
    {
      category: "软件资源",
      year: "2025",
      title: "嵌入式开发环境搭建指南",
      summary: "Keil / STM32CubeMX / 烧录工具的安装配置与常见报错排查。"
    },
    {
      category: "国奖作品",
      year: "2023",
      title: "E 题 · 运动目标控制",
      summary: "视觉识别 + 云台控制方案，附激光笔瞄准的标定细节。"
    },
    {
      category: "器件资料",
      year: "2024",
      title: "电机驱动模块对比实测",
      summary: "TB6612 / L298N / DRV8833 效率、发热与接线复杂度横评。"
    },
    {
      category: "软件资源",
      year: "2023",
      title: "电路仿真工具入门",
      summary: "Multisim 与 LTspice 基础操作，赛前验证电路不再靠玄学。"
    }
  ]
};
