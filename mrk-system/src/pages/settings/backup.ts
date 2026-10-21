/**
 * 백업 파일 만들기·불러오기 도우미.
 * 파일(서명본·첨부) 내용은 IndexedDB 에 있으므로 백업에 넣을 때 base64 로 바꾸고,
 * 불러올 때는 같은 id 로 되돌려 넣는다(lib/files.ts 와 같은 DB·저장소 이름).
 */
import { loadFile } from "@/lib/files";
import type { DB } from "@/types";
import type { BackupFile } from "@/mock/handlers/platform";

const DB_NAME = "mrk-files";
const STORE = "blobs";

/** DB 안에서 파일 id 를 모두 찾는다 */
export function collectFileIds(db: DB): string[] {
  const ids = new Set<string>();
  for (const l of db.leases) for (const f of l.signed_copies ?? []) ids.add(f.id);
  for (const q of db.inquiries) for (const m of q.messages) for (const f of m.attachments ?? []) ids.add(f.id);
  for (const c of db.conversations ?? []) for (const m of c.messages) for (const f of m.attachments ?? []) ids.add(f.id);
  for (const f of db.files) if (f.file_id) ids.add(f.file_id);
  return [...ids];
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",", 2)[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** 파일 내용을 백업에 넣는다. 못 읽은 파일 수를 같이 돌려준다 */
export async function embedFiles(file: BackupFile): Promise<{ file: BackupFile; missing: number }> {
  const ids = collectFileIds(file.db);
  const files: NonNullable<BackupFile["files"]> = {};
  let missing = 0;
  for (const id of ids) {
    const b = await loadFile(id);
    if (!b) {
      missing += 1;
      continue;
    }
    files[id] = { mime: b.type || "application/octet-stream", data: await blobToBase64(b) };
  }
  return { file: { ...file, files }, missing };
}

/** 같은 id 로 IndexedDB 에 되돌려 넣는다 */
export async function restoreFiles(files: BackupFile["files"]): Promise<number> {
  const entries = Object.entries(files ?? {});
  if (!entries.length) return 0;
  const db = await new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  if (!db) return 0;
  let n = 0;
  for (const [id, f] of entries) {
    await new Promise<void>((resolve) => {
      try {
        const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(base64ToBlob(f.data, f.mime), id);
        req.onsuccess = () => {
          n += 1;
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return n;
}

/** 브라우저에서 JSON 파일로 내려받기 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
