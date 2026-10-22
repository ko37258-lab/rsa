// 화면이 처음 열릴 때 서버 기능(AI·프록시·유튜브 검색·내레이션 중계)이 켜져 있는지 알려 줍니다. 비밀값은 내보내지 않습니다.
import { accessCode } from './_common.mjs';
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    ai: Boolean(process.env.ANTHROPIC_API_KEY && accessCode()),
    proxy: true,
    needsCode: Boolean(accessCode()),
    youtube: Boolean(process.env.YOUTUBE_API_KEY),
    tts: true, // Fish Audio 내레이션 중계(api/tts) — 서버가 있으면 전달 가능(키는 사용자가 넣음)
  });
}
