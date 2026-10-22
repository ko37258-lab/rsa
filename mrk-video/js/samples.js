// 예시 이미지 — assets/samples/ 의 실사 이미지(힉스필드로 생성)를 쓰고, 없으면 코드로 그린 그림으로 대신합니다.

import { loadImage, makeSampleImage } from './util.js';

export const SAMPLE_DIR = 'assets/samples/';

/** id → { file, fallback(그림 종류), caption } */
export const SAMPLES = {
  's01-land-zoning': { fallback: 'land', caption: '농촌 토지 항공 사진' },
  's02-landlocked': { fallback: 'road', caption: '도로 없는 맹지' },
  's03-permit-site': { fallback: 'permit', caption: '개발행위허가 뒤 공사 준비' },
  's04-city-commercial': { fallback: 'city', caption: '신도시 근린상가' },
  's05-apartment': { fallback: 'city', caption: '아파트 단지' },
  's06-consultant-desk': { fallback: 'land', caption: '컨설턴트 책상' },
  'c01-product-main': { fallback: 'product', caption: '스킨케어 세럼' },
  'c02-product-sub': { fallback: 'tag', caption: '제품 패키지' },
  'c03-listing-main': { fallback: 'product', caption: '아파트 거실' },
  'c04-listing-sub': { fallback: 'city', caption: '건물 외관' },
  'h01-hero-land': { fallback: 'land', caption: '개발 예정 토지' },
  'h02-hero-studio': { fallback: 'product', caption: '쇼츠 촬영 책상' },
};

const cache = new Map();

/** 예시 이미지 한 장. 실사 파일이 없으면 그림으로 대신하고 img.dataset.real 로 구분합니다. */
export function sample(id, size = 1200) {
  if (cache.has(id)) return cache.get(id);
  const meta = SAMPLES[id] || { fallback: 'land', caption: id };
  const p = loadImage(`${SAMPLE_DIR}${id}.jpg`)
    .then((img) => { img.dataset.name = `예시-${meta.caption}.jpg`; img.dataset.sample = '1'; img.dataset.real = '1'; return img; })
    .catch(() => makeSampleImage(meta.fallback, size, size).then((img) => { img.dataset.name = `예시-${meta.caption}.jpg`; return img; }));
  cache.set(id, p);
  return p;
}

export const sampleUrl = (id) => `${SAMPLE_DIR}${id}.jpg`;

/** 쇼츠 예시 장면 — 토지투자 3원칙 */
export const SHORTS_CASE = {
  title: '공법의 신이 알려주는\n*토지투자* 3원칙',
  scenes: [
    { img: 's01-land-zoning', caption: '땅을 살 때는\n*용도지역*부터 확인하세요', duration: 3 },
    { img: 's02-landlocked', caption: '*도로*에 붙지 않은 맹지는\n건축이 어렵습니다', duration: 3 },
    { img: 's03-permit-site', caption: '*개발행위허가*가 나는 땅인지\n꼭 알아보세요', duration: 3 },
    { img: null, caption: '세 가지만 지켜도\n*토지투자* 실패가 줄어듭니다', duration: 3.6 },
    { img: 's05-apartment', caption: '궁금한 땅은\n*MR.K*에게 물어보세요', duration: 3 },
  ],
};

/** 합성 예시 — 메인 2장 + 서브 1장씩 짝짓기 */
export const COMPOSE_CASE = {
  mains: ['c01-product-main', 'c03-listing-main'],
  subs: ['c02-product-sub', 'c04-listing-sub'],
  badge: '1+1 특가',
};

/** 다운로드 예시 — 같은 폴더의 실사 이미지를 주소로 받아 봅니다(같은 출처라 어디서든 동작). */
export const DOWNLOAD_CASE = [
  ['A1001', sampleUrl('s01-land-zoning')],
  ['A1002', sampleUrl('s04-city-commercial')],
  ['A1003', sampleUrl('s05-apartment')],
  ['A1004', sampleUrl('c01-product-main')],
];
