/*
 * app.js —— 首页渲染逻辑（Day 8，零依赖原生 JS）
 * 职责：
 *   1. 读 mock-data.js 的假数据，把卡片渲染进两个主题区块；
 *   2. 四种页面状态切换：loading（骨架屏）/ success（卡片）/ empty（空提示）/ error（重试）；
 *      用网址参数触发演示：?state=loading / ?state=empty / ?state=error（不带参数 = 正常成功态）
 *   3. 顶栏滚动变色：一开始透明融进 Hero，下滑超过一屏的 60% 后变白；
 *   4. 「探索更多」平滑滚动到正题。
 */

(function () {
  "use strict";

  /* ---------- 四状态渲染 ---------- */

  // 骨架屏（加载中）：先占位，模拟"数据在路上"
  function renderSkeleton(el, count) {
    el.innerHTML = "";
    el.setAttribute("data-state", "loading");
    for (var i = 0; i < (count || 3); i++) {
      var box = document.createElement("div");
      box.className = "skeleton-card";
      box.innerHTML =
        '<div class="sk sk-tag"></div>' +
        '<div class="sk sk-title"></div>' +
        '<div class="sk sk-line"></div>' +
        '<div class="sk sk-line short"></div>';
      el.appendChild(box);
    }
  }

  // 空状态：说明现在没有内容 + 告诉用户下一步做什么（禁止白屏、也不卖萌）
  function renderEmpty(el) {
    el.setAttribute("data-state", "empty");
    el.innerHTML =
      '<div class="state-box">' +
        '<p class="state-title">这个区块的内容还在整理中</p>' +
        "<p>可以先看看另一个主题，或进入分区页浏览已有资料。</p>" +
      "</div>";
  }

  // 错误状态：说清发生了什么、怎么处理，并给一个真的能用的重试按钮
  function renderError(el, zoneKey) {
    el.setAttribute("data-state", "error");
    el.innerHTML =
      '<div class="state-box error">' +
        '<p class="state-title">内容没能加载出来</p>' +
        "<p>请先检查网络连接，然后重新加载。</p>" +
        '<button class="btn-retry" type="button">重新加载</button>' +
      "</div>";
    el.querySelector(".btn-retry").addEventListener("click", function () {
      // 重试 = 直接重新尝试加载数据（不看演示参数，否则 ?state=error 下会永远重试到错误）
      var list = (window.MOCK_DATA || {})[zoneKey];
      if (list && list.length) renderSuccess(el, list);
      else renderEmpty(el);
    });
  }

  // 成功状态：mock 数据 → 卡片
  function renderSuccess(el, list) {
    el.setAttribute("data-state", "success");
    el.innerHTML = "";
    list.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "card";
      card.innerHTML =
        '<div class="card-thumb" aria-hidden="true"></div>' +
        '<div class="card-body">' +
          '<div class="card-meta">' +
            '<span class="card-cat"></span>' +
            '<span class="card-year"></span>' +
          "</div>" +
          '<h3 class="card-title"></h3>' +
          '<p class="card-summary"></p>' +
        "</div>";
      // 用 textContent 填内容，避免假数据里万一有特殊字符破坏页面
      card.querySelector(".card-cat").textContent = item.category;
      card.querySelector(".card-year").textContent = item.year;
      card.querySelector(".card-title").textContent = item.title;
      card.querySelector(".card-summary").textContent = item.summary;
      el.appendChild(card);
    });
  }

  // 渲染一个主题区块：根据网址参数决定演示哪种状态
  function renderZone(zoneKey) {
    var el = document.getElementById(zoneKey + "-grid");
    if (!el) return;
    var list = (window.MOCK_DATA || {})[zoneKey];

    var demo = new URLSearchParams(window.location.search).get("state");
    if (demo === "loading") { renderSkeleton(el, 3); return; }
    if (demo === "empty")   { renderEmpty(el); return; }
    if (demo === "error")   { renderError(el, zoneKey); return; }

    if (!list || !list.length) { renderEmpty(el); return; }   // 数据缺失 → 空态兜底
    renderSuccess(el, list);
  }

  /* ---------- 顶栏滚动变色（透明 → 白） ---------- */

  function setupTopbar() {
    var bar = document.getElementById("topbar");
    if (!bar) return; // 分区页没有这个 id，跳过
    var hero = document.getElementById("hero");
    var threshold = hero ? hero.offsetHeight * 0.6 : 300;

    function update() {
      // 滑过 Hero 六成高度后变白；回到顶部又变回透明
      if (window.scrollY > threshold) bar.classList.add("solid");
      else bar.classList.remove("solid");
    }
    window.addEventListener("scroll", update, { passive: true });
    update(); // 进页面时先算一次（防止刷新时停在半路）
  }

  /* ---------- 「探索更多」平滑滚动 ---------- */

  // 尊重系统"减少动态效果"设置：开了就直接跳，不做滚动动画
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setupHeroBtn() {
    var btn = document.getElementById("heroBtn");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      var target = document.querySelector(btn.getAttribute("href"));
      if (target) {
        e.preventDefault();
        // 减去顶栏高度，别让标题被顶栏压住
        var top = target.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
      }
    });
  }

  /* ---------- 启动 ---------- */

  renderZone("shumo");
  renderZone("edian");
  setupTopbar();
  setupHeroBtn();
})();
