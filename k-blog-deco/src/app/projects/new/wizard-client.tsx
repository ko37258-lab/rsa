"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  downscaleImage,
  extractVideoFrames,
  uploadImage,
  type AppConfig,
  type Asset,
  type Project,
} from "@/lib/client/api";
import { PRESETS, MOOD_TAGS } from "@/lib/design/presets";
import type { BriefT, ReferenceT } from "@/lib/design/schema";
import { Button, Card, Field, Input, Notice, Spinner, Textarea, cx } from "@/components/ui";
import { ImageDrop } from "@/components/image-drop";

const STEPS = ["기본 정보", "레퍼런스", "스타일 요청", "내 사진", "확인"] as const;

const MENU_SUGGESTIONS = ["블로그 소개", "상담 문의", "오시는 길", "후기", "공지사항", "이벤트", "예약하기", "유튜브"];

const GEN_TIPS = [
  "레퍼런스의 색과 여백을 읽고 있어요",
  "제목과 버튼의 크기 비율을 맞추는 중",
  "사진을 어디에 둘지 고민하고 있어요",
  "네이버 위젯 규격(170px)에 맞춰 버튼을 다듬는 중",
  "모바일 커버를 다시 배치하고 있어요",
];

type Ref = ReferenceT & { assets: Asset[] };

const rid = () => `ref_${Math.random().toString(36).slice(2, 10)}`;

export function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tip, setTip] = useState(0);

  // 기본 정보
  const [blogName, setBlogName] = useState("");
  const [tagline, setTagline] = useState("");
  const [industry, setIndustry] = useState("");
  const [audience, setAudience] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [contacts, setContacts] = useState({ phone: "", kakao: "", instagram: "", youtube: "", address: "" });
  // 레퍼런스
  const [refs, setRefs] = useState<Ref[]>([]);
  const [refUrl, setRefUrl] = useState("");
  // 스타일
  const [presetId, setPresetId] = useState<string | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [colorPreference, setColorPreference] = useState("");
  const [styleRequest, setStyleRequest] = useState("");
  const [menu, setMenu] = useState<{ label: string; link: string }[]>([
    { label: "블로그 소개", link: "" },
    { label: "상담 문의", link: "" },
    { label: "오시는 길", link: "" },
  ]);
  // 사진
  const [photos, setPhotos] = useState<Asset[]>([]);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => setTip((i) => (i + 1) % GEN_TIPS.length), 4000);
    return () => clearInterval(t);
  }, [generating]);

  const brief: BriefT = useMemo(
    () => ({
      blogName: blogName.trim(),
      tagline,
      industry,
      audience,
      blogUrl,
      menu: menu.filter((m) => m.label.trim()),
      contacts,
      styleRequest,
      colorPreference,
      moods,
      presetId,
      references: refs.map((r) => ({ id: r.id, kind: r.kind, url: r.url, note: r.note, assetIds: r.assetIds, inspected: r.inspected })),
      photoAssetIds: photos.map((p) => p.id),
    }),
    [blogName, tagline, industry, audience, blogUrl, menu, contacts, styleRequest, colorPreference, moods, presetId, refs, photos],
  );

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const addUrlRef = () =>
    run("url", async () => {
      if (!refUrl.trim()) return;
      const r = await api<{ url: string; inspected: NonNullable<ReferenceT["inspected"]>; assets: Asset[] }>(
        "/api/v1/references/inspect",
        { body: { url: refUrl.trim() } },
      );
      setRefs((rs) => [...rs, { id: rid(), kind: "url", url: r.url, note: "", assetIds: r.assets.map((a) => a.id), inspected: r.inspected, assets: r.assets }]);
      setRefUrl("");
    });

  const addImageRefs = (files: File[]) =>
    run("image", async () => {
      for (const f of files.filter((f) => f.type.startsWith("image/")).slice(0, 8)) {
        const blob = await downscaleImage(f);
        const a = await uploadImage(blob, { kind: "reference", filename: f.name, label: f.name });
        setRefs((rs) => [...rs, { id: rid(), kind: "image", url: "", note: "", assetIds: [a.id], inspected: null, assets: [a] }]);
      }
    });

  const addVideoRef = (files: File[]) =>
    run("video", async () => {
      const f = files.find((x) => x.type.startsWith("video/"));
      if (!f) throw new Error("영상 파일(MP4 등)을 선택해 주세요.");
      const frames = await extractVideoFrames(f, 6);
      const assets: Asset[] = [];
      for (const [i, fr] of frames.entries()) {
        assets.push(await uploadImage(fr, { kind: "reference", filename: `${f.name}-${i + 1}.jpg`, label: `${f.name} 장면 ${i + 1}` }));
      }
      setRefs((rs) => [...rs, { id: rid(), kind: "video", url: "", note: `영상: ${f.name}`, assetIds: assets.map((a) => a.id), inspected: null, assets }]);
    });

  const addPhotos = (files: File[]) =>
    run("photo", async () => {
      for (const f of files.filter((f) => f.type.startsWith("image/")).slice(0, 10 - photos.length)) {
        const blob = await downscaleImage(f);
        const a = await uploadImage(blob, { kind: "photo", filename: f.name, label: "" });
        setPhotos((ps) => [...ps, a]);
      }
    });

  async function setPhotoLabel(a: Asset, label: string) {
    setPhotos((ps) => ps.map((p) => (p.id === a.id ? { ...p, label } : p)));
  }

  async function submit() {
    if (!brief.blogName) {
      setStep(0);
      setError("블로그 이름을 입력해 주세요.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      // 사진 라벨 저장 (AI 가 사진 용도를 알 수 있도록)
      await Promise.all(photos.filter((p) => p.label).map((p) => api(`/api/v1/assets/${p.id}`, { method: "PATCH", body: { label: p.label } })));
      const { project } = await api<{ project: Project }>("/api/v1/projects", { body: { brief } });
      await api(`/api/v1/projects/${project.id}/generate`, { body: {} });
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setError((e as Error).message);
      setGenerating(false);
    }
  }

  const canNext = step !== 0 || blogName.trim().length > 0;

  if (generating) {
    return (
      <main className="flex flex-1 items-center justify-center px-5 py-20">
        <Card className="w-full max-w-md p-10 text-center">
          <Spinner className="size-8 text-accent" />
          <p className="mt-6 text-xl font-extrabold tracking-tight">디자인을 만들고 있어요</p>
          <p className="mt-2 min-h-[1.5em] text-sm text-ink-2 transition">{GEN_TIPS[tip]}</p>
          <p className="mt-6 text-xs text-ink-3">
            {cfg?.ai.mode === "claude" ? "레퍼런스가 많으면 1~3분 정도 걸릴 수 있습니다. 창을 닫지 마세요." : "템플릿 모드로 바로 만들어집니다."}
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-[1100px] flex-1 gap-8 px-5 py-10 md:grid-cols-[200px_1fr]">
      <nav aria-label="단계" className="md:sticky md:top-24 md:self-start">
        <ol className="flex gap-2 overflow-x-auto md:flex-col md:gap-1">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                onClick={() => (i === 0 || blogName.trim()) && setStep(i)}
                className={cx(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-semibold",
                  i === step ? "bg-card text-ink shadow-sm ring-1 ring-line" : "text-ink-3 hover:text-ink",
                )}
              >
                <span className={cx("grid size-5 place-items-center rounded-full text-[11px]", i < step ? "bg-ink text-white" : i === step ? "bg-accent text-white" : "bg-paper-2")}>
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0">
        {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}

        {step === 0 && (
          <Section title="어떤 블로그인가요?" desc="블로그 이름은 디자인에 그대로 들어갑니다. 나머지는 비워도 됩니다.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="블로그 이름 *" className="sm:col-span-2">
                <Input value={blogName} onChange={(e) => setBlogName(e.target.value)} placeholder="예: 새봄 토지연구소" maxLength={40} autoFocus />
              </Field>
              <Field label="한 줄 소개" className="sm:col-span-2">
                <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="예: 땅의 가치를 읽는 부동산 공법 이야기" maxLength={100} />
              </Field>
              <Field label="업종 / 분야">
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="예: 부동산 컨설팅, 카페, 네일샵" maxLength={40} />
              </Field>
              <Field label="주요 방문자">
                <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="예: 토지 투자에 관심 있는 40~60대" maxLength={100} />
              </Field>
              <Field label="내 블로그 주소" hint="버튼 링크가 비어 있으면 이 주소를 씁니다." className="sm:col-span-2">
                <Input value={blogUrl} onChange={(e) => setBlogUrl(e.target.value)} placeholder="https://blog.naver.com/아이디" />
              </Field>
            </div>
            <details className="mt-6 rounded-xl border border-line bg-paper px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink-2">연락처·SNS 추가 (선택)</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["phone", "전화번호", "010-0000-0000"],
                    ["kakao", "카카오톡 채널", "https://pf.kakao.com/..."],
                    ["instagram", "인스타그램", "https://instagram.com/..."],
                    ["youtube", "유튜브", "https://youtube.com/@..."],
                    ["address", "주소", "서울시 ..."],
                  ] as const
                ).map(([k, label, ph]) => (
                  <Field key={k} label={label}>
                    <Input value={contacts[k]} onChange={(e) => setContacts((c) => ({ ...c, [k]: e.target.value }))} placeholder={ph} />
                  </Field>
                ))}
              </div>
            </details>
          </Section>
        )}

        {step === 1 && (
          <Section title="참고할 레퍼런스를 넣어 주세요" desc="닮고 싶은 홈페이지·블로그를 넣을수록 결과가 정확해집니다. 화면 캡처가 가장 확실합니다.">
            <div className="space-y-5">
              <Card className="p-5">
                <p className="text-sm font-bold">웹사이트 / 블로그 주소</p>
                <p className="mt-1 text-xs text-ink-3">색상, 폰트, 메뉴 구성, 대표 이미지를 자동으로 읽어옵니다.</p>
                <div className="mt-3 flex gap-2">
                  <Input value={refUrl} onChange={(e) => setRefUrl(e.target.value)} placeholder="https://blog.naver.com/..." onKeyDown={(e) => e.key === "Enter" && addUrlRef()} />
                  <Button variant="primary" onClick={addUrlRef} disabled={!!busy || !refUrl.trim()}>
                    {busy === "url" ? <Spinner /> : "분석"}
                  </Button>
                </div>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageDrop title={busy === "image" ? "올리는 중…" : "화면 캡처 / 이미지 올리기"} hint="PNG·JPG·WebP, 여러 장 가능" onFiles={addImageRefs} disabled={!!busy} />
                <ImageDrop
                  title={busy === "video" ? "장면 추출 중…" : "참고 영상 올리기"}
                  hint="영상에서 6개 장면을 뽑아 참고합니다 (영상 자체는 업로드하지 않음)"
                  accept="video/*"
                  multiple={false}
                  onFiles={addVideoRef}
                  disabled={!!busy}
                />
              </div>

              {refs.length > 0 && (
                <ul className="space-y-3">
                  {refs.map((r, i) => (
                    <li key={r.id}>
                      <Card className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-bold">
                            레퍼런스 {i + 1}
                            <span className="ml-2 rounded bg-paper-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-3">
                              {r.kind === "url" ? "웹사이트" : r.kind === "video" ? "영상 장면" : "이미지"}
                            </span>
                          </p>
                          <button onClick={() => setRefs((rs) => rs.filter((x) => x.id !== r.id))} className="text-xs text-ink-3 hover:text-danger">삭제</button>
                        </div>
                        {r.kind === "url" && (
                          <div className="mt-2 text-[13px] text-ink-2">
                            <p className="truncate">{r.inspected?.title || r.url}</p>
                            {!!r.inspected?.colors.length && (
                              <div className="mt-2 flex flex-wrap items-center gap-1">
                                {r.inspected.colors.slice(0, 10).map((c) => (
                                  <span key={c} title={c} className="size-5 rounded border border-line" style={{ background: c }} />
                                ))}
                                {!!r.inspected.fonts.length && <span className="ml-2 text-xs text-ink-3">폰트: {r.inspected.fonts.slice(0, 3).join(", ")}</span>}
                              </div>
                            )}
                          </div>
                        )}
                        {r.assets.length > 0 && (
                          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scroll-thin">
                            {r.assets.map((a) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={a.id} src={a.url} alt="" className="h-20 shrink-0 rounded-md border border-line object-cover" />
                            ))}
                          </div>
                        )}
                        <Input
                          className="mt-3"
                          value={r.note}
                          maxLength={300}
                          onChange={(e) => setRefs((rs) => rs.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)))}
                          placeholder="이 레퍼런스에서 무엇을 가져올까요? 예: 상단 배너 배치와 버튼 모양"
                        />
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section title="원하는 스타일을 알려 주세요" desc="프리셋을 고르거나, 말로 자세히 적어 주세요. 둘 다 해도 됩니다.">
            <p className="mb-2 text-[13px] font-semibold text-ink-2">스타일 프리셋 (선택)</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId((cur) => (cur === p.id ? null : p.id))}
                  className={cx(
                    "rounded-xl border bg-card p-3 text-left transition",
                    presetId === p.id ? "border-ink ring-2 ring-ink" : "border-line hover:border-line-2",
                  )}
                >
                  <div className="flex h-8 overflow-hidden rounded-md">
                    {[p.palette.primary, p.palette.secondary, p.palette.accent, p.palette.background].map((c, i) => (
                      <span key={i} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                  <p className="mt-2 text-[13px] font-bold">{p.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-3">{p.description}</p>
                </button>
              ))}
            </div>

            <p className="mb-2 mt-6 text-[13px] font-semibold text-ink-2">분위기</p>
            <div className="flex flex-wrap gap-1.5">
              {MOOD_TAGS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMoods((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m].slice(0, 8)))}
                  className={cx(
                    "rounded-full border px-3 py-1 text-[13px] font-semibold",
                    moods.includes(m) ? "border-ink bg-ink text-white" : "border-line-2 bg-card text-ink-2 hover:border-ink-3",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-5">
              <Field label="색상 취향">
                <Input value={colorPreference} onChange={(e) => setColorPreference(e.target.value)} placeholder="예: 네이비와 골드, 흰 바탕 위주로" maxLength={300} />
              </Field>
              <Field label="이런 스타일로 만들어 주세요 (자세할수록 좋아요)">
                <Textarea
                  rows={6}
                  value={styleRequest}
                  onChange={(e) => setStyleRequest(e.target.value)}
                  maxLength={3000}
                  placeholder={"예)\n- 레퍼런스 1처럼 왼쪽에 큰 제목, 오른쪽에 대표 사진\n- 버튼은 흰색 둥근 알약 모양, 아이콘 없이 글자만\n- 전체적으로 신뢰감 있고 차분하게, 장식은 최소로"}
                />
              </Field>
            </div>

            <div className="mt-8">
              <p className="text-[13px] font-semibold text-ink-2">버튼(메뉴) 구성</p>
              <p className="mt-1 text-xs text-ink-3">홈페이지형 블로그 상단의 클릭 버튼입니다. 네이버 위젯 규격상 한 줄에 5개까지 보기 좋습니다.</p>
              <ul className="mt-3 space-y-2">
                {menu.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <Input className="max-w-[180px]" value={m.label} maxLength={20} placeholder="버튼 이름" onChange={(e) => setMenu((ms) => ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <Input value={m.link} placeholder="연결할 주소 (카테고리·글·외부 링크)" onChange={(e) => setMenu((ms) => ms.map((x, j) => (j === i ? { ...x, link: e.target.value } : x)))} />
                    <Button variant="ghost" onClick={() => setMenu((ms) => ms.filter((_, j) => j !== i))} aria-label="버튼 삭제">✕</Button>
                  </li>
                ))}
              </ul>
              {menu.length < 10 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {MENU_SUGGESTIONS.filter((s) => !menu.some((m) => m.label === s)).map((s) => (
                    <button key={s} onClick={() => setMenu((ms) => [...ms, { label: s, link: "" }])} className="rounded-full border border-dashed border-line-2 px-2.5 py-1 text-xs text-ink-2 hover:border-ink-3">
                      + {s}
                    </button>
                  ))}
                  <button onClick={() => setMenu((ms) => [...ms, { label: "", link: "" }])} className="rounded-full border border-dashed border-line-2 px-2.5 py-1 text-xs text-ink-2 hover:border-ink-3">
                    + 직접 입력
                  </button>
                </div>
              )}
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section title="디자인에 넣을 사진" desc="대표 사진, 프로필, 매장·상품 사진 등을 올리면 AI 가 알맞은 자리에 배치합니다. 없어도 됩니다.">
            <ImageDrop title={busy === "photo" ? "올리는 중…" : "사진 올리기"} hint="최대 10장 · 큰 사진은 자동으로 줄여서 올립니다" onFiles={addPhotos} disabled={!!busy || photos.length >= 10} />
            {photos.length > 0 && (
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((p) => (
                  <li key={p.id}>
                    <Card className="overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-36 w-full object-cover" />
                      <div className="flex gap-2 p-3">
                        <Input value={p.label ?? ""} maxLength={80} onChange={(e) => setPhotoLabel(p, e.target.value)} placeholder="용도 (예: 대표 프로필)" className="h-9" />
                        <Button size="sm" variant="ghost" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>삭제</Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {step === 4 && (
          <Section title="이대로 만들까요?" desc="생성 후에도 말로 수정하거나 직접 끌어서 고칠 수 있습니다.">
            <Card className="divide-y divide-line">
              {[
                ["블로그 이름", brief.blogName || "—"],
                ["한 줄 소개", brief.tagline || "—"],
                ["업종", brief.industry || "—"],
                ["레퍼런스", refs.length ? `${refs.length}개 (${refs.map((r) => (r.kind === "url" ? "웹사이트" : r.kind === "video" ? "영상" : "이미지")).join(", ")})` : "없음"],
                ["스타일", [PRESETS.find((p) => p.id === presetId)?.name, ...moods].filter(Boolean).join(" · ") || "AI 에게 맡김"],
                ["버튼", brief.menu.map((m) => m.label).join(" / ") || "AI 가 제안"],
                ["사진", photos.length ? `${photos.length}장` : "없음"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4 px-5 py-3 text-sm">
                  <span className="w-24 shrink-0 font-semibold text-ink-3">{k}</span>
                  <span className="min-w-0 break-words text-ink">{v}</span>
                </div>
              ))}
            </Card>
            {cfg?.ai.mode === "template" && (
              <div className="mt-4">
                <Notice>AI 키가 없어 <b>템플릿 모드</b>로 만들어집니다. 레퍼런스 분석은 AI 키를 설정해야 동작합니다.</Notice>
              </div>
            )}
          </Section>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-6">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            ← 이전
          </Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext || !!busy}>
              다음 →
            </Button>
          ) : (
            <Button variant="accent" size="lg" onClick={submit} disabled={!!busy || !brief.blogName}>
              디자인 만들기
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-[24px] font-extrabold tracking-tight">{title}</h1>
      <p className="mb-6 mt-1.5 text-sm text-ink-3">{desc}</p>
      {children}
    </section>
  );
}
