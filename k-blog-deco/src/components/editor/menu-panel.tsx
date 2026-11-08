"use client";

import type { BlogDesignT, MenuItemT } from "@/lib/design/schema";
import { FONTS, nearestWeight } from "@/lib/design/fonts";
import { NAVER_SPEC } from "@/lib/naver/spec";
import { Button, Input } from "@/components/ui";
import { ColorInput, FillEditor, FontSelect, Group, NumberInput, Row, Select, Slider, Toggle } from "./controls";

export function MenuPanel({ design, set }: { design: BlogDesignT; set: (fn: (d: BlogDesignT) => BlogDesignT, merge?: boolean) => void }) {
  const m = design.menu;
  const st = m.style;
  const setMenu = (fn: (mm: typeof m) => typeof m, merge = true) => set((d) => ({ ...d, menu: fn(d.menu) }), merge);
  const setStyle = (patch: Partial<typeof st>, merge = true) => setMenu((mm) => ({ ...mm, style: { ...mm.style, ...patch } }), merge);
  const setItem = (id: string, patch: Partial<MenuItemT>) => setMenu((mm) => ({ ...mm, items: mm.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const moveItem = (i: number, dir: -1 | 1) =>
    setMenu((mm) => {
      const j = i + dir;
      if (j < 0 || j >= mm.items.length) return mm;
      const items = [...mm.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...mm, items };
    }, false);

  return (
    <div>
      <Group title={`버튼 목록 (${m.items.length}/10)`}>
        <p className="mb-2 text-[11px] leading-relaxed text-ink-3">버튼 하나가 네이버 위젯 하나가 됩니다 (가로 {NAVER_SPEC.widget.width}px 고정). 한 줄에 {NAVER_SPEC.maxWidgetsPerRow}개까지 들어갑니다.</p>
        <ul className="space-y-2">
          {m.items.map((it, i) => (
            <li key={it.id} className="rounded-lg border border-line bg-paper p-2.5">
              <div className="flex gap-1.5">
                <Input value={it.emoji} onChange={(e) => setItem(it.id, { emoji: Array.from(e.target.value).slice(-2).join("") })} className="h-8 w-11 px-1 text-center" aria-label="이모지" placeholder="✨" />
                <Input value={it.label} maxLength={20} onChange={(e) => setItem(it.id, { label: e.target.value })} className="h-8" aria-label="버튼 이름" />
                <button onClick={() => moveItem(i, -1)} className="px-1 text-ink-3 hover:text-ink" aria-label="위로">↑</button>
                <button onClick={() => moveItem(i, 1)} className="px-1 text-ink-3 hover:text-ink" aria-label="아래로">↓</button>
                <button onClick={() => setMenu((mm) => ({ ...mm, items: mm.items.filter((x) => x.id !== it.id) }), false)} className="px-1 text-ink-3 hover:text-danger" aria-label="삭제">✕</button>
              </div>
              <Input value={it.sublabel} maxLength={30} onChange={(e) => setItem(it.id, { sublabel: e.target.value })} className="mt-1.5 h-8 text-[12px]" placeholder="보조 문구 (예: ABOUT)" />
              <Input value={it.link} onChange={(e) => setItem(it.id, { link: e.target.value })} className="mt-1.5 h-8 text-[12px]" placeholder="https://blog.naver.com/아이디/카테고리…" />
              {!it.link && <p className="mt-1 text-[11px] text-warn">링크를 넣어야 버튼이 동작합니다.</p>}
            </li>
          ))}
        </ul>
        {m.items.length < 10 && (
          <Button
            size="sm"
            className="mt-2 w-full"
            onClick={() =>
              setMenu((mm) => ({
                ...mm,
                items: [...mm.items, { id: `menu-${Date.now().toString(36)}`, label: "새 버튼", sublabel: "", emoji: "", link: "", fill: null, textColor: null }],
              }), false)
            }
          >
            + 버튼 추가
          </Button>
        )}
      </Group>

      <Group title="버튼 모양">
        <Row label="구성">
          <Select
            value={st.layout}
            onChange={(v) => setStyle({ layout: v }, false)}
            options={[
              { value: "label", label: "글자만" },
              { value: "label-sub", label: "글자 + 보조 문구" },
              { value: "emoji-label", label: "이모지 + 글자" },
              { value: "emoji-top", label: "이모지 위, 글자 아래" },
            ]}
          />
        </Row>
        <Row label="버튼 높이"><NumberInput value={m.itemHeight} min={NAVER_SPEC.widget.minHeight} max={NAVER_SPEC.widget.maxHeight} onChange={(v) => setMenu((mm) => ({ ...mm, itemHeight: v }))} /></Row>
        <Row label="버튼 간격"><Slider value={m.gap} min={0} max={40} onChange={(v) => setMenu((mm) => ({ ...mm, gap: v }))} /></Row>
        <Row label="정렬"><Select value={m.align} onChange={(v) => setMenu((mm) => ({ ...mm, align: v }), false)} options={[{ value: "center", label: "가운데" }, { value: "left", label: "왼쪽" }]} /></Row>
        <FillEditor value={st.fill} onChange={(f) => setStyle({ fill: f })} />
        <Row label="글자 색"><ColorInput value={st.textColor} onChange={(c) => setStyle({ textColor: c })} /></Row>
        <Row label="보조 문구 색"><ColorInput value={st.sublabelColor} onChange={(c) => setStyle({ sublabelColor: c })} /></Row>
        <Row label="모서리 둥글기"><Slider value={st.radius} min={0} max={Math.ceil(m.itemHeight / 2)} onChange={(v) => setStyle({ radius: v })} /></Row>
        <Row label="테두리">
          <Toggle checked={!!st.stroke} onChange={(on) => setStyle({ stroke: on ? { color: design.palette.text, width: 1 } : null }, false)} />
          {st.stroke && (
            <>
              <ColorInput value={st.stroke.color} onChange={(c) => setStyle({ stroke: { ...st.stroke!, color: c } })} />
              <NumberInput w="w-[52px]" value={st.stroke.width} min={0.5} max={8} step={0.5} onChange={(v) => setStyle({ stroke: { ...st.stroke!, width: v } })} />
            </>
          )}
        </Row>
        <Row label="글꼴"><FontSelect value={st.font} onChange={(f) => setStyle({ font: f, weight: nearestWeight(f, st.weight) }, false)} /></Row>
        <Row label="글자 크기 / 굵기">
          <NumberInput value={st.size} min={10} max={48} onChange={(v) => setStyle({ size: v })} />
          <Select value={String(st.weight)} onChange={(v) => setStyle({ weight: Number(v) }, false)} options={FONTS[st.font].weights.map((w) => ({ value: String(w), label: String(w) }))} />
        </Row>
      </Group>
    </div>
  );
}
