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

    var note = $("#featured-note");
    if (note && SITE.SAMPLE_MODE) note.textContent = "지금 보이는 매물과 사진은 예시입니다. 실제 매물로 바꿔 올릴 예정입니다.";
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
      '<ul class="c-specs">' + (c.specs || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul></div>" +
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

  /* ---------- 오시는 길: 모션 그래픽 ---------- */
  function setupRoute() {
    var svg = $("#route-map"), btn = $("#route-play");
    if (!svg || !btn) return;
    var WIDE = [0, 0, 960, 660], ZOOM = [507, 294, 240, 165];
    var walk = $("#walk", svg), walker = $("#walker", svg), floorTag = $("#floor-tag", svg);
    var l9 = $("#l9", svg), lsb = $("#lsb", svg), t9 = $("#train9", svg), tsb = $("#trainsb", svg);
    var lblWide = $("#lbl-wide", svg), lblZoom = $("#lbl-zoom", svg), compass = $("#compass", svg), scale = $("#scale", svg);
    var pulseExit = $("#pulse-exit", svg), pulseOffice = $("#pulse-office", svg);
    var caption = $("#route-caption"), steps = $all("#route-steps li"), stepList = $("#route-steps");
    var label = btn.querySelector("span");
    var walkLen = walk.getTotalLength();
    var raf = 0;

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

    // 9호선: 봉은사로 방향(69.5°), 수인분당선: 선릉로 북쪽(343.5°)
    var U = [Math.sin(69.5 * Math.PI / 180), Math.cos(69.5 * Math.PI / 180)];
    var WN = [Math.sin(343.5 * Math.PI / 180), Math.cos(343.5 * Math.PI / 180)];
    function P(e, n) { return [450 + 3 * e, 330 - 3 * n]; }
    function trainAt(el, dir, t) {
      var p = P(dir[0] * t, dir[1] * t);
      el.setAttribute("transform", "translate(" + p[0].toFixed(1) + " " + p[1].toFixed(1) + ")");
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
    function lines(k) {
      [l9, lsb].forEach(function (l) {
        l.style.strokeDasharray = "1";
        l.style.strokeDashoffset = String(1 - k);
        l.style.opacity = String(lerp(.55, 1, k));
      });
    }

    var T = { lines: [0, 900], trains: [150, 1500], zoom: [1700, 3200], walk: [3300, 5600], arrive: [5600, 6400], end: 6600 };
    function seg(t, a) { return clamp((t - a[0]) / (a[1] - a[0]), 0, 1); }

    function draw(t) {
      // 1. 노선과 열차
      lines(easeOut(seg(t, T.lines)));
      var kt = easeOut(seg(t, T.trains));
      var trainVis = t < T.zoom[0] + 600 ? 1 : 1 - seg(t, [T.zoom[0] + 600, T.zoom[0] + 1100]);
      t9.setAttribute("opacity", t > 0 ? trainVis : 0);
      tsb.setAttribute("opacity", t > 0 ? trainVis : 0);
      trainAt(t9, U, lerp(-260, 10, kt));
      trainAt(tsb, WN, lerp(250, 80, kt));
      // 2. 카메라 확대
      var kz = easeInOut(seg(t, T.zoom));
      camera(kz);
      lblWide.setAttribute("opacity", 1 - clamp(kz * 2, 0, 1));
      compass.setAttribute("opacity", 1 - kz);
      scale.setAttribute("opacity", 1 - kz);
      lblZoom.setAttribute("opacity", clamp((kz - .6) / .4, 0, 1));
      pulseExit.classList.toggle("is-on", t >= T.zoom[0] && t < T.walk[1]);
      // 3. 걷기
      var kw = easeInOut(seg(t, T.walk));
      walk.style.strokeDashoffset = String(1 - kw);
      var pt = walk.getPointAtLength(walkLen * kw);
      var mw = marker(walker);
      mw.x = pt.x; mw.y = pt.y;
      walker.setAttribute("opacity", t >= T.walk[0] - 200 && t < T.arrive[1] ? 1 : t >= T.arrive[1] ? 0 : 0);
      // 4. 도착
      var ka = easeOut(seg(t, T.arrive));
      floorTag.setAttribute("opacity", ka);
      marker(floorTag).dy = (1 - ka) * 6;
      svg.classList.toggle("is-arrived", t >= T.arrive[0]);
      pulseOffice.classList.toggle("is-on", t >= T.arrive[0]);
      camera(kz);

      if (t < T.zoom[0]) setStep(1, "9호선·수인분당선 선정릉역에서 내립니다.");
      else if (t < T.walk[0]) setStep(2, "3번 출구로 나옵니다. 9호선과 수인분당선이 같은 출구를 씁니다.");
      else if (t < T.arrive[0]) setStep(2, "출구에서 선릉로 사거리 쪽으로 약 20m 걸어옵니다.");
      else setStep(3, "국가무형유산전수교육관 바로 옆, 씨티라이프61 2층 202호입니다.");
    }

    function reset() {
      cancelAnimationFrame(raf);
      [l9, lsb].forEach(function (l) { l.style.strokeDasharray = ""; l.style.strokeDashoffset = ""; l.style.opacity = ""; });
      walk.style.strokeDashoffset = "";
      t9.setAttribute("opacity", 0); tsb.setAttribute("opacity", 0);
      walker.setAttribute("opacity", 0); floorTag.setAttribute("opacity", 0);
      lblWide.setAttribute("opacity", 1); lblZoom.setAttribute("opacity", 0);
      compass.setAttribute("opacity", 1); scale.setAttribute("opacity", 1);
      svg.classList.remove("is-arrived");
      pulseExit.classList.remove("is-on"); pulseOffice.classList.remove("is-on");
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
          .catch(function () { msg.className = "form-msg is-err"; msg.textContent = "접수가 되지 않았습니다. 02-566-0338로 전화 주시면 바로 도와드리겠습니다."; });
        return;
      }
      // 접수 주소가 아직 없을 때: 내용을 정리해 전화·문자로 전달하도록 안내
      var text = Object.keys(data).filter(function (k) { return data[k]; }).map(function (k) { return k + ": " + data[k]; }).join("\n");
      msg.className = "form-msg";
      msg.innerHTML = "";
      var box = document.createElement("div");
      box.className = "copy-box";
      box.innerHTML = "<strong>온라인 접수 준비 중입니다. 아래 내용을 02-566-0338로 전화 주시거나 문자로 보내 주세요.</strong><pre id=\"inquiry-text\"></pre>";
      box.querySelector("pre").textContent = text;
      var b = document.createElement("button");
      b.type = "button"; b.className = "copy-btn on-light"; b.setAttribute("data-copy", "#inquiry-text"); b.textContent = "내용 복사";
      box.appendChild(b);
      msg.appendChild(box);
    });
  }

  document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
  renderFeatured();
  setupDetail();
  setupRoller();
  setupTabs();
  setupRoute();
  setupCopy();
  setupForm();
})();
