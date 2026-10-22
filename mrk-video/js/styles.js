// 쇼츠 스타일 모델 — styles-data.js 의 데이터를 읽어 프로젝트에 입히는 도구.
// 스타일은 "시각 설정"만 바꾸고 장면(사진·자막)은 건드리지 않습니다.

import { STYLE_DATA } from './styles-data.js';

/** 사양서 1절의 시각 필드만 골라 냅니다(스타일이 장면·소리 등 다른 값을 덮어쓰지 않게). */
const VISUAL_KEYS = [
  'aspect', 'template', 'captionAnim', 'captionStyle', 'overlay', 'transition', 'motion', 'titleMode',
  'bandColor', 'panelColor', 'textColor', 'inkColor', 'highlightColor', 'font', 'captionSize', 'showProgress',
];

function pickVisual(visual = {}) {
  const out = {};
  for (const k of VISUAL_KEYS) if (visual[k] !== undefined) out[k] = visual[k];
  return out;
}

/** 스타일 한 개: 데이터 항목 + apply(p). apply 는 p 에 시각 설정을 입히고 p 를 돌려줍니다(장면은 그대로). */
export function makeStyle(data) {
  const visual = pickVisual(data.visual);
  return {
    ...data,
    visual,
    apply(p) {
      return Object.assign(p, visual);
    },
  };
}

export const STYLES = STYLE_DATA.map(makeStyle);

export const findStyle = (id) => STYLES.find((s) => s.id === id) || null;

/** base 프로젝트를 복사해 style 을 입힌 새 프로젝트를 돌려줍니다(base 는 바뀌지 않음). 장면 배열은 얕게 복사합니다. */
export function styleProject(base, style) {
  let st = typeof style === 'string' ? findStyle(style) : style;
  if (st && typeof st.apply !== 'function') st = makeStyle(st); // apply 가 없는 날 데이터도 받습니다
  const out = {
    ...base,
    ending: base.ending ? { ...base.ending } : base.ending,
    scenes: (base.scenes || []).map((s) => ({ ...s })),
  };
  return st ? st.apply(out) : out;
}
