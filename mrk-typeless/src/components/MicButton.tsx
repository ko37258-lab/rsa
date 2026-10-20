import { useRef } from "react";

interface Props {
  listening: boolean;
  disabled?: boolean;
  size?: "large" | "small";
  pulse: number;
  label: string;
  /** 길게 누르고 있다가 뗐을 때(누르는 동안만 받아쓰기) */
  onHoldEnd: () => void;
  /** 짧게 눌렀을 때(켜기/끄기) */
  onToggle: () => void;
  onPressStart: () => void;
}

const HOLD_MS = 350;

/** 길게 누르면 누르는 동안만, 짧게 누르면 다시 누를 때까지 받아씁니다. */
export function MicButton({ listening, disabled, size = "large", pulse, label, onHoldEnd, onToggle, onPressStart }: Props) {
  const downAtRef = useRef<number | null>(null);
  const startedHereRef = useRef(false);

  return (
    <button
      type="button"
      className={`mic mic--${size}${listening ? " is-live" : ""}`}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={label}
      data-pulse={pulse % 2}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        downAtRef.current = Date.now();
        startedHereRef.current = !listening;
        if (!listening) onPressStart();
      }}
      onPointerUp={() => {
        const downAt = downAtRef.current;
        downAtRef.current = null;
        if (downAt === null) return;
        const held = Date.now() - downAt >= HOLD_MS;
        if (startedHereRef.current) {
          if (held) onHoldEnd();
        } else {
          onToggle();
        }
      }}
      onPointerCancel={() => {
        if (downAtRef.current !== null && startedHereRef.current) onHoldEnd();
        downAtRef.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (listening) onToggle();
          else onPressStart();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mic__icon">
        <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="mic__ring" aria-hidden="true" />
    </button>
  );
}

/** 말하는 동안 움직이는 소리 막대 */
export function Waveform({ live, pulse }: { live: boolean; pulse: number }) {
  const bars = 18;
  return (
    <div className={`wave${live ? " is-live" : ""}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        // 음성인식 결과가 들어올 때마다 막대 높이가 바뀝니다.
        const seed = Math.sin((i + 1) * 12.9898 + pulse * 78.233) * 43758.5453;
        const h = live ? 0.25 + (seed - Math.floor(seed)) * 0.75 : 0.18;
        return <span key={i} style={{ transform: `scaleY(${h.toFixed(2)})` }} />;
      })}
    </div>
  );
}
