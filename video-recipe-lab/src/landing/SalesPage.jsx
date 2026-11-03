import { Fragment, useEffect, useState } from 'react';
import Thumb from './Thumb.jsx';
import { anatomy, brand, faq, flow, genres, hero, lastCta, offer, proofs, results, reviews, stack } from './content.js';
import './sales.css';

const won = (n) => `${n.toLocaleString('ko-KR')}원`;
const START = '#/studio'; // 원본은 /checkout?plan=bundle (PortOne 결제) — 클론에서는 스튜디오로 보낸다

function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, new Date(deadline).getTime() - now);
  if (!left) return '마감';
  const d = Math.floor(left / 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d}일 ${pad(Math.floor(left / 3600000) % 24)}:${pad(Math.floor(left / 60000) % 60)}:${pad(Math.floor(left / 1000) % 60)}`;
}

// 해부 주석 띠 — "해부 주석 보기"가 켜져 있을 때만
function Xray({ k, on }) {
  if (!on) return null;
  const a = anatomy[k];
  return (
    <aside className="xray">
      <div className="xrayIn">
        <span className="xrayNo">해부 · {k}</span>
        <p className="xrayRole">{a.role}</p>
        <ul>
          {a.tactics.map((t) => (
            <li key={t} className={t.startsWith('⚠') ? 'warn' : ''}>{t}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ["앞", "강조", "뒤"] 형태의 제목
const Hl = ({ parts }) => (
  <>
    {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
  </>
);

export default function SalesPage({ xray }) {
  const left = useCountdown(offer.deadline);
  const monthly = Math.round(offer.now / offer.months);
  const [jump, setJump] = useState(null);

  return (
    <div className={`sp${xray ? ' xr' : ''}`}>
      {/* ── HERO ─────────────────────────────── */}
      <div className="dark heroDark">
        <div className="wrap">
          <nav className="nav">
            <a href="#/landing" className="logo">
              {brand.name} <em>{brand.accent}</em>
            </a>
            <span className="navR">
              <a href="#/teardown">문의하기</a>
              <a href="#/teardown">로그인</a>
            </span>
          </nav>
          <section className="hero">
            <div>
              <h1>
                <mark className="lime">AI 영상 한 편</mark>으로
                <br />
                <mark className="lime">800만 원</mark> 수익
              </h1>
              <p className="heroSub">{hero.sub}</p>
              <a className="btn heroBtn" href={START}>{hero.cta}</a>
              <div className="price">
                <s>{won(offer.was)}</s>
                <strong>{won(offer.now)}</strong>
              </div>
              <p className="small">
                <b>{offer.bonusLine}</b> · {offer.deadlineLabel}
              </p>
            </div>
            <div className="heroThumbs">
              {hero.thumbs.map((t) => (
                <Thumb key={t.l1} {...t} />
              ))}
            </div>
          </section>
        </div>
      </div>
      <Xray k="hero" on={xray} />

      {/* ── PROOF ─────────────────────────────── */}
      <section className="sec alt">
        <div className="wrap">
          <h2><Hl parts={proofs.title} /></h2>
          <div className="proofs">
            {proofs.items.map((p) => (
              <div className="card proof" key={p.big}>
                <p className="pLabel">{p.label}</p>
                <p className="pNum">{p.big}</p>
                <div className="pScreen">
                  <span>예상 수익 ◷</span>
                  <b>{p.screen}</b>
                  <em>(원본: 유튜브 스튜디오 캡처 이미지)</em>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Xray k="proofs" on={xray} />

      {/* ── GENRES ─────────────────────────────── */}
      <section className="sec">
        <div className="wrap">
          <h2>{genres.title}</h2>
          <div className="gallery">
            {genres.items.map((g) => (
              <figure key={g.genre}>
                <Thumb {...g} />
                <figcaption>{g.genre}</figcaption>
              </figure>
            ))}
            <figure>
              <div className="thumb more">
                {genres.more[0]}
                <br />
                {genres.more[1]}
              </div>
            </figure>
          </div>
        </div>
      </section>
      <Xray k="genres" on={xray} />

      {/* ── FLOW ─────────────────────────────── */}
      <section className="sec alt">
        <div className="wrap">
          <h2><Hl parts={flow.title} /></h2>
          <div className="card flow">
            <div className="flowHead">
              <span className="fhIn">{flow.invest}</span>
              <span className="fhArrow">➔</span>
              <span className="fhOut">{flow.result}</span>
            </div>
            <div className="flowRow">
              {flow.steps.map((s, i) => (
                <Fragment key={s.text}>
                  <div className={`fstep${s.icon === 'spin' ? ' now' : ''}`}>
                    <span className="ficon">{s.icon === 'spin' ? <i className="spin" /> : s.icon}</span>
                    {s.text}
                  </div>
                  {i < flow.steps.length - 1 && <span className="farrow">→</span>}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>
      <Xray k="flow" on={xray} />

      {/* ── STACK ─────────────────────────────── */}
      <div className="dark stackBand">
        <div className="wrap">
          <h2 className="stackTitle"><Hl parts={stack.title} /></h2>
          <p className="stackSub">{stack.sub}</p>
          <div className="gifts">
            {stack.gifts.map((g) => (
              <div className="gift" key={g.no}>
                <span className="giftNo">{g.no}</span>
                <p className="giftName">
                  {g.name[0]}
                  <br />
                  {g.name[1]}
                </p>
                <span className="giftTag">{g.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Xray k="stack" on={xray} />

      {/* ── REVIEWS ─────────────────────────────── */}
      <section className="sec">
        <div className="wrap">
          <h2><Hl parts={reviews.title} /></h2>
          <div className="reviews">
            {reviews.items.map((r) => (
              <div className="card rv" key={r.who}>
                <p>"{r.q}"</p>
                <span>{r.who}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Xray k="reviews" on={xray} />

      {/* ── FAQ + ASK ─────────────────────────────── */}
      <section className="sec alt">
        <div className="wrap">
          <div className="faq">
            {faq.map((f) => (
              <div className="card q" key={f.q}>
                <b>{f.q}</b>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
          <Xray k="faq" on={xray} />
          <div className="card askBox">
            <div>
              <b>시작하기 전에 물어보고 싶은 게 있으세요?</b>
              <span>카톡으로 바로 답해 드립니다</span>
            </div>
            <div className="askBtns">
              <a className="ebookBtn" href="#/teardown">📘 무료 전자책 받기</a>
              <a className="kbtn" href="#/teardown">💬 카카오톡으로 물어보기</a>
            </div>
          </div>
        </div>
      </section>
      <Xray k="ask" on={xray} />

      {/* ── RESULTS ─────────────────────────────── */}
      <section className="sec">
        <div className="wrap">
          <h2><Hl parts={results.title} /></h2>
          <p className="secSub">{results.sub}</p>
          <div className="results">
            {results.items.map((r) => (
              <div className={`card result${r.wide ? ' full' : ''}`} key={r.title}>
                <div className="rHead">
                  <b>{r.title}</b>
                  <span>{r.len}</span>
                </div>
                <Thumb l1={r.l1} l2={r.l2} hue={r.hue} big>
                  <span className="play">▶</span>
                  {jump?.title === r.title && <span className="jumpTo">▶ {jump.at} 장면으로 이동 (원본: 유튜브 임베드 &start=)</span>}
                </Thumb>
                <div className="chips">
                  {r.chips.map(([label, at]) => (
                    <button key={label} onClick={() => setJump({ title: r.title, at })}>
                      {label} <b>{at}</b>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Xray k="results" on={xray} />

      {/* ── LAST CTA ─────────────────────────────── */}
      <section className="dark lastCta">
        <div className="wrap">
          <h2><Hl parts={lastCta.title} /></h2>
          <p className="lastSub">{lastCta.sub}</p>
          <div className="lastPrice">
            <span className="pct">{offer.pct}%</span>
            <s>{won(offer.was)}</s>
            <strong>{won(offer.now)}</strong>
          </div>
          <p className="small">
            {offer.bonusLine} · {offer.months}개월 할부 시 월 {monthly.toLocaleString('ko-KR')}원 · 한 번 결제, 매달 나가는 돈 없음
          </p>
          <a className="btn lastBtn" href={START}>{lastCta.cta}</a>
        </div>
      </section>
      <Xray k="last" on={xray} />

      <footer className="foot">
        <div className="wrap">
          <p>상호 · 대표 · 사업자등록번호 · 통신판매업신고번호 · 주소 · 고객 문의 이메일 (전자상거래법 필수 표기 자리)</p>
          <p>이용약관 · 개인정보처리방침 · 환불정책</p>
        </div>
      </footer>
      <Xray k="foot" on={xray} />
      <Xray k="bar" on={xray} />

      {/* ── STICKY BAR ─────────────────────────────── */}
      <div className="bar">
        <div className="wrap barIn">
          <div className="barTxt">
            <span className="pct">{offer.pct}%</span>
            <s>{won(offer.was)}</s>
            <strong>{won(offer.now)}</strong>
            <span className="barMeta">
              {offer.bonusLine} · {offer.deadlineLabel} · 남은 시간 <b>{left}</b>
            </span>
          </div>
          <div className="barBtns">
            <a className="barKakao" href="#/teardown">💬<span> 문의</span></a>
            <a className="btn" href={START}>지금 시작하기 →</a>
          </div>
        </div>
      </div>
    </div>
  );
}
