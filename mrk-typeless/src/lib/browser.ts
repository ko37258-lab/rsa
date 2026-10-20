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

/** 무료 브라우저 음성인식이 원래 되는 브라우저인지 (실패해도 네트워크 탓일 가능성이 큼) */
export function hasNativeSpeechService(name = browserName()): boolean {
  return name === "Chrome" || name === "Edge" || name === "Safari";
}
