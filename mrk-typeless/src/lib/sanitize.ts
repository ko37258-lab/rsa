// Windows 음성 입력(Win+H)은 Chrome 계열 브라우저에서 한글 글자 사이에
// "클로─ ─드"처럼 줄 모양 문자나 보이지 않는 채움 문자를 끼워 넣곤 합니다. 정리 전에 지웁니다.
const DASHES = "─━—―⸺ㅡ";
const INVISIBLE = /[ᅟᅠㅤﾠ​-‍⁠﻿]/g;
const BROKEN_JOIN = new RegExp(`([^\\s${DASHES}])[${DASHES}]\\s{0,2}[${DASHES}](?=[^\\s${DASHES}])`, "g");

export function sanitizeDictation(text: string): string {
  let out = text.normalize("NFC").replace(INVISIBLE, "");
  let prev: string;
  do {
    prev = out;
    out = out.replace(BROKEN_JOIN, "$1");
  } while (out !== prev);
  return out;
}
