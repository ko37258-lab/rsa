// Claude 아티팩트로 올릴 페이지를 만듭니다.
// 아티팩트는 <!doctype>/<html>/<head>/<body>를 스스로 감싸므로, index.html에서 표시해 둔 부분만 꺼내 붙입니다.
// 결과: dist-artifact/index.html  (css/, js/ 파일은 원래 경로 그대로 함께 올립니다)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const between = (a, b) => {
  const i = html.indexOf(a);
  const j = html.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error(`표시(${a})를 찾지 못했습니다.`);
  return html.slice(i + a.length, j).trim();
};

const head = between('<!-- ARTIFACT:BEGIN -->', '<!-- ARTIFACT:END -->');
const body = between('<!-- ARTIFACT:BODY -->', '<!-- ARTIFACT:BODY_END -->');
const outDir = join(root, 'dist-artifact');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'index.html'), `${head}\n${body}\n`);
console.log('dist-artifact/index.html 작성 완료');
