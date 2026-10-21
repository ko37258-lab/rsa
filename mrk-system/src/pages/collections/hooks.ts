import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import type { PayerRow } from "@/pages/billing/api";

export type Upd = (patch: Record<string, string | null>) => void;

export function usePayers() {
  const { branchId } = useBranch();
  return useApi<PayerRow[]>(["collections", "payers", branchId], `/api/billing/payers?branch_id=${branchId}`);
}
