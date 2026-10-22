type NavigatorWithHints = Navigator & {
  brave?: unknown;
  userAgentData?: { brands?: { brand: string }[] };
};

/** 안내 문구에 쓸 브라우저 이름 */
export function browserName(): string {
  if (typeof navigator === "undefined") return "이 브라우저";
  const nav = navigator as NavigatorWithHints;
  const ua = nav.userAgent;
  if (nav.brave) return "Brave";
  if (/Whale\//.test(ua)) return "네이버 웨일";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "삼성 인터넷";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Aside\//i.test(ua)) return "Aside";

  // Chrome 바탕 브라우저(Aside 등)는 사용자 에이전트에 "Chrome"이라고만 적기 때문에
  // 브랜드 목록으로 구글 정식 Chrome인지 가려냅니다.
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  if (brands.includes("Google Chrome")) return "Chrome";
  const own = brands.find((b) => !/Chromium|Not.?A.?Brand/i.test(b));
  if (own) return own === "Microsoft Edge" ? "Edge" : own;
  if (/Chrome\//.test(ua)) return brands.length ? "이 브라우저" : "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "이 브라우저";
}

/** 카카오톡·네이버 같은 앱 안에서 열린 경우 그 앱 이름. 앱 안 브라우저는 마이크가 막힌 경우가 많습니다. */
export function inAppBrowser(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return "카카오톡";
  if (/NAVER\(inapp/i.test(ua)) return "네이버 앱";
  if (/Instagram/i.test(ua)) return "인스타그램";
  if (/FBAN|FBAV/i.test(ua)) return "페이스북";
  if (/\bLine\//i.test(ua)) return "라인";
  return null;
}

/** 안드로이드에서 지금 주소를 Chrome으로 여는 주소 */
export function openInChromeUrl(): string | null {
  if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return null;
  const { host, pathname, search, hash } = window.location;
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
}

/** 무료 브라우저 음성인식이 원래 되는 브라우저인지 (실패해도 네트워크 탓일 가능성이 큼) */
export function hasNativeSpeechService(name = browserName()): boolean {
  return name === "Chrome" || name === "Edge" || name === "Safari";
}
