import "server-only";
import { and, desc, eq, inArray, max } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { ApiError, notFound } from "@/lib/api/http";
import { publicFileUrl } from "@/lib/storage";
import { BlogDesign, BriefSchema, type BlogDesignT, type BriefT } from "@/lib/design/schema";
import { normalizeDesign } from "@/lib/design/normalize";
import type { ProjectRow, AssetRow, DesignVersionRow } from "@/lib/db/schema";

export type VersionSource = "ai-generate" | "ai-revise" | "manual" | "restore" | "template";

export function publicProject(p: ProjectRow) {
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    brief: JSON.parse(p.brief) as BriefT,
    currentVersionId: p.currentVersionId,
    lastError: p.lastError,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function publicAsset(a: AssetRow) {
  return {
    id: a.id,
    projectId: a.projectId,
    kind: a.kind,
    label: a.label,
    filename: a.filename,
    mime: a.mime,
    size: a.size,
    width: a.width,
    height: a.height,
    url: `/files/${a.storageKey}`,
    publicUrl: publicFileUrl(a.storageKey),
    createdAt: a.createdAt,
  };
}

export function publicVersion(v: DesignVersionRow, withDesign = false) {
  return {
    id: v.id,
    versionNo: v.versionNo,
    source: v.source,
    note: v.note,
    createdAt: v.createdAt,
    ...(withDesign ? { design: JSON.parse(v.design) as BlogDesignT } : {}),
  };
}

export async function listProjects(userId: string) {
  const db = await getDb();
  return db.query.projects.findMany({
    where: eq(schema.projects.userId, userId),
    orderBy: desc(schema.projects.updatedAt),
    limit: 200,
  });
}

export async function getOwnedProject(userId: string, id: string) {
  const db = await getDb();
  const p = await db.query.projects.findFirst({
    where: and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)),
  });
  if (!p) throw notFound("프로젝트");
  return p;
}

export async function createProject(userId: string, brief: BriefT, title?: string) {
  const db = await getDb();
  const now = Date.now();
  const clean = BriefSchema.parse(brief);
  await assertOwnsAssets(userId, briefAssetIds(clean));
  const row = {
    id: newId("prj"),
    userId,
    title: (title || clean.blogName).slice(0, 60),
    status: "draft",
    brief: JSON.stringify(clean),
    currentVersionId: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.projects).values(row);
  // 브리프에 쓰인 사진들을 이 프로젝트에 연결
  const ids = briefAssetIds(clean);
  if (ids.length) {
    await db
      .update(schema.assets)
      .set({ projectId: row.id })
      .where(and(eq(schema.assets.userId, userId), inArray(schema.assets.id, ids)));
  }
  return row;
}

export async function updateProject(userId: string, id: string, patch: { title?: string; brief?: BriefT }) {
  const p = await getOwnedProject(userId, id);
  const db = await getDb();
  const set: Partial<ProjectRow> = { updatedAt: Date.now() };
  if (patch.title !== undefined) set.title = patch.title.slice(0, 60) || p.title;
  if (patch.brief !== undefined) {
    const clean = BriefSchema.parse(patch.brief);
    await assertOwnsAssets(userId, briefAssetIds(clean));
    set.brief = JSON.stringify(clean);
  }
  await db.update(schema.projects).set(set).where(eq(schema.projects.id, p.id));
  return { ...p, ...set } as ProjectRow;
}

export async function setProjectStatus(id: string, status: string, lastError: string | null = null) {
  const db = await getDb();
  await db.update(schema.projects).set({ status, lastError, updatedAt: Date.now() }).where(eq(schema.projects.id, id));
}

export async function deleteProject(userId: string, id: string) {
  const p = await getOwnedProject(userId, id);
  const db = await getDb();
  await db.delete(schema.designVersions).where(eq(schema.designVersions.projectId, p.id));
  await db.update(schema.assets).set({ projectId: null }).where(eq(schema.assets.projectId, p.id));
  await db.delete(schema.projects).where(eq(schema.projects.id, p.id));
}

export function briefAssetIds(b: BriefT): string[] {
  return [...new Set([...b.photoAssetIds, ...b.references.flatMap((r) => r.assetIds)])];
}

export async function assertOwnsAssets(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.query.assets.findMany({
    where: and(eq(schema.assets.userId, userId), inArray(schema.assets.id, ids)),
  });
  if (rows.length !== new Set(ids).size) {
    throw new ApiError(400, "invalid_asset", "존재하지 않거나 권한이 없는 이미지가 포함되어 있습니다.");
  }
  return rows;
}

export async function userAssetIdSet(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.query.assets.findMany({
    where: eq(schema.assets.userId, userId),
    columns: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

export async function listProjectAssets(userId: string, projectId: string) {
  const db = await getDb();
  return db.query.assets.findMany({
    where: and(eq(schema.assets.userId, userId), eq(schema.assets.projectId, projectId)),
    orderBy: desc(schema.assets.createdAt),
  });
}

export async function getCurrentVersion(project: ProjectRow) {
  if (!project.currentVersionId) return null;
  const db = await getDb();
  return (
    (await db.query.designVersions.findFirst({ where: eq(schema.designVersions.id, project.currentVersionId) })) ?? null
  );
}

/** 디자인을 검증·보정한 뒤 새 버전으로 저장하고 현재 버전으로 지정 */
export async function saveVersion(
  userId: string,
  project: ProjectRow,
  design: unknown,
  source: VersionSource,
  note: string | null,
) {
  const parsed = BlogDesign.parse(design);
  const clean = normalizeDesign(parsed, { allowedAssetIds: await userAssetIdSet(userId) });
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: max(schema.designVersions.versionNo) })
    .from(schema.designVersions)
    .where(eq(schema.designVersions.projectId, project.id));
  const row = {
    id: newId("ver"),
    projectId: project.id,
    versionNo: (n ?? 0) + 1,
    design: JSON.stringify(clean),
    source,
    note: note?.slice(0, 1000) ?? null,
    createdAt: Date.now(),
  };
  await db.insert(schema.designVersions).values(row);
  await db
    .update(schema.projects)
    .set({ currentVersionId: row.id, status: "ready", lastError: null, updatedAt: row.createdAt })
    .where(eq(schema.projects.id, project.id));
  return row;
}

export async function listVersions(projectId: string) {
  const db = await getDb();
  return db.query.designVersions.findMany({
    where: eq(schema.designVersions.projectId, projectId),
    orderBy: desc(schema.designVersions.versionNo),
    limit: 100,
  });
}

export async function getVersion(projectId: string, versionId: string) {
  const db = await getDb();
  const v = await db.query.designVersions.findFirst({
    where: and(eq(schema.designVersions.projectId, projectId), eq(schema.designVersions.id, versionId)),
  });
  if (!v) throw notFound("버전");
  return v;
}
