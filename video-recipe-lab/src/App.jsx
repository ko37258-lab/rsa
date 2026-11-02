import { useEffect, useState } from 'react';
import SalesPage from './landing/SalesPage.jsx';
import Studio from './studio/Studio.jsx';
import Teardown from './teardown/Teardown.jsx';

const TABS = [
  { hash: '#/landing', label: '① 랜딩페이지 클론' },
  { hash: '#/studio', label: '② 영상 생성 스튜디오' },
  { hash: '#/teardown', label: '③ 해부 리포트' },
];

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/landing');
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || '#/landing');
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

  return (
    <>
      <nav className="labbar">
        <b>Video Recipe Lab</b>
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
      {hash.startsWith('#/studio') ? <Studio /> : hash.startsWith('#/teardown') ? <Teardown /> : <SalesPage xray={xray} />}
    </>
  );
}
