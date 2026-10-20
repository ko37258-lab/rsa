import { useMemo } from "react";
import { markFillers } from "../lib/localCleanup";

/**
 * 정리하는 동안 보여 주는 원문: "음, 어" 같은 군더더기와 반복한 말에 손으로 줄을 긋습니다.
 * AI가 무엇을 걷어내는지 눈으로 보이게 하는 장치입니다.
 */
export function StrikePreview({ text }: { text: string }) {
  const lines = useMemo(() => markFillers(text), [text]);
  let order = 0;
  return (
    <div className="strike-preview" aria-hidden="true">
      {lines.map((tokens, li) => (
        <p key={li}>
          {tokens.map((t, ti) => (
            <span key={ti}>
              {t.removed ? (
                <s className="strike" style={{ ["--i" as string]: order++ }}>
                  {t.text}
                </s>
              ) : (
                t.text
              )}{" "}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
