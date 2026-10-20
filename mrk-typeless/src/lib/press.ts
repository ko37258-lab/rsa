// 누를 때마다 손끝 위치에서 물결이 퍼지는 효과. 버튼·칩·마이크에 한 번에 적용합니다.
const SELECTOR = ".btn, .seg__opt, .key-link, .engine, .chip, .tier__item";

export function installPressEffects(): void {
  if (typeof window === "undefined") return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (reduced?.matches || e.button !== 0) return;
      const target = (e.target as Element | null)?.closest<HTMLElement>(SELECTOR);
      if (!target || (target as HTMLButtonElement).disabled) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      target.appendChild(ripple);
      const anim = ripple.animate(
        [
          { transform: "scale(0)", opacity: 0.35 },
          { transform: "scale(1)", opacity: 0 },
        ],
        { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
      anim.onfinish = () => ripple.remove();
    },
    { passive: true },
  );
}
