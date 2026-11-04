// 사용법: COMP=HowTo169 node stills2.mjs 1.5 4.6 ...  -> stills2/<COMP>_sNNNN.png
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const browserExecutable = process.env.CHROME || undefined;
const id = process.env.COMP || 'HowTo169';
const serveUrl = await bundle({entryPoint: path.resolve(process.env.ENTRY || 'src/howto.tsx')});
const composition = await selectComposition({serveUrl, id, browserExecutable});
fs.mkdirSync('stills2', {recursive: true});
for (const s of process.argv.slice(2)) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * 30));
  const output = `stills2/${id}_s${String(Math.round(Number(s) * 10)).padStart(4, '0')}.png`;
  await renderStill({composition, serveUrl, frame, output, scale: 0.5, browserExecutable});
  console.log('ok', s, output);
}
