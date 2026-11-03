// 실행 전 점검: 프로그램이 이미 다른 검은 창에서 켜져 있으면 한국어로 알려 주고 멈춘다.
import net from 'node:net';

const ports = [Number(process.env.PORT || 8787), 5173];

const busy = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e) => resolve(e.code === 'EADDRINUSE'));
    s.once('listening', () => s.close(() => resolve(false)));
    s.listen(port, '127.0.0.1');
  });

const taken = [];
for (const p of ports) if (await busy(p)) taken.push(p);

if (taken.length) {
  console.error('\n⚠️  프로그램이 이미 다른 검은 창에서 실행 중입니다.');
  console.error('   → 브라우저에서 http://localhost:5173 을 새로고침해 보세요. 그대로 쓰시면 됩니다.');
  console.error('   → 새로 켜고 싶으면, 열려 있는 검은 창을 모두 닫은 뒤 한 번만 다시 실행하세요.\n');
  process.exit(1);
}
