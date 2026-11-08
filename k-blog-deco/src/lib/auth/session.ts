import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { sessionKey, env } from "@/lib/env";

export const SESSION_COOKIE = "kbd_session";
export const OAUTH_STATE_COOKIE = "kbd_oauth";
const SESSION_DAYS = 30;

export type SessionPayload = { uid: string };

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setIssuer("k-blog-deco")
    .sign(sessionKey());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { issuer: "k-blog-deco" });
    return typeof payload.uid === "string" ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 24 * 3600) {
  return {
    httpOnly: true,
    secure: env.appUrl.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
