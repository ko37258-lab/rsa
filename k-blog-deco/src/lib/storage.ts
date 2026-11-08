import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/ids";

/**
 * 파일 저장소. 기본은 로컬 디스크(DATA_DIR/uploads).
 * 운영에서 여러 서버를 쓰면 S3/R2 등 오브젝트 스토리지 드라이버로 교체하세요 (인터페이스 동일).
 */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const uploadsDir = () => path.resolve(env.dataDir, "uploads");

const KEY_RE = /^[A-Za-z0-9_-]{16,64}\.(png|jpg|webp|gif)$/;

export function isValidKey(key: string) {
  return KEY_RE.test(key);
}

export async function saveFile(bytes: Uint8Array, mime: string): Promise<string> {
  const ext = ALLOWED_IMAGE_TYPES[mime];
  if (!ext) throw new Error("unsupported mime");
  const key = `${randomToken(18)}.${ext}`;
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), key), bytes);
  return key;
}

export async function readFile(key: string): Promise<Buffer | null> {
  if (!isValidKey(key)) return null;
  try {
    return await fs.readFile(path.join(uploadsDir(), key));
  } catch {
    return null;
  }
}

export async function deleteFile(key: string) {
  if (!isValidKey(key)) return;
  await fs.rm(path.join(uploadsDir(), key), { force: true });
}

export const publicFileUrl = (key: string) => `${env.appUrl}/files/${key}`;

/** 매직 바이트로 실제 이미지 형식을 확인 (확장자/헤더 위조 방지) */
export function sniffImageMime(b: Uint8Array): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  return null;
}

/** PNG/JPEG/GIF/WebP 헤더에서 가로·세로 크기 추출 (외부 라이브러리 없이) */
export function imageSize(b: Uint8Array, mime: string): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === "image/png") return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (mime === "image/gif") return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    if (mime === "image/jpeg") {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const len = dv.getUint16(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
        }
        i += 2 + len;
      }
      return null;
    }
    if (mime === "image/webp") {
      const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (chunk === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = dv.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {
    return null;
  }
  return null;
}
