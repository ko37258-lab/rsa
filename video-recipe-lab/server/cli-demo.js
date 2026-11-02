// 서버·화면 없이 파이프라인만 돌려보는 스크립트:  npm run demo:render
// API 키가 있으면 실제로 Claude 가 대본을 쓰고, 없으면 데모 대본으로 MP4 를 만든다.
import { startJob } from './jobs.js';
import { demoAnalysis } from './pipeline/demo.js';

const job = startJob({
  analysis: demoAnalysis,
  title: process.argv[2] || demoAnalysis.titles[0].text,
  topic: process.argv[3] || demoAnalysis.newTopic,
  minutes: 1,
  voice: process.env.DEMO_VOICE || 'silent',
  thumbnail: demoAnalysis.thumbnails[0],
  demo: process.env.DEMO_MODE === '1' || !process.argv[2],
});

let last = '';
job.on('update', (s) => {
  const line = s.steps.map((x) => `${x.status === 'done' ? '✔' : x.status === 'running' ? '…' : x.status === 'error' ? '✖' : '·'} ${x.label}${x.detail ? `(${x.detail})` : ''}`).join('  ');
  if (line !== last) console.log(line);
  last = line;
  if (s.status === 'done') {
    console.log('\n완성:', s.result.video, `(${s.result.seconds.toFixed(1)}초)`);
    console.log('썸네일:', s.result.thumbnail);
  }
  if (s.status === 'error') {
    console.error('\n실패:', s.error);
    process.exitCode = 1;
  }
});
