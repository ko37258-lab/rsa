// ==========================================================================
// MR.K 고상철의 부동산IT 활용
// 모션 레이어 — 마우스·스크롤 반응형 인터랙션 (전 페이지 공통)
//  · 커서 링, 스크롤 진행바, 마그네틱 버튼, 카드 틸트·스포트라이트
//  · 스크롤 리빌, 숫자 카운트, 텍스트 스크램블, 마키 띠
//  · 홈 히어로: 마우스로 태양을 움직이면 건물 그림자가 바뀌는 대지 시뮬레이션
//  · 서브페이지: 히어로 오른쪽에 생성 이미지 패럴랙스 아트 삽입
// ==========================================================================

(() => {
    if (window.__mrkMotion) return;
    window.__mrkMotion = true;

    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    root.classList.add('mx-on');
    root.classList.toggle('mx-reduce', reduce);
    root.classList.toggle('mx-fine', fine);

    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    // ── 공용 포인터 상태 (뷰포트 기준 -1 ~ 1, 부드럽게 따라가는 값 포함) ──
    const pointer = { x: innerWidth / 2, y: innerHeight / 2, nx: 0, ny: 0, sx: 0, sy: 0, moved: false };
    window.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        pointer.nx = (event.clientX / innerWidth) * 2 - 1;
        pointer.ny = (event.clientY / innerHeight) * 2 - 1;
        pointer.moved = true;
    }, { passive: true });

    // ── 스크롤 상태 (속도 포함) ──
    const scroll = { y: scrollY, last: scrollY, velocity: 0 };
    window.addEventListener('scroll', () => { scroll.y = scrollY; }, { passive: true });

    // ── 단일 rAF 루프 ──
    const tasks = new Set();
    function frame(time) {
        pointer.sx = lerp(pointer.sx, pointer.nx, 0.07);
        pointer.sy = lerp(pointer.sy, pointer.ny, 0.07);
        scroll.velocity = lerp(scroll.velocity, scroll.y - scroll.last, 0.18);
        scroll.last = scroll.y;
        tasks.forEach(task => task(time));
        requestAnimationFrame(frame);
    }

    // 화면에 보일 때만 작업하도록 표시
    const visibility = new WeakMap();
    const viewWatcher = 'IntersectionObserver' in window
        ? new IntersectionObserver(entries => {
            entries.forEach(entry => visibility.set(entry.target, entry.isIntersecting));
        }, { rootMargin: '120px 0px' })
        : null;
    function watch(el) {
        visibility.set(el, true);
        viewWatcher?.observe(el);
    }
    const inView = el => visibility.get(el) !== false;

    // ======================================================================
    // 1. 스크롤 진행바 + 내비게이션 그림자
    // ======================================================================
    function initProgress() {
        const bar = document.createElement('div');
        bar.className = 'mx-progress';
        bar.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bar);
        const nav = document.querySelector('.site-nav');
        let lastY = -1;
        tasks.add(() => {
            if (scroll.y === lastY) return;
            lastY = scroll.y;
            const max = document.documentElement.scrollHeight - innerHeight;
            bar.style.transform = `scaleX(${max > 0 ? clamp(scroll.y / max, 0, 1) : 0})`;
            nav?.classList.toggle('mx-scrolled', scroll.y > 8);
        });
    }

    // ======================================================================
    // 2. 커서 링 (마우스 환경 전용)
    // ======================================================================
    function initCursor() {
        if (!fine || reduce) return;
        const dot = document.createElement('div');
        const ring = document.createElement('div');
        dot.className = 'mx-cursor is-hidden';
        ring.className = 'mx-ring is-hidden';
        ring.innerHTML = '<span class="mx-ring-label"></span>';
        dot.setAttribute('aria-hidden', 'true');
        ring.setAttribute('aria-hidden', 'true');
        document.body.append(dot, ring);
        const label = ring.firstElementChild;
        let rx = pointer.x;
        let ry = pointer.y;

        const linkSel = 'a, button, [role="button"], label, summary, [data-cursor], .skin-dot';
        const nativeSel = 'input, textarea, select, canvas, iframe, [contenteditable], .leaflet-container';

        document.addEventListener('pointerover', event => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) return;
            const native = target.closest(nativeSel);
            const link = !native && target.closest(linkSel);
            const text = link?.closest('[data-cursor]')?.dataset.cursor || '';
            dot.classList.toggle('is-hidden', Boolean(native));
            ring.classList.toggle('is-hidden', Boolean(native));
            ring.classList.toggle('is-link', Boolean(link));
            ring.classList.toggle('has-label', Boolean(text));
            label.textContent = text;
        });
        document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
        document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
        document.documentElement.addEventListener('pointerleave', () => {
            dot.classList.add('is-hidden');
            ring.classList.add('is-hidden');
        });
        window.addEventListener('pointermove', () => {
            if (!pointer.moved) return;
            dot.classList.remove('is-hidden');
            if (!ring.classList.contains('is-link') && !ring.classList.contains('has-label')) {
                ring.classList.remove('is-hidden');
            }
        }, { passive: true, once: true });

        tasks.add(() => {
            rx = lerp(rx, pointer.x, 0.18);
            ry = lerp(ry, pointer.y, 0.18);
            dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
            ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
        });
    }

    // ======================================================================
    // 3. 마그네틱 버튼 — CSS translate 속성만 사용해 기존 transform과 충돌 없음
    // ======================================================================
    function initMagnetic() {
        if (!fine || reduce) return;
        const items = document.querySelectorAll('.btn-primary, .btn-secondary, .nav-cta, .report-btn, [data-magnetic]');
        items.forEach(el => {
            const strength = Number(el.dataset.magnetic) || 0.28;
            el.classList.add('mx-magnetic');
            el.addEventListener('pointermove', event => {
                const rect = el.getBoundingClientRect();
                const dx = event.clientX - (rect.left + rect.width / 2);
                const dy = event.clientY - (rect.top + rect.height / 2);
                el.style.translate = `${clamp(dx * strength, -12, 12)}px ${clamp(dy * strength * 1.2, -9, 9)}px`;
            });
            el.addEventListener('pointerleave', () => { el.style.translate = ''; });
        });
    }

    // ======================================================================
    // 4. 카드 틸트 + 스포트라이트 + 이미지 팬
    //    data-tilt="최대각도" / data-spot(테두리 빛) / data-glow(커서 위치만 CSS 변수로)
    //    --px, --py 값으로 카드 안 이미지가 커서 반대쪽으로 살짝 이동합니다.
    // ======================================================================
    function initTilt() {
        const items = document.querySelectorAll('[data-tilt], [data-spot], [data-glow]');
        items.forEach(el => {
            const max = reduce || !fine ? 0 : Number(el.dataset.tilt) || 0;
            const state = { tx: 0, ty: 0, cx: 0, cy: 0, active: false };
            el.addEventListener('pointermove', event => {
                if (event.pointerType === 'touch') return;
                const rect = el.getBoundingClientRect();
                const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
                const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
                el.style.setProperty('--sx', `${px * 100}%`);
                el.style.setProperty('--sy', `${py * 100}%`);
                el.style.setProperty('--px', px.toFixed(3));
                el.style.setProperty('--py', py.toFixed(3));
                state.tx = (0.5 - py) * max;
                state.ty = (px - 0.5) * max;
                state.active = true;
            });
            el.addEventListener('pointerleave', () => {
                state.tx = 0;
                state.ty = 0;
                el.style.setProperty('--px', '0.5');
                el.style.setProperty('--py', '0.5');
            });
            if (!max) return;
            tasks.add(() => {
                if (!state.active) return;
                state.cx = lerp(state.cx, state.tx, 0.12);
                state.cy = lerp(state.cy, state.ty, 0.12);
                el.style.transform = `perspective(1000px) rotateX(${state.cx.toFixed(2)}deg) rotateY(${state.cy.toFixed(2)}deg)`;
                if (Math.abs(state.cx) < 0.01 && Math.abs(state.cy) < 0.01 && !state.tx && !state.ty) {
                    state.active = false;
                    el.style.transform = '';
                }
            });
        });
    }

    // ======================================================================
    // 5. 스크롤 리빌 — 제목 줄 나눔, 순차 등장, 숫자 카운트, 스크램블
    // ======================================================================
    function splitLines(el) {
        if (el.dataset.splitDone) return;
        el.dataset.splitDone = '1';
        const parts = el.innerHTML.split(/<br\s*\/?>/i);
        el.innerHTML = parts
            .map((part, index) => `<span class="mx-line" style="--l:${index}"><span>${part.trim()}</span></span>`)
            .join('');
    }

    function countUp(el) {
        const target = el.dataset.count;
        const match = target.match(/^([^0-9-]*)(-?[0-9.,]+)(.*)$/);
        if (!match || reduce) { el.textContent = target; return; }
        const [, prefix, numText, suffix] = match;
        const decimals = (numText.split('.')[1] || '').length;
        const pad = numText.startsWith('0') && !numText.includes('.') ? numText.length : 0;
        const end = parseFloat(numText.replace(/,/g, ''));
        const duration = 1400;
        const start = performance.now();
        const step = now => {
            const t = clamp((now - start) / duration, 0, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            let value = (end * eased).toFixed(decimals);
            if (pad) value = value.padStart(pad, '0');
            el.textContent = `${prefix}${value}${suffix}`;
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function scramble(el) {
        const finalText = el.dataset.scramble || el.textContent;
        if (reduce) { el.textContent = finalText; return; }
        const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%';
        let frameCount = 0;
        const total = 22;
        const tick = () => {
            frameCount += 1;
            el.textContent = finalText
                .split('')
                .map((char, index) => {
                    if (char === ' ') return ' ';
                    return frameCount / total > index / finalText.length
                        ? char
                        : glyphs[Math.floor(Math.random() * glyphs.length)];
                })
                .join('');
            if (frameCount < total) requestAnimationFrame(tick);
            else el.textContent = finalText;
        };
        tick();
    }

    function initReveal() {
        document.querySelectorAll('[data-split]').forEach(splitLines);
        document.querySelectorAll('[data-stagger]').forEach(group => {
            const step = Number(group.dataset.stagger) || 1;
            Array.from(group.children).forEach((child, index) => {
                if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', '');
                child.style.setProperty('--i', String(index * step));
            });
        });

        const targets = document.querySelectorAll('[data-reveal], [data-split], [data-count], [data-scramble]');
        const show = el => {
            el.classList.add('is-in');
            if (el.dataset.count && !el.dataset.counted) {
                el.dataset.counted = '1';
                countUp(el);
            }
            if (el.hasAttribute('data-scramble') && !el.dataset.scrambled) {
                el.dataset.scrambled = '1';
                scramble(el);
            }
        };
        if (!('IntersectionObserver' in window) || reduce) {
            targets.forEach(show);
            return;
        }
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                show(entry.target);
                io.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        targets.forEach(el => io.observe(el));
    }

    // ======================================================================
    // 6. 패럴랙스 — [data-parallax] 영역 안의 [data-depth] 레이어가 마우스와 스크롤에 반응
    // ======================================================================
    function initParallax() {
        if (reduce) return;
        document.querySelectorAll('[data-parallax]').forEach(area => {
            watch(area);
            const layers = Array.from(area.querySelectorAll('[data-depth]'));
            tasks.add(() => {
                if (!inView(area)) return;
                const rect = area.getBoundingClientRect();
                // 영역 중심이 화면 중심에 올 때 0, 위로 지나가면 -1 → 배경이 내용보다 천천히 움직임
                const progress = clamp((rect.top + rect.height / 2 - innerHeight / 2) / (innerHeight / 2 + rect.height / 2), -1, 1);
                layers.forEach(layer => {
                    const depth = Number(layer.dataset.depth) || 0;
                    const scrollFactor = Number(layer.dataset.scroll) || 0;
                    const x = -pointer.sx * depth * 18;
                    const y = -pointer.sy * depth * 12 - progress * scrollFactor * rect.height * 0.5;
                    layer.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
                });
            });
        });
    }

    // ======================================================================
    // 7. 마키 띠 — 스크롤 속도에 따라 빨라지고 방향이 바뀜
    // ======================================================================
    function initMarquee() {
        document.querySelectorAll('[data-marquee]').forEach(row => {
            const track = row.querySelector('.mx-marquee-track');
            if (!track) return;
            track.innerHTML += track.innerHTML;
            watch(row);
            const base = (Number(row.dataset.marquee) || 0.6) * (reduce ? 0 : 1);
            let offset = 0;
            tasks.add(() => {
                if (!inView(row) || reduce) return;
                const half = track.scrollWidth / 2;
                const boost = clamp(scroll.velocity * 0.35, -14, 14);
                offset -= base + boost * Math.sign(base || 1);
                if (offset <= -half) offset += half;
                if (offset > 0) offset -= half;
                track.style.transform = `translate3d(${offset.toFixed(2)}px, 0, 0) skewX(${clamp(-scroll.velocity * 0.4, -8, 8).toFixed(2)}deg)`;
            });
        });
    }

    // ======================================================================
    // 8. 스크롤 따라 단어가 켜지는 인용문 / 진행선
    // ======================================================================
    function initScrub() {
        const quotes = Array.from(document.querySelectorAll('[data-scrub-words]'));
        quotes.forEach(el => {
            const words = el.textContent.trim().split(/\s+/);
            el.innerHTML = words.map(word => `<span class="mx-word">${word}</span>`).join(' ');
            watch(el);
        });
        const lines = Array.from(document.querySelectorAll('[data-progress-line]'));
        lines.forEach(watch);
        if (!quotes.length && !lines.length) return;
        tasks.add(() => {
            quotes.forEach(el => {
                if (!inView(el)) return;
                const rect = el.getBoundingClientRect();
                const progress = reduce ? 1 : clamp((innerHeight * 0.85 - rect.top) / (innerHeight * 0.5), 0, 1);
                const words = el.children;
                const lit = Math.round(progress * words.length);
                for (let i = 0; i < words.length; i += 1) words[i].classList.toggle('is-lit', i < lit);
            });
            lines.forEach(el => {
                if (!inView(el)) return;
                const rect = el.getBoundingClientRect();
                const progress = reduce ? 1 : clamp((innerHeight * 0.8 - rect.top) / (rect.height + innerHeight * 0.3), 0, 1);
                el.style.setProperty('--p', progress.toFixed(3));
            });
        });
    }

    // ======================================================================
    // 9. 마스터 비주얼(SVG) — 마우스로 카드들이 깊이감 있게 떠오름
    // ======================================================================
    function initMasterVisual() {
        const box = document.querySelector('[data-mv]');
        if (!box || reduce) return;
        watch(box);
        const groups = Array.from(box.querySelectorAll('[data-mv-depth]'));
        const local = { x: 0, y: 0, cx: 0, cy: 0 };
        box.addEventListener('pointermove', event => {
            const rect = box.getBoundingClientRect();
            local.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            local.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        });
        box.addEventListener('pointerleave', () => { local.x = 0; local.y = 0; });
        tasks.add(() => {
            if (!inView(box)) return;
            local.cx = lerp(local.cx, local.x, 0.08);
            local.cy = lerp(local.cy, local.y, 0.08);
            box.style.transform = `perspective(1600px) rotateX(${(-local.cy * 4).toFixed(2)}deg) rotateY(${(local.cx * 5).toFixed(2)}deg)`;
            groups.forEach(group => {
                const depth = Number(group.dataset.mvDepth) || 0;
                group.style.transform = `translate(${(local.cx * depth * 16).toFixed(2)}px, ${(local.cy * depth * 10).toFixed(2)}px)`;
            });
        });
    }

    // ======================================================================
    // 10. 홈 히어로 — 사진 속 실제 빈 필지 위에 대지경계·건축 매스·그림자를 겹치고
    //     마우스 좌우 이동으로 태양 위치를 바꿔 그림자를 움직입니다.
    //     좌표는 원본 이미지(2688×1152) 픽셀 기준입니다.
    // ======================================================================
    function initSiteSimulation() {
        const svg = document.querySelector('[data-hx-site]');
        if (!svg) return;
        const NS = 'http://www.w3.org/2000/svg';
        const parcel = [[1360, 778], [1812, 614], [2366, 694], [2072, 964]];
        const bilinear = (u, v) => {
            const [a, b, c, d] = parcel;
            return [
                (1 - u) * (1 - v) * a[0] + u * (1 - v) * b[0] + u * v * c[0] + (1 - u) * v * d[0],
                (1 - u) * (1 - v) * a[1] + u * (1 - v) * b[1] + u * v * c[1] + (1 - u) * v * d[1]
            ];
        };
        const quad = (u0, u1, v0, v1) => [bilinear(u0, v0), bilinear(u1, v0), bilinear(u1, v1), bilinear(u0, v1)];
        // 저층 4개 층 + 북쪽(사진 위쪽)에서 물러난 상층 3개 층 = 일조 사선 계단형 매스
        const FLOOR = 30;
        const blocks = [
            { foot: quad(0.28, 0.74, 0.3, 0.78), base: 0, floors: 4 },
            { foot: quad(0.28, 0.56, 0.48, 0.78), base: 4, floors: 3 }
        ];
        const up = (p, h) => [p[0], p[1] - h];
        const pts = list => list.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        const el = (name, attrs, parent = svg) => {
            const node = document.createElementNS(NS, name);
            Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
            parent.appendChild(node);
            return node;
        };

        const defs = el('defs', {});
        defs.innerHTML = `
            <clipPath id="hxParcelClip"><polygon points="${pts(parcel)}"/></clipPath>
            <linearGradient id="hxScan" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#fff" stop-opacity="0"/>
                <stop offset="0.5" stop-color="#f3d79b" stop-opacity="0.42"/>
                <stop offset="1" stop-color="#fff" stop-opacity="0"/>
            </linearGradient>
            <radialGradient id="hxSunGlow">
                <stop offset="0" stop-color="#ffe2a6" stop-opacity="0.95"/>
                <stop offset="0.35" stop-color="#f0b45c" stop-opacity="0.45"/>
                <stop offset="1" stop-color="#f0b45c" stop-opacity="0"/>
            </radialGradient>
            <filter id="hxSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>`;

        // 태양 궤적
        const arc = { s: [1150, 600], c: [1880, -60], e: [2620, 560] };
        el('path', { class: 'hx-arc', d: `M${arc.s} Q${arc.c} ${arc.e}`, fill: 'none' });

        // 대지 경계 + 스캔
        el('polygon', { class: 'hx-parcel-fill', points: pts(parcel) });
        const scanGroup = el('g', { 'clip-path': 'url(#hxParcelClip)' });
        el('rect', { class: 'hx-scan', x: 1100, y: 560, width: 420, height: 460, fill: 'url(#hxScan)' }, scanGroup);
        el('polygon', { class: 'hx-parcel-line', points: pts(parcel), pathLength: 1, fill: 'none' });
        parcel.forEach((p, index) => {
            el('circle', { class: 'hx-corner-ring', cx: p[0], cy: p[1], r: 16, style: `animation-delay:${index * 0.4}s` });
            el('circle', { class: 'hx-corner', cx: p[0], cy: p[1], r: 6.5 });
        });

        // 그림자 (그룹 불투명도로 겹침 방지)
        const shadowGroup = el('g', { class: 'hx-shadow', filter: 'url(#hxSoft)' });
        const shadows = blocks.map(() => el('polygon', { points: '' }, shadowGroup));

        // 건축 매스
        const massGroup = el('g', { class: 'hx-mass' });
        const faces = blocks.map(block => {
            const [a, b, c, d] = block.foot;
            const h0 = block.base * FLOOR;
            const h1 = (block.base + block.floors) * FLOOR;
            const left = el('polygon', { class: 'hx-face hx-face-left', points: pts([up(a, h0), up(d, h0), up(d, h1), up(a, h1)]) }, massGroup);
            const right = el('polygon', { class: 'hx-face hx-face-right', points: pts([up(d, h0), up(c, h0), up(c, h1), up(d, h1)]) }, massGroup);
            for (let f = 1; f < block.floors; f += 1) {
                const h = h0 + f * FLOOR;
                el('polyline', { class: 'hx-floor', points: pts([up(a, h), up(d, h), up(c, h)]) }, massGroup);
            }
            el('polygon', { class: 'hx-face hx-face-top', points: pts([up(a, h1), up(b, h1), up(c, h1), up(d, h1)]) }, massGroup);
            return { left, right };
        });

        // 태양
        const sun = el('g', { class: 'hx-sun' });
        el('circle', { r: 120, fill: 'url(#hxSunGlow)' }, sun);
        el('circle', { class: 'hx-sun-core', r: 22 }, sun);

        const sunAt = t => {
            const m = 1 - t;
            return [
                m * m * arc.s[0] + 2 * m * t * arc.c[0] + t * t * arc.e[0],
                m * m * arc.s[1] + 2 * m * t * arc.c[1] + t * t * arc.e[1]
            ];
        };
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const hull = points => {
            const sorted = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
            const lower = [];
            const upper = [];
            sorted.forEach(p => {
                while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
                lower.push(p);
            });
            sorted.slice().reverse().forEach(p => {
                while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
                upper.push(p);
            });
            return lower.slice(0, -1).concat(upper.slice(0, -1));
        };
        const center = bilinear(0.45, 0.55);

        let t = 0.32;
        let lastT = -1;
        const area = svg.closest('[data-parallax]') || svg;
        watch(area);
        function render(value) {
            const s = sunAt(value);
            sun.setAttribute('transform', `translate(${s[0].toFixed(1)} ${s[1].toFixed(1)})`);
            const elevation = Math.sin(Math.PI * value);
            const dx = center[0] - s[0];
            const dy = center[1] - s[1];
            const len = Math.hypot(dx, dy) || 1;
            const reach = 2.1 - elevation * 1.35;
            const vx = (dx / len) * reach;
            const vy = (dy / len) * reach * 0.7;
            blocks.forEach((block, index) => {
                const h = (block.base + block.floors) * FLOOR;
                const cast = block.foot.map(p => [p[0] + vx * h, p[1] + vy * h]);
                shadows[index].setAttribute('points', pts(hull(block.foot.concat(cast))));
                const leftLit = clamp(0.5 - (value - 0.5) * 1.6, 0.08, 0.95);
                faces[index].left.style.setProperty('--lit', leftLit.toFixed(3));
                faces[index].right.style.setProperty('--lit', (1 - leftLit).toFixed(3));
            });
            svg.style.setProperty('--sun-elev', elevation.toFixed(3));
        }
        render(t);
        if (reduce) return;

        const started = performance.now();
        tasks.add(now => {
            if (!inView(area)) return;
            const target = pointer.moved
                ? clamp((pointer.sx + 1) / 2, 0.04, 0.96)
                : 0.5 + Math.sin((now - started) / 2600) * 0.38;
            t = lerp(t, target, 0.06);
            if (Math.abs(t - lastT) < 0.0005) return;
            lastT = t;
            render(t);
        });
    }

    // ======================================================================
    // 11. 서브페이지 히어로 아트 — 페이지마다 맞는 생성 이미지를 오른쪽에 배치
    // ======================================================================
    function initPageArt() {
        if (document.querySelector('[data-hx-site]')) return;
        const page = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
        const map = {
            property: ['.land-hero', 'assets/hx-step1-land.webp', '빈 필지를 내려다본 항공 사진'],
            'building-simulation': ['.sim-hero', 'assets/hx-step3-mass.webp', '일조 사선으로 상층부가 후퇴한 건축 매스 모형'],
            'cost-simulation': ['.cost-hero', 'assets/hx-step4-build.webp', '골조 공사가 진행 중인 건설 현장'],
            report2: ['.r2-hero', 'assets/hx-step5-done.webp', '준공된 근린생활 건물의 야경'],
            'report-land': ['.r2-hero', 'assets/hx-step2-zoning.webp', '용도지역 지도 위에 필지를 검토하는 손']
        };
        const entry = map[page];
        if (!entry) return;
        const hero = document.querySelector(entry[0]);
        if (!hero) return;
        hero.classList.add('mx-art-host');
        hero.setAttribute('data-parallax', '');
        const art = document.createElement('div');
        art.className = 'mx-page-art';
        art.setAttribute('aria-hidden', 'true');
        art.innerHTML = `<div class="mx-page-art-img" data-depth="-1.1" data-scroll="0.18"><img src="${entry[1]}" alt="" decoding="async"></div>`;
        hero.prepend(art);
        const img = art.querySelector('img');
        const ready = () => art.classList.add('is-loaded');
        if (img.complete) ready();
        else img.addEventListener('load', ready, { once: true });
    }

    // ======================================================================
    // 12. 서브페이지 자동 리빌 — 첫 화면 아래 블록만 부드럽게 등장
    // ======================================================================
    function initAutoReveal() {
        if (document.querySelector('[data-hx-site]')) return;
        const selector = [
            '.sim-panel', '.panel-block', '.cost-block', '.result-panel', '.total-board',
            '.learning-card', '.ai-advisor-card', '.api-guide-card', '.progress-card',
            '.flow-card', '.tool-card', '.r2-sheet', '.report-paper'
        ].join(',');
        const fold = innerHeight * 0.92;
        document.querySelectorAll(selector).forEach(el => {
            if (el.closest('[data-reveal]') || el.getBoundingClientRect().top < fold) return;
            el.setAttribute('data-reveal', '');
        });
        document.querySelectorAll('.flow-card, .tool-card').forEach(el => {
            if (!el.hasAttribute('data-spot')) el.setAttribute('data-spot', '');
        });
    }

    function boot() {
        initPageArt();
        initAutoReveal();
        initProgress();
        initCursor();
        initMagnetic();
        initTilt();
        initReveal();
        initParallax();
        initMarquee();
        initScrub();
        initMasterVisual();
        initSiteSimulation();
        requestAnimationFrame(frame);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
