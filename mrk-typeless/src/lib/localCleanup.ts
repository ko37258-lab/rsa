// AI 없이도 바로 쓸 수 있는 기본 정리.
// 의미가 없는 감탄사와 연달아 반복된 말만 지우고, 문장을 고쳐 쓰지는 않습니다.
// (말을 바꾼 부분이나 목록 정리는 AI 정리에서 처리합니다.)

const FILLER = /^(음+|으+음+|어+|으+|아+|에+|흠+|um+|uh+|erm+|hmm+)$/i;
const EDGE_PUNCT = /^[\s"'“”‘’(]+|[\s,.…!?~"'“”‘’)]+$/g;

function bare(token: string): string {
  return token.replace(EDGE_PUNCT, "");
}

export function localCleanup(raw: string): { text: string; removed: number } {
  let removed = 0;
  const lines = raw.split(/\n/).map((line) => {
    const kept: string[] = [];
    for (const token of line.split(/\s+/).filter(Boolean)) {
      const core = bare(token);
      if (core && FILLER.test(core)) {
        removed++;
        continue;
      }
      const prev = kept[kept.length - 1];
      if (prev !== undefined && core && bare(prev).toLowerCase() === core.toLowerCase()) {
        // "그 그 상가", "제가 제가" 처럼 바로 이어서 반복한 말
        removed++;
        kept[kept.length - 1] = token;
        continue;
      }
      kept.push(token);
    }
    return kept.join(" ").replace(/\s+([,.!?…])/g, "$1");
  });
  return { text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed };
}
