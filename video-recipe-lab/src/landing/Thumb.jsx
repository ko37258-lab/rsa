// 원본 썸네일 이미지는 복제하지 않고, "정보채널 썸네일 공식"(배경 + 흰 글씨 한 줄 + 강조색 큰 글씨 한 줄)만 CSS 로 재현
export default function Thumb({ l1, l2, tag, hue = 160, big = false, children }) {
  const bg = {
    background: `radial-gradient(circle at 72% 28%, hsl(${hue} 70% 62% / .9), transparent 55%),
      radial-gradient(circle at 15% 85%, hsl(${(hue + 40) % 360} 60% 40% / .8), transparent 50%),
      linear-gradient(135deg, hsl(${hue} 45% 14%), hsl(${hue} 55% 30%))`,
  };
  return (
    <div className={`thumb${big ? ' thumbBig' : ''}`} style={bg}>
      {tag && <span className="thumbTag">{tag}</span>}
      <div className="thumbText">
        {l1 && <span className="thumbL1">{l1}</span>}
        {l2 && <span className="thumbL2">{l2}</span>}
      </div>
      {children}
    </div>
  );
}
