import { and, desc, eq } from "drizzle-orm";
import { route, requireUser, ok, ApiError } from "@/lib/api/http";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { MAX_UPLOAD_BYTES, imageSize, saveFile, sniffImageMime } from "@/lib/storage";
import { getOwnedProject, publicAsset } from "@/lib/services/projects";

const KINDS = new Set(["photo", "reference", "export"]);

/** 내 이미지 목록 (?projectId= 로 필터) */
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const projectId = req.nextUrl.searchParams.get("projectId");
  const db = await getDb();
  const rows = await db.query.assets.findMany({
    where: projectId
      ? and(eq(schema.assets.userId, user.id), eq(schema.assets.projectId, projectId))
      : eq(schema.assets.userId, user.id),
    orderBy: desc(schema.assets.createdAt),
    limit: 300,
  });
  return ok({ assets: rows.map(publicAsset) });
});

/**
 * 이미지 업로드 (multipart/form-data)
 * - file: PNG/JPEG/WebP/GIF, 최대 8MB (형식은 파일 내용으로 검사)
 * - kind: photo(디자인에 쓸 사진) | reference(레퍼런스) | export(내보낸 위젯 등)
 * - projectId, label (선택)
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new ApiError(400, "no_file", "file 필드에 이미지를 담아 보내 주세요.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "too_large", "이미지는 8MB 이하만 올릴 수 있습니다.");
  const kind = String(form.get("kind") || "photo");
  if (!KINDS.has(kind)) throw new ApiError(400, "invalid_kind", "kind 는 photo, reference, export 중 하나여야 합니다.");
  const projectId = form.get("projectId") ? String(form.get("projectId")) : null;
  if (projectId) await getOwnedProject(user.id, projectId);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageMime(bytes);
  if (!mime) throw new ApiError(415, "unsupported_type", "PNG, JPG, WebP, GIF 이미지만 올릴 수 있습니다.");
  const size = imageSize(bytes, mime);
  const key = await saveFile(bytes, mime);
  const row = {
    id: newId("ast"),
    userId: user.id,
    projectId,
    kind,
    label: String(form.get("label") || "").slice(0, 80) || null,
    filename: (file.name || "").slice(0, 120) || null,
    mime,
    size: bytes.byteLength,
    width: size?.width ?? null,
    height: size?.height ?? null,
    storageKey: key,
    createdAt: Date.now(),
  };
  const db = await getDb();
  await db.insert(schema.assets).values(row);
  return ok({ asset: publicAsset(row) }, 201);
});
