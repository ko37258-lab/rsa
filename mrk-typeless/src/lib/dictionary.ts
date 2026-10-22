export interface Replacement {
  from: string;
  to: string;
}

export interface Dictionary {
  /** 정확한 표기로 써야 하는 용어 (AI에게 전달) */
  terms: string[];
  /** 음성인식이 자주 틀리는 말 → 바른 표기 (AI 전에 바로 바꿈) */
  replacements: Replacement[];
}

// 기본 사전: 부동산공법·토지개발 용어와 미스터홈즈 고유명사
export const DEFAULT_DICTIONARY: Dictionary = {
  terms: [
    "미스터홈즈",
    "공법의 신",
    "용도지역",
    "용도지구",
    "용도구역",
    "건폐율",
    "용적률",
    "지구단위계획",
    "개발행위허가",
    "도시·군기본계획",
    "도시·군관리계획",
    "개발제한구역",
    "토지거래허가구역",
    "성장관리계획구역",
    "기반시설부담구역",
    "농지전용",
    "산지전용",
    "공시지가",
    "가로주택정비사업",
  ],
  replacements: [
    { from: "건폐률", to: "건폐율" },
    { from: "용적율", to: "용적률" },
    { from: "지구 단위 계획", to: "지구단위계획" },
    { from: "개발 행위 허가", to: "개발행위허가" },
    { from: "미스터 홈즈", to: "미스터홈즈" },
  ],
};

/** 바꿔쓰기 규칙을 글자 그대로 적용하고, 바꾼 횟수를 함께 돌려줍니다. */
export function applyReplacements(text: string, replacements: Replacement[]): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const { from, to } of replacements) {
    // 아직 바른 표기를 안 적은 규칙은 적용하지 않습니다 (적용하면 그 말이 통째로 지워짐).
    if (!from.trim() || !to.trim() || from === to) continue;
    const parts = out.split(from);
    count += parts.length - 1;
    out = parts.join(to);
  }
  return { text: out, count };
}
