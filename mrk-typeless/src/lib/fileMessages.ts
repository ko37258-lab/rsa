// 받아쓰기 오류 문구는 마이크로 말할 때에 맞춰 쓰여 있습니다('다시 말해 주세요').
// 녹음 파일을 올렸을 때는 파일에 맞는 말로 고쳐 보여 줍니다. PC 프로그램의 filejob.for_file과 같은 규칙입니다.

const SERVER_SAID = / ?\((?:ElevenLabs|OpenAI): ([^)]*)\)/;
const FORMAT_HINT = " 이 서비스가 받지 않는 파일 형식 같습니다. m4a·mp3·wav로 바꿔 올리거나, 설정에서 받아쓰기 서비스를 Gemini로 바꿔 보세요.";

/** 말로 받아쓸 때 쓰던 안내를 녹음 파일에 맞게 고치고, 서버가 보낸 영어 설명은 화면에서 뺍니다. */
export function forFile(message: string): string {
  // 웹에는 로그가 없어, 영어 설명이 파일 형식 문제였으면 그 뜻만 한국어로 남깁니다.
  const said = SERVER_SAID.exec(message)?.[1] ?? "";
  let m = message.replace("나눠서 말해 주세요", "나눠서 올려 주세요").replace("다시 말해 주세요", "다시 해 주세요");
  m = m.replace(new RegExp(SERVER_SAID.source, "g"), "");
  m = m.replace(/(거절했습니다 \(\d+\)): [\x00-\x7f]+$/, "$1.");
  if (/format|file type|unsupported|decod/i.test(said)) m += FORMAT_HINT;
  return m;
}
