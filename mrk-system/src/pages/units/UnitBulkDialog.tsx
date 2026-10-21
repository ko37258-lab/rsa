import { useEffect, useMemo, useState } from "react";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { cx } from "@/lib/format";
import { Button, Dialog, Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui";
import type { Building, UnitType } from "@/types";
import type { UnitRow } from "./model";
import { CODE_RE, expandCodes, floorFromCode } from "./codes";

/** 여러 호실 한 번에 — "101-110, 201-205, B01" 처럼 적으면 미리 보여주고 한꺼번에 등록한다 */
export function UnitBulkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { branchId, branches } = useBranch();
  const [bid, setBid] = useState("");
  const [text, setText] = useState("");
  const [typeId, setTypeId] = useState("");
  const [buildingId, setBuildingId] = useState("");
  const [floor, setFloor] = useState("");
  const [rent, setRent] = useState<number | null>(null);
  const [mgmt, setMgmt] = useState<number | null>(null);
  const types = useApi<UnitType[]>(["unit-types", bid], bid ? `/api/branches/${bid}/unit-types` : null);
  const buildings = useApi<Building[]>(["buildings", bid], bid ? `/api/branches/${bid}/buildings` : null);
  const existing = useApi<UnitRow[]>(["units", bid], bid ? `/api/units?branch_id=${bid}` : null);

  useEffect(() => {
    if (open) {
      setBid(branchId === "all" ? branches[0]?.id ?? "" : branchId);
      setText("");
      setTypeId("");
      setBuildingId("");
      setFloor("");
      setRent(null);
      setMgmt(null);
    }
  }, [open, branchId, branches]);

  const pickType = (id: string) => {
    setTypeId(id);
    const t = types.data?.find((x) => x.id === id);
    setRent(t ? t.list_rent : null);
    setMgmt(t ? t.list_mgmt : null);
  };

  const codes = useMemo(() => expandCodes(text), [text]);
  const have = useMemo(() => new Set((existing.data ?? []).map((u) => u.code.toLowerCase())), [existing.data]);
  const chips = codes.map((c) => ({ code: c, bad: !CODE_RE.test(c), dup: have.has(c.toLowerCase()), floor: floor === "" ? floorFromCode(c) : Number(floor) }));
  const bad = chips.filter((c) => c.bad).length;
  const dup = chips.filter((c) => c.dup).length;
  const fresh = chips.filter((c) => !c.bad && !c.dup);

  const save = useApiMutation<{ created: number }>({ invalidate: [["units"]], success: (r) => `${r.created}개 호실을 등록했다`, onSuccess: onClose });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="여러 호실 한 번에"
      description="범위는 101-110 또는 101~110, 여러 개는 쉼표로 구분한다. 층은 번호에서 읽는다(301 → 3층). 하나라도 문제가 있으면 등록하지 않는다."
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={!bid || !fresh.length || bad > 0 || dup > 0}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                path: "/api/units/bulk",
                body: { branch_id: bid, building_id: buildingId || null, unit_type_id: typeId || null, codes: fresh.map((c) => c.code), floor: floor === "" ? null : Number(floor), asking_price: rent !== null ? { rent, mgmt: mgmt ?? 0 } : null },
              })
            }
          >
            {fresh.length ? `${fresh.length}개 등록` : "등록"}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormGrid cols={3}>
          <Field label="지점" htmlFor="bulk-branch">
            <Select id="bulk-branch" value={bid} onChange={(e) => (setBid(e.target.value), setTypeId(""), setBuildingId(""))} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="건물" htmlFor="bulk-building">
            <Select id="bulk-building" value={buildingId} onChange={(e) => setBuildingId(e.target.value)} placeholder="기본 건물" options={(buildings.data ?? []).map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="층" htmlFor="bulk-floor" hint="비우면 번호에서 읽는다">
            <Input id="bulk-floor" inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^\d-]/g, ""))} placeholder="번호에서 읽기" />
          </Field>
        </FormGrid>
        <Field label="호실 번호" htmlFor="bulk-codes">
          <Textarea id="bulk-codes" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="예: 101-110, 201-205, B01" autoFocus />
        </Field>
        {codes.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-sunken/50 p-3">
            <div className="text-xs text-ink2">
              새 호실 <b className="num">{fresh.length}</b>개
              {dup > 0 && <span className="text-bad"> · 이미 있음 {dup}개</span>}
              {bad > 0 && <span className="text-bad"> · 잘못된 번호 {bad}개(영문·숫자·- 만)</span>}
            </div>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {chips.map((c) => (
                <span
                  key={c.code}
                  title={c.bad ? "영문·숫자·- 만 쓸 수 있다" : c.dup ? "이미 있는 호실" : c.floor === null ? "층 미정" : `${c.floor}층`}
                  className={cx("num rounded border px-1.5 py-0.5 text-xs", c.bad || c.dup ? "border-bad/50 bg-bad/10 text-bad line-through" : "border-line bg-surface")}
                >
                  {c.code}
                  {!c.bad && !c.dup && <span className="ml-1 text-[10px] text-ink3">{c.floor === null ? "층?" : `${c.floor}F`}</span>}
                </span>
              ))}
            </div>
          </div>
        )}
        <FormGrid cols={3}>
          <Field label="룸타입" htmlFor="bulk-type">
            <Select
              id="bulk-type"
              value={typeId}
              onChange={(e) => pickType(e.target.value)}
              placeholder="룸타입 미정"
              options={(types.data ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${t.area_m2}㎡` }))}
            />
          </Field>
          <Field label="모집가 · 월세" htmlFor="bulk-rent">
            <MoneyInput id="bulk-rent" value={rent} onChange={setRent} placeholder="없음" />
          </Field>
          <Field label="모집가 · 관리비" htmlFor="bulk-mgmt">
            <MoneyInput id="bulk-mgmt" value={mgmt} onChange={setMgmt} placeholder="없음" />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}
