import { useEffect, useState } from "react";
import { DESKTOP_VERSION, GEMINI_KEY_URL, PORTABLE_URL, SETUP_URL } from "../lib/desktop";
import { HandNote } from "./HandNote";
import { StrikePreview } from "./StrikePreview";

// 맨 위 시연: 말한 그대로 → 군더더기에 줄 긋기 → 정리된 글이 쓰던 창에 들어가는 모습을 되풀이합니다.
const DEMOS = [
  {
    raw: "음 그러니까 내일 수업은 어 일곱 시가 아니라 아 여덟 시에 시작하고요 교재는 그 공법 체계도 챙겨 오세요",
    result: "내일 수업은 8시에 시작합니다.\n교재는 공법 체계도를 챙겨 오세요.",
  },
  {
    raw: "어 이번 주 과제는 음 용도지역 정리하는 거고 금요일까지 아 아니다 토요일까지 제출하면 돼요",
    result: "이번 주 과제는 용도지역 정리입니다.\n토요일까지 제출하면 됩니다.",
  },
  {
    raw: "음 고객님께 어 내일 오후 두 시 그 현장 답사 가능하신지 여쭤봐 주세요",
    result: "고객님께 내일 오후 2시 현장 답사가 가능하신지 여쭤봐 주세요.",
  },
];

type Phase = "listen" | "strike" | "done";
const PHASE_MS: Record<Phase, number> = { listen: 1600, strike: 2300, done: 3400 };
const NEXT: Record<Phase, Phase> = { listen: "strike", strike: "done", done: "listen" };

function Demo() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("done");
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setTimeout(() => {
      if (phase === "done") setIndex((i) => (i + 1) % DEMOS.length);
      setPhase(NEXT[phase]);
    }, PHASE_MS[phase]);
    return () => window.clearTimeout(timer);
  }, [phase, reduced]);

  const demo = DEMOS[index];
  const pill =
    phase === "listen"
      ? { label: "듣는 중 · 0:03", tone: "rec" }
      : phase === "strike"
        ? { label: "정리하는 중…", tone: "work" }
        : { label: "붙여넣었습니다", tone: "ok" };

  return (
    <div className="demo" aria-hidden="true">
      <div className="demo__window">
        <div className="demo__bar">
          <i />
          <i />
          <i />
          <span>메일 · 메신저 · 한글 · ChatGPT 어디서나</span>
        </div>
        <div className="demo__doc">
          {phase === "done" ? (
            <p key={`r${index}`} className="demo__result">
              {demo.result}
            </p>
          ) : (
            <span className="demo__caret" />
          )}
        </div>
      </div>

      <div className="demo__said">
        <span className="demo__said-label">말한 그대로</span>
        {phase === "listen" ? (
          <p key={`l${index}`} className="demo__listening">
            {demo.raw}
          </p>
        ) : (
          <StrikePreview key={`s${index}`} text={demo.raw} />
        )}
      </div>

      <div className={`demo__pill is-${pill.tone}`}>
        <span className="demo__dot" />
        {pill.label}
        {phase === "listen" && (
          <span className="demo__bars">
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}

const KEYS: { keys: string[]; title: string; desc: string; main?: boolean }[] = [
  { keys: ["Win", "H"], title: "말해서 입력", desc: "글 쓸 곳을 클릭하고 Win+H → 말하기 → Win+H 한 번 더. 정리된 글이 그 자리에 들어갑니다.", main: true },
  { keys: ["Ctrl", "Shift", "Space"], title: "누른 채 말하기", desc: "누른 채 말하고 손을 떼면 끝. 짧게 누르면 다시 누를 때까지 듣습니다." },
  { keys: ["Ctrl", "Alt", "Space"], title: "써 둔 글 정리", desc: "이미 쓴 글을 마우스로 선택하고 누르면 '음, 어'를 지우고 다듬어 줍니다." },
  { keys: ["Ctrl", "Alt", "E"], title: "말로 고치기", desc: "글을 선택하고 누른 채 \"더 공손하게\", \"세 줄로 요약해줘\"처럼 말합니다." },
  { keys: ["Esc"], title: "녹음 버리기", desc: "말하는 도중에 누르면 입력하지 않고 버립니다." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Win+H를 눌렀는데 원래 Windows 음성 입력이 떠요.",
    a: "MR.K Typeless가 켜져 있는지 작업 표시줄 오른쪽 아래(^ 안)의 파란 마이크 아이콘을 확인하세요. 켜져 있다면 아이콘 → 설정 → '시작하기' 탭에서 'Win+H를 누르면 MR.K로 받아쓰기'가 켜져 있는지 봅니다.",
  },
  {
    q: "'Windows의 PC 보호' 창이 떠요.",
    a: "코드 서명 인증서가 없는 프로그램이라 처음 한 번 뜹니다. '추가 정보'를 누르면 나오는 '실행' 버튼을 누르세요. 백신이 막으면 허용 목록에 넣어 주세요.",
  },
  {
    q: "돈이 드나요?",
    a: "프로그램은 무료입니다. Gemini API 키는 Google AI Studio에서 무료로 만들 수 있고, 무료 사용량 안에서는 요금이 나오지 않습니다. 다만 무료 등급에서는 보낸 내용이 Google 서비스 개선에 쓰일 수 있으니 민감한 내용은 조심하세요.",
  },
  {
    q: "말한 내용이 엉뚱하게 받아써져요.",
    a: "영상이나 음악을 끄고, 마이크에 조금 가까이 대고 말해 보세요. 자주 틀리는 용어는 아이콘 오른쪽 클릭 → '사전 고치기'에 넣어 두면 더 잘 알아듣습니다.",
  },
  {
    q: "Mac이나 휴대폰에서도 되나요?",
    a: "이 프로그램은 Windows 10·11 전용입니다. Mac과 휴대폰은 웹 버전(mrk-typeless.vercel.app)을 쓰세요.",
  },
  {
    q: "지우려면 어떻게 하나요?",
    a: "Windows 설정 → 앱 → 설치된 앱에서 'MR.K Typeless'를 찾아 제거합니다.",
  },
];

function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span className="caps">
      {keys.map((k, i) => (
        <span key={k} className="caps__group">
          {i > 0 && <span className="caps__plus">+</span>}
          <kbd className="cap">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

function DownloadButton({ big = false }: { big?: boolean }) {
  return (
    <a className={`btn btn--primary dl-btn${big ? " dl-btn--big" : ""}`} href={SETUP_URL}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 16.5h12" />
      </svg>
      Windows용 내려받기
    </a>
  );
}

const LATEST_API = "https://api.github.com/repos/ko37258-lab/rsa/releases/latest";

/** GitHub 릴리스의 최신 버전과 설치 파일 크기. 못 가져오면 코드에 적힌 버전을 보여 줍니다. */
function useLatestRelease() {
  const [info, setInfo] = useState<{ version: string; sizeMb: number | null }>({ version: DESKTOP_VERSION, sizeMb: null });
  useEffect(() => {
    const ctl = new AbortController();
    fetch(LATEST_API, { signal: ctl.signal, headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tag_name?: string; assets?: { name: string; size: number }[] } | null) => {
        if (!data) return;
        const version = data.tag_name?.match(/(\d+\.\d+\.\d+)/)?.[1];
        const setup = data.assets?.find((a) => a.name === "MRK-Typeless-Setup.exe");
        setInfo({ version: version ?? DESKTOP_VERSION, sizeMb: setup ? Math.round(setup.size / 1024 / 1024) : null });
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);
  return info;
}

export function DownloadPage() {
  const latest = useLatestRelease();
  return (
    <div className="app dl">
      <header className="nav">
        <a className="brand" href="/">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="9" y="4" width="6" height="11" rx="3" />
              <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3" />
            </svg>
          </span>
          <span className="brand__name">
            MR.K <b>Typeless</b>
          </span>
        </a>
        <a className="btn btn--ghost" href="/">
          웹에서 바로 써 보기
        </a>
      </header>

      <section className="hero dl-hero">
        <p className="dl-eyebrow">Windows PC 프로그램</p>
        <h1 className="hero__title">
          <span className="hero__accent">Win+H</span> 누르고 말하면, 정리된 글이 그 자리에
        </h1>
        <p className="hero__sub">메일, 메신저, 한글, ChatGPT 어디서든 말하면 "음, 어"를 걷어낸 글이 바로 입력됩니다.</p>
        <div className="dl-cta">
          <DownloadButton big />
          <p className="dl-meta">
            v{latest.version}
            {latest.sizeMb ? ` · ${latest.sizeMb}MB` : ""} · Windows 10·11 · 관리자 권한 필요 없음 ·{" "}
            <a href={PORTABLE_URL}>설치 없이 쓰는 한 파일 버전</a>
          </p>
        </div>
        <HandNote text="설치는 5분이면 끝나요" className="dl-hero__note" />
      </section>

      <Demo />

      <section className="dl-section" aria-labelledby="steps-title">
        <h2 id="steps-title" className="dl-h2">
          설치 3단계
        </h2>
        <ol className="steps">
          <li className="step">
            <span className="step__num">1</span>
            <h3 className="step__title">내려받아 실행</h3>
            <p className="step__desc">
              <b>MRK-Typeless-Setup.exe</b>를 실행합니다. 파란 'Windows의 PC 보호' 창이 뜨면 <b>추가 정보 → 실행</b>을 누르세요.
            </p>
            <div className="mock mock--smartscreen" aria-hidden="true">
              <p className="mock__title">Windows의 PC 보호</p>
              <p className="mock__text">Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다.</p>
              <span className="mock__link">
                추가 정보
                <svg className="mock__circle" viewBox="0 0 120 44" preserveAspectRatio="none">
                  <path d="M10 22 C 10 6, 108 4, 112 20 C 116 38, 20 42, 8 26" />
                </svg>
              </span>
              <span className="mock__btn">실행</span>
            </div>
          </li>
          <li className="step">
            <span className="step__num">2</span>
            <h3 className="step__title">Gemini 키 하나 넣기</h3>
            <p className="step__desc">
              설정 창의 '키 발급 ↗'을 누르면 Google AI Studio가 열립니다. <b>API 키 만들기</b>로 만든 키를 복사해 붙여넣고 저장하세요.
            </p>
            <div className="mock mock--settings" aria-hidden="true">
              <span className="mock__label">Gemini API 키</span>
              <span className="mock__input">AIza••••••••••</span>
              <span className="mock__chip">키 발급 ↗</span>
              <span className="mock__btn mock__btn--save">저장</span>
            </div>
            <a className="key-link" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">
              Gemini 키 발급 페이지 열기 ↗
            </a>
          </li>
          <li className="step">
            <span className="step__num">3</span>
            <h3 className="step__title">Win+H로 말하기</h3>
            <p className="step__desc">
              글 쓸 곳을 클릭하고 <b>Win+H</b>를 누르고 말한 뒤, <b>Win+H</b>를 한 번 더 누르면 정리된 글이 들어갑니다.
            </p>
            <div className="mock mock--keys" aria-hidden="true">
              <Keycaps keys={["Win", "H"]} />
            </div>
          </li>
        </ol>
      </section>

      <section className="dl-section" aria-labelledby="keys-title">
        <h2 id="keys-title" className="dl-h2">
          쓰는 법
        </h2>
        <p className="dl-lead">작업 표시줄 오른쪽 아래의 파란 마이크 아이콘을 누르면 프로그램 안에서도 이 사용 방법을 볼 수 있습니다.</p>
        <ul className="keys">
          {KEYS.map((k) => (
            <li key={k.title} className={`keyrow${k.main ? " keyrow--main" : ""}`}>
              <Keycaps keys={k.keys} />
              <div>
                <p className="keyrow__title">{k.title}</p>
                <p className="keyrow__desc">{k.desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="dl-lead">
          글 형식(메시지·이메일·보고서·강의 원고·번역 등)은 마이크 아이콘을 <b>오른쪽 클릭 → 글 형식</b>에서 바꿉니다.
        </p>
      </section>

      <section className="dl-section" aria-labelledby="faq-title">
        <h2 id="faq-title" className="dl-h2">
          자주 묻는 것
        </h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q} className="faq__item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="dl-final">
        <p className="dl-final__title">지금 내려받아 Win+H로 말해 보세요</p>
        <DownloadButton />
      </section>

      <footer className="foot">
        <span>MR.K Typeless · 미스터홈즈</span>
        <span>키와 기록은 내 컴퓨터에만 저장됩니다</span>
      </footer>
    </div>
  );
}
