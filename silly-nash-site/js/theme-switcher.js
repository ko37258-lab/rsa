// 테마 스킨 전환 위젯 — 좌하단 "테마" + 컬러 동그라미
(() => {
    const KEY = 'mrk_skin_v1';
    const SKINS = [
        ['corporate', '기업형 네이비·골드 (기본)', '#17233a', '#9a7b3f'],
        ['claude', '클로드 — 크림·테라코타', '#faf9f5', '#d97757'],
        ['toss', '토스 — 화이트·블루', '#ffffff', '#3182f6'],
        ['stripe', '스트라이프 — 인디고', '#f6f9fc', '#635bff'],
        ['forest', '에스테이트 그린 (추천)', '#f3f6f3', '#2e7d5b'],
        ['burgundy', '버건디 와인 (추천)', '#faf7f2', '#8c2f39']
    ];

    function apply(skin) {
        if (skin === 'corporate') {
            document.documentElement.removeAttribute('data-skin');
        } else {
            document.documentElement.setAttribute('data-skin', skin);
        }
    }

    let saved = 'corporate';
    try {
        const stored = localStorage.getItem(KEY);
        if (stored && SKINS.some(([id]) => id === stored)) saved = stored;
    } catch { /* 저장소 접근 불가 시 기본 테마 */ }
    apply(saved);

    function build() {
        if (document.querySelector('.skin-switcher')) return;
        const wrap = document.createElement('div');
        wrap.className = 'skin-switcher';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', '테마 선택');
        wrap.innerHTML = '<span class="skin-label">테마</span>' + SKINS.map(([id, name, c1, c2]) =>
            `<button type="button" class="skin-dot${id === saved ? ' active' : ''}" data-skin-id="${id}" title="${name}" aria-label="${name}" style="background:linear-gradient(135deg, ${c1} 52%, ${c2} 52%)"></button>`
        ).join('');
        document.body.appendChild(wrap);
        wrap.addEventListener('click', event => {
            const btn = event.target.closest('.skin-dot');
            if (!btn) return;
            const id = btn.dataset.skinId;
            apply(id);
            try { localStorage.setItem(KEY, id); } catch { /* 무시 */ }
            wrap.querySelectorAll('.skin-dot').forEach(dot => dot.classList.toggle('active', dot === btn));
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }

    // 모션 레이어 — 모든 페이지가 이 파일을 불러오므로 여기서 공통 CSS/JS를 붙입니다.
    if (!document.querySelector('link[href*="css/motion.css"]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'css/motion.css?v=1';
        document.head.appendChild(css);
    }
    if (!document.querySelector('script[src*="js/motion.js"]')) {
        const js = document.createElement('script');
        js.src = 'js/motion.js?v=1';
        js.defer = true;
        document.head.appendChild(js);
    }
})();
