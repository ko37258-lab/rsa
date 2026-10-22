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
  // 마우스·손가락으로 누른 버튼에는 포커스를 남기지 않습니다. 그래야 다음에 Space를 누를 때
  // 그 버튼이 다시 눌리지 않고 '말하기'로 갑니다. 키보드(Tab)로 간 포커스는 그대로 둡니다.
  document.addEventListener(
    "pointerup",
    (e) => {
      const target = (e.target as Element | null)?.closest?.("button");
      if (target && !target.closest(".mic") && document.activeElement === target) target.blur();
    },
    { passive: true },
  );
}
