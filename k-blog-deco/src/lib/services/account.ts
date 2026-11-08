import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { deleteFile } from "@/lib/storage";

/** 회원 탈퇴: 사용자의 모든 데이터를 삭제합니다 (법령상 보관 의무가 있는 기록은 없음). */
export async function deleteUserCompletely(userId: string) {
  const db = await getDb();
  const projects = await db.query.projects.findMany({ where: eq(schema.projects.userId, userId), columns: { id: true } });
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length) await db.delete(schema.designVersions).where(inArray(schema.designVersions.projectId, projectIds));
  await db.delete(schema.projects).where(eq(schema.projects.userId, userId));
  const assets = await db.query.assets.findMany({ where: eq(schema.assets.userId, userId), columns: { storageKey: true } });
  await db.delete(schema.assets).where(eq(schema.assets.userId, userId));
  await db.delete(schema.apiTokens).where(eq(schema.apiTokens.userId, userId));
  await db.delete(schema.aiRuns).where(eq(schema.aiRuns.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  // 파일 삭제는 DB 정리 뒤에 (실패해도 계정 삭제는 완료)
  await Promise.allSettled(assets.map((a) => deleteFile(a.storageKey)));
  return { projects: projectIds.length, assets: assets.length };
}

export async function accountSummary(userId: string) {
  const db = await getDb();
  const [projects, assets, tokens] = await Promise.all([
    db.query.projects.findMany({ where: eq(schema.projects.userId, userId), columns: { id: true } }),
    db.query.assets.findMany({ where: eq(schema.assets.userId, userId), columns: { size: true } }),
    db.query.apiTokens.findMany({ where: eq(schema.apiTokens.userId, userId), columns: { id: true } }),
  ]);
  return { projects: projects.length, assets: assets.length, assetBytes: assets.reduce((s, a) => s + a.size, 0), tokens: tokens.length };
}
