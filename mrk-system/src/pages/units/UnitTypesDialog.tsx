import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { Button, Dialog, Field, Input, MoneyInput, Select } from "@/components/ui";
import type { Building, UnitType } from "@/types";
import type { UnitRow } from "./model";

type Draft = { name: string; area_m2: string; list_rent: number | null; list_mgmt: number | null };
const blank: Draft = { name: "", area_m2: "", list_rent: null, list_mgmt: null };

/** 룸타입 관리 — 정가(월세·관리비)·면적, 그리고 건물 추가. 쓰는 호실이 있는 룸타입은 지우지 못한다 */
export function UnitTypesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { branchId, branches } = useBranch();
  const [bid, setBid] = useState("");
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [add, setAdd] = useState<Draft>(blank);
  const [bname, setBname] = useState("");
  const types = useApi<UnitType[]>(["unit-types", bid], bid ? `/api/branches/${bid}/unit-types` : null);
  const buildings = useApi<Building[]>(["buildings", bid], bid ? `/api/branches/${bid}/buildings` : null);
  const units = useApi<UnitRow[]>(["units", bid], bid ? `/api/units?branch_id=${bid}` : null);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of units.data ?? []) if (u.unit_type_id) m.set(u.unit_type_id, (m.get(u.unit_type_id) ?? 0) + 1);
    return m;
  }, [units.data]);

  useEffect(() => {
    if (open) {
      setBid(branchId === "all" ? branches[0]?.id ?? "" : branchId);
      setEdits({});
      setAdd(blank);
      setBname("");
    }
  }, [open, branchId, branches]);

  const inv = [["unit-types"], ["units"], ["buildings"]];
  const patch = useApiMutation({ invalidate: inv, success: "룸타입을 고쳤다" });
  const create = useApiMutation({ invalidate: inv, success: "룸타입을 더했다", onSuccess: () => setAdd(blank) });
  const del = useApiMutation({ invalidate: inv, success: "룸타입을 지웠다" });
  const addB = useApiMutation({ invalidate: inv, success: "건물을 더했다", onSuccess: () => setBname("") });

  const draftOf = (t: UnitType): Draft => edits[t.id] ?? { name: t.name, area_m2: String(t.area_m2), list_rent: t.list_rent, list_mgmt: t.list_mgmt };
  const dirty = (t: UnitType) => {
    const d = edits[t.id];
    return !!d && (d.name !== t.name || Number(d.area_m2) !== t.area_m2 || d.list_rent !== t.list_rent || d.list_mgmt !== t.list_mgmt);
  };
  const setD = (id: string, d: Draft) => setEdits((e) => ({ ...e, [id]: d }));

  return (
    <Dialog open={open} onClose={onClose} wide title="룸타입 관리" description="정가는 계약 작성·공실 손실 계산에 쓰인다. 새 룸타입을 더하면 호실 등록에서 고를 수 있다." footer={<Button onClick={onClose}>닫기</Button>}>
      <div className="flex flex-col gap-5">
        {branchId === "all" && (
          <Field label="지점" htmlFor="types-branch">
            <Select id="types-branch" value={bid} onChange={(e) => setBid(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
        )}
        <div className="scroll-x">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink3">
                <th className="py-1.5 pr-2 font-semibold">이름</th>
                <th className="w-20 py-1.5 pr-2 font-semibold">면적(㎡)</th>
                <th className="w-32 py-1.5 pr-2 font-semibold">정가 월세</th>
                <th className="w-28 py-1.5 pr-2 font-semibold">정가 관리비</th>
                <th className="w-14 py-1.5 pr-2 text-right font-semibold">호실</th>
                <th className="w-28 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {(types.data ?? []).map((t) => {
                const d = draftOf(t);
                const n = counts.get(t.id) ?? 0;
                return (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-1.5 pr-2">
                      <Input aria-label="룸타입 이름" value={d.name} onChange={(e) => setD(t.id, { ...d, name: e.target.value })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input aria-label="면적" inputMode="decimal" value={d.area_m2} onChange={(e) => setD(t.id, { ...d, area_m2: e.target.value.replace(/[^\d.]/g, "") })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <MoneyInput value={d.list_rent} onChange={(v) => setD(t.id, { ...d, list_rent: v })} />
                    </td>
                    <td className="py-1.5 pr-2">
                      <MoneyInput value={d.list_mgmt} onChange={(v) => setD(t.id, { ...d, list_mgmt: v })} />
                    </td>
                    <td className="num py-1.5 pr-2 text-right text-ink2">{n}</td>
                    <td className="py-1.5">
                      <div className="flex justify-end gap-1">
                        {dirty(t) && (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={patch.isPending}
                            onClick={() => patch.mutate({ path: `/api/unit-types/${t.id}`, method: "PATCH", body: { name: d.name, area_m2: Number(d.area_m2) || 0, list_rent: d.list_rent ?? 0, list_mgmt: d.list_mgmt ?? 0 } })}
                          >
                            저장
                          </Button>
                        )}
                        <button
                          type="button"
                          aria-label={`${t.name} 지우기`}
                          title={n ? `${n}개 호실이 쓰고 있어 지울 수 없다` : "지우기"}
                          disabled={n > 0}
                          onClick={() => del.mutate({ path: `/api/unit-types/${t.id}`, method: "DELETE" })}
                          className="rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-line bg-sunken/40">
                <td className="py-1.5 pr-2">
                  <Input aria-label="새 룸타입 이름" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="새 룸타입 이름" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input aria-label="새 룸타입 면적" inputMode="decimal" value={add.area_m2} onChange={(e) => setAdd({ ...add, area_m2: e.target.value.replace(/[^\d.]/g, "") })} placeholder="㎡" />
                </td>
                <td className="py-1.5 pr-2">
                  <MoneyInput value={add.list_rent} onChange={(v) => setAdd({ ...add, list_rent: v })} placeholder="월세" />
                </td>
                <td className="py-1.5 pr-2">
                  <MoneyInput value={add.list_mgmt} onChange={(v) => setAdd({ ...add, list_mgmt: v })} placeholder="관리비" />
                </td>
                <td />
                <td className="py-1.5 text-right">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!add.name.trim() || !bid}
                    loading={create.isPending}
                    onClick={() => create.mutate({ path: `/api/branches/${bid}/unit-types`, body: { name: add.name.trim(), area_m2: Number(add.area_m2) || 0, list_rent: add.list_rent ?? 0, list_mgmt: add.list_mgmt ?? 0 } })}
                  >
                    더하기
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="label-caps">건물</div>
          <div className="flex flex-wrap gap-1.5">
            {(buildings.data ?? []).map((b) => (
              <span key={b.id} className="rounded border border-line px-2 py-1 text-xs">
                {b.name}
              </span>
            ))}
            {buildings.data?.length === 0 && <span className="text-xs text-ink3">건물이 없다</span>}
          </div>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (bname.trim() && bid) addB.mutate({ path: `/api/branches/${bid}/buildings`, body: { name: bname.trim() } });
            }}
          >
            <Input id="new-building" className="w-60" value={bname} onChange={(e) => setBname(e.target.value)} placeholder="새 건물 이름(예: 별관)" />
            <Button type="submit" size="sm" disabled={!bname.trim()} loading={addB.isPending}>
              건물 더하기
            </Button>
          </form>
        </div>
      </div>
    </Dialog>
  );
}
