(function () {
  "use strict";

  var SITE = window.SITE || {};
  var FEATURED = window.FEATURED || [];
  var CASES = (window.CASES || []).filter(function (c) { return c.status !== "계약완료"; });
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeInOut(k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }

  /* ---------- my-office.js 5칸을 채웠을 때: 내 정보로 바꾸고 예시 사무소 내용은 일반 문구로 ---------- */
  function regionOf(addr) {
    addr = String(addr || "");
    var gu = (/(\S+?[구군])(?=[\s,]|$)/.exec(addr) || [])[1];
    if (!gu) gu = (/(\S+?시)(?=[\s,])/.exec(addr.replace(/^\S+(특별시|광역시|특별자치시|특별자치도|도)\s/, "")) || [])[1];
    var dong = (/\((\S+?[동읍면리가])(?=[,)\s])/.exec(addr) || [])[1];
    return [gu, dong].filter(Boolean).join(" ");
  }

  function applyMyOffice() {
    var my = window.MY_OFFICE || {};
    var name = String(my.name || "").trim();
    if (!name) return;
    var region = regionOf(my.address);
    SITE.office = name;
    SITE.address = String(my.address || "").trim();
    SITE.phone = String(my.phone || "").trim();
    SITE.regNo = String(my.regNo || "").trim();
    SITE.broker = String(my.broker || "").trim();
    if (SITE.DEMO_CONTENT === false) return;   // config.js 를 직접 고친 경우 그 내용을 그대로 씀

    var place = region || "우리 동네";
    SITE.pageTitle = name;
    SITE.brand = name;
    SITE.brandSub = region || "공인중개사사무소";
    SITE.logoLetter = name.charAt(0);
    SITE.services = "아파트 · 주택 · 상가 · 토지 · 상담";
    SITE.areaServed = SITE.address;
    SITE.description = (region ? region + " " : "") + name + ". 아파트·주택·상가·토지 매매와 임대차, 부동산 상담.";
    SITE.kakaoChannel = SITE.kakaoChannel || "";
    SITE.hero = {
      eyebrow: region ? region + " · " + name : name,
      title: [place + "의 좋은 매물,", "신뢰와 실력으로 *전문중개*합니다."],
      sub: ["아파트 · 주택 · 상가 · 토지 매매와 임대차, 부동산 상담.", "대표 공인중개사가 직접 확인하고 안내합니다."]
    };
    SITE.typesTitle = ["매물 유형별", "거래 사례"];
    SITE.proof = [];
    SITE.ceo = { label: "대표 공인중개사", name: SITE.broker, role: name, initial: SITE.broker.charAt(0) || name.charAt(0), cv: [] };
    SITE.expert = {
      eyebrow: "왜 " + name + "인가",
      title: ["가격만 보는 중개가 아니라,", "조건까지 함께 따지는 중개"],
      lede: "같은 가격이라도 권리관계, 대출 조건, 입주 시기에 따라 결과가 달라집니다. 계약 전에 확인할 것을 하나씩 짚어 드립니다.",
      points: [
        { title: "계약 전 권리관계 확인", text: "등기사항증명서와 건축물대장을 함께 보고 선순위 권리와 위반건축물 여부를 확인합니다." },
        { title: "시세와 조건 비교", text: "인근 실거래가와 매물 조건을 나란히 놓고 적정 가격을 함께 판단합니다." },
        { title: "계약 후까지 안내", text: "잔금, 전입신고, 확정일자처럼 계약 뒤에 챙길 일정까지 알려 드립니다." }
      ],
      quote: ""
    };
    SITE.location = {
      title: [SITE.address.split(",")[0].trim(), (SITE.address.split(",")[1] || "").replace(/\(.*\)/, "").trim()].filter(Boolean),
      steps: [], building: "", bus: "", kakaoPlaceId: "", captions: []
    };
    SITE.map = null;   // 지도 좌표는 config.js 에서 따로 넣을 수 있습니다
    SITE.contact = {
      title: ["매물 의뢰도, 매입 상담도", "대표가 직접 답합니다"],
      lede: "집을 팔거나 구하려는 분, 상가·토지가 궁금한 분 모두 편하게 남겨 주세요.",
      prep: [
        "매도·임대 의뢰: 주소, 희망 가격, 입주 가능일",
        "매수·임차 상담: 예산, 희망 지역, 입주 시기",
        "기타 상담: 궁금한 매물 주소나 계약서"
      ],
      budgets: ["1억 미만", "1억 ~ 5억", "5억 ~ 10억", "10억 이상", "정하지 않음"],
      placeholder: "예: " + (region ? region.split(" ").pop() + " " : "") + "전용 59㎡ 아파트 전세, 3월 입주"
    };
    // 아직 예시 매물이면 예시 사무소의 지역 이름을 빼고 내 지역으로
    if (SITE.SAMPLE_MODE) {
      FEATURED.concat(CASES).forEach(function (f) {
        if (f.generic) f.title = f.generic;
        f.area = region || "";
        f.station = "";
        if (f.legal && f.legal["소재지"]) f.legal["소재지"] = (region || "소재지") + " (예시)";
      });
    }
  }

  /* ---------- config.js 내용을 화면에 채우기 ---------- */
  function get(path) {
    return path.split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, SITE);
  }
  function rich(s) { return esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>"); }
  function asList(v) { return v == null || v === "" ? [] : Array.isArray(v) ? v : [v]; }
  function telHref(p) { return "tel:" + String(p || "").replace(/[^0-9+]/g, ""); }

  function bindSite() {
    $all("[data-bind]").forEach(function (el) {
      var v = get(el.getAttribute("data-bind"));
      if (v != null) el.textContent = Array.isArray(v) ? v.join(" ") : v;
    });
    $all("[data-title]").forEach(function (el) {
      var v = asList(get(el.getAttribute("data-title")));
      el.innerHTML = el.getAttribute("data-mode") === "spans"
        ? v.map(function (l) { return "<span>" + rich(l) + "</span>"; }).join("")
        : v.map(rich).join("<br>");
    });
    $all("[data-lines]").forEach(function (el) {
      el.innerHTML = asList(get(el.getAttribute("data-lines"))).map(esc).join("<br>");
    });
    $all("[data-list]").forEach(function (el) {
      var items = asList(get(el.getAttribute("data-list")));
      el.innerHTML = items.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("");
      el.hidden = !items.length;
    });
    $all("[data-if]").forEach(function (el) { el.hidden = !get(el.getAttribute("data-if")); });
    $all("[data-tel]").forEach(function (el) { el.setAttribute("href", telHref(SITE.phone)); });
    $all("[data-aria-brand]").forEach(function (el) { el.setAttribute("aria-label", (SITE.brand || "") + " 처음으로"); });
    $all("[data-alt-ceo]").forEach(function (el) { el.alt = ((SITE.ceo && SITE.ceo.name) || "") + " 대표 사진"; });

    if (SITE.pageTitle || SITE.brand) document.title = SITE.pageTitle || (SITE.brand + " 부동산");
    var md = document.querySelector('meta[name="description"]');
    if (md && SITE.description) md.setAttribute("content", SITE.description + " " + (SITE.office || "") + " " + (SITE.phone || ""));

    // 검색엔진용 사무소 정보
    var o = SITE.map && SITE.map.office;
    var ld = {
      "@context": "https://schema.org", "@type": "RealEstateAgent",
      name: SITE.office, alternateName: SITE.brand, telephone: SITE.phone,
      address: { "@type": "PostalAddress", streetAddress: SITE.address, addressCountry: "KR" },
      areaServed: SITE.areaServed, founder: SITE.broker
    };
    if (o && o.at) ld.geo = { "@type": "GeoCoordinates", latitude: o.at[0], longitude: o.at[1] };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(ld);
    document.head.appendChild(s);
  }

  function renderSections() {
    var proof = $("#proof-row");
    if (proof) proof.closest(".proof").hidden = !asList(SITE.proof).length;
    if (proof) proof.innerHTML = asList(SITE.proof).map(function (p) {
      var isNum = /^[0-9.,]+$/.test(p.big);
      return '<div class="proof-item"><b class="num' + (isNum ? "" : " kr") + '">' + esc(p.big) + (p.unit ? "<small>" + esc(p.unit) + "</small>" : "") + "</b><span>" + esc(p.text) + "</span></div>";
    }).join("");

    var pillars = $("#pillars");
    if (pillars) pillars.innerHTML = asList(SITE.expert && SITE.expert.points).map(function (p) {
      return "<li><h3>" + esc(p.title) + "</h3><p>" + esc(p.text) + "</p></li>";
    }).join("");
    var quote = $(".quote");
    if (quote && !(SITE.expert && SITE.expert.quote)) quote.hidden = true;

    var steps = $("#process-steps");
    if (steps) steps.innerHTML = asList(SITE.process).map(function (p) {
      return "<li><b>" + esc(p.title) + "</b><span>" + esc(p.text) + "</span></li>";
    }).join("");

    var M = SITE.map || {}, L = SITE.location || {};
    var target = asList(M.exits).filter(function (x) { return x.target; })[0] || {};
    var badges = [
      '<span class="line-dots" aria-hidden="true">' + asList(M.lines).map(function (l) { return '<i style="border-color:' + esc(l.color) + '"></i>'; }).join("") + "</span>",
      '<span class="exit-badge" aria-hidden="true">' + esc(target.no || "") + "</span>",
      '<span class="floor-badge" aria-hidden="true">' + esc((M.office && M.office.floorShort) || "") + "</span>"
    ];
    var rs = $("#route-steps");
    if (rs) rs.hidden = !asList(L.steps).length;
    if (rs) rs.innerHTML = asList(L.steps).slice(0, 3).map(function (st, i) {
      return '<li data-step="' + (i + 1) + '">' + badges[i] + "<div><b>" + esc(st.title) + "</b><span>" + esc(st.text) + "</span></div></li>";
    }).join("");

    var at = M.office && M.office.at;
    var q = encodeURIComponent(String(SITE.address || "").replace(/,.*$/, ""));
    var name = encodeURIComponent((M.office && M.office.name) || SITE.office || "");
    var links = [["네이버 지도", "https://map.naver.com/p/search/" + q]];
    if (L.kakaoPlaceId) links.push(["카카오맵 길찾기", "https://map.kakao.com/link/to/" + encodeURIComponent(L.kakaoPlaceId)]);
    else if (at) links.push(["카카오맵 길찾기", "https://map.kakao.com/link/to/" + name + "," + at[0] + "," + at[1]]);
    else links.push(["카카오맵", "https://map.kakao.com/?q=" + q]);
    links.push(["구글 지도", at ? "https://www.google.com/maps/dir/?api=1&destination=" + at[0] + "," + at[1] + "&travelmode=transit" : "https://www.google.com/maps/search/?api=1&query=" + q]);
    var ml = $("#map-links");
    if (ml) ml.innerHTML = links.map(function (l) { return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + "</a>"; }).join("");
    var rm = $("#real-map");
    if (rm) rm.setAttribute("data-src", at ? "https://maps.google.com/maps?q=" + at[0] + "," + at[1] + "&z=18&hl=ko&output=embed" : "https://maps.google.com/maps?q=" + q + "&z=17&hl=ko&output=embed");

    var C = SITE.contact || {};
    var sel = $("#f-budget");
    if (sel) sel.innerHTML = asList(C.budgets).map(function (b, i) { return "<option" + (i === 1 ? " selected" : "") + ">" + esc(b) + "</option>"; }).join("");
    var msg = $("#f-msg");
    if (msg && C.placeholder) msg.placeholder = C.placeholder;

    var note = $("#featured-note");
    if (note) note.textContent = SITE.SAMPLE_MODE ? "지금 보이는 매물과 사진은 예시입니다. 실제 매물로 바꿔 올릴 예정입니다." : (SITE.featuredNote || "");

    var types = $("#types-title");
    if (types && SITE.typesTitle) types.innerHTML = asList(SITE.typesTitle).map(rich).join("<br>");

    if (SITE.kakaoChannel) {
      var dock = $("#dock");
      var k = document.createElement("a");
      k.href = SITE.kakaoChannel; k.target = "_blank"; k.rel = "noopener"; k.textContent = "카톡 상담";
      dock.insertBefore(k, dock.children[1]);
      dock.classList.add("has-4");
    }
  }

  /* ---------- 대표 매물 ---------- */
  function renderFeatured() {
    var grid = $("#featured-grid");
    if (!grid) return;
    grid.innerHTML = FEATURED.map(function (f) {
      var chips = '<span class="chip is-key">대표</span>' + (SITE.SAMPLE_MODE ? '<span class="chip is-sample">예시</span>' : "");
      var specs = (f.specs || []).slice(0, 3).map(function (s) {
        return "<div><dt>" + esc(s[0]) + "</dt><dd>" + esc(s[1]) + "</dd></div>";
      }).join("");
      return '<article class="f-card">' +
        '<div class="f-photo"><img src="' + esc(f.image) + '" alt="' + esc(f.title) + ' 외관" loading="eager"><div class="chips">' + chips + "</div></div>" +
        '<div class="f-info">' +
          '<p class="f-kind">' + esc(f.type) + " · " + esc(f.deal) + "</p>" +
          '<h3 class="f-title">' + esc(f.title) + "</h3>" +
          '<p class="f-area">' + esc(f.area) + (f.station ? " · " + esc(f.station) : "") + "</p>" +
          '<p class="f-price"><b>' + esc(f.price) + "</b><small>" + esc(f.pricePerPy || "") + "</small></p>" +
          '<dl class="spec-grid">' + specs + "</dl>" +
          '<div class="f-foot"><button type="button" class="link-btn" data-detail="' + esc(f.id) + '">상세 · 법정 표시사항</button>' +
          (f.checked ? '<span class="checked">확인 ' + esc(f.checked) + "</span>" : "") + "</div>" +
        "</div></article>";
    }).join("");
  }

  /* ---------- 매물 상세 (법정 명시사항) ---------- */
  function setupDetail() {
    var dlg = $("#detail");
    if (!dlg) return;
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-detail]");
      if (!btn) return;
      var f = FEATURED.filter(function (x) { return x.id === btn.getAttribute("data-detail"); })[0];
      if (!f) return;
      var rows = Object.keys(f.legal || {}).map(function (k) {
        return "<tr><th scope=\"row\">" + esc(k) + "</th><td>" + esc(f.legal[k]) + "</td></tr>";
      }).join("");
      $("#detail-body").innerHTML =
        '<p class="eyebrow">' + esc(f.type) + " · " + esc(f.deal) + (SITE.SAMPLE_MODE ? " · 예시" : "") + "</p>" +
        '<h3 id="detail-title">' + esc(f.title) + "</h3>" +
        '<p class="d-price">' + esc(f.price) + "</p>" +
        '<table class="legal-table"><caption class="sr">중개대상물 표시·광고 명시사항</caption><tbody>' + rows + "</tbody></table>" +
        '<p class="d-note">중개대상물 표시·광고 명시사항(공인중개사법 시행령 제17조의2)입니다. 상세 지번과 임대차 현황은 상담 시 안내해 드립니다.<br>' +
        esc(SITE.office) + " · 등록번호 " + esc(SITE.regNo) + " · 개업공인중개사 " + esc(SITE.broker) + " · " + esc(SITE.phone) + "</p>";
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- 유형별 사례: 마우스 방향으로 움직이는 롤링 ---------- */
  function cardHTML(c, clone) {
    return '<article class="c-card"' + (clone ? ' aria-hidden="true"' : "") + ">" +
      '<img src="' + esc(c.image) + '" alt="' + (clone ? "" : esc(c.type + " 사례: " + c.title)) + '" loading="lazy" draggable="false">' +
      '<div class="c-top"><span class="c-type">' + esc(c.type) + '</span><span class="c-status">' + esc(c.deal) + (c.status && c.status !== "매물" ? " · " + esc(c.status) : "") + "</span></div>" +
      '<div class="c-body"><span class="c-area">' + esc(c.area) + '</span><h3 class="c-title">' + esc(c.title) + "</h3>" +
      '<span class="c-price">' + esc(c.price) + "</span>" +
      '<div class="c-more"><ul class="c-specs">' + (c.specs || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div></div>" +
      (SITE.SAMPLE_MODE ? '<span class="c-sample">예시</span>' : "") +
      "</article>";
  }

  function setupRoller() {
    var roller = $("#roller"), track = $("#roller-track");
    if (!roller || !track || !CASES.length) return;
    // 원본 1벌 + 이어 붙일 복제 2벌 (끊김 없는 순환)
    track.innerHTML = CASES.map(function (c) { return cardHTML(c, false); }).join("") +
      CASES.map(function (c) { return cardHTML(c, true); }).join("") +
      CASES.map(function (c) { return cardHTML(c, true); }).join("");

    var hint = $("#roller-hint");
    if (hint && !canHover) hint.textContent = "옆으로 밀어서 넘겨 보세요";
    if (hint && reduceMotion) hint.textContent = "좌우 버튼이나 스크롤로 넘겨 보세요";

    var BASE = reduceMotion ? 0 : -26;   // 평소 흐르는 속도(px/s)
    var MAX = 560;                        // 가장자리에서의 최고 속도
    var x = 0, speed = BASE, target = BASE;
    var setW = 0, step = 0, last = 0, visible = true;
    var hovering = false, focused = false, px = 0, py = 0;
    var drag = null, tween = null;
    var cards = $all(".c-card", track);

    function measure() {
      var first = cards[0], nth = cards[CASES.length];
      if (!first || !nth) return;
      setW = nth.offsetLeft - first.offsetLeft;
      step = (cards[1] ? cards[1].offsetLeft - first.offsetLeft : first.offsetWidth + 20);
    }
    function wrap() {
      if (!setW) return;
      while (x <= -setW) x += setW;
      while (x > 0) x -= setW;
    }
    function render() { track.style.transform = "translate3d(" + x.toFixed(2) + "px,0,0)"; }

    function markHot() {
      var hot = null;
      if (hovering && !drag) {
        var el = document.elementFromPoint(px, py);
        hot = el && el.closest ? el.closest(".c-card") : null;
      }
      cards.forEach(function (c) { c.classList.toggle("is-hot", c === hot); });
    }

    function frame(now) {
      var dt = Math.min(.05, (now - (last || now)) / 1000);
      last = now;
      if (visible && !document.hidden) {
        if (tween) {
          var k = clamp((now - tween.t0) / tween.dur, 0, 1);
          x = lerp(tween.from, tween.to, easeOut(k));
          if (k >= 1) { tween = null; speed = 0; }
        } else if (!drag) {
          if (hovering && !reduceMotion) {
            var r = roller.getBoundingClientRect();
            var rel = clamp((px - r.left - r.width / 2) / (r.width / 2), -1, 1);
            var dz = .22;
            target = Math.abs(rel) < dz ? 0 : -Math.sign(rel) * MAX * Math.pow((Math.abs(rel) - dz) / (1 - dz), 1.6);
          } else {
            target = focused ? 0 : BASE;
          }
          speed += (target - speed) * Math.min(1, dt * 3.2);
          x += speed * dt;
        }
        wrap();
        render();
        markHot();
      }
      requestAnimationFrame(frame);
    }

    function nudge(dir) {
      measure();
      tween = { from: x, to: x - dir * step, t0: performance.now(), dur: reduceMotion ? 1 : 520 };
      speed = 0;
    }

    roller.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hovering = true; });
    roller.addEventListener("pointerleave", function () { hovering = false; });
    roller.addEventListener("pointermove", function (e) {
      px = e.clientX; py = e.clientY;
      if (drag) {
        var dx = e.clientX - drag.x;
        drag.v = dx / Math.max(1, (e.timeStamp - drag.t)) * 1000;
        drag.x = e.clientX; drag.t = e.timeStamp;
        x += dx; drag.moved += Math.abs(dx);
      }
    });
    roller.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      tween = null;
      drag = { x: e.clientX, t: e.timeStamp, v: 0, moved: 0 };
      roller.classList.add("is-dragging");
      if (roller.setPointerCapture) roller.setPointerCapture(e.pointerId);
    });
    function endDrag() {
      if (!drag) return;
      speed = clamp(drag.v, -1400, 1400);
      drag = null;
      roller.classList.remove("is-dragging");
    }
    roller.addEventListener("pointerup", endDrag);
    roller.addEventListener("pointercancel", endDrag);
    roller.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { nudge(1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { nudge(-1); e.preventDefault(); }
    });
    // 키보드로 들어오면 자동 흐름을 멈춰 읽을 수 있게
    roller.addEventListener("focus", function () { focused = true; });
    roller.addEventListener("blur", function () { focused = false; });
    $("#roller-next").addEventListener("click", function () { nudge(1); });
    $("#roller-prev").addEventListener("click", function () { nudge(-1); });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { rootMargin: "120px" }).observe(roller);
    }
    window.addEventListener("resize", measure);
    $all("img", track).forEach(function (img) { img.addEventListener("load", measure); });
    measure();
    requestAnimationFrame(frame);
  }

  /* ---------- 오시는 길: 탭 ---------- */
  function setupTabs() {
    var tabs = $all('.loc-tabs [role="tab"]');
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.setAttribute("aria-selected", on ? "true" : "false");
          $("#" + t.getAttribute("aria-controls")).hidden = !on;
        });
        if (tab.id === "tab-map") loadRealMap();
      });
    });
  }
  function loadRealMap() {
    var box = $("#real-map");
    if (!box || box.dataset.loaded || document.documentElement.getAttribute("data-embed-map") === "off") return;
    box.dataset.loaded = "1";
    var f = document.createElement("iframe");
    f.src = box.getAttribute("data-src");
    f.title = "미스터홈즈 위치 지도 (봉은사로 404)";
    f.loading = "lazy";
    f.referrerPolicy = "no-referrer-when-downgrade";
    box.appendChild(f);
  }

  /* ---------- 오시는 길: config.js 좌표로 지도 그리기 ---------- */
  function textW(str, size) {
    var w = 0;
    String(str || "").split("").forEach(function (ch) { w += ch.charCodeAt(0) < 128 ? .6 : 1; });
    return w * size;
  }
  function norm(v) { var l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
  function readable(a) { while (a > 90) a -= 180; while (a <= -90) a += 180; return a; }

  function buildMap(M) {
    if (!M || !M.center || !M.office || !M.office.at) return null;
    var lat0 = M.center[0], lng0 = M.center[1];
    var MG = 111320 * Math.cos(lat0 * Math.PI / 180);
    function EN(ll) { return [(ll[1] - lng0) * MG, (ll[0] - lat0) * 111320]; }
    var off = EN(M.office.at);
    // 역과 사무소가 모두 들어오도록 가로 폭과 중심을 자동으로 맞춤
    var span = Math.max(M.span || 320, Math.hypot(off[0], off[1]) * 2.4 + 120), S = 960 / span;
    var OX = 480 - S * off[0] * .5, OY = 330 + S * off[1] * .5;
    function inFrame(x, y, w, h) { return [clamp(x, 16, 944 - w), clamp(y, 20, 540 - h)]; }
    function P(e, n) { return [OX + S * e, OY - S * n]; }
    function f(x) { return (Math.round(x * 10) / 10).toString(); }
    function pt(p) { var q = P(p[0], p[1]); return f(q[0]) + "," + f(q[1]); }
    function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
    function angOf(d) { return Math.atan2(-d[1], d[0]) * 180 / Math.PI; }
    function square(c, size, d) {
      var nrm = [d[1], -d[0]], h = size / 2;
      return [add(add(c, d, -h), nrm, -h), add(add(c, d, h), nrm, -h), add(add(c, d, h), nrm, h), add(add(c, d, -h), nrm, h)];
    }

    var roads = asList(M.roads).slice(0, 2).map(function (r) {
      var d = norm(EN(r.toward)), w = r.width || 30;
      return { name: r.name, d: d, n: [d[1], -d[0]], w: w, hw: (w - 8) / 2, ang: readable(angOf(d)) };
    });
    var d0 = roads[0] ? roads[0].d : [1, 0];
    var L = span * 1.4;
    var exits = asList(M.exits).map(function (x) { return { no: x.no, p: EN(x.at), target: !!x.target }; });
    var target = exits.filter(function (x) { return x.target; })[0] || exits[0] || { no: "", p: off };
    var walk = asList(M.walk).length > 1 ? M.walk.map(EN) : [target.p, off];
    var oSize = M.office.size || 16;
    var o = [];

    o.push('<svg class="route-map" id="route-map" viewBox="0 0 960 660" preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="map-t map-d">');
    o.push('<title id="map-t">' + esc((M.station || "역") + "에서 " + (SITE.brand || "사무소") + "까지 오는 길") + "</title>");
    o.push('<desc id="map-d">' + esc(asList(SITE.location && SITE.location.steps).map(function (s) { return s.title; }).join(" → ")) + "</desc>");
    o.push('<defs><pattern id="lots" width="34" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(' + f(angOf(d0)) + ')"><rect class="lot" x="2" y="2" width="30" height="22" rx="1.5"/></pattern>' +
      '<radialGradient id="glow"><stop offset="0" stop-color="#e36a5f" stop-opacity=".55"/><stop offset="1" stop-color="#e36a5f" stop-opacity="0"/></radialGradient></defs>');
    o.push('<rect class="ground" x="-600" y="-600" width="2160" height="1860"/><rect fill="url(#lots)" x="-600" y="-600" width="2160" height="1860"/>');

    // 큰길: 보도 → 차도
    ["walkway", "road"].forEach(function (cls) {
      roads.forEach(function (r) {
        var a = P.apply(null, add([0, 0], r.d, -L)), b = P.apply(null, add([0, 0], r.d, L));
        o.push('<line class="' + cls + '" x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" stroke-width="' + f((cls === "road" ? r.w - 8 : r.w) * S) + '"/>');
      });
    });
    // 횡단보도
    if (roads.length === 2) {
      roads.forEach(function (r, i) {
        var other = roads[1 - i];
        var sin = Math.abs(r.d[0] * other.d[1] - r.d[1] * other.d[0]) || 1;
        [-1, 1].forEach(function (sg) {
          var c = add([0, 0], r.d, sg * (other.hw + 7) / sin);
          var a = P.apply(null, add(c, r.n, -(r.hw + .5))), b = P.apply(null, add(c, r.n, r.hw + .5));
          o.push('<line class="zebra" x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" stroke-width="' + f(4 * S) + '" stroke-dasharray="' + f(S) + " " + f(S * 1.15) + '"/>');
        });
      });
    }
    // 지하 대합실 (출구를 잇는 점선)
    if (exits.length > 2) {
      var cx = 0, cy = 0;
      exits.forEach(function (x) { cx += x.p[0] / exits.length; cy += x.p[1] / exits.length; });
      var hull = exits.slice().sort(function (a, b) { return Math.atan2(a.p[1] - cy, a.p[0] - cx) - Math.atan2(b.p[1] - cy, b.p[0] - cx); });
      o.push('<polygon class="concourse" points="' + hull.map(function (x) { return pt(x.p); }).join(" ") + '"/>');
    }
    // 지하철 노선 · 승강장 · 열차
    var trains = [];
    asList(M.lines).forEach(function (ln, i) {
      var r = roads[ln.road || 0] || roads[0];
      if (!r) return;
      var a = P.apply(null, add([0, 0], r.d, -L)), b = P.apply(null, add([0, 0], r.d, L));
      o.push('<line class="subway" id="line-' + i + '" style="stroke:' + esc(ln.color) + '" x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" pathLength="1"/>');
      var t0 = ln.at ? EN(ln.at)[0] * r.d[0] + EN(ln.at)[1] * r.d[1] : 0;
      var c0 = add([0, 0], r.d, t0);
      var plat = [add(add(c0, r.d, -55), r.n, -5), add(add(c0, r.d, 55), r.n, -5), add(add(c0, r.d, 55), r.n, 5), add(add(c0, r.d, -55), r.n, 5)];
      o.push('<polygon class="platform" style="stroke:' + esc(ln.color) + '" points="' + plat.map(pt).join(" ") + '"/>');
      o.push('<g class="train" id="train-' + i + '" opacity="0"><g transform="rotate(' + f(angOf(r.d)) + ')"><rect style="fill:' + esc(ln.color) + '" x="-27" y="-6" width="54" height="12" rx="5"/><rect class="win" x="-21" y="-2" width="42" height="4" rx="2"/></g></g>');
      trains.push({ id: "train-" + i, d: r.d, from: t0 + (i % 2 ? 250 : -260), to: t0 + (i % 2 ? 4 : -4) });
    });
    // 주변 건물
    asList(M.landmarks).forEach(function (lm) {
      if (lm.size > 0) o.push('<polygon class="bldg" points="' + square(EN(lm.at), lm.size, d0).map(pt).join(" ") + '"/>');
    });
    var oPoly = square(off, oSize, d0).map(pt).join(" ");
    o.push('<polygon class="office-glow" points="' + oPoly + '"/><polygon class="office" id="office" points="' + oPoly + '"/>');
    // 걷는 길
    var dWalk = "M" + walk.map(pt).join(" L");
    o.push('<path class="walk-ghost" d="' + dWalk + '"/><path class="walk" id="walk" d="' + dWalk + '" pathLength="1"/>');
    // 출구
    exits.forEach(function (x) {
      var q = P(x.p[0], x.p[1]);
      o.push('<g class="exit' + (x.target ? ' is-target" id="exit-target' : "") + '" transform="translate(' + f(q[0]) + " " + f(q[1]) + ')">' + (x.target ? '<circle class="pulse" id="pulse-exit" r="9"/>' : "") + '<circle class="dot" r="9"/><text>' + esc(x.no) + "</text></g>");
    });
    if (M.bus && M.bus.at) {
      var bq = P.apply(null, EN(M.bus.at));
      o.push('<g class="bus" transform="translate(' + f(bq[0]) + " " + f(bq[1]) + ')"><rect x="-9" y="-9" width="18" height="18" rx="4"/><text>B</text></g>');
    }
    var oq = P(off[0], off[1]);
    o.push('<g class="pin" id="pin" transform="translate(' + f(oq[0]) + " " + f(oq[1]) + ')"><circle class="pulse" id="pulse-office" r="12"/><path d="M0 0c-7-9-11-14-11-19a11 11 0 0 1 22 0c0 5-4 10-11 19z"/><circle cx="0" cy="-19" r="4"/></g>');
    var wq = P.apply(null, walk[0]);
    o.push('<g class="walker" id="walker" transform="translate(' + f(wq[0]) + " " + f(wq[1]) + ')" opacity="0"><circle class="halo" r="10"/><circle r="4.5"/></g>');
    // 층 표시는 걸어오는 방향의 반대편에
    var prev = walk.length > 1 ? walk[walk.length - 2] : target.p;
    if (Math.hypot(prev[0] - walk[walk.length - 1][0], prev[1] - walk[walk.length - 1][1]) < 1) prev = target.p;
    var away = norm([off[0] - prev[0], off[1] - prev[1]]);
    var tq = P.apply(null, add(off, away, oSize / 2 + 9)), floor = M.office.floor || "", tw = Math.max(64, textW(floor, 10) + 18);
    o.push('<g class="floor-tag" id="floor-tag" transform="translate(' + f(tq[0]) + " " + f(tq[1]) + ')" opacity="0"><rect x="' + f(-tw / 2) + '" y="-9" width="' + f(tw) + '" height="18" rx="3"/><text x="0" y="1">' + esc(floor) + "</text></g>");

    // 넓게 볼 때 글자
    o.push('<g id="lbl-wide">');
    roads.forEach(function (r) {
      [-1, 1].forEach(function (sg) {
        var q = P.apply(null, add(add([0, 0], r.d, sg * span * .27), r.n, -1.5));
        o.push('<text class="road-name" transform="translate(' + f(q[0]) + " " + f(q[1]) + ") rotate(" + f(r.ang) + ')" dy="4">' + esc(String(r.name || "").split("").join(" ")) + "</text>");
      });
    });
    var sgE = off[0] >= 0 ? 1 : -1, sgN = off[1] <= 0 ? 1 : -1;
    var badgeX = 14, badges = "";
    asList(M.lines).forEach(function (ln) {
      if (ln.short && String(ln.short).length <= 2) {
        badges += '<circle cx="' + (badgeX + 9) + '" cy="0" r="9" style="fill:' + esc(ln.color) + '"/><text class="b9t" x="' + (badgeX + 9) + '" y="0">' + esc(ln.short) + "</text>";
        badgeX += 22;
      } else {
        badges += '<rect x="' + badgeX + '" y="-9" width="22" height="18" rx="9" style="fill:' + esc(ln.color) + '"/>';
        badgeX += 26;
      }
    });
    var stW = badgeX + 8 + textW(M.station, 16) + 14;
    // 역 이름표는 사거리에서 사무소 반대쪽으로
    var c0q = P(0, 0), od = norm([off[0] || 1, -(off[1] || 0)]);
    var stP = inFrame(c0q[0] - od[0] * 190 - stW / 2, c0q[1] - od[1] * 190 - 22, stW, 44);
    stP[1] += 22;
    o.push('<g class="station-tag" transform="translate(' + f(stP[0]) + " " + f(stP[1]) + ')"><rect x="0" y="-22" width="' + f(stW) + '" height="44" rx="6"/>' + badges + '<text class="station-name" x="' + (badgeX + 8) + '" y="1">' + esc(M.station || "") + "</text></g>");
    asList(M.landmarks).forEach(function (lm) {
      var q = P.apply(null, EN(lm.at));
      o.push('<text class="lbl sm" x="' + f(q[0]) + '" y="' + f(q[1] + 4) + '">' + esc(lm.name) + "</text>");
    });
    if (M.bus && M.bus.at) o.push('<text class="lbl sm left" x="' + f(bq[0] - 14) + '" y="' + f(bq[1] + 4) + '">' + esc(M.bus.name || "") + "</text>");
    var c1 = M.office.callout || SITE.brand || "", c2 = [M.office.name, M.office.floor].filter(Boolean).join(" · ");
    var cw = Math.max(textW(c1, 12.5), textW(c2, 11)) + 22;
    var cA = P(off[0] + sgE * (oSize / 2 + 12), off[1] - sgN * (oSize / 2 + 12));
    var cb = inFrame(sgE > 0 ? cA[0] : cA[0] - cw, sgN > 0 ? cA[1] : cA[1] - 40, cw, 40), bx = cb[0], by = cb[1];
    var lead = P(off[0] + sgE * oSize * .35, off[1] - sgN * oSize * .35);
    o.push('<g class="callout"><path d="M' + f(lead[0]) + " " + f(lead[1]) + " L" + f(sgE > 0 ? bx : bx + cw) + " " + f(by + 20) + '"/><rect x="' + f(bx) + '" y="' + f(by) + '" width="' + f(cw) + '" height="40" rx="4"/><text class="c1" x="' + f(bx + 11) + '" y="' + f(by + 16) + '">' + esc(c1) + '</text><text class="c2" x="' + f(bx + 11) + '" y="' + f(by + 32) + '">' + esc(c2) + "</text></g>");
    o.push("</g>");

    // 확대했을 때 글자
    o.push('<g id="lbl-zoom" opacity="0">');
    var tq0 = P.apply(null, target.p);
    if (roads[0]) {
      var tT = target.p[0] * d0[0] + target.p[1] * d0[1], sT = target.p[0] * roads[0].n[0] + target.p[1] * roads[0].n[1];
      var rq = P.apply(null, add(add([0, 0], d0, tT - 13), roads[0].n, (sT >= 0 ? 1 : -1) * 9));
      o.push('<text class="z-road" transform="translate(' + f(rq[0]) + " " + f(rq[1]) + ") rotate(" + f(roads[0].ang) + ')">' + esc(roads[0].name) + "</text>");
      var zRoadAt = rq;
    }
    o.push('<text class="z-exit" x="' + f(tq0[0] + 7) + '" y="' + f(tq0[1] - 9) + '">' + esc(target.no) + "번 출구</text>");
    var best = 0, bi = 0;
    for (var i = 1; i < walk.length; i++) { var len = Math.hypot(walk[i][0] - walk[i - 1][0], walk[i][1] - walk[i - 1][1]); if (len > best) { best = len; bi = i; } }
    if (M.walkLabel && bi) {
      var a0 = walk[bi - 1], a1 = walk[bi], mid = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      var sd = norm([a1[0] - a0[0], a1[1] - a0[1]]), pn = [sd[1], -sd[0]];
      if (pn[0] * -mid[0] + pn[1] * -mid[1] < 0) pn = [-pn[0], -pn[1]];
      var mq = P.apply(null, add(mid, pn, 2.5));
      o.push('<text class="z-dist" transform="translate(' + f(mq[0]) + " " + f(mq[1]) + ") rotate(" + f(readable(angOf(sd))) + ')">' + esc(M.walkLabel) + "</text>");
    }
    var nq = P(off[0], off[1] - 4);
    o.push('<text class="z-bldg" x="' + f(nq[0]) + '" y="' + f(nq[1]) + '">' + esc(M.office.name || "") + "</text>");
    asList(M.landmarks).forEach(function (lm) {
      if (!(lm.size > 0)) return;
      var q = P.apply(null, EN(lm.at));
      o.push('<text class="z-lm" x="' + f(q[0]) + '" y="' + f(q[1] + 1.5) + '">' + esc(lm.name) + "</text>");
    });
    o.push("</g>");
    o.push('<g class="compass" id="compass" transform="translate(806 46)"><circle r="20"/><path d="M0 -14 L5 4 L0 0 L-5 4z"/><text y="14">N</text></g>');
    o.push('<g class="scale" id="scale" transform="translate(176 628)"><path d="M0 -6 V0 H' + f(20 * S) + ' V-6"/><text x="' + f(20 * S + 8) + '" y="0">20m</text></g>');
    o.push("</svg>");

    // 확대 화면: 출구·걷는 길·사무소·층 표시가 모두 들어오게
    var pts = [tq0, [tq0[0] + 46, tq0[1] - 16], [tq[0] - tw * .25, tq[1] - 12], [tq[0] + tw * .25, tq[1] + 12]];
    if (typeof zRoadAt !== "undefined") pts.push([zRoadAt[0], zRoadAt[1] - 8]);
    walk.forEach(function (p) { pts.push(P.apply(null, p)); });
    square(off, oSize, d0).forEach(function (p) { pts.push(P.apply(null, p)); });
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs) - 22, x1 = Math.max.apply(null, xs) + 22, y0 = Math.min.apply(null, ys) - 16, y1 = Math.max.apply(null, ys) + 16;
    var zw = Math.max(x1 - x0, (y1 - y0) * 960 / 660, 240), zh = zw * 660 / 960;
    var zoom = [(x0 + x1) / 2 - zw / 2, (y0 + y1) / 2 - zh / 2 + zh * .08, zw, zh];

    return { html: o.join(""), trains: trains, zoom: zoom, P: P };
  }

  /* ---------- 오시는 길: 모션 그래픽 ---------- */
  function setupRoute() {
    var holder = $("#map-holder"), btn = $("#route-play");
    var G = buildMap(SITE.map);
    if (!holder || !btn) return;
    if (!G) {
      // 좌표가 없으면 길 안내 애니메이션 대신 실제 지도만 보여 줌
      $("#panel-guide").hidden = true;
      $("#panel-map").hidden = false;
      $(".loc-tabs").hidden = true;
      loadRealMap();
      return;
    }
    holder.innerHTML = G.html;
    var svg = $("#route-map");
    var WIDE = [0, 0, 960, 660], ZOOM = G.zoom;
    var walk = $("#walk", svg), walker = $("#walker", svg), floorTag = $("#floor-tag", svg);
    var lines = $all(".subway", svg);
    var trains = G.trains.map(function (t) { t.el = $("#" + t.id, svg); return t; });
    var lblWide = $("#lbl-wide", svg), lblZoom = $("#lbl-zoom", svg), compass = $("#compass", svg), scale = $("#scale", svg);
    var pulseExit = $("#pulse-exit", svg), pulseOffice = $("#pulse-office", svg);
    var caption = $("#route-caption"), steps = $all("#route-steps li"), stepList = $("#route-steps");
    var label = btn.querySelector("span");
    var walkLen = walk.getTotalLength();
    var raf = 0;
    var M = SITE.map, L = SITE.location || {};
    var lineNames = asList(M.lines).map(function (l) { return l.name; }).join("·");
    var target = asList(M.exits).filter(function (x) { return x.target; })[0] || {};
    var caps = asList(L.captions);
    var CAP = [
      caps[0] || (lineNames + " " + M.station + "에서 내립니다."),
      caps[1] || (target.no + "번 출구로 나옵니다."),
      caps[2] || ("출구에서 " + (M.walkLabel || "조금") + " 걸어옵니다."),
      caps[3] || ([M.office.name, M.office.floor].filter(Boolean).join(" ") + "입니다.")
    ];

    // 확대해도 표식이 너무 커지지 않게, 원래 위치를 기억해 두고 크기를 보정
    var markers = $all(".exit, .pin, .walker, .floor-tag, .bus", svg).map(function (el) {
      var m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(el.getAttribute("transform") || "");
      return { el: el, x: m ? +m[1] : 0, y: m ? +m[2] : 0, k: el.classList.contains("floor-tag") ? .45 : el.classList.contains("pin") ? .34 : el.classList.contains("walker") ? .5 : .42, dy: 0 };
    });
    function marker(el) { return markers.filter(function (m) { return m.el === el; })[0]; }
    function place(m, z) {
      var s = lerp(1, m.k, clamp((z - 1) / 3, 0, 1));
      m.el.setAttribute("transform", "translate(" + m.x.toFixed(1) + " " + (m.y + m.dy).toFixed(1) + ") scale(" + s.toFixed(3) + ")");
    }
    function trainAt(t, along) {
      var p = G.P(t.d[0] * along, t.d[1] * along);
      t.el.setAttribute("transform", "translate(" + p[0].toFixed(1) + " " + p[1].toFixed(1) + ")");
    }
    function camera(k) {
      var vb = WIDE.map(function (w, i) { return lerp(w, ZOOM[i], k); });
      svg.setAttribute("viewBox", vb.map(function (n) { return n.toFixed(2); }).join(" "));
      var z = WIDE[2] / vb[2];
      markers.forEach(function (m) { place(m, z); });
    }
    function setStep(n, text) {
      stepList.classList.toggle("is-running", n > 0);
      steps.forEach(function (li) { li.classList.toggle("is-on", +li.getAttribute("data-step") === n); });
      if (text && caption.textContent !== text) caption.textContent = text;
    }
    function drawLines(k) {
      lines.forEach(function (l) {
        l.style.strokeDasharray = "1";
        l.style.strokeDashoffset = String(1 - k);
        l.style.opacity = String(lerp(.55, 1, k));
      });
    }

    var T = { lines: [0, 900], trains: [150, 1500], zoom: [1700, 3200], walk: [3300, 5600], arrive: [5600, 6400], end: 6600 };
    function seg(t, a) { return clamp((t - a[0]) / (a[1] - a[0]), 0, 1); }

    function draw(t) {
      // 1. 노선과 열차
      drawLines(easeOut(seg(t, T.lines)));
      var kt = easeOut(seg(t, T.trains));
      var trainVis = t < T.zoom[0] + 600 ? 1 : 1 - seg(t, [T.zoom[0] + 600, T.zoom[0] + 1100]);
      trains.forEach(function (tr) { tr.el.setAttribute("opacity", t > 0 ? trainVis : 0); trainAt(tr, lerp(tr.from, tr.to, kt)); });
      // 2. 카메라 확대
      var kz = easeInOut(seg(t, T.zoom));
      lblWide.setAttribute("opacity", 1 - clamp(kz * 2, 0, 1));
      compass.setAttribute("opacity", 1 - kz);
      scale.setAttribute("opacity", 1 - kz);
      lblZoom.setAttribute("opacity", clamp((kz - .6) / .4, 0, 1));
      pulseExit && pulseExit.classList.toggle("is-on", t >= T.zoom[0] && t < T.walk[1]);
      // 3. 걷기
      var kw = easeInOut(seg(t, T.walk));
      walk.style.strokeDashoffset = String(1 - kw);
      var pt = walk.getPointAtLength(walkLen * kw);
      var mw = marker(walker);
      mw.x = pt.x; mw.y = pt.y;
      walker.setAttribute("opacity", t >= T.walk[0] - 200 && t < T.arrive[1] ? 1 : 0);
      // 4. 도착
      var ka = easeOut(seg(t, T.arrive));
      floorTag.setAttribute("opacity", ka);
      marker(floorTag).dy = (1 - ka) * 6;
      svg.classList.toggle("is-arrived", t >= T.arrive[0]);
      pulseOffice.classList.toggle("is-on", t >= T.arrive[0]);
      camera(kz);

      if (t < T.zoom[0]) setStep(1, CAP[0]);
      else if (t < T.walk[0]) setStep(2, CAP[1]);
      else if (t < T.arrive[0]) setStep(2, CAP[2]);
      else setStep(3, CAP[3]);
    }

    function reset() {
      cancelAnimationFrame(raf);
      lines.forEach(function (l) { l.style.strokeDasharray = ""; l.style.strokeDashoffset = ""; l.style.opacity = ""; });
      walk.style.strokeDashoffset = "";
      trains.forEach(function (tr) { tr.el.setAttribute("opacity", 0); });
      walker.setAttribute("opacity", 0); floorTag.setAttribute("opacity", 0);
      lblWide.setAttribute("opacity", 1); lblZoom.setAttribute("opacity", 0);
      compass.setAttribute("opacity", 1); scale.setAttribute("opacity", 1);
      svg.classList.remove("is-arrived");
      pulseExit && pulseExit.classList.remove("is-on"); pulseOffice.classList.remove("is-on");
      camera(0);
    }

    function play() {
      reset();
      btn.classList.add("is-playing");
      label.textContent = "길 안내 재생 중";
      if (reduceMotion) { draw(T.end); finish(); return; }
      var t0 = performance.now();
      (function tick(now) {
        var t = now - t0;
        draw(t);
        if (t < T.end) raf = requestAnimationFrame(tick); else finish();
      })(t0);
    }
    function finish() {
      btn.classList.remove("is-playing");
      label.textContent = "다시 재생";
    }

    btn.addEventListener("click", play);
    reset();
  }

  /* ---------- 복사 버튼 ---------- */
  function setupCopy() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-copy]");
      if (!b) return;
      var src = $(b.getAttribute("data-copy"));
      var text = src ? src.textContent.trim() : "";
      var done = function () { var o = b.textContent; b.textContent = "복사됨"; setTimeout(function () { b.textContent = o; }, 1600); };
      var fallback = function () {
        var r = document.createRange(); r.selectNodeContents(src);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        b.textContent = "선택됨 · 길게 눌러 복사";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  }

  /* ---------- 상담 신청 ---------- */
  function setupForm() {
    var form = $("#inquiry"), msg = $("#form-msg");
    if (!form) return;
    $all("[data-kind]").forEach(function (a) {
      a.addEventListener("click", function () { var r = $("#" + a.getAttribute("data-kind")); if (r) r.checked = true; });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#f-name"), phone = $("#f-phone"), agree = $("#f-agree");
      var bad = [];
      [name, phone].forEach(function (el) {
        var ok = el.value.trim().length > 0 && (el !== phone || /[0-9]{2,}.*[0-9]{3,}.*[0-9]{4}/.test(el.value.replace(/\s/g, "")));
        el.setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok) bad.push(el === name ? "성함" : "연락처");
      });
      if (bad.length) { msg.className = "form-msg is-err"; msg.textContent = bad.join("과 ") + "을 확인해 주세요."; return; }
      if (!agree.checked) { msg.className = "form-msg is-err"; msg.textContent = "개인정보 수집·이용에 동의해 주셔야 상담을 접수할 수 있습니다."; return; }

      var kind = (form.querySelector('input[name="kind"]:checked') || {}).value || "";
      var data = { 문의유형: kind, 성함: name.value.trim(), 연락처: phone.value.trim(), 예산: $("#f-budget").value, 내용: $("#f-msg").value.trim() };

      if (SITE.formEndpoint) {
        msg.className = "form-msg"; msg.textContent = "접수하는 중입니다…";
        fetch(SITE.formEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); msg.className = "form-msg is-ok"; msg.textContent = "상담 신청이 접수되었습니다. 영업일 기준 하루 안에 연락드리겠습니다."; })
          .catch(function () { msg.className = "form-msg is-err"; msg.textContent = "접수가 되지 않았습니다. " + SITE.phone + "로 전화 주시면 바로 도와드리겠습니다."; });
        return;
      }
      // 접수 주소가 아직 없을 때: 내용을 정리해 전화·문자로 전달하도록 안내
      var text = Object.keys(data).filter(function (k) { return data[k]; }).map(function (k) { return k + ": " + data[k]; }).join("\n");
      msg.className = "form-msg";
      msg.innerHTML = "";
      var box = document.createElement("div");
      box.className = "copy-box";
      box.innerHTML = "<strong>온라인 접수 준비 중입니다. 아래 내용을 " + esc(SITE.phone) + "로 전화 주시거나 문자로 보내 주세요.</strong><pre id=\"inquiry-text\"></pre>";
      box.querySelector("pre").textContent = text;
      var b = document.createElement("button");
      b.type = "button"; b.className = "copy-btn on-light"; b.setAttribute("data-copy", "#inquiry-text"); b.textContent = "내용 복사";
      box.appendChild(b);
      msg.appendChild(box);
    });
  }

  // 설정 파일을 못 읽었을 때 원인을 화면에 표시
  var problem = window.__configError ||
    (!window.MY_OFFICE ? "js/my-office.js 파일을 읽지 못했습니다. 따옴표(\")·쉼표(,)가 빠지지 않았는지 확인해 주세요." : "") ||
    (!window.SITE || !window.SITE.office ? "js/config.js 파일을 읽지 못했습니다. 따옴표(\")·쉼표(,)·괄호가 빠지지 않았는지 확인해 주세요." : "") ||
    (!window.FEATURED || !window.CASES ? "js/listings.js 파일을 읽지 못했습니다. 따옴표(\")·쉼표(,)·괄호가 빠지지 않았는지 확인해 주세요." : "");
  if (problem) {
    var bar = document.createElement("div");
    bar.className = "config-error";
    bar.setAttribute("role", "alert");
    bar.textContent = "설정 오류: " + problem;
    document.body.insertBefore(bar, document.body.firstChild);
    if (!window.SITE || !window.SITE.office) return;
  }

  document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
  applyMyOffice();
  bindSite();
  renderSections();
  renderFeatured();
  setupDetail();
  setupRoller();
  setupTabs();
  setupRoute();
  setupCopy();
  setupForm();
})();
