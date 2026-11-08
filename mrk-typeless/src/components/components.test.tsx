import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HistoryItem } from "../lib/history";
import { newTerms } from "./DictionaryView";
import { HistoryView } from "./HistoryView";

describe("newTerms", () => {
  it("한 번에 같은 용어를 두 번 적어도 하나만 넣는다", () => {
    expect(newTerms("개발부담금, 개발부담금", [])).toEqual(["개발부담금"]);
  });

  it("이미 있는 용어와 빈 칸은 빼고, 쉼표·줄바꿈으로 나눈다", () => {
    expect(newTerms("건폐율, 김OO 소장\n , 용적률", ["건폐율"])).toEqual(["김OO 소장", "용적률"]);
  });
});

describe("HistoryView", () => {
  it("접힌 카드에는 긴 글의 앞부분만 그린다", () => {
    const long = "가".repeat(5_000);
    const history: HistoryItem[] = [
      { id: "1", createdAt: Date.now(), kind: "dictation", mode: "clean", raw: "원문", result: long, engine: "local", savedMs: 0 },
    ];
    const html = renderToStaticMarkup(<HistoryView history={history} onChange={() => {}} active={false} />);
    expect(html).toContain("가".repeat(400));
    expect(html).not.toContain("가".repeat(401));
    // 통계의 글자 수는 전체 글로 셉니다.
    expect(html).toContain("5,000");
  });
});
