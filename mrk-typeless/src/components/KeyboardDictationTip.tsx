import type { SpeechProblem } from "../hooks/useSpeech";

/** 브라우저 마이크를 못 쓸 때: 운영체제 키보드의 음성 입력으로 원문 칸에 말하는 방법 */
export function KeyboardDictationTip({ reason }: { reason: SpeechProblem }) {
  const headline =
    reason === "unsupported"
      ? "이 브라우저는 음성인식을 지원하지 않습니다."
      : __ARTIFACT__
        ? "claude.ai 화면 안에서는 마이크를 바로 쓸 수 없습니다."
        : "마이크 사용이 막혀 있습니다. 주소창 왼쪽의 사이트 설정에서 마이크를 허용해 주세요.";

  return (
    <aside className="tip" aria-label="키보드 음성 입력 안내">
      <p className="tip__head">
        {headline} 대신 키보드의 음성 입력으로 원문 칸에 말하면, 정리는 똑같이 됩니다.
        {!__ARTIFACT__ && reason === "unsupported" && " 설정 → 음성 인식에서 녹음 받아쓰기 키를 넣으면 어느 브라우저에서나 마이크 버튼을 쓸 수 있습니다."}
      </p>
      <dl className="tip__list">
        <div>
          <dt>휴대폰</dt>
          <dd>원문 칸을 누르고 키보드의 마이크 버튼</dd>
        </div>
        <div>
          <dt>Windows</dt>
          <dd>
            <kbd>Win</kbd> + <kbd>H</kbd>
          </dd>
        </div>
        <div>
          <dt>Mac</dt>
          <dd>
            <kbd>Fn</kbd> 키 두 번 (받아쓰기)
          </dd>
        </div>
      </dl>
    </aside>
  );
}
