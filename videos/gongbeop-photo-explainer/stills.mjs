// 사용법: node stills.mjs 1.5 4.5 11.8 ...  (초 단위) -> stills/sNNN.png
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const browserExecutable = process.env.CHROME || undefined;
const serveUrl = await bundle({entryPoint: path.resolve('src/index.tsx')});
const composition = await selectComposition({serveUrl, id: 'Decor', browserExecutable});
fs.mkdirSync('stills', {recursive: true});
for (const s of process.argv.slice(2)) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * 30));
  const output = `stills/s${String(Math.round(Number(s) * 10)).padStart(4, '0')}.png`;
  await renderStill({composition, serveUrl, frame, output, scale: 0.5, browserExecutable});
  console.log('ok', s, output);
}
