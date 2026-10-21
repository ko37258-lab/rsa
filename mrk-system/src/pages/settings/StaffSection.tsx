import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Field, FormGrid, Input, Section, Loading } from "@/components/ui";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import type { Staff } from "@/types";

function StaffRow({ s, isMe }: { s: Staff; isMe: boolean }) {
  const [name, setName] = useState(s.name);
  const [role, setRole] = useState(s.role);
  useEffect(() => {
    setName(s.name);
    setRole(s.role);
  }, [s.name, s.role]);
  const save = useApiMutation({ invalidate: [["staff"], ["me"]], success: "직원 정보를 고쳤다" });
  const del = useApiMutation({ invalidate: [["staff"], ["inquiries"], ["leases"]], success: `${s.name}을(를) 뺐다` });
  const dirty = name.trim() !== s.name || role.trim() !== s.role;
  return (
    <li className="grid grid-cols-1 items-end gap-2 border-b border-line py-3 last:border-0 sm:grid-cols-[1fr_1fr_auto]">
      <Field label={isMe ? <span className="flex items-center gap-1.5">이름 <Badge tone="brass" dot={false}>나</Badge></span> : "이름"} htmlFor={`st-name-${s.id}`}>
        <Input id={`st-name-${s.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="역할" htmlFor={`st-role-${s.id}`}>
        <Input id={`st-role-${s.id}`} value={role} onChange={(e) => setRole(e.target.value)} placeholder="지점 매니저" />
      </Field>
      <div className="flex gap-1.5">
        <Button size="sm" variant="primary" disabled={!dirty || !name.trim()} loading={save.isPending} onClick={() => save.mutate({ path: `/api/staff/${s.id}`, method: "PATCH", body: { name, role } })}>
          저장
        </Button>
        {!isMe && (
          <button
            type="button"
            aria-label={`${s.name} 빼기`}
            onClick={() => del.mutate({ path: `/api/staff/${s.id}`, method: "DELETE" })}
            className="inline-flex size-8 items-center justify-center rounded text-ink3 hover:bg-sunken hover:text-bad"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}

export function StaffSection() {
  const { me } = useBranch();
  const q = useApi<Staff[]>(["staff"], "/api/staff");
  const [name, setName] = useState("");
  const [role, setRole] = useState("매니저");
  const [company, setCompany] = useState("");
  const status = useApi<{ company_name: string }>(["setup"], "/api/setup/status");
  useEffect(() => {
    if (status.data) setCompany(status.data.company_name);
  }, [status.data]);
  const add = useApiMutation({ invalidate: [["staff"]], success: "직원을 더했다", onSuccess: () => setName("") });
  const saveCompany = useApiMutation({ invalidate: [["setup"], ["me"]], success: "회사 이름을 고쳤다" });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Section title="직원" hint="상담·계약의 담당자로 고를 수 있다. 빼면 맡던 상담·계약은 «담당 없음»이 된다.">
        {q.isLoading ? (
          <Loading />
        ) : (
          <ul className="flex flex-col">
            {(q.data ?? []).map((s) => (
              <StaffRow key={s.id} s={s} isMe={s.id === me?.id} />
            ))}
          </ul>
        )}
        <form
          className="mt-3 grid grid-cols-1 items-end gap-2 rounded-md bg-sunken/60 p-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate({ path: "/api/staff", body: { name, role } });
          }}
        >
          <Field label="새 직원 이름" htmlFor="st-new-name">
            <Input id="st-new-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="역할" htmlFor="st-new-role">
            <Input id="st-new-role" value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <Button type="submit" icon={<Plus className="size-4" />} disabled={!name.trim()} loading={add.isPending}>
            더하기
          </Button>
        </form>
      </Section>

      <Section title="회사" hint="화면 아래와 청구서에 쓰는 이름">
        <FormGrid cols={2}>
          <Field label="회사 이름" htmlFor="co-name" className="sm:col-span-2">
            <Input id="co-name" value={company} onChange={(e) => setCompany(e.target.value)} />
          </Field>
        </FormGrid>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" disabled={!company.trim() || company === status.data?.company_name} loading={saveCompany.isPending} onClick={() => saveCompany.mutate({ path: "/api/me", method: "PATCH", body: { company_name: company } })}>
            저장
          </Button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink3">
          권한: {me?.permissions.length ? me.permissions.join(", ") : "없음"}. 지금은 한 사람이 쓰는 브라우저 저장 모드라 로그인이 없다. 서버를 연결하면 회사 Google 계정 로그인과 직원별 권한을 쓴다.
        </p>
      </Section>
    </div>
  );
}
