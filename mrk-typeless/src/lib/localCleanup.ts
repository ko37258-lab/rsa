// AI 없이도 바로 쓸 수 있는 기본 정리.
// 의미가 없는 감탄사와 연달아 반복된 말만 지우고, 문장을 고쳐 쓰지는 않습니다.
// (말을 바꾼 부분이나 목록 정리는 AI 정리에서 처리합니다.)

const FILLER = /^(음+|으+음+|어+|으+|아+|에+|흠+|um+|uh+|erm+|hmm+)$/i;
const EDGE_PUNCT = /^[\s"'“”‘’(]+|[\s,.…!?~"'“”‘’)]+$/g;
const SENTENCE_END = /[.!?…]+$/;
// 일부러 겹쳐 말하는 부사: "정말 정말", "하나 하나"는 더듬은 말이 아닙니다.
const REDUPLICATED = new Set(["정말", "하나", "따로", "매일", "빨리", "자주", "가끔", "조금", "많이", "아주", "너무", "각각", "천천히", "차근차근", "꼭", "잘", "더", "또", "다시"]);

/** 바로 이어서 반복한 말 가운데 더듬은 말로 볼 것: 짧은 말(두 글자 이하)이면서 겹쳐 쓰는 부사가 아닌 것 */
function isStutter(core: string): boolean {
  return core.length <= 2 && !REDUPLICATED.has(core);
}

function bare(token: string): string {
  return token.replace(EDGE_PUNCT, "");
}

export interface MarkedToken {
  text: string;
  /** 군더더기 말이거나 바로 이어서 반복한 말 */
  removed: boolean;
}

/** 줄마다 낱말을 나누고, 지울 낱말(감탄사·반복)에 표시합니다. 정리 중 화면의 '줄 긋기'에 씁니다. */
export function markFillers(raw: string): MarkedToken[][] {
  return raw.split(/\n/).map((line) => {
    const tokens: MarkedToken[] = [];
    let lastKept = -1;
    for (const text of line.split(/\s+/).filter(Boolean)) {
      const core = bare(text);
      if (core && FILLER.test(core)) {
        tokens.push({ text, removed: true });
        // "확인했습니다 음." → 마침표는 앞 말에 남깁니다.
        const tail = SENTENCE_END.exec(text)?.[0];
        if (tail && lastKept >= 0 && !SENTENCE_END.test(tokens[lastKept].text)) tokens[lastKept].text += tail;
        continue;
      }
      const prev = lastKept >= 0 ? tokens[lastKept] : undefined;
      if (prev && core && isStutter(core) && bare(prev.text).toLowerCase() === core.toLowerCase()) {
        // "그 그 상가", "제가 제가" 처럼 바로 이어서 반복한 말: 앞의 것을 지움
        prev.removed = true;
      }
      tokens.push({ text, removed: false });
      lastKept = tokens.length - 1;
    }
    return tokens;
  });
}

export function localCleanup(raw: string): { text: string; removed: number } {
  let removed = 0;
  const lines = markFillers(raw).map((tokens) => {
    removed += tokens.filter((t) => t.removed).length;
    return tokens
      .filter((t) => !t.removed)
      .map((t) => t.text)
      .join(" ")
      .replace(/\s+([,.!?…])/g, "$1");
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}
