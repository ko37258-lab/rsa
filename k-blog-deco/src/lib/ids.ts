import { randomBytes } from "node:crypto";

/** 접두사 + URL-safe 랜덤 ID (예: prj_3k9X...) */
export function newId(prefix: string, bytes = 12): string {
  return `${prefix}_${randomBytes(bytes).toString("base64url")}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
