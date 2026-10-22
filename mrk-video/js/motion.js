// 화면 움직임 모음 — 키네틱 타이포(흐릿함+넓은 자간 → 또렷+좁은 자간), 패널 떠오르기, 화면 전환, 상단 진행선
// 모든 움직임은 Web Animations API 로 돌리고, "움직임 줄이기" 설정이면 바로 최종 상태로 둡니다.

const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
export const EASE_SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';

/**
 * 제목 글자를 단어 단위로 쪼개 순서대로 들여보냅니다. `*강조*`는 파란 글씨로, 옆에서 밀려 들어옵니다.
 * 같은 요소에 다시 부르면 원문(data-kinetic)으로 되돌린 뒤 다시 움직입니다.
 */
export function kinetic(el, { delay = 0, stagger = 55, duration = 620 } = {}) {
  if (!el) return Promise.resolve();
  // 원문은 data-kinetic-src 에 보관(HTML 의 data-kinetic 은 표시용 빈 속성이라 쓰지 않는다)
  const raw = el.dataset.kineticSrc ?? el.textContent;
  el.dataset.kineticSrc = raw;
  el.textContent = '';
  el.classList.add('kinetic');
  const frag = document.createDocumentFragment();
  const anims = [];
  let i = 0;
  raw.split('\n').forEach((line, li) => {
    if (li) frag.append(document.createElement('br'));
    let hl = false;
    for (const part of line.split('*')) {
      if (part) {
        for (const word of part.split(/(\s+)/)) {
          if (!word) continue;
          if (/^\s+$/.test(word)) { frag.append(document.createTextNode(' ')); continue; }
          const span = document.createElement('span');
          span.className = 'k-word' + (hl ? ' k-hl' : '');
          span.textContent = word;
          frag.append(span);
          if (!reduce()) {
            const from = hl
              ? { opacity: 0, transform: 'translateX(26px)', filter: 'blur(10px)', letterSpacing: '0.12em' }
              : { opacity: 0, transform: 'translateY(18px)', filter: 'blur(12px)', letterSpacing: '0.18em' };
            anims.push(span.animate([from, { opacity: 1, transform: 'none', filter: 'blur(0)', letterSpacing: 'var(--k-ls, -0.03em)' }],
              { duration, delay: delay + i * stagger, easing: EASE_OUT, fill: 'both' }));
          }
          i++;
        }
      }
      hl = !hl;
    }
  });
  el.append(frag);
  return Promise.all(anims.map((a) => a.finished.catch(() => {})));
}

/** 패널·카드를 아래에서 흐릿하게 떠오르게, 차례대로. */
export function rise(elements, { delay = 0, stagger = 70, duration = 560, y = 22 } = {}) {
  const list = [...elements].filter(Boolean);
  if (reduce()) return Promise.resolve();
  return Promise.all(list.map((el, i) => el.animate(
    [{ opacity: 0, transform: `translateY(${y}px)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration, delay: delay + i * stagger, easing: EASE_OUT, fill: 'both' },
  ).finished.catch(() => {})));
}

/** UI 칩이 옆에서 튕기듯 들어옵니다(레퍼런스의 "서류 카드"). */
export function popIn(elements, { delay = 0, stagger = 110, duration = 520 } = {}) {
  const list = [...elements].filter(Boolean);
  if (reduce()) return Promise.resolve();
  return Promise.all(list.map((el, i) => el.animate(
    [{ opacity: 0, transform: 'translateY(14px) scale(.92)' }, { opacity: 1, transform: 'none' }],
    { duration, delay: delay + i * stagger, easing: EASE_SPRING, fill: 'both' },
  ).finished.catch(() => {})));
}

/** 밑줄이 왼쪽에서 그어집니다. */
export function underline(el, { delay = 0, duration = 500 } = {}) {
  if (!el || reduce()) return;
  el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, delay, easing: EASE_OUT, fill: 'both' });
}

/** 화면 전환: 나가는 화면은 왼쪽으로 밀리며 흐려지고, 들어오는 화면은 오른쪽에서 또렷해집니다. */
export async function swapViews(outEl, inEl, dir = 1) {
  if (reduce() || !outEl) {
    if (outEl) outEl.hidden = true;
    inEl.hidden = false;
    return;
  }
  const leave = outEl.animate(
    [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateX(${-28 * dir}px)`, filter: 'blur(8px)' }],
    { duration: 220, easing: 'ease-in', fill: 'forwards' },
  );
  await leave.finished.catch(() => {});
  outEl.hidden = true;
  leave.cancel();
  inEl.hidden = false;
  inEl.animate(
    [{ opacity: 0, transform: `translateX(${34 * dir}px)`, filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
    { duration: 420, easing: EASE_OUT, fill: 'both' },
  );
}

/** 상단 파란 진행선: 화면이 바뀔 때 0 → 100% 로 긋습니다. */
export function topline() {
  const bar = document.getElementById('topline');
  if (!bar) return;
  bar.getAnimations().forEach((a) => a.cancel());
  if (reduce()) { bar.style.transform = 'scaleX(1)'; return; }
  bar.animate([{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: .75 }, { transform: 'scaleX(1)', opacity: 0 }],
    { duration: 900, easing: EASE_OUT, fill: 'forwards' });
}

/** 스크롤해 들어올 때 한 번 떠오르게(사례 화면). */
export function revealOnScroll(root) {
  const targets = root.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || reduce()) {
    targets.forEach((t) => t.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const t = e.target;
      io.unobserve(t);
      t.classList.add('is-in');
      const kids = t.querySelectorAll('[data-rise]');
      rise(kids, { stagger: 80 });
      const chips = t.querySelectorAll('[data-pop]');
      popIn(chips, { delay: 180 });
      const title = t.querySelector('[data-kinetic-title]');
      if (title) kinetic(title, { delay: 60 });
      const ul = t.querySelector('[data-underline]');
      if (ul) underline(ul, { delay: 420 });
    }
  }, { threshold: 0.28 });
  targets.forEach((t) => io.observe(t));
}

/** 숫자가 0에서 목표값까지 올라갑니다. */
export function countUp(el, to, { duration = 900, suffix = '' } = {}) {
  if (!el) return;
  if (reduce()) { el.textContent = to + suffix; return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / duration);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * e) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 버튼 누름 느낌(스케일) — 전역 한 번만 걸어 둡니다. */
export function wirePressFeedback() {
  if (reduce()) return;
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn, .nav a, .case-cta');
    if (!b) return;
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(.965)' }, { transform: 'scale(1)' }], { duration: 260, easing: EASE_SPRING });
  }, { passive: true });
}
