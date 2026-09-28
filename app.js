/*
 * app.js —— 首页渲染逻辑（Day 8，零依赖原生 JS）
 * 职责：
 *   1. 读 mock-data.js 的假数据，把卡片渲染进两个主题区块；
 *   2. 四种页面状态切换：loading（骨架屏）/ success（卡片）/ empty（空提示）/ error（重试）；
 *      用网址参数触发演示：?state=loading / ?state=empty / ?state=error（不带参数 = 正常成功态）
 *   3. 顶栏滚动变色：初始透明融进 Hero，滚动离开顶部（>0 像素）即变白，回到最顶恢复透明；
 *   4. 「探索更多」平滑滚动到正题；
 *   5. 卡片交互反馈（Day 11）：收藏星标（状态变化+弹跳）、复制链接（真剪贴板）、
 *      toast 提示条——反馈三层叠加：状态变了 + 动一下 + 说清楚；
 *   6. 搜索筛选（Day 12，按 skills/frontend-guidelines 规则实现）：
 *      输入关键词或选类别 → 只显示匹配卡片 → 无结果给「没有找到相关内容」+ 下一步 → 清空恢复；
 *   7. 全屏搜索层（Day 12 追加，对齐紫光互动）：顶栏放大镜点开 → 全屏搜索，
 *      结果点一下跳到对应区块并自动填好筛选词，Esc / 关闭按钮 / 点遮罩退出；
 *   8. 资料库页（Day 13）：列表视图 ↔ 详情视图，用地址 #item=编号 切换（不刷新、可后退、可分享），
 *      分类标签 + 关键词搜索；面包屑末项随视图变化。
 *      列表同样有四种状态（沿用首页的 ?state=loading/empty/error 演示参数）：
 *      加载中骨架屏 / 库里没内容（空）/ 加载失败（说清+真重试）/ 正常卡片。
 *   9. 会员中心（Day 13 板块④）：登录 / 注册表单的前端校验——必填、邮箱格式、密码强度、
 *      两次密码一致、验证码、协议勾选；通过后如实说明"账号系统接入后端才能用"，不做假登录。
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

  // 错误状态：说清发生了什么、怎么处理，并给一个真的能用的重试按钮。
  // onRetry 可选：不同页面「重试」该回到什么样子不一样（首页回卡片、资料库回列表），
  // 传了就用页面自己的；不传就走默认（首页那套）。
  function renderError(el, zoneKey, onRetry) {
    el.setAttribute("data-state", "error");
    el.innerHTML =
      '<div class="state-box error">' +
        '<p class="state-title">内容没能加载出来</p>' +
        "<p>请先检查网络连接，然后重新加载。</p>" +
        '<button class="btn-retry" type="button">重新加载</button>' +
      "</div>";
    el.querySelector(".btn-retry").addEventListener("click", function () {
      // 重试 = 直接重新尝试加载数据（不看演示参数，否则 ?state=error 下会永远重试到错误）
      if (onRetry) { onRetry(); return; }
      var list = (window.MOCK_DATA || {})[zoneKey];
      if (list && list.length) renderSuccess(el, list, zoneKey);
      else renderEmpty(el);
    });
  }

  // 成功状态：mock 数据 → 卡片（每张卡带「收藏 / 复制链接」操作行，Day 11）
  function renderSuccess(el, list, zoneKey) {
    el.setAttribute("data-state", "success");
    // 首页卡片带「查看详情」入口 → 跳到该区资料库页并直接打开这一条（Day 13 多级切换）
    renderCards(el, list, zoneKey, zoneKey + "/library.html");
  }

  // 渲染一批卡片（renderSuccess 与搜索筛选、资料库列表共用，Day 12 抽出）；
  // 清空容器放在这里：无论谁调用都是"整批重画"，不会越叠越多；
  // detailPath 传了才加「查看详情」链接（资料库页自己不需要再链回自己）
  function renderCards(el, list, zoneKey, detailPath) {
    el.innerHTML = "";
    var fullList = (window.MOCK_DATA || {})[zoneKey] || [];
    list.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "card";
      // 收藏状态的记忆键用标题：筛选后卡片顺序会变，序号键会让收藏错位
      var cardKey = zoneKey + "-" + item.title;
      // 详情链接用「在完整数据里的位置」：筛选后的子集序号会指错资料
      var fullIndex = fullList.indexOf(item);
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
            // 查看详情：跳到资料库页并直接展开这一条（资料库页自身不传 detailPath）
            (detailPath && fullIndex >= 0
              ? '<a class="card-btn card-link" href="' + detailPath + "#item=" + fullIndex + '">' +
                  "<span>查看详情</span>" +
                "</a>"
              : "") +
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

    // 重渲染后恢复已收藏状态：状态存在 favorites 里，DOM 是新的，得重新对齐
    // （只恢复外观，不弹 toast、不弹跳——那是点击瞬间的反馈）
    if (favorites.has(cardKey)) {
      favBtn.setAttribute("aria-pressed", "true");
      favBtn.querySelector("span").textContent = "已收藏";
    }

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

  /* ---------- 搜索筛选（Day 12）：关键词 + 类别 → 只显示匹配内容 ---------- */

  // 首页两个主题区块的筛选：输入框 + 类别下拉（下拉选项从数据动态生成）
  function setupZoneFilter(zoneKey) {
    var bar = document.querySelector('.filter-bar[data-zone="' + zoneKey + '"]');
    var grid = document.getElementById(zoneKey + "-grid");
    if (!bar || !grid) return;
    var input = bar.querySelector(".filter-input");
    var select = bar.querySelector(".filter-select");

    // 类别下拉动态生成：mock 数据加新类型，选项自动跟上，不用改代码
    var cats = [];
    (window.MOCK_DATA[zoneKey] || []).forEach(function (item) {
      if (cats.indexOf(item.category) < 0) cats.push(item.category);
    });
    cats.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });

    function applyFilter() {
      // 演示态（?state=loading/empty/error）不抢戏：筛选只在正常成功态生效
      if (grid.getAttribute("data-state") !== "success") return;
      var kw = input.value.trim().toLowerCase();
      var cat = select.value;
      var matched = (window.MOCK_DATA[zoneKey] || []).filter(function (item) {
        var hay = (item.title + item.category + item.summary + item.year).toLowerCase();
        var hitCat = !cat || item.category === cat;
        var hitKw = !kw || hay.indexOf(kw) >= 0;
        return hitCat && hitKw;
      });
      if (matched.length) {
        // 筛选后仍然带「查看详情」入口（不传的话卡片会少一个按钮，前后不一致）
        renderCards(grid, matched, zoneKey, zoneKey + "/library.html");
      } else {
        // 无结果：说清发生了什么 + 给下一步（符合 SKILL.md「失败必须给下一步」）
        grid.innerHTML =
          '<div class="state-box">' +
            '<p class="state-title">没有找到相关内容</p>' +
            "<p>换个关键词试试，或清空筛选查看全部。</p>" +
            '<button class="btn-retry filter-clear" type="button">查看全部</button>' +
          "</div>";
        grid.querySelector(".filter-clear").addEventListener("click", function () {
          input.value = "";
          select.value = "";
          applyFilter();
          input.focus();
        });
      }
    }

    input.addEventListener("input", applyFilter);
    select.addEventListener("change", applyFilter);
  }

  // 分区页的筛选：静态功能卡片用显示/隐藏过滤（不重建 DOM，保留灰态等既有样式）
  function setupStaticFilter() {
    var bar = document.querySelector(".filter-bar-static");
    if (!bar) return;
    var input = bar.querySelector(".filter-input");
    var cards = Array.prototype.slice.call(document.querySelectorAll(".feature-grid .feature-card"));
    var emptyBox = document.querySelector(".filter-empty");
    if (!input || !cards.length) return;

    function applyFilter() {
      var kw = input.value.trim().toLowerCase();
      var shown = 0;
      cards.forEach(function (card) {
        var hit = !kw || card.textContent.toLowerCase().indexOf(kw) >= 0;
        card.style.display = hit ? "" : "none";
        if (hit) shown++;
      });
      if (!emptyBox) return;
      if (shown === 0) {
        emptyBox.hidden = false;
        var clearBtn = emptyBox.querySelector(".filter-clear");
        if (clearBtn && !clearBtn.__bound) {   // 只绑一次，防反复显隐重复绑定
          clearBtn.__bound = true;
          clearBtn.addEventListener("click", function () {
            input.value = "";
            applyFilter();
            input.focus();
          });
        }
      } else {
        emptyBox.hidden = true;
      }
    }

    input.addEventListener("input", applyFilter);
  }

  /* ---------- 全屏搜索层（Day 12 追加）：顶栏放大镜 → 全屏搜索 ---------- */

  // 收集当前页面可搜索的内容：首页 = 两区 mock 数据；分区页 = 静态功能卡片
  // （两个数据源天然互斥：首页没有 .feature-card，分区页没有 MOCK_DATA）
  function collectSearchable() {
    var items = [];
    var zoneNames = { shumo: "数学建模", edian: "电子设计" };
    ["shumo", "edian"].forEach(function (zone) {
      (((window.MOCK_DATA || {})[zone]) || []).forEach(function (item, idx) {
        items.push({
          zone: zone,
          index: idx,                                  // 在原数据里的位置：资料库页靠它直接展开详情
          title: item.title,
          meta: item.category + " · " + item.year + " · " + zoneNames[zone],
          hay: (item.title + item.category + item.summary + item.year).toLowerCase()
        });
      });
    });
    document.querySelectorAll(".feature-grid .feature-card h3").forEach(function (h3) {
      items.push({
        zone: "feature",
        title: h3.textContent,
        meta: "本区功能",
        hay: h3.closest(".feature-card").textContent.toLowerCase()
      });
    });
    return items;
  }

  function setupSearchOverlay() {
    var overlay = document.getElementById("search-overlay");
    var toggle = document.querySelector(".search-toggle");
    if (!overlay || !toggle) return;
    var input = overlay.querySelector(".search-overlay-input");
    var resultsBox = overlay.querySelector(".search-results");
    var hint = overlay.querySelector(".search-hint");
    var closeBtn = overlay.querySelector(".search-close");
    var lastFocus = null;

    function renderResults() {
      var kw = input.value.trim().toLowerCase();
      if (!kw) {
        hint.hidden = false;
        hint.textContent = "输入关键词，搜索本站全部可查内容（共 " + collectSearchable().length + " 条）";
        resultsBox.innerHTML = "";
        return;
      }
      var matched = collectSearchable().filter(function (it) {
        return it.hay.indexOf(kw) >= 0;
      });
      hint.hidden = true;
      resultsBox.innerHTML = "";
      if (!matched.length) {
        // 无结果：说清发生了什么 + 给下一步（SKILL.md：失败必须给下一步）
        resultsBox.innerHTML =
          '<div class="state-box search-empty">' +
            '<p class="state-title">没有找到相关内容</p>' +
            "<p>换个关键词试试，或清空后浏览全部内容。</p>" +
          "</div>";
        return;
      }
      matched.forEach(function (it) {
        var btn = document.createElement("button");
        btn.className = "search-result";
        btn.type = "button";
        btn.innerHTML = '<span class="sr-title"></span><span class="sr-meta"></span>';
        btn.querySelector(".sr-title").textContent = it.title;
        btn.querySelector(".sr-meta").textContent = it.meta;
        btn.addEventListener("click", function () { gotoResult(it, kw); });
        resultsBox.appendChild(btn);
      });
    }

    function open() {
      lastFocus = document.activeElement;
      overlay.hidden = false;
      document.body.style.overflow = "hidden";    // 背景页不许滚，防焦点/滚动错乱
      requestAnimationFrame(function () { overlay.classList.add("open"); });
      input.value = "";
      renderResults();
      input.focus();
    }

    function close() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      setTimeout(function () { overlay.hidden = true; }, 250);   // 等淡出动画走完再隐藏
      if (lastFocus && lastFocus.focus) lastFocus.focus();       // 焦点还给触发按钮
    }

    // 点结果：关层 → 把关键词填进对应区块的现成筛选框 → 滚过去。
    // 复用已有筛选逻辑（dispatch input 事件），不另写一套，两处行为永远一致。
    function gotoResult(item, kw) {
      close();
      // 资料库页点中「本页所属区」的资料 → 原地切到详情视图（Day 13：视图切换，不跳页）
      var libApp = document.getElementById("library-app");
      if (libApp && item.zone !== "feature" && item.zone === libApp.getAttribute("data-zone") && item.index >= 0) {
        window.location.hash = "item=" + item.index;
        return;
      }
      var filterInput, scrollTarget;
      if (item.zone === "feature") {
        filterInput = document.querySelector(".filter-bar-static .filter-input");
        scrollTarget = document.getElementById("features");
      } else {
        filterInput = document.querySelector('.filter-bar[data-zone="' + item.zone + '"] .filter-input');
        scrollTarget = document.getElementById("zone-" + item.zone);
      }
      if (filterInput) {
        filterInput.value = kw;
        filterInput.dispatchEvent(new Event("input"));
      }
      if (scrollTarget) {
        var top = scrollTarget.getBoundingClientRect().top + window.scrollY - 70;
        setTimeout(function () {
          window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
        }, 60);
      }
    }

    toggle.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    input.addEventListener("input", renderResults);
  }

  /* ---------- 资料库页（Day 13）：列表视图 ↔ 详情视图 ---------- */

  // 切换方式：顶层页面之间整页跳转（多页），列表与详情之间用地址 # 切换（不刷新、可后退）。
  // # 后面的内容浏览器不会发给服务器，所以改它不会重新加载页面 —— 这就是"页内视图切换"的原理。
  function setupLibrary() {
    var app = document.getElementById("library-app");
    if (!app) return;                                  // 不是资料库页就直接跳过
    var zoneKey = app.getAttribute("data-zone");
    var list = (window.MOCK_DATA || {})[zoneKey] || [];
    var listView = app.querySelector(".lib-list-view");
    var detailView = app.querySelector(".lib-detail-view");
    var grid = document.getElementById("lib-grid");
    var tabs = app.querySelector(".lib-tabs");
    var search = app.querySelector(".lib-search");
    var crumb = app.querySelector(".crumb-current");
    var pageTitle = document.title;                    // 进详情时改标题，回列表时还原
    var filter = { cat: "", kw: "" };
    // 演示参数：和首页同一套机制（?state=loading/empty/error），不发明第二种
    var demo = new URLSearchParams(window.location.search).get("state");

    // 分类标签从数据生成：以后加新类型不用改代码
    var cats = [];
    list.forEach(function (item) {
      if (cats.indexOf(item.category) < 0) cats.push(item.category);
    });
    cats.forEach(function (c) {
      var b = document.createElement("button");
      b.className = "lib-tab";
      b.type = "button";
      b.setAttribute("aria-pressed", "false");        // 当前选中靠 aria 表达，键盘/读屏都认
      b.setAttribute("data-cat", c);
      b.textContent = c;
      tabs.appendChild(b);
    });

    function matched() {
      return list.filter(function (item) {
        var hay = (item.title + item.category + item.summary + item.year).toLowerCase();
        return (!filter.cat || item.category === filter.cat) &&
               (!filter.kw || hay.indexOf(filter.kw) >= 0);
      });
    }

    // —— 正常态：卡片列表 ——
    function renderList() {
      if (demo) return;                                 // 演示态下筛选不抢戏（与首页筛选同规则）
      if (!list.length) { renderLibEmpty(); return; }    // 库里真没数据 → 空态兜底
      var m = matched();
      if (!m.length) { renderNoResult(); return; }       // 筛选没命中 → 无结果提示 + 下一步
      grid.setAttribute("data-state", "success");
      renderCards(grid, m, zoneKey);                     // 复用首页卡片渲染（带收藏/复制）
    }

    // —— 空态：资料库本身还没有内容（不白屏，给下一步）——
    function renderLibEmpty() {
      grid.setAttribute("data-state", "empty");
      grid.innerHTML =
        '<div class="state-box">' +
          '<p class="state-title">这个资料库还没有内容</p>' +
          "<p>资料正在整理，可以先回分区首页看看其他功能。</p>" +
        "</div>";
    }

    // —— 筛选无结果：和首页同一套文案与下一步 ——
    function renderNoResult() {
      grid.setAttribute("data-state", "empty");
      grid.innerHTML =
        '<div class="state-box">' +
          '<p class="state-title">没有找到相关内容</p>' +
          "<p>换个关键词试试，或清空筛选查看全部。</p>" +
          '<button class="btn-retry lib-clear" type="button">查看全部</button>' +
        "</div>";
      grid.querySelector(".lib-clear").addEventListener("click", function () {
        filter.cat = "";
        filter.kw = "";
        search.value = "";
        Array.prototype.forEach.call(tabs.querySelectorAll(".lib-tab"), function (x) {
          x.setAttribute("aria-pressed", x.getAttribute("data-cat") === "" ? "true" : "false");
        });
        renderList();
        search.focus();
      });
    }

    // —— 进列表：先看网址参数要不要演示某种状态，不带参数才是正常列表 ——
    function start() {
      if (demo === "loading") { renderSkeleton(grid, 6); return; }
      if (demo === "empty")   { renderLibEmpty(); return; }
      if (demo === "error")   {
        // 重试 = 回到正常列表（顺手关掉演示参数，否则点完还是错误态）
        renderError(grid, zoneKey, function () { demo = ""; renderList(); });
        return;
      }
      renderList();
    }

    function showDetail(idx) {
      var item = list[idx];
      if (!item) { window.location.hash = ""; return; }  // 编号无效 → 退回列表，不白屏
      detailView.querySelector(".lib-tag").textContent = item.category;
      detailView.querySelector(".lib-year").textContent = item.year;
      detailView.querySelector(".lib-detail-title").textContent = item.title;
      detailView.querySelector(".lib-detail-summary").textContent = item.summary;
      listView.hidden = true;
      detailView.hidden = false;
      if (crumb) crumb.textContent = item.title;        // 面包屑末项 = 当前所在位置
      document.title = item.title + " · " + pageTitle;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }

    function showList() {
      listView.hidden = false;
      detailView.hidden = true;
      if (crumb) crumb.textContent = "资料库";
      document.title = pageTitle;
    }

    // 地址是唯一的事实来源：刷新、前进/后退键、直接粘贴带 # 的链接，都走这一个判断
    function sync() {
      var m = /^#item=(\d+)$/.exec(window.location.hash);
      if (m) showDetail(parseInt(m[1], 10));
      else showList();
    }

    tabs.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".lib-tab") : null;
      if (!btn) return;
      filter.cat = btn.getAttribute("data-cat");
      Array.prototype.forEach.call(tabs.querySelectorAll(".lib-tab"), function (x) {
        x.setAttribute("aria-pressed", x === btn ? "true" : "false");
      });
      renderList();
    });

    search.addEventListener("input", function () {
      filter.kw = search.value.trim().toLowerCase();
      renderList();
    });

    window.addEventListener("hashchange", sync);
    start();         // 四种状态：看 ?state= 演示参数决定，不带参数 = 正常列表
    sync();          // 带 #item=编号 直接打开也能进详情（链接可分享）
  }

  /* ---------- 会员中心：登录 / 注册表单校验（Day 13 板块④） ---------- */

  // 前端能拦住的错就当场说清（提示里直接写改法），拦不住的（账号是否存在）交给后端
  var AUTH_PATTERN = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    username: /^[A-Za-z0-9_]{3,16}$/,
    password: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
  };
  var AUTH_REQUIRED_MSG = {
    email: "请填写邮箱",
    username: "请填写用户名",
    password: "请填写密码",
    confirm: "请再输一次密码",
    school: "请填写所在院校",
    identity: "请选择你的身份",
    captcha: "请填写右侧的 4 个字符"
  };

  function setupAuthForm() {
    var form = document.querySelector(".auth-form");
    if (!form) return;                                 // 不是登录/注册页就跳过
    var kind = form.getAttribute("data-auth");         // login | register
    var result = form.querySelector(".auth-result");

    // 验证码：本地随机生成 4 位，点一下换一张。
    // 这是前端演示版（后端还没有账号系统），接后端后换成服务端图片验证码。
    var captchaBox = form.querySelector(".captcha-box");
    var captchaText = form.querySelector(".captcha-text");
    var captchaInput = form.querySelector('[data-rule="captcha"]');
    var captchaCode = "";

    function newCaptcha() {
      var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";  // 去掉容易看混的 I、O、0、1
      captchaCode = "";
      for (var i = 0; i < 4; i++) {
        captchaCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      if (captchaText) captchaText.textContent = captchaCode;
      if (captchaInput) captchaInput.value = "";
    }
    if (captchaBox) {
      newCaptcha();
      captchaBox.addEventListener("click", newCaptcha);
    }

    // 报错/消错都只动这一个字段：出错框红描边 + 下方红字说清怎么改
    function showFieldError(control, msg) {
      var field = control.closest ? control.closest(".field") : null;
      var box = field ? field.querySelector(".field-error") : null;
      if (field) field.classList.toggle("has-error", !!msg);
      if (msg) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
      if (box) {
        box.textContent = msg || "";
        box.hidden = !msg;
      }
    }

    function checkField(control) {
      var rule = control.getAttribute("data-rule");
      var value = (control.value || "").trim();
      var msg = "";

      if (rule === "agree") {
        if (!control.checked) msg = "需要先同意用户协议与隐私政策才能注册";
      } else if (!value) {
        msg = AUTH_REQUIRED_MSG[rule] || "这一项不能为空";
      } else if (rule === "email" && !AUTH_PATTERN.email.test(value)) {
        msg = "邮箱格式不对，应该像 name@example.com 这样";
      } else if (rule === "username" && !AUTH_PATTERN.username.test(value)) {
        msg = "用户名请用 3-16 位字母、数字或下划线";
      } else if (rule === "password" && kind === "register" && !AUTH_PATTERN.password.test(value)) {
        msg = "密码至少 8 位，且同时包含字母和数字";
      } else if (rule === "confirm") {
        var pw = form.querySelector('[data-rule="password"]');
        if (pw && pw.value !== control.value) msg = "两次输入的密码不一样";
      } else if (rule === "captcha" && captchaCode && value.toUpperCase() !== captchaCode) {
        msg = "验证码不对，点一下验证码换一张再试";
      }

      showFieldError(control, msg);
      return !msg;
    }

    var controls = Array.prototype.slice.call(form.querySelectorAll("[data-rule]"));

    controls.forEach(function (control) {
      // 离开这一项时校验（不打断正在输入的人）；勾选框用 change
      control.addEventListener("blur", function () { checkField(control); });
      control.addEventListener("change", function () { checkField(control); });
      // 已经报错的项：边改边消错，改对了立刻恢复
      control.addEventListener("input", function () {
        if (control.getAttribute("aria-invalid") === "true") checkField(control);
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var firstBad = null;
      controls.forEach(function (control) {
        if (!checkField(control) && !firstBad) firstBad = control;
      });
      if (firstBad) {
        if (result) result.hidden = true;
        firstBad.focus();                                // 焦点跳到第一个错处
        return;
      }
      if (result) {
        // 如实说明：校验过了，但账号系统还没接后端 —— 不假装已经登录/注册成功
        result.textContent = kind === "register"
          ? "信息检查通过。账号系统还在建设中，接入后才能真的创建账号 —— 现在可以先浏览资料库。"
          : "信息检查通过。账号系统还在建设中，接入后才能真的登录 —— 现在可以先浏览资料库。";
        result.hidden = false;
      }
      if (captchaBox) newCaptcha();                      // 验证码一次性：提交后换一张
    });
  }

  // 注册页的「参赛方向」多选标签：点一下切换选中（选中态用 aria-pressed，键盘也能用）
  function setupChoiceGroup() {
    var group = document.querySelector(".choice-group");
    if (!group) return;
    group.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest(".lib-tab") : null;
      if (!chip) return;
      chip.setAttribute("aria-pressed",
        chip.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  }

  // 还没有页面的入口（如「忘记密码」）：不做假链接，点了用提示条说清现状与下一步
  function setupSoonButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-soon]"), function (btn) {
      btn.addEventListener("click", function () { showToast(btn.getAttribute("data-soon")); });
    });
  }

  /* ---------- 启动 ---------- */

  renderZone("shumo");
  renderZone("edian");
  setupTopbar();
  setupHeroBtn();
  setupZoneFilter("shumo");
  setupZoneFilter("edian");
  setupStaticFilter();
  setupSearchOverlay();
  setupLibrary();
  setupAuthForm();
  setupChoiceGroup();
  setupSoonButtons();
})();
