/**
 * 파일 보관함(계약서 서명본, 대화 첨부, 준비된 파일).
 * 파일 내용은 브라우저 IndexedDB 에, 목록 정보(FileRef)는 Mock DB 에 둔다.
 * IndexedDB 를 못 쓰는 환경에서는 메모리에만 둔다(새로고침하면 사라짐).
 */
import type { FileRef } from "@/types";

const DB_NAME = "mrk-files";
const STORE = "blobs";
const memory = new Map<string, Blob>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

let seq = 0;
/** 파일을 보관하고 목록 정보를 돌려준다. 돌려받은 FileRef 를 API 로 보내 DB 에 붙인다 */
export async function storeFile(file: File | Blob, name?: string, kind: FileRef["kind"] = "attachment"): Promise<FileRef> {
  seq += 1;
  const id = `f_${Date.now().toString(36)}${seq}`;
  memory.set(id, file);
  await tx("readwrite", (s) => s.put(file, id));
  return {
    id,
    name: name ?? (file instanceof File ? file.name : "파일"),
    size: file.size,
    mime: file.type || "application/octet-stream",
    kind,
    created_at: new Date().toISOString(),
  };
}

export async function loadFile(id: string): Promise<Blob | null> {
  return memory.get(id) ?? (await tx<Blob>("readonly", (s) => s.get(id))) ?? null;
}

/** 새 탭에서 열기용 주소. 없으면 null */
export async function fileUrl(id: string): Promise<string | null> {
  const b = await loadFile(id);
  return b ? URL.createObjectURL(b) : null;
}

export async function deleteFile(id: string): Promise<void> {
  memory.delete(id);
  await tx("readwrite", (s) => s.delete(id));
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
