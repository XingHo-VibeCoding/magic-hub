/*
 * app.js —— 首页渲染逻辑（Day 8，零依赖原生 JS）
 * 职责：
 *   1. 读 mock-data.js 的假数据，把卡片渲染进两个主题区块；
 *   2. 四种页面状态切换：loading（骨架屏）/ success（卡片）/ empty（空提示）/ error（重试）；
 *      用网址参数触发演示：?state=loading / ?state=empty / ?state=error（不带参数 = 正常成功态）
 *   3. 顶栏滚动变色：初始透明融进 Hero，滚动离开顶部（>0 像素）即变白，回到最顶恢复透明；
 *   4. 「探索更多」平滑滚动到正题；
 *   5. 卡片交互反馈（Day 11）：收藏星标（状态变化+弹跳）、复制链接（真剪贴板）、
 *      toast 提示条——反馈三层叠加：状态变了 + 动一下 + 说清楚。
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
      if (list && list.length) renderSuccess(el, list, zoneKey);
      else renderEmpty(el);
    });
  }

  // 成功状态：mock 数据 → 卡片（每张卡带「收藏 / 复制链接」操作行，Day 11）
  function renderSuccess(el, list, zoneKey) {
    el.setAttribute("data-state", "success");
    el.innerHTML = "";
    list.forEach(function (item, index) {
      var card = document.createElement("article");
      card.className = "card";
      var cardKey = zoneKey + "-" + index;   // 收藏状态的记忆键（区块 + 序号）
      card.innerHTML =
        '<div class="card-thumb" aria-hidden="true"></div>' +
        '<div class="card-body">' +
          '<div class="card-meta">' +
            '<span class="card-cat"></span>' +
            '<span class="card-year"></span>' +
          "</div>" +
          '<h3 class="card-title"></h3>' +
          '<p class="card-summary"></p>' +
          '<div class="card-actions">' +
            '<button class="card-btn btn-fav" type="button" aria-pressed="false">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
                '<path class="star-fill" d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="currentColor"/>' +
              "</svg>" +
              "<span>收藏</span>" +
            "</button>" +
            '<button class="card-btn btn-copy" type="button">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M10.5 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
                '<path d="M13.5 10.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1.4-1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
              "</svg>" +
              "<span>复制链接</span>" +
            "</button>" +
          "</div>" +
        "</div>";
      // 用 textContent 填内容，避免假数据里万一有特殊字符破坏页面
      card.querySelector(".card-cat").textContent = item.category;
      card.querySelector(".card-year").textContent = item.year;
      card.querySelector(".card-title").textContent = item.title;
      card.querySelector(".card-summary").textContent = item.summary;
      setupCardActions(card, cardKey, item);
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
    renderSuccess(el, list, zoneKey);
  }

  /* ---------- 顶栏滚动变色（透明 → 白） ---------- */

  function setupTopbar() {
    var bar = document.getElementById("topbar");
    if (!bar) return; // 防御：个别页面没有顶栏就跳过

    function update() {
      // 对齐参考站（紫光同创官网 index.js 的行为）：只要离开页面顶部（滚动 > 0 像素）
      // 就变白，回到最顶才恢复透明 —— 半透明顶栏压在滚上来的正文上会看不清。
      if (window.scrollY > 0) bar.classList.add("solid");
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

  /* ---------- 交互反馈：toast 提示条 + 收藏 / 复制链接（Day 11） ---------- */

  // 收藏状态存在内存里：刷新就清空 —— 还没有数据库，如实反馈，不假装"已保存"
  var favorites = new Set();

  // toast：页面底部弹出的小提示条。type 不传 = 成功（紫底），传 "error" = 失败（深红底）
  function showToast(message, type) {
    var root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      root.setAttribute("aria-live", "polite");   // 读屏器会自动播报这里的文字变化
      document.body.appendChild(root);
    }
    // 同一时间只留一条：新的顶掉旧的，连续点击不会堆成一摞
    var old = root.querySelector(".toast");
    if (old) old.remove();
    var t = document.createElement("div");
    t.className = "toast" + (type === "error" ? " toast-error" : "");
    t.textContent = message;
    root.appendChild(t);
    // 下一帧再加 .show，让"进场过渡"真的发生（否则浏览器会跳过动画直接显示）
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");                 // 先淡出
      setTimeout(function () { t.remove(); }, 350); // 过渡走完再删节点
    }, 2600);
  }

  // 每张卡片的一对按钮：收藏（状态变化 + 弹跳）、复制链接（真剪贴板，失败给下一步）
  function setupCardActions(card, cardKey, item) {
    var favBtn = card.querySelector(".btn-fav");
    var copyBtn = card.querySelector(".btn-copy");

    favBtn.addEventListener("click", function () {
      var pressed = favBtn.getAttribute("aria-pressed") === "true";
      if (pressed) {
        favorites.delete(cardKey);
        favBtn.setAttribute("aria-pressed", "false");
        favBtn.querySelector("span").textContent = "收藏";
        showToast("已取消收藏");
      } else {
        favorites.add(cardKey);
        favBtn.setAttribute("aria-pressed", "true");
        favBtn.querySelector("span").textContent = "已收藏";
        showToast("已收藏");
        // 重新触发弹跳动画：先摘掉动画类 → 强制浏览器重排 → 再挂回去
        favBtn.classList.remove("pop");
        void favBtn.offsetWidth;
        favBtn.classList.add("pop");
      }
    });

    copyBtn.addEventListener("click", function () {
      var text = item.title + "（" + item.category + " · " + item.year + "）— " + window.location.href;
      // 剪贴板 API 只在 https 或 localhost 下存在；环境不支持就直接给失败提示和下一步
      if (!(navigator.clipboard && navigator.clipboard.writeText)) {
        showToast("复制失败，请手动复制地址栏链接", "error");
        return;
      }
      navigator.clipboard.writeText(text).then(function () {
        showToast("复制成功，可直接粘贴分享");
      }).catch(function () {
        showToast("复制失败，请手动复制地址栏链接", "error");
      });
    });
  }

  /* ---------- 启动 ---------- */

  renderZone("shumo");
  renderZone("edian");
  setupTopbar();
  setupHeroBtn();
})();
