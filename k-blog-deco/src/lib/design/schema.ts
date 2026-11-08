import { z } from "zod";
import { FONT_KEYS } from "./fonts";

/**
 * 블로그 디자인 문서(BlogDesign) — 이 JSON 하나가 미리보기·편집·내보내기·AI 수정의 단일 원천입니다.
 * 숫자 범위 제약은 스키마가 아니라 normalizeDesign() 에서 보정합니다
 * (AI 구조화 출력은 min/max 를 강제하지 않기 때문).
 */
export const Color = z.string().describe("hex 색상 (#RRGGBB 또는 투명도 포함 #RRGGBBAA)");

export const SolidFill = z.object({ type: z.literal("solid"), color: Color });
export const LinearFill = z.object({
  type: z.literal("linear"),
  angle: z.number().describe("그라디언트 방향(도). 0=왼→오, 90=위→아래"),
  stops: z.array(z.object({ at: z.number().describe("0~1 위치"), color: Color })),
});
export const Fill = z.discriminatedUnion("type", [SolidFill, LinearFill]);

export const Shadow = z.object({ color: Color, blur: z.number(), x: z.number(), y: z.number() });
export const Stroke = z.object({ color: Color, width: z.number() });

const base = {
  id: z.string(),
  name: z.string().describe("편집기에 표시할 레이어 이름 (예: '메인 제목')"),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  opacity: z.number().describe("0~1"),
  rotation: z.number().describe("회전 각도(도), 보통 0"),
};

export const RectLayer = z.object({
  ...base,
  type: z.literal("rect"),
  fill: Fill,
  radius: z.number(),
  stroke: Stroke.nullable(),
  shadow: Shadow.nullable(),
});

export const EllipseLayer = z.object({
  ...base,
  type: z.literal("ellipse"),
  fill: Fill,
  stroke: Stroke.nullable(),
});

export const ImageLayer = z.object({
  ...base,
  type: z.literal("image"),
  assetId: z.string().nullable().describe("사용자 사진 ID. 맞는 사진이 없으면 null (자리표시자로 표시)"),
  placeholder: z.string().describe("사진이 없을 때 표시할 안내 (예: '대표 사진')"),
  fit: z.enum(["cover", "contain"]),
  shape: z.enum(["rect", "circle", "arch"]),
  radius: z.number(),
  stroke: Stroke.nullable(),
  shadow: Shadow.nullable(),
});

export const TextLayer = z.object({
  ...base,
  type: z.literal("text"),
  text: z.string().describe("줄바꿈은 \\n"),
  font: z.enum(FONT_KEYS),
  size: z.number(),
  weight: z.number().describe("400, 500, 700, 800, 900 중 하나"),
  color: Color,
  align: z.enum(["left", "center", "right"]),
  lineHeight: z.number().describe("배수, 보통 1.2~1.6"),
  letterSpacing: z.number().describe("자간(px), 보통 -1~4"),
  shadow: Shadow.nullable(),
});

export const Layer = z.discriminatedUnion("type", [RectLayer, EllipseLayer, ImageLayer, TextLayer]);

export const Artboard = z.object({
  width: z.number(),
  height: z.number(),
  background: Fill,
  backgroundImage: z
    .object({ assetId: z.string(), opacity: z.number(), overlay: Fill.nullable() })
    .nullable()
    .describe("배경 전체를 덮는 사진 (선택)"),
  layers: z.array(Layer).describe("아래에서 위 순서로 그려짐"),
});

export const MenuItem = z.object({
  id: z.string(),
  label: z.string().describe("버튼 문구 (짧게, 2~8자)"),
  sublabel: z.string().describe("보조 문구 (영문 소제목 등, 없으면 빈 문자열)"),
  emoji: z.string().describe("아이콘 이모지 1개 또는 빈 문자열"),
  link: z.string().describe("클릭 시 이동할 URL"),
  fill: Fill.nullable().describe("이 버튼만 다른 배경을 쓸 때"),
  textColor: Color.nullable(),
});

export const MenuStyle = z.object({
  fill: Fill,
  textColor: Color,
  sublabelColor: Color,
  radius: z.number(),
  stroke: Stroke.nullable(),
  font: z.enum(FONT_KEYS),
  size: z.number(),
  weight: z.number(),
  layout: z.enum(["label", "label-sub", "emoji-label", "emoji-top"]),
});

export const Menu = z.object({
  itemHeight: z.number().describe("버튼(위젯) 세로 px. 가로는 네이버 위젯 규격 170px 고정"),
  gap: z.number(),
  align: z.enum(["left", "center"]),
  style: MenuStyle,
  items: z.array(MenuItem),
});

export const Palette = z.object({
  primary: Color,
  secondary: Color,
  accent: Color,
  background: Color,
  surface: Color,
  text: Color,
  muted: Color,
});

export const BlogDesign = z.object({
  version: z.literal(1),
  name: z.string(),
  summary: z.string().describe("디자인 콘셉트 설명 (한국어 2~3문장)"),
  palette: Palette,
  fonts: z.object({ heading: z.enum(FONT_KEYS), body: z.enum(FONT_KEYS) }),
  pageBackground: Color.describe("히어로 아래 블로그 본문 바깥 배경색"),
  layout: z.object({
    titleHeight: z.number().describe("네이버 타이틀 영역 높이 (50~300)"),
    showMenuBar: z.boolean().describe("네이버 기본 상단 메뉴 바 표시 여부"),
    widgetTop: z.number().describe("버튼(위젯) 줄이 시작되는 y 위치 (히어로 좌표)"),
  }),
  hero: Artboard.describe("PC 상단 히어로. 좌표는 가운데 966px 본문 칼럼 기준 (x=0~966), 배경은 스킨 폭으로 좌우 확장"),
  menu: Menu,
  mobile: Artboard.describe("모바일 커버 1080x1080"),
});

export type FillT = z.infer<typeof Fill>;
export type ShadowT = z.infer<typeof Shadow>;
export type StrokeT = z.infer<typeof Stroke>;
export type LayerT = z.infer<typeof Layer>;
export type TextLayerT = z.infer<typeof TextLayer>;
export type ImageLayerT = z.infer<typeof ImageLayer>;
export type RectLayerT = z.infer<typeof RectLayer>;
export type ArtboardT = z.infer<typeof Artboard>;
export type MenuT = z.infer<typeof Menu>;
export type MenuItemT = z.infer<typeof MenuItem>;
export type PaletteT = z.infer<typeof Palette>;
export type BlogDesignT = z.infer<typeof BlogDesign>;

// ───────── 프로젝트 브리프 (사용자가 입력하는 요구사항) ─────────

const s = (max: number) => z.string().trim().max(max);

export const ReferenceSchema = z.object({
  id: s(40),
  kind: z.enum(["url", "image", "video"]),
  url: s(500).default(""),
  note: s(500).default(""),
  assetIds: z.array(s(40)).max(8).default([]),
  inspected: z
    .object({
      title: s(200).default(""),
      description: s(400).default(""),
      colors: z.array(s(20)).max(16).default([]),
      fonts: z.array(s(60)).max(10).default([]),
      headings: z.array(s(120)).max(12).default([]),
      navLabels: z.array(s(60)).max(20).default([]),
    })
    .nullable()
    .default(null),
});

export const BriefSchema = z.object({
  blogName: s(40).min(1, "블로그 이름을 입력해 주세요."),
  tagline: s(100).default(""),
  industry: s(40).default(""),
  audience: s(100).default(""),
  blogUrl: s(200).default(""),
  menu: z.array(z.object({ label: s(20), link: s(300).default("") })).max(10).default([]),
  contacts: z
    .object({
      phone: s(40).default(""),
      kakao: s(200).default(""),
      instagram: s(200).default(""),
      youtube: s(200).default(""),
      address: s(200).default(""),
    })
    .partial()
    .default({}),
  styleRequest: s(3000).default(""),
  colorPreference: s(300).default(""),
  moods: z.array(s(20)).max(8).default([]),
  presetId: s(40).nullable().default(null),
  references: z.array(ReferenceSchema).max(12).default([]),
  photoAssetIds: z.array(s(40)).max(10).default([]),
});

export type ReferenceT = z.infer<typeof ReferenceSchema>;
export type BriefT = z.infer<typeof BriefSchema>;
