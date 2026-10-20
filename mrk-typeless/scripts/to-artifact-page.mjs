// dist-artifact/의 app.js·app.css를 claude.ai 아티팩트 한 장짜리 페이지로 합칩니다.
// 아티팩트는 <!doctype>/<html>/<head>/<body>를 게시할 때 덧씌우므로 내용만 씁니다.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}dist-artifact/`;

const indexHtml = readFileSync(`${root}index.html`, "utf8");
const title = indexHtml.match(/<title>(.*?)<\/title>/)?.[1] ?? "MR.K - Typeless";
// 아티팩트는 Google Fonts 스타일시트만 허용하므로 그 밖의 글꼴 링크(Pretendard 등)는 뺍니다.
const fontLinks = [...indexHtml.matchAll(/<link rel="(?:stylesheet|preconnect)"[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => /fonts\.(googleapis|gstatic)\.com/.test(tag));
const css = readFileSync(`${dist}app.css`, "utf8").trim();
const js = readFileSync(`${dist}app.js`, "utf8").trim().replaceAll("</script", "<\\/script");

// React UMD는 cdnjs에서 정확한 버전으로 불러옵니다 (package.json의 react와 같은 버전).
const REACT = "18.3.1";

const page = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fontLinks.join("\n")}
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT}/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;

writeFileSync(`${dist}mrk-typeless.html`, page);
console.log(`아티팩트 페이지: dist-artifact/mrk-typeless.html (${(page.length / 1024).toFixed(1)} KB)`);
