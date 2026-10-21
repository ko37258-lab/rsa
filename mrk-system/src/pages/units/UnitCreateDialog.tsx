import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { Button, Dialog, Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui";
import type { Unit, UnitType } from "@/types";

/** 호실 등록 — 원본의 "호실 번호 · 룸타입 · 층" 입력을 따른다 */
export function UnitCreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { branchId, branches } = useBranch();
  const nav = useNavigate();
  const [bid, setBid] = useState(branchId === "all" ? "" : branchId);
  const [code, setCode] = useState("");
  const [typeId, setTypeId] = useState("");
  const [floor, setFloor] = useState("");
  const [rent, setRent] = useState<number | null>(null);
  const [mgmt, setMgmt] = useState<number | null>(null);
  const types = useApi<UnitType[]>(["unit-types", bid], bid ? `/api/branches/${bid}/unit-types` : null);

  useEffect(() => {
    if (open) {
      setBid(branchId === "all" ? branches[0]?.id ?? "" : branchId);
      setCode("");
      setTypeId("");
      setFloor("");
      setRent(null);
      setMgmt(null);
    }
  }, [open, branchId, branches]);

  // 번호가 "503" 처럼 생기면 층을 채워 준다
  useEffect(() => {
    if (/^\d{3,4}$/.test(code)) setFloor(code.slice(0, -2));
  }, [code]);

  const pickType = (id: string) => {
    setTypeId(id);
    const t = types.data?.find((x) => x.id === id);
    if (t) {
      setRent(t.list_rent);
      setMgmt(t.list_mgmt);
    }
  };

  const codeOk = /^[A-Za-z0-9-]+$/.test(code);
  const save = useApiMutation<Unit>({
    invalidate: [["units"]],
    success: (u) => `${u.code}호를 등록했다`,
    onSuccess: (u) => {
      onClose();
      nav(`/units/${u.id}`);
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="호실 등록"
      description="등록하면 바로 판매 가능 상태가 된다. 모집가는 룸타입 정가로 채워 두고 고칠 수 있다."
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={!bid || !codeOk}
            onClick={() =>
              save.mutate({
                path: "/api/units",
                body: { branch_id: bid, code, unit_type_id: typeId || null, floor: floor === "" ? null : Number(floor), asking_price: rent !== null ? { rent, mgmt: mgmt ?? 0 } : null },
              })
            }
          >
            등록
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {branchId === "all" && (
          <Field label="지점" htmlFor="unit-branch">
            <Select id="unit-branch" value={bid} onChange={(e) => setBid(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
        )}
        <FormGrid>
          <Field label="호실 번호" htmlFor="unit-code" hint="영문·숫자·- 만. 지점 안에서 겹치지 않아야 한다" error={code && !codeOk ? "영문·숫자·- 만 쓸 수 있다" : null}>
            <Input id="unit-code" value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="예: 503" autoFocus />
          </Field>
          <Field label="층" htmlFor="unit-floor">
            <Input id="unit-floor" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^\d-]/g, ""))} placeholder="층 미정" />
          </Field>
        </FormGrid>
        <Field label="룸타입" htmlFor="unit-type">
          <Select
            id="unit-type"
            value={typeId}
            onChange={(e) => pickType(e.target.value)}
            placeholder="룸타입 미정"
            options={(types.data ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.area_m2}㎡ · 정가 ${Math.round(t.list_rent / 10000)}만` }))}
          />
        </Field>
        <FormGrid>
          <Field label="모집가 · 월세" htmlFor="unit-rent">
            <MoneyInput id="unit-rent" value={rent} onChange={setRent} placeholder="없음" />
          </Field>
          <Field label="모집가 · 관리비" htmlFor="unit-mgmt">
            <MoneyInput id="unit-mgmt" value={mgmt} onChange={setMgmt} placeholder="없음" />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
