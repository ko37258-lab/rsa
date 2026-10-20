/** 손글씨 메모와 손으로 그린 화살표. 처음 보일 때 화살표가 그려집니다. */
export function HandNote({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`hand-note ${className}`} aria-hidden="true">
      <span className="hand-note__text">{text}</span>
      <svg className="hand-note__arrow" viewBox="0 0 64 70" width="46" height="50">
        <path d="M8 6 C 30 4, 52 18, 44 40 C 40 50, 34 56, 30 62" />
        <path d="M22 54 L 30 63 L 38 55" />
      </svg>
    </div>
  );
}

/** 글자 밑에 손으로 그은 듯한 밑줄 */
export function Scribble({ className = "" }: { className?: string }) {
  return (
    <svg className={`scribble ${className}`} viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 8 C 40 3, 70 10, 110 6 S 170 3, 198 7" />
    </svg>
  );
}
