import { useEffect, useRef } from "react";
import { DOWNLOAD_PAGE_URL } from "../lib/desktop";
import { MODES } from "../lib/modes";
import { StrikePreview } from "./StrikePreview";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

const EXAMPLE_RAW = "음 그러니까 목요일 아 아니다 금요일 세 시에 어 분당 상가 답사 가고요 건폐률 용적율 확인";
const EXAMPLE_RESULT = "금요일 오후 3시에 분당 상가 답사를 갑니다.\n- 건폐율·용적률 확인";

const SECTIONS = [
  { id: "guide-record", label: "녹음 켜고 끄기" },
  { id: "guide-ai", label: "AI 정리" },
  { id: "guide-result", label: "결과 쓰기" },
  { id: "guide-tabs", label: "다른 메뉴" },
  { id: "guide-keys", label: "단축키" },
];

function MiniMic({ live = false }: { live?: boolean }) {
  return (
    <span className={`gmic${live ? " is-live" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="9" y="4" width="6" height="11" rx="3" />
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3" />
      </svg>
    </span>
  );
}

/** 홈페이지 안 사용법: 무엇을 누르면 녹음이 켜지고 꺼지는지, AI가 어떻게 정리하는지 */
export function GuideDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>(".guide__body")?.scrollTo({ top: 0 });
      dialog.querySelector<HTMLElement>("#guide-title")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const jump = (id: string) => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  return (
    <dialog
      ref={ref}
      className="guide"
      aria-labelledby="guide-title"
      onClose={onClose}
      onClick={(e) => {
        // 바깥(어두운 곳)을 누르면 닫습니다.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="guide__panel">
        <header className="guide__head">
          <div>
            <p className="guide__eyebrow">처음이라면 3분만</p>
            <h2 id="guide-title" className="guide__title" tabIndex={-1}>
              MR.K Typeless 사용법
            </h2>
          </div>
          <button type="button" className="btn btn--ghost guide__close" onClick={onClose} aria-label="사용법 닫기">
            닫기
          </button>
        </header>

        <nav className="guide__toc" aria-label="사용법 차례">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className="chip" onClick={() => jump(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="guide__body">
          <section id="guide-record" className="gsec">
            <h3 className="gsec__title">
              <span className="gsec__num">1</span>녹음 켜고 끄기
            </h3>
            <p className="gsec__lead">받아쓰기 탭 가운데의 보라색 마이크 버튼 하나로 합니다. 누르는 방법이 두 가지입니다.</p>
            <div className="gcards">
              <div className="gcard">
                <MiniMic live />
                <p className="gcard__title">꾹 누른 채 말하기</p>
                <p className="gcard__desc">
                  마이크를 <b>누르고 있는 동안</b> 녹음됩니다. 말을 마치고 <b>손을 떼면</b> 녹음이 꺼지고 바로 정리합니다.
                </p>
              </div>
              <div className="gcard">
                <MiniMic />
                <p className="gcard__title">짧게 눌러 켜고 끄기</p>
                <p className="gcard__desc">
                  <b>한 번 톡</b> 누르면 녹음이 켜집니다. 다 말한 뒤 <b>한 번 더</b> 누르면 꺼지고 정리합니다.
                </p>
              </div>
            </div>
            <ol className="gstates">
              <li>
                <span className="gdot" />
                <span>
                  <b>보라색 마이크</b> 기다리는 중
                </span>
              </li>
              <li>
                <span className="gdot gdot--rec" />
                <span>
                  <b>빨간 마이크 + 시간·파형</b> 듣는 중 (녹음 켜짐)
                </span>
              </li>
              <li>
                <span className="gdot gdot--work" />
                <span>
                  <b>받아쓰는 중… / 군더더기를 걷어내는 중…</b> 녹음이 꺼지고 글로 바꾸는 중
                </span>
              </li>
            </ol>
            <p className="gsec__note">
              녹음을 버리려면 <kbd>Esc</kbd>. 마이크를 쓸 수 없는 화면이면 <b>받아쓴 원문</b> 칸을 누르고 키보드의 음성 입력(Windows{" "}
              <kbd>Win</kbd>+<kbd>H</kbd>, 휴대폰은 키보드의 마이크)으로 말하세요. 말을 멈추면 3초 뒤 자동으로 정리합니다.
            </p>
            <div className="gbox">
              <p className="gbox__title">말 → 글자는 누가 바꾸나요?</p>
              <ul>
                <li>
                  <b>브라우저 음성인식</b> (무료): Chrome·Edge·Safari가 말하는 동안 바로 글자로 바꿉니다.
                </li>
                <li>
                  <b>녹음 받아쓰기</b>: 다 말한 뒤 녹음을 Gemini·ElevenLabs·OpenAI로 보내 글자로 바꿉니다. 어사이드·웨일처럼 브라우저
                  음성인식이 막힌 곳에서도 됩니다. 설정 → 음성 인식에서 고릅니다.
                </li>
              </ul>
            </div>
            {!__ARTIFACT__ && (
              <div className="gbox">
                <p className="gbox__title">녹음해 둔 파일도 글로 바꿀 수 있어요</p>
                <ul>
                  <li>
                    마이크 아래 <b>녹음 파일 올리기</b>를 누르거나, 파일을 이 화면에 끌어다 놓으세요. 휴대폰 녹음(m4a)·강의 녹음(mp3·wav)·
                    영상(mp4)을 받습니다.
                  </li>
                  <li>
                    글로 바뀐 내용이 <b>받아쓴 원문</b>에 들어가고, 고른 <b>글의 형식</b>(강의 원고·상담 노트·보고서 등)으로 바로 정리합니다.
                  </li>
                  <li>
                    Gemini 키 하나로 됩니다. 1시간이 넘는 녹음도 20분씩 나눠 받아쓰고, 다 쓴 녹음 파일은 Google 서버에서 바로 지웁니다.
                  </li>
                  <li>
                    아이폰 <b>음성 메모</b>는 녹음을 열고 공유 → <b>파일에 저장</b>을 한 뒤, 올리기에서 그 파일을 고르세요.
                  </li>
                </ul>
              </div>
            )}
          </section>

          <section id="guide-ai" className="gsec">
            <h3 className="gsec__title">
              <span className="gsec__num">2</span>AI 정리는 이렇게 합니다
            </h3>
            <p className="gsec__lead">녹음이 꺼지면 아래 순서로 자동 진행됩니다. 직접 고친 원문은 '정리하기'를 누르면 같은 순서로 정리합니다.</p>
            <ol className="gflow">
              <li className="gflow__step">
                <span className="gflow__num">1</span>
                <div>
                  <p className="gflow__title">받아쓴 원문</p>
                  <p className="gflow__desc">말한 그대로입니다. "음, 어"와 고쳐 말한 부분이 섞여 있습니다.</p>
                </div>
              </li>
              <li className="gflow__step">
                <span className="gflow__num">2</span>
                <div>
                  <p className="gflow__title">사전으로 먼저 고치기</p>
                  <p className="gflow__desc">자주 틀리는 말을 바로잡습니다 (건폐률 → 건폐율). 사전 탭에서 더할 수 있습니다.</p>
                </div>
              </li>
              <li className="gflow__step gflow__step--ai">
                <span className="gflow__num">3</span>
                <div>
                  <p className="gflow__title">AI가 다듬기 (Claude 또는 Gemini)</p>
                  <ul className="gflow__list">
                    <li>뜻 없는 군더더기(음, 어, 그러니까)를 지웁니다</li>
                    <li>고쳐 말한 곳("목요일, 아 아니다 금요일")은 마지막 뜻만 남깁니다</li>
                    <li>반복과 맞춤법을 고치고, 숫자는 3시처럼 씁니다</li>
                    <li>나열한 말은 목록으로, 고른 글 형식(이메일·보고서 등)에 맞춥니다</li>
                    <li>뜻·숫자·이름은 바꾸지 않고, 말하지 않은 내용은 지어내지 않습니다</li>
                  </ul>
                </div>
              </li>
              <li className="gflow__step">
                <span className="gflow__num">4</span>
                <div>
                  <p className="gflow__title">정리된 글 + 자동 복사</p>
                  <p className="gflow__desc">결과가 나오면 클립보드에 복사됩니다. 쓰던 곳에서 {MOD_KEY}+V로 붙여넣으세요.</p>
                </div>
              </li>
            </ol>
            <div className="gexample" aria-label="정리 예시">
              <div>
                <span className="gexample__label">말한 그대로</span>
                {open && <StrikePreview text={EXAMPLE_RAW} />}
              </div>
              <span className="gexample__arrow" aria-hidden="true">
                →
              </span>
              <div>
                <span className="gexample__label">정리된 글</span>
                <p className="gexample__result">{EXAMPLE_RESULT}</p>
              </div>
            </div>
            <div className="gbox">
              <p className="gbox__title">어떤 AI가 정리하나요?</p>
              <ul>
                <li>
                  설정 → AI 정리 방식에서 고릅니다: <b>내 Claude 계정</b>(claude.ai에서 열었을 때), <b>Claude API 키</b>,{" "}
                  <b>Gemini API 키</b>, <b>AI 없이</b>.
                </li>
                <li>'AI 없이'는 군더더기와 반복만 지웁니다. 고쳐 말한 곳·목록·형식 바꾸기는 AI가 있어야 됩니다.</li>
                <li>
                  원문은 고른 AI 회사(Anthropic 또는 Google)로만 보냅니다. 단, <b>Claude·Gemini 비교</b>를 누르면 두 회사 모두로 보냅니다. 키와
                  기록은 이 브라우저에만 저장합니다.
                </li>
                <li>Gemini 무료 등급에서는 보낸 내용이 Google 서비스 개선에 쓰일 수 있습니다. 민감한 내용은 유료 등급이나 Claude 키를 쓰세요.</li>
              </ul>
            </div>
            <p className="gsec__subtitle">글의 형식 7가지 (받아쓰기 탭 위쪽에서 고름)</p>
            <ul className="gmodes">
              {MODES.map((m) => (
                <li key={m.id}>
                  <b>{m.label}</b>
                  <span>{m.hint}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="guide-result" className="gsec">
            <h3 className="gsec__title">
              <span className="gsec__num">3</span>정리된 글 쓰기
            </h3>
            <ul className="gbtns">
              <li>
                <span className="gbtn gbtn--primary">복사</span>다시 복사합니다 (자동 복사가 막힌 화면에서)
              </li>
              <li>
                <span className="gbtn">원문과 비교</span>말한 그대로와 나란히 봅니다
              </li>
              <li>
                <span className="gbtn">다시 정리</span>같은 원문을 AI가 새로 정리합니다
              </li>
              <li>
                <span className="gbtn">Claude·Gemini 비교</span>두 AI의 결과를 나란히 보고 마음에 드는 쪽을 고릅니다
              </li>
              <li>
                <span className="gbtn">음성 편집으로 보내기</span>정리된 글을 말로 더 고칩니다
              </li>
            </ul>
          </section>

          <section id="guide-tabs" className="gsec">
            <h3 className="gsec__title">
              <span className="gsec__num">4</span>다른 메뉴
            </h3>
            <dl className="gtabs">
              <div>
                <dt>음성 편집</dt>
                <dd>글을 붙여넣고 마이크를 누른 채 "세 줄로 요약해줘", "더 공손하게"처럼 말하면 그대로 고칩니다.</dd>
              </div>
              <div>
                <dt>사전</dt>
                <dd>정확히 써야 할 용어와 자주 틀리는 말을 넣어 둡니다. 부동산공법 용어가 기본으로 들어 있습니다.</dd>
              </div>
              <div>
                <dt>기록</dt>
                <dd>정리한 글이 쌓입니다. 검색·복사·원문 보기와 최근 7일 통계를 봅니다.</dd>
              </div>
              <div>
                <dt>설정</dt>
                <dd>AI 정리 방식과 키, 말하는 언어, 음성 인식 방식, 나만의 문체, 이메일 서명을 정합니다.</dd>
              </div>
            </dl>
          </section>

          <section id="guide-keys" className="gsec">
            <h3 className="gsec__title">
              <span className="gsec__num">5</span>단축키
            </h3>
            <ul className="gkeys">
              <li>
                <span>
                  <kbd>Space</kbd> 길게
                </span>
                누르는 동안 말하기
              </li>
              <li>
                <span>
                  <kbd>{MOD_KEY}</kbd>+<kbd>Enter</kbd>
                </span>
                정리하기
              </li>
              <li>
                <span>
                  <kbd>Esc</kbd>
                </span>
                녹음·정리 멈추기
              </li>
            </ul>
            <a className="gpc" href={DOWNLOAD_PAGE_URL} target="_blank" rel="noopener noreferrer">
              <span>
                <b>Windows PC 프로그램</b>을 설치하면 메일·메신저·한글 어디서든 <kbd>Win</kbd>+<kbd>H</kbd>로 말해 바로 입력됩니다.
                1.1.5부터는 <b>한/영·한자 키를 건드리지 않습니다</b>. 예전 버전을 쓰셨다면 새로 받아 설치하세요.
              </span>
              <span className="gpc__go">내려받기 ↗</span>
            </a>
          </section>
        </div>
      </div>
    </dialog>
  );
}
