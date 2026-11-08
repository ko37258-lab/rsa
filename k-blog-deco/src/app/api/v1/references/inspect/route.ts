import { z } from "zod";
import { route, requireUser, ok, readJson } from "@/lib/api/http";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { imageSize, saveFile, sniffImageMime } from "@/lib/storage";
import { fetchImage, inspectUrl } from "@/lib/references/inspect";
import { getOwnedProject, publicAsset } from "@/lib/services/projects";

export const maxDuration = 60;

const Body = z.object({ url: z.string().trim().min(4).max(500), projectId: z.string().max(40).optional() });

/**
 * 레퍼런스 웹사이트/블로그 주소 분석.
 * 색상·폰트·메뉴·제목을 뽑고, 대표 이미지(og:image, 스킨 이미지)를 레퍼런스 이미지로 저장합니다.
 */
export const POST = route(async (req) => {
  const user = await requireUser(req);
  const body = await readJson(req, Body);
  if (body.projectId) await getOwnedProject(user.id, body.projectId);
  const url = /^https?:\/\//i.test(body.url) ? body.url : `https://${body.url}`;
  const result = await inspectUrl(url);

  const db = await getDb();
  const saved = [];
  for (const imgUrl of result.imageUrls.slice(0, 2)) {
    try {
      const bytes = await fetchImage(imgUrl);
      const mime = sniffImageMime(bytes);
      if (!mime) continue;
      const size = imageSize(bytes, mime);
      if (size && (size.width < 200 || size.height < 100)) continue; // 아이콘 등 너무 작은 이미지 제외
      const key = await saveFile(bytes, mime);
      const row = {
        id: newId("ast"),
        userId: user.id,
        projectId: body.projectId ?? null,
        kind: "reference",
        label: `웹사이트 이미지 — ${new URL(result.finalUrl).hostname}`,
        filename: null,
        mime,
        size: bytes.byteLength,
        width: size?.width ?? null,
        height: size?.height ?? null,
        storageKey: key,
        createdAt: Date.now(),
      };
      await db.insert(schema.assets).values(row);
      saved.push(publicAsset(row));
    } catch {
      // 대표 이미지는 부가 정보 — 실패해도 분석 결과는 돌려줍니다.
    }
  }
  return ok({ url: result.finalUrl, inspected: result.inspected, assets: saved });
});
