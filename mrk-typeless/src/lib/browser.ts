/** 안내 문구에 쓸 브라우저 이름 */
export function browserName(): string {
  if (typeof navigator === "undefined") return "이 브라우저";
  const ua = navigator.userAgent;
  if ((navigator as Navigator & { brave?: unknown }).brave) return "Brave";
  if (/Whale\//.test(ua)) return "네이버 웨일";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/SamsungBrowser\//.test(ua)) return "삼성 인터넷";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "이 브라우저";
}
