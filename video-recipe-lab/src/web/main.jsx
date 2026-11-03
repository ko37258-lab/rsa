import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../App.jsx';
import '../global.css';
import { installShim } from './shim.js';

installShim();

// 도구함 공개 스위치와 같은 판단: 열렸거나 최고관리자면 연다. 확인 실패는 닫힘. 내 PC 시험 때는 건너뛴다
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

function Gate() {
  const [open, setOpen] = useState(LOCAL ? true : null);
  useEffect(() => {
    if (LOCAL) return;
    fetch('/api/gate?name=mrkvr&route=status', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setOpen(Boolean(s?.visible)))
      .catch(() => setOpen(false));
  }, []);
  if (open === null) return <p style={{ padding: 40, textAlign: 'center' }}>확인하는 중입니다…</p>;
  if (!open) {
    return (
      <p style={{ padding: 40, textAlign: 'center', lineHeight: 1.7 }}>
        아직 열리지 않은 도구입니다. <a href="/mrk-vr/">안내 페이지로 돌아가기</a>
      </p>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Gate />
  </React.StrictMode>,
);
