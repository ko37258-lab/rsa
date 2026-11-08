import type { BlogDesignT, BriefT } from "@/lib/design/schema";

/** 프론트엔드도 외부 연동과 똑같이 /api/v1 REST API 만 사용합니다. */
export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body || init.form ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    if (res.status === 401 && typeof window !== "undefined") {
      // 세션 만료: 앱 어디서든 로그인 화면으로 전체 이동 (라우터 밖 유틸리티라 하드 이동)
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/?next=${encodeURIComponent(window.location.pathname)}`);
    }
    throw new ApiClientError(res.status, err?.code ?? "error", err?.message ?? `요청 실패 (${res.status})`);
  }
  return data as T;
}

export type Asset = {
  id: string;
  projectId: string | null;
  kind: "photo" | "reference" | "export";
  label: string | null;
  filename: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string;
  publicUrl: string;
  createdAt: number;
};

export type Project = {
  id: string;
  title: string;
  status: "draft" | "generating" | "ready" | "error";
  brief: BriefT;
  currentVersionId: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Version = { id: string; versionNo: number; source: string; note: string | null; createdAt: number; design?: BlogDesignT };

export type AppConfig = {
  naverLogin: boolean;
  devLogin: boolean;
  ai: { mode: "claude" | "template"; model: string | null };
};

export async function uploadImage(file: Blob, opts: { kind: Asset["kind"]; projectId?: string; label?: string; filename?: string }) {
  const form = new FormData();
  form.append("file", file, opts.filename ?? "image.png");
  form.append("kind", opts.kind);
  if (opts.projectId) form.append("projectId", opts.projectId);
  if (opts.label) form.append("label", opts.label);
  const r = await api<{ asset: Asset }>("/api/v1/assets", { form });
  return r.asset;
}

/** 업로드 전 브라우저에서 축소 (AI 권장 1568px, 용량 절감) */
export async function downscaleImage(file: File, maxSide = 1568): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return new Promise((resolve) => c.toBlob((b) => resolve(b ?? file), type, 0.88));
}

/** 영상 파일에서 장면 N개를 균등 간격으로 캡처 (브라우저 내 처리, 업로드는 프레임만) */
export async function extractVideoFrames(file: File, count = 6, maxSide = 1280): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("이 영상 형식은 브라우저에서 열 수 없습니다. MP4(H.264) 파일을 사용해 주세요."));
    });
    const dur = Number.isFinite(video.duration) ? video.duration : 0;
    if (!dur) throw new Error("영상 길이를 읽을 수 없습니다.");
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(video.videoWidth * scale);
    c.height = Math.round(video.videoHeight * scale);
    const ctx = c.getContext("2d")!;
    const frames: Blob[] = [];
    for (let i = 0; i < count; i++) {
      const t = (dur * (i + 0.5)) / count;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, c.width, c.height);
      frames.push(await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("캡처 실패"))), "image/jpeg", 0.85)));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}
