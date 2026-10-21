import { useSearchParams } from "react-router-dom";
import { PageHeader, Segmented } from "@/components/ui";
import { DataSection } from "./DataSection";
import { BranchSection } from "./BranchSection";
import { StaffSection } from "./StaffSection";
import { BackupSection } from "./BackupSection";

type Tab = "data" | "branch" | "staff" | "backup";
const TABS: Tab[] = ["data", "branch", "staff", "backup"];

export default function SettingsPage() {
  const [sp, setSp] = useSearchParams();
  const tab: Tab = TABS.includes(sp.get("tab") as Tab) ? (sp.get("tab") as Tab) : "data";
  const go = (t: Tab) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (t === "data") n.delete("tab");
        else n.set("tab", t);
        return n;
      },
      { replace: true },
    );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="설정" subtitle="실사용 시작 · 지점과 계약 조건 · 직원 · 백업">
        <Segmented
          value={tab}
          onChange={go}
          options={[
            { value: "data", label: "시작하기 · 데이터" },
            { value: "branch", label: "지점" },
            { value: "staff", label: "직원" },
            { value: "backup", label: "백업" },
          ]}
        />
      </PageHeader>
      {tab === "data" && <DataSection goBackup={() => go("backup")} />}
      {tab === "branch" && <BranchSection />}
      {tab === "staff" && <StaffSection />}
      {tab === "backup" && <BackupSection />}
    </div>
  );
}
