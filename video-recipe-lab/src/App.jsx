import { useEffect, useState } from 'react';
import SalesPage from './landing/SalesPage.jsx';
import Studio from './studio/Studio.jsx';
import Teardown from './teardown/Teardown.jsx';

const TABS = [
  { hash: '#/studio', label: 'K-영상제작기' },
  { hash: '#/landing', label: '원본 랜딩 해부' },
  { hash: '#/teardown', label: '해부 리포트' },
];

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/studio');
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || '#/studio');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const [xray, setXray] = useState(true);
  const [mode, setMode] = useState(null); // 'member' | 'lab'

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((s) => setMode(s.appMode || 'lab'))
      .catch(() => setMode('lab'));
  }, []);

  useEffect(() => {
    document.title = 'MR.K-VR · K-영상제작기';
  }, [mode]);

  if (mode === null) return null;

  // 회원용: K-영상제작기 화면만
  if (mode === 'member') {
    return (
      <>
        <nav className="labbar">
          <b>MR.K-VR<small>K-영상제작기</small></b>
          <span className="labsp" />
          <span className="labNote">고상철 · ko372.com 도구함</span>
        </nav>
        <Studio member />
      </>
    );
  }

  return (
    <>
      <nav className="labbar">
        <b>MR.K-VR</b>
        {TABS.map((t) => (
          <a key={t.hash} href={t.hash} className={hash.startsWith(t.hash) ? 'on' : ''}>
            {t.label}
          </a>
        ))}
        <span className="labsp" />
        {hash.startsWith('#/landing') && (
          <label>
            <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} /> 해부 주석 보기
          </label>
        )}
      </nav>
      {hash.startsWith('#/landing') ? <SalesPage xray={xray} /> : hash.startsWith('#/teardown') ? <Teardown /> : <Studio />}
    </>
  );
}
