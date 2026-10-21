import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, PlayCircle, RotateCcw } from "lucide-react";
import { Badge, Button, Field, Input, Section, useToast } from "@/components/ui";
import { api, API_MODE } from "@/api/client";
import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { fmt, num } from "@/lib/format";
import type { SetupStatus } from "@/mock/handlers/platform";
import { SetupWizard } from "./SetupWizard";
import { mb } from "./backup";

function useStorageEstimate() {
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let alive = true;
    navigator.storage
      ?.estimate?.()
      .then((e) => alive && setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return est;
}

export function DataSection({ goBackup }: { goBackup: () => void }) {
  const st = useApi<SetupStatus>(["setup"], "/api/setup/status");
  const [wizard, setWizard] = useState(false);
  const [demoConfirm, setDemoConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const { setBranchId } = useBranch();
  const est = useStorageEstimate();
  const s = st.data;
  const real = s?.mode === "real";

  if (API_MODE === "live")
    return (
      <Section title="데이터" hint="실서버에 연결돼 있다">
        <p className="text-sm text-ink2">데이터는 서버에 있다. 시작하기·시연 데이터·백업은 브라우저 저장 모드에서만 쓴다.</p>
      </Section>
    );

  const toDemo = async () => {
    setBusy(true);
    try {
      await api("/api/setup/demo", { method: "POST" });
      setBranchId("all");
      await qc.resetQueries();
      toast.show("시연 데이터를 오늘 기준으로 다시 만들었다", "good");
      setDemoConfirm(false);
      setTyped("");
      nav("/dashboard");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "바꾸지 못했다", "bad");
    } finally {
      setBusy(false);
    }
  };

  if (wizard)
    return (
      <Section title="빈 상태로 시작" hint="내 지점·룸타입·호실만 넣고 시작한다. 5단계, 2분이면 끝난다.">
        <SetupWizard realMode={real} onCancel={() => setWizard(false)} />
      </Section>
    );

  return (
    <div className="flex flex-col gap-4">
      <Section
        title={
          <span className="flex items-center gap-2">
            지금 쓰는 데이터
            {s && <Badge tone={real ? "good" : "brass"}>{real ? "실사용" : "시연 데이터"}</Badge>}
          </span>
        }
        hint={real ? "이 브라우저에 저장된 실제 운영 데이터다. 다른 기기·직원과 나누려면 백업 파일을 옮기거나 서버를 연결한다." : "지어낸 3개 지점·96개 호실로 화면을 둘러보는 상태다. 실제로 쓰려면 빈 상태로 시작한다."}
      >
        {s ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              {(
                [
                  ["회사", s.company_name],
                  ["지점", `${s.counts.branches}개`],
                  ["호실", `${num(s.counts.units)}개`],
                  ["계약", `${num(s.counts.leases)}건`],
                  ["고객", `${num(s.counts.parties)}명`],
                  ["청구 줄", `${num(s.counts.charges)}건`],
                  ["입금", `${num(s.counts.payments)}건`],
                  [real ? "시작한 날" : "만든 날", fmt(s.seeded_on)],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-ink3">{k}</dt>
                  <dd className="num truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-sunken/60 px-3 py-2 text-xs text-ink2">
              <Database className="size-3.5 text-ink3" />
              <span className="num">데이터 {mb(s.data_size)} · 브라우저 저장 한도 약 5MB</span>
              {s.data_size > 4_000_000 && <span className="font-medium text-bad">· 한도에 가깝다. 백업을 내려받는다</span>}
              {s.counts.files > 0 && (
                <span className="num">
                  · 첨부·서명본 {s.counts.files}개{est && est.usage > 0 ? ` (${mb(est.usage)})` : ""}
                </span>
              )}
            </div>
            {s.last_save_failed && (
              <div className="flex items-start gap-2 rounded-md border border-bad/40 bg-bad/5 px-3 py-2.5 text-sm text-bad" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                  <span>브라우저 저장 공간이 부족해 마지막 변경을 저장하지 못했다 — 백업 파일을 내려받는다</span>
                  <Button size="sm" variant="danger" onClick={goBackup}>
                    백업으로
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink3">불러오는 중</p>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="빈 상태로 시작" hint="시연 데이터를 지우고 내 지점·룸타입·호실로 바꾼다. 상담·계약·청구는 비어 있는 상태가 된다.">
          <div className="flex flex-col gap-3">
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink2">
              <li>회사·지점·입금 계좌</li>
              <li>계약 조건 기본값(선불·후불, 일할, 납기)</li>
              <li>룸타입과 호실 번호(예: 101-105, 201-205)</li>
            </ul>
            <div>
              <Button variant="brass" icon={<PlayCircle className="size-4" />} onClick={() => setWizard(true)}>
                {real ? "처음부터 다시 시작" : "빈 상태로 시작"}
              </Button>
            </div>
            {real && <p className="text-xs text-bad">지금 데이터가 바뀐다. 먼저 백업 파일을 내려받는다.</p>}
          </div>
        </Section>

        <Section title="시연 데이터" hint="지어낸 3개 지점·96개 호실을 오늘 날짜 기준으로 다시 만든다.">
          {!demoConfirm ? (
            <Button icon={<RotateCcw className="size-4" />} onClick={() => (real ? setDemoConfirm(true) : void toDemo())} loading={busy}>
              {real ? "시연 데이터로 돌아가기" : "시연 데이터 다시 만들기"}
            </Button>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-bad/40 bg-bad/5 p-3">
              <p className="text-sm text-bad">실사용 데이터가 시연 데이터로 바뀐다. 백업하지 않았다면 되돌릴 수 없다.</p>
              <Field label="계속하려면 «시연»이라고 적는다" htmlFor="demo-typed">
                <Input id="demo-typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="시연" />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={goBackup}>먼저 백업</Button>
                <Button
                  onClick={() => {
                    setDemoConfirm(false);
                    setTyped("");
                  }}
                >
                  그만두기
                </Button>
                <Button variant="danger" disabled={typed.trim() !== "시연"} loading={busy} onClick={toDemo}>
                  시연 데이터로 바꾸기
                </Button>
              </div>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
