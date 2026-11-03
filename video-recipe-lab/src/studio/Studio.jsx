// 원본 프로그램의 4단계 흐름: 잘된 영상 주소 넣기 → 제목·썸네일·목소리 고르기 → 기다리기 → 완성 영상
import { useEffect, useRef, useState } from 'react';
import Thumb from '../landing/Thumb.jsx';
import './studio.css';

const STEP_NAMES = ['잘된 영상 주소 넣기', '제목·썸네일·목소리 고르기', '기다리기', '완성 영상'];
const KEY_GROUPS = [
  {
    title: '① 분석·대본 AI',
    note: 'Claude 와 Gemini 중 하나만 있으면 됩니다. Claude 키가 없으면 Gemini 키(무료 사용량 있음)로 시작하세요.',
    fields: [
      { id: 'anthropic', env: 'ANTHROPIC_API_KEY', name: 'Claude 키', role: '영상 분석·제목·대본 (품질 우선)', placeholder: 'sk-ant- 로 시작하는 키를 붙여넣으세요', link: 'https://console.anthropic.com/settings/keys' },
      { id: 'gemini', env: 'GEMINI_API_KEY', name: 'Gemini 키', role: 'Claude 대신 분석·대본 (무료로 시작 가능)', placeholder: 'AIza 로 시작하는 키를 붙여넣으세요', link: 'https://aistudio.google.com/apikey' },
    ],
  },
  {
    title: '② 그림·목소리 (선택)',
    note: '없으면 그림은 단색 카드, 목소리는 무음(자막만)으로 만들어집니다.',
    fields: [
      { id: 'openai', env: 'OPENAI_API_KEY', name: 'OpenAI 키', role: '장면 AI 그림 + 내레이션 목소리', placeholder: 'sk- 로 시작하는 키를 붙여넣으세요', link: 'https://platform.openai.com/api-keys' },
      { id: 'elevenlabs', env: 'ELEVENLABS_API_KEY', name: 'ElevenLabs 키', role: '더 자연스러운 한국어 목소리 · 내 목소리 복제', placeholder: 'sk_ 로 시작하는 키를 붙여넣으세요', link: 'https://elevenlabs.io/app/settings/api-keys' },
    ],
  },
];
const EMPTY_KEYS = { anthropic: '', gemini: '', openai: '', elevenlabs: '' };
const AI_NAME = { claude: 'Claude', gemini: 'Gemini' };
const HEALTH_KEY = { claude: 'anthropic', gemini: 'gemini' };

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function api(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `요청 실패 (${r.status})`), { data: j });
  return j;
}

export default function Studio({ member = false }) {
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ url: '', topic: '', transcript: '', showPaste: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [an, setAn] = useState(null); // 분석 결과
  const [pick, setPick] = useState({ title: '', thumb: 0, voice: 'silent', minutes: 1 });
  const [job, setJob] = useState(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [keyForm, setKeyForm] = useState(EMPTY_KEYS);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyResult, setKeyResult] = useState(null);
  const videoRef = useRef(null);

  const loadStatus = () =>
    api('/api/status')
      .then((s) => {
        setStatus(s);
        // OpenAI 목소리를 쓸 수 있으면 기본 목소리를 무음 대신 남성 내레이터로
        const firstReal = s.voices?.find((v) => v.id !== 'silent');
        setPick((p) => (p.voice === 'silent' && firstReal ? { ...p, voice: firstReal.id } : p));
      })
      .catch(() => setStatus({ offline: true }));

  useEffect(() => {
    loadStatus();
  }, []);

  async function saveKeys() {
    setKeyBusy(true);
    setKeyResult(null);
    try {
      const body = {};
      for (const [k, v] of Object.entries(keyForm)) if (v.trim()) body[k] = v.trim();
      const r = await api('/api/keys', body);
      setKeyResult(r.check);
      setKeyForm(EMPTY_KEYS);
      await loadStatus();
    } catch (e) {
      setKeyResult({ error: { ok: false, msg: e.message } });
    } finally {
      setKeyBusy(false);
    }
  }

  const live = status?.providers?.text; // 'claude' | 'gemini' | null
  const liveName = AI_NAME[live];
  const liveBad = live && status?.keyHealth?.[HEALTH_KEY[live]] === false;

  async function chooseTextAI(v) {
    try {
      await api('/api/settings', { textAI: v });
      await loadStatus();
    } catch (e) {
      setErr(e.message);
    }
  }

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
            <h1>K-영상제작기</h1>
            <p>
              {member
                ? '잘된 유튜브 영상 주소 하나로 성공 공식을 분석하고, 제목·썸네일·대본·그림·목소리·자막을 붙인 영상까지 만듭니다.'
                : '잘된 유튜브 영상 주소 하나로 성공 공식을 분석하고, 제목·썸네일·대본·그림·목소리·자막을 붙인 영상까지 만듭니다. (영상레시피 AI 해부 → MR.K 버전)'}
            </p>
          </div>
          <div className="pills">
            {status?.offline ? (
              <span className="pill bad">API 서버 꺼짐 — npm run dev 로 실행</span>
            ) : status ? (
              <>
                {liveBad ? (
                  <span className="pill bad">{liveName} 키 오류</span>
                ) : (
                  <span className={`pill ${live ? 'ok' : ''}`}>분석·대본 {live ? liveName : '체험'}</span>
                )}
                {status.providers.openai && status.keyHealth?.openai === false ? (
                  <span className="pill bad">OpenAI 키 오류</span>
                ) : (
                  <span className={`pill ${status.providers.openai ? 'ok' : ''}`}>그림·음성 {status.providers.openai ? 'OpenAI' : '대체'}</span>
                )}
                {status.providers.elevenlabs && status.keyHealth?.elevenlabs === false ? (
                  <span className="pill bad">ElevenLabs 키 오류</span>
                ) : (
                  <span className={`pill ${status.providers.elevenlabs ? 'ok' : ''}`}>ElevenLabs {status.providers.elevenlabs ? 'ON' : 'OFF'}</span>
                )}
                <span className={`pill ${status.ffmpeg ? 'ok' : 'bad'}`}>ffmpeg {status.ffmpeg ? 'OK' : '없음'}</span>
              </>
            ) : (
              <span className="pill">상태 확인 중…</span>
            )}
            {status && !status.offline && (
              <button className="keyBtn" onClick={() => setKeysOpen(!keysOpen)}>🔑 API 키 등록</button>
            )}
          </div>
        </header>

        {status && !status.offline && !live && !keysOpen && (
          <div className="demoNote">
            <span>
              지금은 <b>체험 모드</b>입니다. 넣은 영상을 진짜로 분석하려면 Claude 키나 <b>Gemini 키(무료로 시작 가능)</b>를 등록하세요.
            </span>
            <button onClick={() => setKeysOpen(true)}>키 등록하기 →</button>
          </div>
        )}

        {keysOpen && (
          <section className="panel keys">
            <h2>API 키 등록</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              키는 이 PC 의 설정 파일(.env)에만 저장됩니다. 저장할 때 키가 맞는지 확인하는데, 이 확인에는 요금이 나가지 않습니다.
            </p>
            {KEY_GROUPS.map((g) => (
              <div className="keyGroup" key={g.title}>
                <h3>{g.title}</h3>
                <p className="hint" style={{ marginTop: 0 }}>{g.note}</p>
                {g.fields.map((f) => (
                  <div className="keyRow" key={f.id}>
                    <div className="keyHead">
                      <b>{f.name}</b> <em>{f.role}</em>
                      <span className={`kst ${status.keys?.[f.env] ? 'on' : ''}`}>{status.keys?.[f.env] ? `등록됨 ${status.keys[f.env]}` : '미등록'}</span>
                    </div>
                    <input type="password" autoComplete="off" placeholder={f.placeholder} value={keyForm[f.id]} onChange={(e) => setKeyForm({ ...keyForm, [f.id]: e.target.value })} />
                    <a href={f.link} target="_blank" rel="noreferrer">키 발급받으러 가기 ↗</a>
                    {keyResult?.[f.id] && <p className={`kres ${keyResult[f.id].ok ? 'ok' : 'bad'}`}>{keyResult[f.id].ok ? '✅' : '❌'} {keyResult[f.id].msg}</p>}
                  </div>
                ))}
                {g.title.startsWith('①') && status.providers.claude && status.providers.gemini && (
                  <div className="aiPick">
                    <b>분석·대본은 어느 AI 로 만들까요?</b>
                    {['claude', 'gemini'].map((v) => (
                      <label key={v} className={live === v ? 'sel' : ''}>
                        <input type="radio" name="textAI" checked={live === v} onChange={() => chooseTextAI(v)} /> {AI_NAME[v]}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {keyResult?.error && <p className="kres bad">❌ {keyResult.error.msg}</p>}
            <div className="row">
              <button className="primary" disabled={keyBusy || !Object.values(keyForm).some((v) => v.trim())} onClick={saveKeys}>
                {keyBusy ? '확인 중…' : '저장하고 연결 확인'}
              </button>
              <button className="ghost" onClick={() => setKeysOpen(false)}>닫기</button>
            </div>
          </section>
        )}

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
              <p className="hint howto">
                자막을 못 가져왔을 때: 유튜브에서 그 영상을 열고 설명란의 <b>…더보기</b> → <b>스크립트 표시</b>를 누르세요. 오른쪽에 나오는 대본을
                마우스로 처음부터 끝까지 끌어서 복사(Ctrl+C)한 뒤 아래 칸에 붙여넣기(Ctrl+V) 하면 됩니다.
              </p>
            )}
            {form.showPaste && (
              <textarea rows={7} placeholder="원본 영상 대본(자막)을 붙여넣으세요" value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} />
            )}
            <div className="row">
              <button className="primary" disabled={busy || (!form.url && !form.transcript)} onClick={() => analyze(false)}>
                {busy ? '분석 중…' : live ? '분석하기 →' : '분석하기 (체험) →'}
              </button>
              <button className="ghost" disabled={busy} onClick={() => analyze(true)}>
                키 없이 체험해 보기
              </button>
            </div>
            <p className="hint">
              {live
                ? `${liveName} 가 대본을 읽고 "왜 잘됐는지" 해부한 뒤 같은 공식으로 제목·썸네일을 기획합니다.`
                : 'Claude 나 Gemini 키가 없어서 체험 모드입니다. 영상 정보(제목·채널)는 실제로 가져오고, 분석 결과는 준비된 예시를 씁니다.'}
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
                  <span className="kicker">벤치마킹 원본 {an.demo && '· 체험용 예시 분석'}</span>
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
                  <span>길이 {an.demo && <em>(체험은 약 1분 고정)</em>}</span>
                  <select value={pick.minutes} onChange={(e) => setPick({ ...pick, minutes: Number(e.target.value) })} disabled={an.demo}>
                    {[1, 3, 5, 8, 10].map((m) => <option key={m} value={m}>약 {m}분</option>)}
                  </select>
                </label>
              </div>
              <div className="row">
                <button className="ghost" onClick={() => setStep(0)}>← 다시 넣기</button>
                <button className="primary" disabled={!pick.title} onClick={make}>영상 만들기 →</button>
              </div>
              {!an.demo && (
                <p className="hint">
                  {live === 'gemini'
                    ? '실제 AI 로 만듭니다. 대본은 Gemini 무료 사용량 안에서는 요금이 나가지 않고, 그림·목소리를 OpenAI·ElevenLabs 로 만들면 그쪽 요금이 나갑니다.'
                    : '실제 AI 로 만듭니다. 등록한 키의 계정에 사용료가 나갑니다 (1분 영상 기준 대략 수백 원~1천 원, 그림 장수에 따라 달라짐).'}
                </p>
              )}
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
                <button onClick={() => api(`/api/jobs/${job.id}/open-folder`, {}).catch((e) => setErr(e.message))}>📂 결과 폴더 열기</button>
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
