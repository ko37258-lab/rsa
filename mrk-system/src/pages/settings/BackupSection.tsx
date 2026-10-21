import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { Button, KeyValue, Section, useToast } from "@/components/ui";
import { api, API_MODE } from "@/api/client";
import { useBranch } from "@/lib/branch";
import { fmt, num } from "@/lib/format";
import { todayStr } from "@/lib/dates";
import type { BackupFile } from "@/mock/handlers/platform";
import { downloadJson, embedFiles, mb, restoreFiles } from "./backup";

interface CheckRes {
  mode: "demo" | "real";
  company_name: string;
  version: number;
  seeded_on: string;
  branches: string[];
  units: number;
  leases: number;
  parties: number;
  charges: number;
}

export function BackupSection() {
  const [withFiles, setWithFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<{ name: string; size: number; data: BackupFile; check: CheckRes } | null>(null);
  const [agree, setAgree] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { setBranchId } = useBranch();

  if (API_MODE === "live")
    return (
      <Section title="백업" hint="실서버 모드">
        <p className="text-sm text-ink2">데이터는 서버에 있다. 백업은 서버 관리자가 맡는다.</p>
      </Section>
    );

  const download = async () => {
    setBusy(true);
    try {
      let file = await api<BackupFile>("/api/backup");
      let missing = 0;
      if (withFiles) ({ file, missing } = await embedFiles(file));
      downloadJson(`MRK-백업_${todayStr()}.json`, file);
      toast.show(missing ? `백업 파일을 만들었다 · 못 읽은 파일 ${missing}개는 빠졌다` : "백업 파일을 만들었다", "good");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "백업하지 못했다", "bad");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (f: File | undefined) => {
    setPicked(null);
    setAgree(false);
    if (!f) return;
    try {
      const data = JSON.parse(await f.text()) as BackupFile;
      const check = await api<CheckRes>("/api/backup/check", { method: "POST", body: data });
      setPicked({ name: f.name, size: f.size, data, check });
    } catch (e) {
      toast.show(e instanceof SyntaxError ? "JSON 파일이 아니다. MR.K 에서 내려받은 백업 파일을 고른다" : e instanceof Error ? e.message : "읽지 못했다", "bad");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const restore = async () => {
    if (!picked) return;
    setRestoring(true);
    try {
      const restoredFiles = await restoreFiles(picked.data.files);
      await api("/api/backup/restore", { method: "POST", body: { db: picked.data.db ?? picked.data } });
      setBranchId("all");
      await qc.resetQueries();
      toast.show(`백업을 불러왔다 · 호실 ${picked.check.units}개${restoredFiles ? ` · 파일 ${restoredFiles}개` : ""}`, "good");
      setPicked(null);
      nav("/dashboard");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "불러오지 못했다", "bad");
    } finally {
      setRestoring(false);
    }
  };

  const fileCount = picked ? Object.keys(picked.data.files ?? {}).length : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section title="백업 파일 내려받기" hint="데이터는 이 브라우저에만 있다. 일주일에 한 번, 그리고 큰 작업 전에 내려받아 안전한 곳(구글 드라이브 등)에 둔다.">
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm text-ink2" htmlFor="bk-files">
            <input id="bk-files" type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} className="mt-0.5 size-4 accent-[rgb(var(--navy))]" />
            <span>
              파일(계약서 서명본·첨부) 포함
              <span className="block text-xs text-ink3">파일이 많으면 백업 파일이 커진다</span>
            </span>
          </label>
          <div>
            <Button variant="primary" icon={<Download className="size-4" />} loading={busy} onClick={download}>
              백업 파일 내려받기
            </Button>
          </div>
          <p className="text-xs text-ink3">파일 이름: MRK-백업_{todayStr()}.json</p>
        </div>
      </Section>

      <Section title="백업 불러오기" hint="다른 기기로 옮기거나 예전 상태로 되돌릴 때 쓴다. 지금 데이터는 백업 내용으로 바뀐다.">
        <div className="flex flex-col gap-3">
          <input ref={input} id="bk-input" type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          <div>
            <Button icon={<Upload className="size-4" />} onClick={() => input.current?.click()}>
              백업 파일 고르기
            </Button>
          </div>
          {picked && (
            <div className="flex flex-col gap-3 rounded-md border border-line p-3">
              <div className="text-sm font-medium">
                {picked.name} <span className="num text-xs font-normal text-ink3">· {mb(picked.size)}</span>
              </div>
              <KeyValue
                items={[
                  ["종류", picked.check.mode === "real" ? "실사용 데이터" : "시연 데이터"],
                  ["회사", picked.check.company_name || "—"],
                  ["지점", picked.check.branches.join(", ") || "—"],
                  ["규모", `호실 ${num(picked.check.units)}개 · 계약 ${num(picked.check.leases)}건 · 고객 ${num(picked.check.parties)}명`],
                  ["저장한 때", picked.data.exported_at ? fmt(picked.data.exported_at, "yyyy.M.d HH:mm") : "—"],
                  ["파일", fileCount ? `${fileCount}개 포함` : "없음"],
                ]}
              />
              <label className="flex items-start gap-2 rounded-md border border-bad/40 bg-bad/5 p-2.5 text-sm text-bad" htmlFor="bk-agree">
                <input id="bk-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[rgb(var(--bad))]" />
                지금 이 브라우저의 데이터가 이 백업으로 바뀐다
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => setPicked(null)}>그만두기</Button>
                <Button variant="danger" disabled={!agree} loading={restoring} onClick={restore}>
                  이 백업으로 바꾸기
                </Button>
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
