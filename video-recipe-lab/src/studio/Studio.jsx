// 원본 프로그램의 4단계 흐름: 잘된 영상 주소 넣기 → 제목·썸네일·목소리 고르기 → 기다리기 → 완성 영상
import { useEffect, useRef, useState } from 'react';
import Thumb from '../landing/Thumb.jsx';
import './studio.css';

const STEP_NAMES = ['잘된 영상 주소 넣기', '제목·썸네일·목소리 고르기', '기다리기', '완성 영상'];
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `요청 실패 (${r.status})`), { data: j });
  return j;
}

export default function Studio() {
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ url: '', topic: '', transcript: '', showPaste: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [an, setAn] = useState(null); // 분석 결과
  const [pick, setPick] = useState({ title: '', thumb: 0, voice: 'silent', minutes: 1 });
  const [job, setJob] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    api('/api/status').then(setStatus).catch(() => setStatus({ offline: true }));
  }, []);

  const live = status?.providers?.claude;

  async function analyze(demo = false) {
    setBusy(true);
    setErr('');
    try {
      const r = await api('/api/analyze', { url: form.url, topic: form.topic, transcript: form.showPaste ? form.transcript : '', demo });
      setAn({ ...r, demo: demo || r.mode === 'demo' });
      setPick((p) => ({ ...p, title: r.analysis.titles[0]?.text || '', thumb: 0 }));
      setStep(1);
    } catch (e) {
      if (e.data?.needTranscript) setForm((f) => ({ ...f, showPaste: true }));
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function make() {
    setErr('');
    try {
      const th = an.analysis.thumbnails[pick.thumb];
      const { id } = await api('/api/jobs', {
        analysis: an.analysis, title: pick.title, topic: form.topic || an.analysis.newTopic,
        minutes: pick.minutes, voice: pick.voice, thumbnail: th, demo: an.demo,
      });
      setStep(2);
      const es = new EventSource(`/api/jobs/${id}/events`);
      es.onmessage = (ev) => {
        const s = JSON.parse(ev.data);
        setJob(s);
        if (s.status === 'done') {
          es.close();
          setStep(3);
        }
        if (s.status === 'error') es.close();
      };
    } catch (e) {
      setErr(e.message);
    }
  }

  const seek = (t) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.play();
    }
  };

  return (
    <div className="studio">
      <div className="wrap">
        <header className="stHead">
          <div>
            <h1>영상 생성 스튜디오</h1>
            <p>원본 프로그램(Windows 설치형)이 하는 일을 React + Node 로 다시 만든 것. 단계마다 무슨 일이 일어나는지 보이게 했습니다.</p>
          </div>
          <div className="pills">
            {status?.offline ? (
              <span className="pill bad">API 서버 꺼짐 — npm run dev 로 실행</span>
            ) : status ? (
              <>
                <span className={`pill ${live ? 'ok' : ''}`}>Claude {live ? 'ON' : '데모'}</span>
                <span className={`pill ${status.providers.openai ? 'ok' : ''}`}>그림·음성 {status.providers.openai ? 'OpenAI' : '대체'}</span>
                <span className={`pill ${status.providers.elevenlabs ? 'ok' : ''}`}>ElevenLabs {status.providers.elevenlabs ? 'ON' : 'OFF'}</span>
                <span className={`pill ${status.ffmpeg ? 'ok' : 'bad'}`}>ffmpeg {status.ffmpeg ? 'OK' : '없음'}</span>
              </>
            ) : (
              <span className="pill">상태 확인 중…</span>
            )}
          </div>
        </header>

        <ol className="steps">
          {STEP_NAMES.map((n, i) => (
            <li key={n} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <span>{i < step ? '✓' : i + 1}</span>
              {n}
            </li>
          ))}
        </ol>

        {err && <p className="err">{err}</p>}

        {/* ① 주소 넣기 */}
        {step === 0 && (
          <section className="panel">
            <label className="fld">
              <span>잘된 영상 주소</span>
              <input placeholder="https://www.youtube.com/watch?v=…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </label>
            <label className="fld">
              <span>내가 만들 주제 <em>(비우면 AI가 같은 장르에서 제안)</em></span>
              <input placeholder="예: 용도지역이 바뀌면 땅값은 어떻게 될까" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </label>
            <button className="linkish" onClick={() => setForm({ ...form, showPaste: !form.showPaste })}>
              {form.showPaste ? '▾' : '▸'} 자막을 못 가져오면: 대본 직접 붙여넣기
            </button>
            {form.showPaste && (
              <textarea rows={7} placeholder="원본 영상 대본(자막)을 붙여넣으세요" value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} />
            )}
            <div className="row">
              <button className="primary" disabled={busy || (!form.url && !form.transcript)} onClick={() => analyze(false)}>
                {busy ? '분석 중…' : live ? '분석하기 →' : '분석하기 (데모) →'}
              </button>
              <button className="ghost" disabled={busy} onClick={() => analyze(true)}>
                키 없이 데모로 해보기
              </button>
            </div>
            <p className="hint">
              {live
                ? 'Claude 가 대본을 읽고 "왜 잘됐는지" 해부한 뒤 같은 공식으로 제목·썸네일을 기획합니다.'
                : 'ANTHROPIC_API_KEY 가 없어서 데모 모드입니다. 영상 정보(제목·채널)는 실제로 가져오고, 분석 결과는 준비된 예시를 씁니다.'}
            </p>
          </section>
        )}

        {/* ② 고르기 */}
        {step === 1 && an && (
          <>
            <section className="panel">
              <div className="src">
                {an.meta?.thumbnail && <img src={an.meta.thumbnail} alt="" />}
                <div>
                  <span className="kicker">벤치마킹 원본 {an.demo && '· 데모 분석'}</span>
                  <b>{an.meta?.title || '(제목 없음)'}</b>
                  <small>
                    {an.meta?.author} · 대본 {an.transcript?.text?.length?.toLocaleString()}자 ({an.transcript?.source})
                  </small>
                </div>
              </div>
              <div className="anGrid">
                <div>
                  <h3>후킹</h3>
                  <p><b>{an.analysis.hook.technique}</b> — {an.analysis.hook.opening}</p>
                  <h3>말투</h3>
                  <p>{an.analysis.tone}</p>
                  <h3>잘된 이유</h3>
                  <ul>{an.analysis.whyItWorked.map((w) => <li key={w}>{w}</li>)}</ul>
                </div>
                <div>
                  <h3>대본 뼈대</h3>
                  <div className="struct">
                    {an.analysis.structure.map((s) => (
                      <div key={s.section} style={{ flex: Math.max(0.08, s.share) }} title={s.role}>
                        <b>{s.section}</b>
                        <small>{s.role}</small>
                      </div>
                    ))}
                  </div>
                  <h3>제목 공식</h3>
                  <p>{an.analysis.titlePattern}</p>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2>제목 고르기</h2>
              <div className="titles">
                {an.analysis.titles.map((t) => (
                  <label key={t.text} className={pick.title === t.text ? 'sel' : ''}>
                    <input type="radio" name="title" checked={pick.title === t.text} onChange={() => setPick({ ...pick, title: t.text })} />
                    <span>{t.text}</span>
                    <em>{t.angle}</em>
                  </label>
                ))}
              </div>
              <input className="edit" value={pick.title} onChange={(e) => setPick({ ...pick, title: e.target.value })} />

              <h2>썸네일 고르기</h2>
              <div className="thumbs">
                {an.analysis.thumbnails.map((t, i) => (
                  <button key={t.line1 + i} className={pick.thumb === i ? 'sel' : ''} onClick={() => setPick({ ...pick, thumb: i })}>
                    <Thumb l1={t.line1} l2={t.line2} hue={[160, 30, 220][i % 3]} />
                    <small>{t.imageConcept}</small>
                  </button>
                ))}
              </div>

              <div className="row2">
                <label className="fld">
                  <span>목소리</span>
                  <select value={pick.voice} onChange={(e) => setPick({ ...pick, voice: e.target.value })}>
                    {status?.voices?.map((v) => (
                      <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>
                    ))}
                  </select>
                </label>
                <label className="fld">
                  <span>길이 {an.demo && <em>(데모는 약 1분 고정)</em>}</span>
                  <select value={pick.minutes} onChange={(e) => setPick({ ...pick, minutes: Number(e.target.value) })} disabled={an.demo}>
                    {[1, 3, 5, 8, 10].map((m) => <option key={m} value={m}>약 {m}분</option>)}
                  </select>
                </label>
              </div>
              <div className="row">
                <button className="ghost" onClick={() => setStep(0)}>← 다시 넣기</button>
                <button className="primary" disabled={!pick.title} onClick={make}>영상 만들기 →</button>
              </div>
            </section>
          </>
        )}

        {/* ③ 기다리기 */}
        {step === 2 && (
          <section className="panel wait">
            <div className="waitTop">
              <b>{job?.status === 'error' ? '중간에 멈췄습니다' : '만드는 중입니다'}</b>
              <span>{job ? `${job.elapsed}초 경과 · ${job.progress}%` : '시작하는 중…'}</span>
            </div>
            <div className="prog"><i style={{ width: `${job?.progress || 3}%` }} /></div>
            <ul className="jobSteps">
              {(job?.steps || []).map((s) => (
                <li key={s.key} className={s.status}>
                  <span className="dot">{s.status === 'done' ? '✓' : s.status === 'running' ? <i className="spin" /> : s.status === 'error' ? '!' : ''}</span>
                  {s.label}
                  {s.detail && <em>{s.detail}</em>}
                </li>
              ))}
            </ul>
            {job?.logs?.map((l) => <p className="hint" key={l}>• {l}</p>)}
            {job?.error && (
              <>
                <pre className="errBox">{job.error}</pre>
                <button className="ghost" onClick={() => setStep(1)}>← 고르기로 돌아가기</button>
              </>
            )}
          </section>
        )}

        {/* ④ 완성 */}
        {step === 3 && job?.result && (
          <section className="panel done">
            <div className="rHead2">
              <b>{job.result.title}</b>
              <span>{fmt(job.result.seconds)}</span>
            </div>
            <video ref={videoRef} src={job.result.video} controls poster={job.result.thumbnail} />
            <div className="chips">
              {job.result.chapters.map((c) => (
                <button key={c.type} onClick={() => seek(c.at)}>
                  {c.label} <b>{fmt(c.at)}</b>
                </button>
              ))}
            </div>
            <div className="outs">
              <figure>
                <img src={job.result.thumbnail} alt="생성된 썸네일" />
                <figcaption>썸네일</figcaption>
              </figure>
              <div className="dl">
                <a href={job.result.video} download>MP4 받기</a>
                <a href={job.result.thumbnail} download>썸네일 JPG</a>
                <a href={job.result.srt} download>SRT 자막</a>
                <a href={job.result.script} download>대본 JSON</a>
              </div>
            </div>
            <h2>장면 컷</h2>
            <ol className="scenes">
              {job.result.scenes.map((s, i) => (
                <li key={i} onClick={() => seek(s.start)}>
                  <img src={s.image} alt="" />
                  <div>
                    <small>{fmt(s.start)} · {s.visualType}</small>
                    <p>{s.narration}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="row">
              <button className="ghost" onClick={() => { setStep(0); setJob(null); }}>새 영상 만들기</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
