import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ui/Toast";
import { BranchProvider } from "@/lib/branch";
import App from "./App";
import { API_MODE } from "@/api/client";
import { initDB } from "@/mock/db";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

// 시연·실사용 데이터(브라우저 저장소)를 먼저 읽고 화면을 그린다
const ready = API_MODE === "mock" ? initDB() : Promise.resolve();

void ready.finally(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BranchProvider>
            <App />
          </BranchProvider>
        </ToastProvider>
      </QueryClientProvider>
    </StrictMode>,
  ),
);
