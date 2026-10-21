import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { useBranch } from "@/lib/branch";
import { useApiMutation } from "@/lib/hooks";
import { CHANNEL, SOURCES } from "@/lib/codes";
import { maskPhone } from "@/lib/format";
import { Badge, Button, Dialog, Field, FormGrid, Input, Segmented, Select, Textarea } from "@/components/ui";
import type { Channel, Inquiry } from "@/types";
import type { PartyMatch } from "./model";

const empty = {
  kind: "individual" as "individual" | "corporation",
  company_name: "",
  name: "",
  email: "",
  phone: "",
  channel: "phone" as Channel,
  source_group: "",
  source_detail: "",
  branch_id: "",
  desired_move_in: "",
  stay_months: "",
  budget_man: "",
  rooms: "1",
  message: "",
};

/** 입주문의 접수 — 전화·방문·메일로 들어온 문의를 직접 남긴다 */
export function InquiryCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { branchId, branches } = useBranch();
  const nav = useNavigate();
  const [f, setF] = useState(empty);
  const [matches, setMatches] = useState<PartyMatch[]>([]);
  const [party, setParty] = useState<PartyMatch | null>(null);
  const up = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (open) {
      setF({ ...empty, branch_id: branchId === "all" ? "" : branchId });
      setMatches([]);
      setParty(null);
    }
  }, [open, branchId]);

  /** 전화·이메일을 다 적으면 같은 연락처 고객을 찾는다 */
  const lookup = async (field: "phone" | "email", value: string) => {
    if (party) return;
    if (field === "phone" && value.replace(/\D/g, "").length < 9) return;
    if (field === "email" && !/.+@.+\..+/.test(value)) return;
    try {
      const rows = await api<PartyMatch[]>("/api/parties/search", { method: "POST", body: { field, value } });
      setMatches((prev) => [...prev.filter((p) => !rows.some((r) => r.id === p.id)), ...rows]);
    } catch {
      /* 찾기 실패는 접수를 막지 않는다 */
    }
  };

  const save = useApiMutation<Inquiry>({
    invalidate: [["inquiries"], ["customers"]],
    success: "문의를 접수했다",
    onSuccess: (q) => {
      onClose();
      nav(`/inquiries/${q.id}`);
    },
  });

  const corp = f.kind === "corporation";
  const valid = party ? true : (corp ? f.company_name.trim() : f.name.trim()) && (f.phone.trim() || f.email.trim());

  const submit = () =>
    save.mutate({
      path: "/api/inquiries",
      body: {
        party_id: party?.id,
        kind: f.kind,
        company_name: f.company_name,
        name: f.name,
        email: f.email,
        phone: f.phone,
        channel: f.channel,
        source_group: f.source_group || "기타",
        source_detail: f.source_detail || "기타",
        branch_id: f.branch_id || null,
        desired_move_in: f.desired_move_in || null,
        stay_months: f.stay_months ? Number(f.stay_months) : null,
        monthly_budget: f.budget_man ? Number(f.budget_man) * 10000 : null,
        rooms: Number(f.rooms) || 1,
        message: f.message,
      },
    });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="입주문의 접수"
      description="전화·방문·메일로 들어온 문의를 직접 남긴다"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!valid} loading={save.isPending} onClick={submit}>
            접수
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
      >
        {party ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brass/50 bg-brass/10 px-3 py-2.5 text-sm">
            <span>
              <b>{party.name}</b> 고객으로 받는다 · {party.phone ? maskPhone(party.phone) : party.email} · 문의 {party.inquiry_count}건
            </span>
            <Button size="sm" variant="ghost" onClick={() => setParty(null)}>
              새로 만들기
            </Button>
          </div>
        ) : (
          <>
            <Segmented
              value={f.kind}
              onChange={(v) => up("kind", v)}
              options={[
                { value: "individual", label: "개인" },
                { value: "corporation", label: "법인" },
              ]}
            />
            <FormGrid>
              {corp && (
                <Field label="회사명" htmlFor="iq-company">
                  <Input id="iq-company" value={f.company_name} onChange={(e) => up("company_name", e.target.value)} />
                </Field>
              )}
              <Field label={corp ? "담당자 이름" : "이름"} htmlFor="iq-name">
                <Input id="iq-name" value={f.name} onChange={(e) => up("name", e.target.value)} autoFocus />
              </Field>
              <Field label="전화" htmlFor="iq-phone">
                <Input id="iq-phone" inputMode="tel" value={f.phone} onChange={(e) => up("phone", e.target.value)} onBlur={(e) => lookup("phone", e.target.value)} placeholder="010-… 또는 +81 …" />
              </Field>
              <Field label="이메일" htmlFor="iq-email">
                <Input id="iq-email" type="email" value={f.email} onChange={(e) => up("email", e.target.value)} onBlur={(e) => lookup("email", e.target.value)} />
              </Field>
            </FormGrid>
            {matches.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border border-warn/50 bg-warn/10 px-3 py-2.5">
                <p className="text-sm font-medium">같은 연락처의 고객이 있다. 같은 사람이면 그 고객으로 받는다</p>
                {matches.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <b>{m.name}</b>
                      {m.kind === "corporation" && <Badge tone="navy">법인</Badge>}
                      <span className="text-ink3">{[m.contact_name && `담당 ${m.contact_name}`, m.phone, m.email, `문의 ${m.inquiry_count}건`, m.lease_count ? `계약 ${m.lease_count}건` : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Button size="sm" onClick={() => (setParty(m), setMatches([]))}>
                      이 고객으로 받기
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <FormGrid cols={3}>
          <Field label="접수 채널" htmlFor="iq-channel">
            <Select id="iq-channel" value={f.channel} onChange={(e) => up("channel", e.target.value as Channel)} options={Object.entries(CHANNEL).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="유입경로 · 대분류" htmlFor="iq-src">
            <Select id="iq-src" value={f.source_group} onChange={(e) => setF((x) => ({ ...x, source_group: e.target.value, source_detail: "" }))} placeholder="고르기" options={Object.keys(SOURCES).map((k) => ({ value: k, label: k }))} />
          </Field>
          <Field label="세부 경로" htmlFor="iq-src2" hint={!f.source_group ? "대분류를 먼저 고른다" : undefined}>
            <Select id="iq-src2" value={f.source_detail} disabled={!f.source_group} onChange={(e) => up("source_detail", e.target.value)} placeholder="고르기" options={(SOURCES[f.source_group] ?? []).map((k) => ({ value: k, label: k }))} />
          </Field>
        </FormGrid>

        <FormGrid cols={3}>
          <Field label="희망 지점" htmlFor="iq-branch">
            <Select id="iq-branch" value={f.branch_id} onChange={(e) => up("branch_id", e.target.value)} placeholder="정하지 않음" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="희망 입주일" htmlFor="iq-movein">
            <Input id="iq-movein" type="date" value={f.desired_move_in} onChange={(e) => up("desired_move_in", e.target.value)} />
          </Field>
          <Field label="희망 기간(개월)" htmlFor="iq-months">
            <Input id="iq-months" inputMode="numeric" value={f.stay_months} onChange={(e) => up("stay_months", e.target.value.replace(/\D/g, ""))} placeholder="예: 6" />
          </Field>
          <Field label="월 예산(만원)" htmlFor="iq-budget">
            <Input id="iq-budget" inputMode="numeric" value={f.budget_man} onChange={(e) => up("budget_man", e.target.value.replace(/\D/g, ""))} placeholder="예: 75" />
          </Field>
          <Field label="요청 방 수" htmlFor="iq-rooms">
            <Input id="iq-rooms" inputMode="numeric" value={f.rooms} onChange={(e) => up("rooms", e.target.value.replace(/\D/g, ""))} />
          </Field>
        </FormGrid>

        <Field label="문의 내용" htmlFor="iq-msg" hint="고객이 문의하며 한 말. 이 문의 대화의 첫 메시지가 된다">
          <Textarea id="iq-msg" rows={3} value={f.message} onChange={(e) => up("message", e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}
