import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, type ApiInit } from "@/api/client";
import { useToast } from "@/components/ui/Toast";

/**
 * 조회 훅. key 는 무효화 단위다 — 같은 영역은 첫 칸을 맞춘다.
 * 예: useApi(["leases", branchId], `/api/leases?branch_id=${branchId}`)
 */
export function useApi<T>(key: QueryKey, path: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api<T>(path as string),
    enabled: path !== null && (opts.enabled ?? true),
  });
}

/**
 * 변경 훅. 성공하면 invalidate 의 키들을 다시 읽고 토스트를 띄운다.
 * const save = useApiMutation({ invalidate: [["leases"]], success: "계약을 저장했다" });
 * save.mutate({ path: "/api/leases", method: "POST", body });
 */
export function useApiMutation<T = unknown>(opts: { invalidate?: QueryKey[]; success?: string | ((r: T) => string); onSuccess?: (r: T) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<T, Error, ApiInit & { path: string }>({
    mutationFn: ({ path, ...init }) => api<T>(path, { method: init.method ?? "POST", body: init.body }),
    onSuccess: async (r) => {
      // 영역 간 숫자가 얽혀 있어(계약 → 청구 → 대시보드) 지정 키 + 요약성 키를 같이 무효화한다
      await Promise.all([...(opts.invalidate ?? []), ["dashboard"], ["alerts"]].map((k) => qc.invalidateQueries({ queryKey: k })));
      if (opts.success) toast.show(typeof opts.success === "function" ? opts.success(r) : opts.success, "good");
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.show(e.message, "bad"),
  });
}
