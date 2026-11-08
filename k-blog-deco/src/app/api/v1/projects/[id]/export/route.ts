import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { route, requireUser, ok, readJson, ApiError } from "@/lib/api/http";
import { getDb, schema } from "@/lib/db";
import { publicFileUrl } from "@/lib/storage";
import { NAVER_SPEC } from "@/lib/naver/spec";
import { applyGuide, widgetHtml } from "@/lib/naver/guide";
import type { BlogDesignT } from "@/lib/design/schema";
import { getCurrentVersion, getOwnedProject } from "@/lib/services/projects";

async function loadDesign(userId: string, id: string) {
  const p = await getOwnedProject(userId, id);
  const v = await getCurrentVersion(p);
  if (!v) throw new ApiError(409, "no_design", "아직 디자인이 없습니다.");
  return { project: p, design: JSON.parse(v.design) as BlogDesignT };
}

const files = (d: BlogDesignT) => [
  { name: "skin-background.png", width: NAVER_SPEC.skinWidth, height: d.hero.height, use: "리모콘 > 스킨배경 > 직접등록 (상단)" },
  { name: "title-area.png", width: NAVER_SPEC.contentWidth, height: d.layout.titleHeight, use: "(선택) 리모콘 > 타이틀 > 직접등록 — 스킨 배경을 쓰지 않을 때" },
  ...d.menu.items.map((it, i) => ({ name: `widget-${i + 1}.png`, width: NAVER_SPEC.widget.width, height: d.menu.itemHeight, use: `위젯 직접등록 — ${it.label}` })),
  { name: "mobile-cover.png", width: NAVER_SPEC.mobileCover.width, height: NAVER_SPEC.mobileCover.height, use: "블로그 앱 > 홈편집 > 커버 이미지" },
];

/** 내보내기 정보: 파일 목록·규격·적용 가이드 (위젯 코드는 이미지 주소가 생긴 뒤 POST 로 받음) */
export const GET = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/export">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { design } = await loadDesign(user.id, id);
  return ok({
    spec: NAVER_SPEC,
    files: files(design),
    guide: applyGuide(design),
    widgets: design.menu.items.map((it) => ({ itemId: it.id, label: it.label, link: it.link, imageUrl: null, html: null })),
  });
});

const Body = z.object({
  /** 메뉴 버튼 id → 업로드한 위젯 PNG 의 asset id */
  widgetAssets: z.record(z.string().max(40), z.string().max(40)),
});

/** 위젯 이미지(업로드 완료)를 받아 네이버 '위젯 직접등록'용 HTML 코드를 만들어 줍니다. */
export const POST = route(async (req, ctx: RouteContext<"/api/v1/projects/[id]/export">) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { design } = await loadDesign(user.id, id);
  const body = await readJson(req, Body);
  const ids = Object.values(body.widgetAssets);
  const db = await getDb();
  const rows = ids.length
    ? await db.query.assets.findMany({ where: and(eq(schema.assets.userId, user.id), inArray(schema.assets.id, ids)) })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const widgets = design.menu.items.map((it) => {
    const asset = byId.get(body.widgetAssets[it.id] ?? "");
    const imageUrl = asset ? publicFileUrl(asset.storageKey) : null;
    return {
      itemId: it.id,
      label: it.label,
      link: it.link,
      imageUrl,
      html: imageUrl ? widgetHtml(it, imageUrl, design.menu.itemHeight) : null,
    };
  });
  return ok({ spec: NAVER_SPEC, files: files(design), guide: applyGuide(design), widgets });
});
