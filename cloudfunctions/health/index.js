/*
 * /api/health —— 健康检查接口（Day 15）
 *
 * 作用：不连数据库，只证明一件事——云函数真的部署到了 CloudBase，并且公网能访问。
 * 后面第 17–19 天的所有接口，走的都是同一条部署链路。
 *
 * 返回形状见 api-contract.md 3.1：{ ok:true, data:{ status, service, db, time } }
 * db 固定为 false：本接口不连库，连库是 Day 17 的事。
 *
 * 部署后要到 CloudBase 控制台 → HTTP 访问服务，把触发路径配成 /api/health，
 * 公网地址形如 https://<环境ID>.service.tcloudbase.com/api/health
 */

exports.main = async (event, context) => {
  return {
    ok: true,
    data: {
      status: "ok",
      service: "magic-hub",
      db: false,
      time: new Date().toISOString()
    }
  };
};
