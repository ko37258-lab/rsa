// Windows용 MR.K Typeless 데스크톱 프로그램 내려받기 주소.
// GitHub 릴리스의 '최신' 주소라 새 버전을 올려도 바뀌지 않습니다.
const RELEASES = "https://github.com/ko37258-lab/rsa/releases";

export const DESKTOP_VERSION = "1.2.0";
export const SETUP_URL = `${RELEASES}/latest/download/MRK-Typeless-Setup.exe`;
export const PORTABLE_URL = `${RELEASES}/latest/download/MRK-Typeless.exe`;
export const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";
/** 아티팩트(claude.ai) 안에서는 상대 주소가 안 되므로 전체 주소를 씁니다. */
export const DOWNLOAD_PAGE_URL = __ARTIFACT__ ? "https://mrk-typeless.vercel.app/download" : "/download";
