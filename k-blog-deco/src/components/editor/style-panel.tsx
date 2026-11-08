"use client";

import type { BlogDesignT, PaletteT } from "@/lib/design/schema";
import { NAVER_SPEC } from "@/lib/naver/spec";
import type { Asset } from "@/lib/client/api";
import { ColorInput, FillEditor, FontSelect, Group, NumberInput, Row, Select, Slider, Toggle } from "./controls";

const PALETTE_LABELS: Record<keyof PaletteT, string> = {
  primary: "주 색상",
  secondary: "보조 색상",
  accent: "포인트 색상",
  background: "배경",
  surface: "면 색상",
  text: "글자",
  muted: "보조 글자",
};

/** 팔레트 색을 바꾸면 디자인 전체에서 같은 색을 함께 바꿉니다. */
function swapColor(d: BlogDesignT, from: string, to: string): BlogDesignT {
  if (!from || from === to) return d;
  const re = new RegExp(`"${from}"`, "gi");
  const next = JSON.parse(JSON.stringify(d).replace(re, JSON.stringify(to))) as BlogDesignT;
  return next;
}

export function StylePanel({
  design,
  which,
  set,
  photos,
}: {
  design: BlogDesignT;
  which: "hero" | "mobile";
  set: (fn: (d: BlogDesignT) => BlogDesignT, merge?: boolean) => void;
  photos: Asset[];
}) {
  const ab = which === "hero" ? design.hero : design.mobile;
  const setAb = (fn: (a: typeof ab) => typeof ab, merge = true) =>
    set((d) => (which === "hero" ? { ...d, hero: fn(d.hero) } : { ...d, mobile: fn(d.mobile) }), merge);

  return (
    <div>
      <Group title="색상 팔레트">
        <p className="mb-1 text-[11px] leading-relaxed text-ink-3">팔레트 색을 바꾸면 그 색을 쓰는 모든 요소가 함께 바뀝니다.</p>
        {(Object.keys(PALETTE_LABELS) as (keyof PaletteT)[]).map((k) => (
          <Row key={k} label={PALETTE_LABELS[k]}>
            <ColorInput
              value={design.palette[k]}
              onChange={(c) => set((d) => ({ ...swapColor(d, d.palette[k], c), palette: { ...d.palette, [k]: c } }), true)}
            />
          </Row>
        ))}
      </Group>

      <Group title="글꼴">
        <Row label="제목 글꼴">
          <FontSelect
            value={design.fonts.heading}
            onChange={(f) =>
              set((d) => ({
                ...d,
                fonts: { ...d.fonts, heading: f },
                hero: { ...d.hero, layers: d.hero.layers.map((l) => (l.type === "text" && l.font === d.fonts.heading ? { ...l, font: f } : l)) },
                mobile: { ...d.mobile, layers: d.mobile.layers.map((l) => (l.type === "text" && l.font === d.fonts.heading ? { ...l, font: f } : l)) },
              }))
            }
          />
        </Row>
        <Row label="본문 글꼴">
          <FontSelect
            value={design.fonts.body}
            onChange={(f) =>
              set((d) => ({
                ...d,
                fonts: { ...d.fonts, body: f },
                hero: { ...d.hero, layers: d.hero.layers.map((l) => (l.type === "text" && l.font === d.fonts.body ? { ...l, font: f } : l)) },
                mobile: { ...d.mobile, layers: d.mobile.layers.map((l) => (l.type === "text" && l.font === d.fonts.body ? { ...l, font: f } : l)) },
              }))
            }
          />
        </Row>
      </Group>

      <Group title={which === "hero" ? "상단(히어로) 배경" : "모바일 커버 배경"}>
        <FillEditor value={ab.background} onChange={(f) => setAb((a) => ({ ...a, background: f }))} />
        <Row label="배경 사진">
          <Select
            value={ab.backgroundImage?.assetId ?? ""}
            onChange={(id) => setAb((a) => ({ ...a, backgroundImage: id ? { assetId: id, opacity: a.backgroundImage?.opacity ?? 1, overlay: a.backgroundImage?.overlay ?? { type: "solid", color: "#00000059" } } : null }), false)}
            options={[{ value: "", label: "없음" }, ...photos.map((p, i) => ({ value: p.id, label: p.label || `사진 ${i + 1}` }))]}
          />
        </Row>
        {ab.backgroundImage && (
          <>
            <Row label="사진 투명도"><Slider value={ab.backgroundImage.opacity} min={0} max={1} step={0.05} onChange={(v) => setAb((a) => ({ ...a, backgroundImage: a.backgroundImage && { ...a.backgroundImage, opacity: v } }))} /></Row>
            <Row label="어둡게 덮기">
              <Toggle
                checked={!!ab.backgroundImage.overlay}
                onChange={(on) => setAb((a) => ({ ...a, backgroundImage: a.backgroundImage && { ...a.backgroundImage, overlay: on ? { type: "solid", color: "#00000059" } : null } }), false)}
              />
              {ab.backgroundImage.overlay?.type === "solid" && (
                <ColorInput value={ab.backgroundImage.overlay.color} onChange={(c) => setAb((a) => ({ ...a, backgroundImage: a.backgroundImage && { ...a.backgroundImage, overlay: { type: "solid", color: c } } }))} />
              )}
            </Row>
          </>
        )}
      </Group>

      {which === "hero" && (
        <Group title="네이버 배치">
          <Row label="히어로 높이">
            <NumberInput value={design.hero.height} min={NAVER_SPEC.heroHeight.min} max={NAVER_SPEC.heroHeight.max} onChange={(v) => set((d) => ({ ...d, hero: { ...d.hero, height: v } }), true)} />
          </Row>
          <Row label="타이틀 영역 높이">
            <NumberInput value={design.layout.titleHeight} min={NAVER_SPEC.titleHeight.min} max={NAVER_SPEC.titleHeight.max} onChange={(v) => set((d) => ({ ...d, layout: { ...d.layout, titleHeight: v } }), true)} />
          </Row>
          <Row label="네이버 메뉴 바 표시">
            <Toggle checked={design.layout.showMenuBar} onChange={(on) => set((d) => ({ ...d, layout: { ...d.layout, showMenuBar: on } }))} />
          </Row>
          <Row label="버튼 줄 위치(Y)">
            <NumberInput value={design.layout.widgetTop} min={0} onChange={(v) => set((d) => ({ ...d, layout: { ...d.layout, widgetTop: v } }), true)} />
          </Row>
          <Row label="본문 바깥 배경">
            <ColorInput value={design.pageBackground} onChange={(c) => set((d) => ({ ...d, pageBackground: c }), true)} />
          </Row>
          <p className="pt-1 text-[11px] leading-relaxed text-ink-3">
            타이틀 영역 높이는 네이버 리모콘 &gt; 타이틀에서 같은 값으로 맞춥니다. 버튼 줄 위치는 미리보기용이며, 실제 위치는 네이버 레이아웃 설정에 따라 정해집니다.
          </p>
        </Group>
      )}
    </div>
  );
}
