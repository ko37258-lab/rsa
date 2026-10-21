/**
 * 시연용 데이터 생성기. 시드 고정 난수라 같은 날 만들면 같은 데이터가 나온다.
 * 모든 이름·연락처는 지어낸 예시다(이메일은 example.com).
 * 오늘을 기준으로 13개월 전부터의 계약·청구·입금 흐름을 만들어 대시보드 추이가 채워지게 한다.
 */
import type {
  Allocation, Branch, Building, Charge, ChargeKind, DB, Inquiry, Lease, LeaseStatus, Message, Party, Payment,
  Policy, PreparedFile, QaItem, ReplyTemplate, Settlement, Signature, Unit, UnitBlock, UnitType, Memo, HistoryEvent, Channel,
} from "@/types";
import { daysBetween, plusDays, plusMonths, ym } from "@/lib/dates";
import { SOURCES, LOST_REASONS } from "@/lib/codes";

export const DB_VERSION = 5;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(today: string): DB {
  const rnd = mulberry32(20261021);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
  const chance = (p: number) => rnd() < p;
  const counters: Record<string, number> = {};
  const id = (prefix: string) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}_${counters[prefix].toString().padStart(4, "0")}`;
  };
  const iso = (d: string, h = int(9, 20), m = int(0, 59)) =>
    `${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`;

  const staff = [
    { id: "s_kim", name: "김하늘", role: "지점 매니저" },
    { id: "s_lee", name: "이도윤", role: "상담 매니저" },
    { id: "s_park", name: "박서연", role: "정산 담당" },
    { id: "s_choi", name: "최민준", role: "현장 매니저" },
  ];

  // ── 지점 · 건물 · 룸타입 · 호실 ─────────────────────────────
  const branchDefs = [
    { code: "SC", name: "MR.K 신촌", en: "MR.K Sinchon", addr: "서울 서대문구 연세로 12", floors: [2, 3, 4, 5, 6, 7], perFloor: 7, rate: 1200 },
    { code: "SS", name: "MR.K 성수", en: "MR.K Seongsu", addr: "서울 성동구 연무장길 45", floors: [2, 3, 4, 5, 6], perFloor: 6, rate: 1000 },
    { code: "PG", name: "MR.K 판교", en: "MR.K Pangyo", addr: "경기 성남시 분당구 판교역로 210", floors: [3, 4, 5, 6], perFloor: 6, rate: 1100 },
  ];
  const typeDefs = [
    { name: "스탠다드", area: 14.2, rent: 620000, mgmt: 80000 },
    { name: "스탠다드 플러스", area: 17.5, rent: 720000, mgmt: 80000 },
    { name: "프리미엄", area: 22.1, rent: 890000, mgmt: 100000 },
    { name: "투룸 스위트", area: 31.4, rent: 1250000, mgmt: 120000 },
  ];
  const branches: Branch[] = [];
  const buildings: Building[] = [];
  const unitTypes: UnitType[] = [];
  const units: Unit[] = [];
  branchDefs.forEach((b, bi) => {
    const branch: Branch = {
      id: `b_${b.code.toLowerCase()}`,
      code: b.code,
      name: b.name,
      name_en: b.en,
      address: b.addr,
      email: `${b.code.toLowerCase()}@mrk-living.example.com`,
      phone: `02-${3140 + bi * 7}-${1200 + bi * 31}`,
      opened_on: plusDays(today, -900 + bi * 120),
      commission: { structure: bi === 1 ? "fixed_minus" : "rate", rate_bp: b.rate, fixed_amount: 18000000 },
      bank_account: `국민 ${400 + bi}-21-0${bi}93${bi}1`,
    };
    branches.push(branch);
    const bld: Building = { id: `bd_${b.code.toLowerCase()}`, branch_id: branch.id, name: `${b.name.replace("MR.K ", "")} 하우스`, floors: b.floors.length };
    buildings.push(bld);
    const types = typeDefs.map((t) => {
      const ut: UnitType = {
        id: id("ut"),
        branch_id: branch.id,
        name: t.name,
        area_m2: t.area,
        list_rent: Math.round((t.rent * (bi === 2 ? 1.08 : bi === 1 ? 1.04 : 1)) / 10000) * 10000,
        list_mgmt: t.mgmt,
      };
      unitTypes.push(ut);
      return ut;
    });
    b.floors.forEach((f) => {
      for (let i = 1; i <= b.perFloor; i++) {
        // 층마다 끝 호실은 넓은 타입, 맨 위층 한 칸은 투룸
        const t = f === b.floors[b.floors.length - 1] && i === b.perFloor ? types[3] : i === b.perFloor ? types[2] : i % 3 === 0 ? types[1] : types[0];
        units.push({
          id: id("u"),
          branch_id: branch.id,
          building_id: bld.id,
          unit_type_id: t.id,
          code: `${f}${String(i).padStart(2, "0")}`,
          floor: f,
          area_m2: t.area_m2,
          facing: pick(["남", "동", "서", "남동", "남서", "북"] as const),
          sale_status: "on_sale",
          asking_price: { rent: t.list_rent + (f >= 5 ? 20000 : 0), mgmt: t.list_mgmt },
          layout: { col: i, span: t === types[3] ? 2 : 1 },
          memo: "",
          created_at: iso(branch.opened_on),
        });
      }
    });
  });
  // 운영중지 · 모집가 미정 몇 개
  units[5].sale_status = "off_sale";
  units[47].asking_price = null;

  // ── 사람 ─────────────────────────────────────────────
  const surnames = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍"];
  const given = ["민서", "지호", "서윤", "도현", "하은", "예준", "지우", "수아", "시우", "유진", "현우", "채원", "준서", "다은", "건우", "서연", "태윤", "나연", "은호", "소율", "재민", "가은", "우진", "하린"];
  const foreign: Array<[string, string, Party["gender"]]> = [
    ["Sato Yui", "JP", "F"], ["Tanaka Ren", "JP", "M"], ["Emily Carter", "US", "F"], ["Lucas Martin", "FR", "M"], ["Nguyen Thi Lan", "VN", "F"],
    ["Wang Hao", "CN", "M"], ["Chen Yu-ting", "TW", "F"], ["Jonas Weber", "DE", "M"], ["Olivia Brown", "US", "F"], ["Kim Jisoo Anna", "US", "F"],
    ["Suzuki Haruto", "JP", "M"], ["Li Mei", "CN", "F"], ["Tran Minh", "VN", "M"], ["Camille Dubois", "FR", "F"],
  ];
  const corps = ["(주)한빛소프트", "넥스트랩 주식회사", "(주)그린모빌리티", "스텔라바이오(주)", "(주)오픈코어"];
  const parties: Party[] = [];
  const phone = () => `010-${int(2000, 9899)}-${int(1000, 9999)}`;
  const newPerson = (branchId: string, createdDay: string): Party => {
    const isForeign = chance(0.22);
    let name: string;
    let nat = "KR";
    let gender: Party["gender"];
    if (isForeign) {
      const f = pick(foreign);
      name = f[0];
      nat = f[1];
      gender = f[2];
    } else {
      name = pick(surnames) + pick(given);
      gender = chance(0.5) ? "F" : "M";
    }
    const p: Party = {
      id: id("pt"),
      kind: "individual",
      name,
      phone: phone(),
      email: `guest${counters.pt ?? 0}${int(10, 99)}@example.com`,
      nationality: nat,
      gender,
      branch_id: branchId,
      contact_name: null,
      created_at: iso(createdDay),
      last_activity_at: iso(createdDay),
      retention_until: null,
      bank_account: chance(0.6) ? `${pick(["국민", "신한", "우리", "하나", "카카오뱅크", "토스뱅크"])} ${int(100, 999)}-${int(10, 99)}-${int(100000, 999999)}` : null,
    };
    parties.push(p);
    return p;
  };
  const corpParties: Party[] = corps.map((c, i) => {
    const p: Party = {
      id: id("pt"),
      kind: "corporation",
      name: c,
      phone: `02-${int(2000, 7999)}-${int(1000, 9999)}`,
      email: `hr${i + 1}@corp.example.com`,
      nationality: "KR",
      gender: null,
      branch_id: null,
      contact_name: pick(surnames) + pick(given),
      created_at: iso(plusDays(today, -500)),
      last_activity_at: iso(plusDays(today, -int(1, 40))),
      retention_until: null,
      bank_account: `기업 ${int(100, 999)}-${int(100000, 999999)}-01-0${i}`,
    };
    parties.push(p);
    return p;
  });

  // ── 계약 사슬 ───────────────────────────────────────────
  const leases: Lease[] = [];
  const inquiries: Inquiry[] = [];
  const history: HistoryEvent[] = [];
  const hist = (kind: HistoryEvent["target_kind"], tid: string, at: string, text: string, author = pick(staff).name) =>
    history.push({ id: id("h"), target_kind: kind, target_id: tid, at, author, text });

  const sourcePick = () => {
    const g = pick(["검색", "검색", "플랫폼", "플랫폼", "플랫폼", "SNS", "소개", "기타"]);
    return { g, d: pick(SOURCES[g]) };
  };
  const channelFor = (g: string): Channel => (g === "플랫폼" ? "platform" : g === "SNS" ? pick(["kakao", "web"] as const) : pick(["phone", "web", "email", "kakao", "visit"] as const));

  const firstMessage = (inq: { stay_months: number | null; desired_move_in: string | null; budget: number | null }) =>
    pick([
      `${inq.desired_move_in ? inq.desired_move_in.slice(5).replace("-", "월 ") + "일" : "다음 달"}부터 ${inq.stay_months ?? 6}개월 정도 살 방을 찾고 있어요. 지금 비어 있는 방이 있을까요?`,
      `월 ${inq.budget ? Math.round(inq.budget / 10000) : 70}만원 안쪽으로 가능한 방 있나요? 투어도 하고 싶습니다.`,
      "Hi, I'm looking for a furnished room for a few months. Is there any availability?",
      "회사 근처라 문의드립니다. 단기 계약도 가능한가요?",
      "보증금이랑 관리비에 뭐가 포함되는지 궁금합니다.",
    ]);

  const makeInquiry = (
    branchId: string,
    party: Party,
    created: string,
    stage: Inquiry["stage"],
    opts: { moveIn?: string; months?: number; budget?: number; leaseIds?: string[]; lost?: string } = {},
  ): Inquiry => {
    const src = sourcePick();
    const replyMin = chance(0.1) ? null : chance(0.55) ? int(4, 55) : chance(0.6) ? int(70, 600) : int(1500, 3000);
    const createdAt = iso(created);
    const firstReply = replyMin === null ? null : new Date(new Date(createdAt).getTime() + replyMin * 60000).toISOString();
    const months = opts.months ?? pick([3, 6, 6, 12, 12, 1]);
    const budget = opts.budget ?? pick([600000, 700000, 800000, 900000, 1000000, 1300000]);
    const moveIn = opts.moveIn ?? plusDays(created, int(7, 40));
    const msgs: Message[] = [
      { id: id("m"), direction: "inbound", body: firstMessage({ stay_months: months, desired_move_in: moveIn, budget }), at: createdAt, author: party.name, via: channelFor(src.g) },
    ];
    if (firstReply)
      msgs.push({
        id: id("m"),
        direction: "outbound",
        body: `안녕하세요, ${branches.find((b) => b.id === branchId)?.name}입니다. 문의 주셔서 감사합니다. 희망하시는 날짜에 입주 가능한 방을 정리해 보내드릴게요. 투어는 평일 10~19시에 가능합니다.`,
        at: firstReply,
        author: pick(staff).name,
        via: "email",
      });
    const inq: Inquiry = {
      id: id("iq"),
      branch_id: branchId,
      kind: "inquiry",
      party_id: party.id,
      channel: channelFor(src.g),
      source_group: src.g,
      source_detail: src.d,
      stage,
      lost_reason: stage === "lost" ? opts.lost ?? pick(LOST_REASONS) : null,
      assignee_id: chance(0.9) ? pick(staff).id : null,
      desired_move_in: moveIn,
      stay_months: months,
      monthly_budget: budget,
      rooms: chance(0.06) ? 2 : 1,
      message: msgs[0].body,
      unit_id: null,
      lease_ids: opts.leaseIds ?? [],
      created_at: createdAt,
      first_reply_at: firstReply,
      last_activity_at: firstReply ?? createdAt,
      closed_at: stage === "lost" || stage === "concluded" ? iso(plusDays(created, int(2, 14))) : null,
      messages: msgs,
      tours: [],
    };
    inquiries.push(inq);
    hist("inquiry", inq.id, createdAt, `${inq.channel === "platform" ? "플랫폼" : "직접"} 문의 접수`);
    return inq;
  };

  const historyStart = plusDays(today, -380);
  /** 오늘을 넘는 날짜는 오늘에서 back 일 전으로 당긴다 */
  const upToToday = (d: string, back = 0) => (d > today ? plusDays(today, -back) : d);
  for (const unit of units) {
    if (unit.sale_status === "off_sale") continue;
    const branchId = unit.branch_id;
    const ut = unitTypes.find((t) => t.id === unit.unit_type_id)!;
    let cursor = plusDays(historyStart, -int(0, 90)); // 오래 산 입주자도 있게
    let prevParty: Party | null = null;
    let prevLease: Lease | null = null;
    let guard = 0;
    while (guard++ < 30) {
      const isRenewal = !!prevLease && chance(0.32);
      const gap = isRenewal ? 0 : chance(0.12) ? int(20, 55) : int(0, 14);
      const start = plusDays(cursor, gap);
      if (start > plusDays(today, 50)) break;
      const term = pick([1, 3, 6, 6, 6, 12, 12, 12]);
      const end = plusDays(plusMonths(start, term), -1);
      const future = start > today;
      // 앞날 계약은 일부만 이미 잡혀 있다
      if (future && !chance(daysBetween(today, start) < 20 ? 0.7 : 0.4)) break;
      // 오늘 비어 있는 방도 조금 있게
      if (!future && start <= today && end >= today && chance(0.07)) break;

      const corp = chance(0.1);
      const contractor: Party = isRenewal && prevParty ? prevParty : newPerson(branchId, upToToday(plusDays(start, -int(10, 45))));
      const payer = corp ? pick(corpParties) : contractor;
      const discount = term >= 12 ? 30000 : term <= 1 ? -50000 : 0;
      const rent = Math.max(ut.list_rent - discount - (chance(0.15) ? 20000 : 0), 400000);
      let status: LeaseStatus;
      if (future) status = pick(["concluded", "concluded", "move_in_confirmed", "awaiting_signature"] as const);
      else if (end >= today) status = daysBetween(today, end) <= 10 && chance(0.6) ? "closing" : "occupied";
      else status = daysBetween(end, today) <= 12 && chance(0.7) ? "closing" : "closed";
      if (status === "move_in_confirmed" && daysBetween(today, start) > 25) status = "concluded";

      // 앞날 계약도 작성·서명은 오늘 이전에 일어났다
      const createdDay = upToToday(plusDays(start, -int(5, 35)), int(1, 6));
      const signedDay = status === "awaiting_signature" ? null : upToToday(plusDays(createdDay, int(0, 3)));
      const src = sourcePick();
      const lease: Lease = {
        id: id("ls"),
        branch_id: branchId,
        unit_id: unit.id,
        inquiry_id: null,
        contractor_id: contractor.id,
        payer_id: payer.id,
        status,
        start_date: start,
        end_date: end,
        move_in_date: status === "concluded" ? (chance(0.5) ? null : start) : start,
        move_out_date: status === "closed" || status === "closing" ? end : null,
        deposit: term <= 1 ? 500000 : 1000000,
        mgmt_deposit: 100000,
        prepaid_rent: term <= 1 ? rent : 0,
        contract_fee: 300000,
        rent,
        list_rent: ut.list_rent,
        mgmt_fee: ut.list_mgmt,
        cleaning_fee: ut.area_m2 > 25 ? 120000 : 80000,
        due_day: Number(start.slice(8, 10)),
        vat: corp ? "excluded" : "none",
        source_group: isRenewal ? "기타" : src.g,
        assignee_id: pick(staff).id,
        created_at: iso(createdDay),
        signed_at: signedDay ? iso(signedDay) : null,
        closed_at: status === "closed" ? iso(plusDays(end, int(3, 12))) : null,
        renewal_of: isRenewal && prevLease ? prevLease.id : null,
        memo: corp ? `${payer.name} 법인 대납 · 세금계산서 발행` : "",
      };
      leases.push(lease);
      hist("lease", lease.id, lease.created_at, "계약 작성");
      if (lease.signed_at) hist("lease", lease.id, lease.signed_at, "전자서명 완료 · 체결");
      if (["occupied", "closing", "closed"].includes(status)) hist("lease", lease.id, iso(start, 14), "입주 처리");
      if (status === "closing" || status === "closed") hist("lease", lease.id, iso(end, 11), "퇴실 처리");

      if (!isRenewal && createdDay >= plusDays(today, -330)) {
        const inq = makeInquiry(branchId, contractor, plusDays(createdDay, -int(1, 12)), status === "awaiting_signature" ? "signing" : "concluded", {
          moveIn: start,
          months: term,
          budget: Math.ceil(rent / 100000) * 100000,
          leaseIds: [lease.id],
        });
        inq.source_group = lease.source_group;
        if (inq.tours.length === 0 && chance(0.65))
          inq.tours.push({ id: id("tr"), at: iso(plusDays(inq.created_at.slice(0, 10), int(1, 4)), int(10, 18), 0), unit_ids: [unit.id], status: "done", memo: "" });
        lease.inquiry_id = inq.id;
      }
      prevParty = contractor;
      prevLease = lease;
      cursor = plusDays(end, 1);
      if (future) break;
    }
  }

  // 재계약으로 이어진 계약은 퇴실이 없었다: 퇴실일·퇴실 이력을 지우고 "끝남" 으로 둔다
  const renewedIds = new Set(leases.filter((l) => l.renewal_of).map((l) => l.renewal_of as string));
  for (const l of leases) {
    if (!renewedIds.has(l.id)) continue;
    l.move_out_date = null;
    if (l.status === "closing") {
      l.status = "closed";
      l.closed_at = iso(plusDays(l.end_date, 1));
    }
  }
  for (let i = history.length - 1; i >= 0; i--)
    if (renewedIds.has(history[i].target_id) && history[i].text === "퇴실 처리") history.splice(i, 1);

  // 결렬된 문의 · 진행 중 문의
  for (let i = 0; i < 260; i++) {
    const b = pick(branches);
    const created = plusDays(today, -int(1, 330));
    const p = newPerson(b.id, created);
    makeInquiry(b.id, p, created, "lost");
  }
  const openStages: Inquiry["stage"][] = ["new", "new", "new", "new", "tour", "tour", "drafting"];
  for (let i = 0; i < 26; i++) {
    const b = pick(branches);
    const created = plusDays(today, -int(0, 12));
    const p = newPerson(b.id, created);
    const stage = pick(openStages);
    const inq = makeInquiry(b.id, p, created, stage);
    if (i < 7) {
      // 답장 대기: 고객 메시지가 마지막
      inq.messages.push({ id: id("m"), direction: "inbound", body: pick(["혹시 반려동물 가능한가요?", "주차도 되나요?", "투어 시간 변경 가능할까요?", "계약서 미리 볼 수 있을까요?"]), at: iso(today, int(8, 11)), author: p.name, via: inq.channel });
      inq.last_activity_at = inq.messages[inq.messages.length - 1].at;
      if (i < 3) inq.assignee_id = null;
    }
    if (stage === "tour") {
      const cand = units.filter((u) => u.branch_id === b.id).slice(0, 40);
      inq.tours.push({ id: id("tr"), at: iso(plusDays(today, int(0, 4)), int(10, 18), 0), unit_ids: [pick(cand).id, pick(cand).id], status: "scheduled", memo: "" });
    }
  }
  // 생활문의
  const occupiedLeases = leases.filter((l) => l.status === "occupied");
  const lifeTopics = ["보일러에서 소리가 나요", "택배가 분실된 것 같아요", "인터넷이 자주 끊깁니다", "세탁기 사용 시간 문의", "재계약하고 싶어요", "퇴실 날짜 조정 가능할까요?", "Is it possible to extend my stay?", "방 열쇠를 잃어버렸어요"];
  for (let i = 0; i < 12; i++) {
    const l = pick(occupiedLeases);
    const p = parties.find((x) => x.id === l.contractor_id)!;
    const created = plusDays(today, -int(0, 20));
    const at = iso(created);
    const done = i >= 5;
    inquiries.push({
      id: id("iq"),
      branch_id: l.branch_id,
      kind: "life",
      party_id: p.id,
      channel: pick(["kakao", "email", "phone"] as const),
      source_group: "기타",
      source_detail: "입주자",
      stage: done ? "concluded" : "new",
      lost_reason: null,
      assignee_id: pick(staff).id,
      desired_move_in: null,
      stay_months: null,
      monthly_budget: null,
      rooms: 1,
      message: lifeTopics[i % lifeTopics.length],
      unit_id: l.unit_id,
      lease_ids: [l.id],
      created_at: at,
      first_reply_at: done ? iso(created, 20) : null,
      last_activity_at: at,
      closed_at: done ? iso(plusDays(created, 1)) : null,
      messages: [{ id: id("m"), direction: "inbound", body: lifeTopics[i % lifeTopics.length], at, author: p.name, via: "kakao" }],
      tours: [],
    });
  }

  // ── 청구 · 입금 · 배분 ──────────────────────────────────────
  const charges: Charge[] = [];
  const payments: Payment[] = [];
  const allocations: Allocation[] = [];
  const thisM = ym(today);
  const vatSplit = (amount: number, vat: Lease["vat"]) => {
    if (vat === "excluded") return { amount: Math.round(amount * 1.1), supply: amount, vat_amount: Math.round(amount * 0.1) };
    if (vat === "included") {
      const supply = Math.round(amount / 1.1);
      return { amount, supply, vat_amount: amount - supply };
    }
    return { amount, supply: amount, vat_amount: 0 };
  };
  const addCharge = (l: Lease, kind: ChargeKind, label: string, base: number, due: string, from: string | null, to: string | null) => {
    const v = kind === "rent" || kind === "mgmt" || kind === "usage" ? vatSplit(base, l.vat) : { amount: base, supply: base, vat_amount: 0 };
    const sent = due <= plusDays(today, 4);
    const c: Charge = {
      id: id("c"),
      branch_id: l.branch_id,
      lease_id: l.id,
      payer_id: l.payer_id,
      month: ym(due),
      kind,
      label,
      ...v,
      period_from: from,
      period_to: to,
      due_date: due,
      status: sent ? "sent" : "draft",
      invoice_no: sent ? `INV-${ym(due).replace("-", "")}-${l.id.slice(3)}` : null,
      sent_at: sent ? iso(plusDays(due, -5), 9, 0) : null,
      sent_via: sent ? "email" : null,
      created_at: iso(plusDays(due, -7), 9, 0),
    };
    charges.push(c);
    return c;
  };

  for (const l of leases) {
    if (l.status === "draft" || l.status === "awaiting_signature" || l.status === "cancelled") continue;
    if (l.end_date < historyStart) continue; // 아주 오래된 계약은 청구 기록 없이 둔다
    const signed = (l.signed_at ?? l.created_at).slice(0, 10);
    if (!l.renewal_of) {
      addCharge(l, "contract_fee", "계약금", l.contract_fee, signed, null, null);
      addCharge(l, "deposit", "보증금 잔금", l.deposit + l.mgmt_deposit - l.contract_fee, plusDays(l.start_date, -1) > signed ? plusDays(l.start_date, -1) : signed, null, null);
    }
    let k = 0;
    for (;;) {
      const pFrom = plusMonths(l.start_date, k);
      if (pFrom > l.end_date) break;
      if (ym(pFrom) > thisM) break;
      const pTo = plusDays(plusMonths(l.start_date, k + 1), -1);
      addCharge(l, "rent", `${Number(pFrom.slice(5, 7))}월 월세`, l.rent, pFrom, pFrom, pTo);
      addCharge(l, "mgmt", `${Number(pFrom.slice(5, 7))}월 관리비`, l.mgmt_fee, pFrom, pFrom, pTo);
      if (k > 0 && daysBetween(pFrom, today) < 100 && daysBetween(pFrom, today) >= 0)
        addCharge(l, "usage", "전기·가스 사용료", int(12, 48) * 1000, pFrom, plusMonths(pFrom, -1), plusDays(pFrom, -1));
      k++;
    }
    if ((l.status === "closing" || l.status === "closed") && !renewedIds.has(l.id) && daysBetween(l.end_date, today) >= 0)
      addCharge(l, "cleaning", "퇴실청소비", l.cleaning_fee, l.end_date, null, null);
  }

  // 납부자·납기일별로 묶어서 입금. 최근 달은 일부 미납.
  const groups = new Map<string, Charge[]>();
  for (const c of charges) {
    if (c.status !== "sent" || c.due_date > today) continue;
    if (c.kind === "cleaning") continue; // 퇴실 정산에서 보증금으로 차감
    const key = `${c.payer_id}|${c.due_date}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const lateBias = new Set(leases.filter((l) => l.status === "occupied" && chance(0.08)).map((l) => l.payer_id));
  for (const [key, cs] of groups) {
    const [payerId, due] = key.split("|");
    const age = daysBetween(due, today);
    const late = lateBias.has(payerId);
    if (late && age < 75) continue; // 연체
    if (!late && age < 4 && chance(0.6)) continue; // 납기 직후라 아직
    if (age < 60 && chance(0.008)) continue;
    const total = cs.reduce((s, c) => s + c.amount, 0);
    const partial = age < 60 && chance(0.012);
    const paidAmt = partial ? Math.round(total * 0.6 / 1000) * 1000 : total;
    const payer = parties.find((x) => x.id === payerId)!;
    const rcv = plusDays(due, Math.min(int(-3, 6), age));
    const pay: Payment = {
      id: id("pay"),
      branch_id: cs[0].branch_id,
      payer_id: payerId,
      depositor_name: payer.kind === "corporation" ? payer.name.replace(/\(주\)|주식회사|\(|\)/g, "").trim() : payer.name,
      amount: paidAmt,
      received_at: iso(rcv, int(8, 22)),
      account: branches.find((b) => b.id === cs[0].branch_id)!.bank_account,
      method: "bank",
      status: "matched",
      memo: "",
    };
    payments.push(pay);
    let left = paidAmt;
    for (const c of cs) {
      if (left <= 0) break;
      const a = Math.min(left, c.amount);
      allocations.push({ id: id("al"), payment_id: pay.id, charge_id: c.id, amount: a, at: pay.received_at });
      left -= a;
    }
  }
  // 안 맞춘 입금(입금자명이 달라 자동으로 못 맞춘 것)
  const oddNames = ["김*수", "ANNA K", "한빛소프트인사", "박서윤(엄마)", "SATO Y", "이체 3월분"];
  for (let i = 0; i < 6; i++) {
    const b = branches[i % 3];
    payments.push({
      id: id("pay"),
      branch_id: b.id,
      payer_id: null,
      depositor_name: oddNames[i],
      amount: pick([700000, 800000, 970000, 450000, 1020000, 310000]),
      received_at: iso(plusDays(today, -int(0, 9)), int(8, 22)),
      account: b.bank_account,
      method: "bank",
      status: "unmatched",
      memo: "",
    });
  }

  // ── 정산 ────────────────────────────────────────────────
  const settlements: Settlement[] = [];
  for (const l of leases.filter((x) => x.status === "closed" && !renewedIds.has(x.id))) {
    // 재계약 사슬이면 처음 계약에서 받은 보증금을 이어서 돌려준다
    let root = l;
    while (root.renewal_of) root = leases.find((x) => x.id === root.renewal_of) ?? root;
    const deposit = root.deposit + root.mgmt_deposit;
    const deds = [{ label: "퇴실청소비", amount: l.cleaning_fee }];
    // 청소비 청구는 보증금에서 차감해 다 받은 것으로 맞춘다
    const clean = charges.find((c) => c.lease_id === l.id && c.kind === "cleaning");
    if (clean) {
      const pay: Payment = {
        id: id("pay"),
        branch_id: l.branch_id,
        payer_id: l.payer_id,
        depositor_name: "보증금 차감",
        amount: clean.amount,
        received_at: l.closed_at ?? iso(l.end_date),
        account: "",
        method: "direct",
        status: "matched",
        memo: "퇴실 정산 · 보증금에서 차감",
      };
      payments.push(pay);
      allocations.push({ id: id("al"), payment_id: pay.id, charge_id: clean.id, amount: clean.amount, at: pay.received_at });
    }
    if (chance(0.15)) deds.push({ label: "원상복구(벽지 오염)", amount: pick([50000, 80000, 120000]) });
    const ded = deds.reduce((s, d) => s + d.amount, 0);
    settlements.push({
      id: id("st"),
      lease_id: l.id,
      status: "refunded",
      deposit_total: deposit,
      unpaid: 0,
      deductions: deds,
      refund_amount: deposit - ded,
      refund_account: parties.find((p) => p.id === l.contractor_id)?.bank_account ?? "",
      confirmed_at: l.closed_at,
      refunded_at: l.closed_at,
    });
  }

  // ── 일정 블록 ───────────────────────────────────────────
  const blocks: UnitBlock[] = [
    { id: id("bk"), unit_id: units[5].id, kind: "suspend", from: plusDays(today, -20), until: plusDays(today, 12), reason: "욕실 누수 수리", inquiry_id: null, hold_expires_at: null, created_at: iso(plusDays(today, -21)) },
  ];
  const openInq = inquiries.filter((q) => q.kind === "inquiry" && (q.stage === "tour" || q.stage === "drafting"));
  const occupiedUnitIds = new Set(leases.filter((l) => l.start_date <= today && l.end_date >= today && l.status !== "cancelled").map((l) => l.unit_id));
  const freeUnits = units.filter((u) => !occupiedUnitIds.has(u.id) && u.sale_status === "on_sale");
  openInq.slice(0, 3).forEach((q, i) => {
    const u = freeUnits.find((x) => x.branch_id === q.branch_id) ?? freeUnits[i];
    if (!u) return;
    blocks.push({ id: id("bk"), unit_id: u.id, kind: "hold", from: today, until: plusDays(today, 2), reason: "투어 후 결정 대기", inquiry_id: q.id, hold_expires_at: iso(plusDays(today, 1 + i), 18, 0), created_at: iso(today, 10) });
  });

  // ── Q&A · 운영정책 · 응대 자료 ───────────────────────────────
  const recentLeases = leases.filter((l) => l.status === "occupied" || l.status === "closing");
  const unitCode = (uid: string) => units.find((u) => u.id === uid)?.code ?? null;
  const qaDefs: Array<[string, string, string | null, QaItem["state"], boolean]> = [
    ["청구", "중도 입주한 달 관리비를 일할로 청구하나요, 한 달 치를 받나요?", "일할 계산합니다. 사용일수 ÷ 그 달 일수.", "confirmed", false],
    ["청구", "법인 대납 계약은 부가세 별도 청구서를 따로 발행하나요?", "네, 법인은 공급가 + 부가세로 따로 보냅니다.", "confirmed", false],
    ["수납", "입주자 부모님 명의로 입금된 돈은 어떻게 맞추나요?", null, "open", true],
    ["계약", "1개월 단기 계약의 선납임대료는 보증금에서 빼나요?", "선납임대료는 첫 달 월세로 채웁니다.", "answered", false],
    ["청구", "전기 사용료를 다음 달 월세와 같이 보내도 되나요?", null, "open", true],
    ["운영", "재계약 시 보증금을 다시 받나요?", "기존 보증금을 이어서 씁니다. 차액만 청구.", "confirmed", false],
    ["수납", "과납된 금액은 다음 달 청구에서 자동으로 빼나요?", null, "open", false],
    ["계약", "퇴실 2주 전 통보 안 하면 위약금이 있나요?", "운영정책 LEASE-004 기준 1주 치 월세.", "answered", false],
    ["청구", "외국인 입주자에게 영문 청구서를 보낼 수 있나요?", null, "open", false],
    ["운영", "청소비는 룸타입별로 다르게 받나요?", "25㎡ 넘는 방은 12만원, 나머지 8만원.", "confirmed", false],
  ];
  const qa: QaItem[] = qaDefs.map(([topic, q, a, state, blocksInv], i) => {
    const l = recentLeases[i * 7 % recentLeases.length];
    const created = plusDays(today, -int(1, 40));
    return {
      id: id("qa"),
      branch_id: l.branch_id,
      lease_id: i % 3 === 2 ? null : l.id,
      unit_code: i % 3 === 2 ? null : unitCode(l.unit_id),
      topic,
      question: q,
      answer: a,
      state,
      created_at: iso(created),
      answered_at: a ? iso(plusDays(created, int(0, 3))) : null,
      blocks_invoice: blocksInv,
    };
  });

  const pol = (code: string, scope: Policy["scope"], branch_id: string | null, category: string, title: string, body: string, basis: string, state: Policy["state"] = "confirmed", version = 1): Policy => ({
    id: id("po"), code, scope, branch_id, category, title, body, basis, state, version, updated_at: iso(plusDays(today, -int(3, 120))),
  });
  const policies: Policy[] = [
    pol("LEASE-001", "공통", null, "계약", "계약 기간과 갱신", "최소 계약 기간은 1개월, 기본은 6·12개월. 만료 30일 전까지 연장 의사를 확인한다.", "주택임대차보호법 · 내부 운영 기준"),
    pol("LEASE-002", "공통", null, "계약", "보증금과 계약금", "계약금 30만원은 서명 직후, 보증금 잔금은 입주 전날까지 받는다. 1개월 계약은 보증금 50만원.", "표준 계약서 제4조", "confirmed", 2),
    pol("LEASE-004", "공통", null, "계약", "중도 퇴실", "퇴실 2주 전 통보가 없으면 1주 치 월세를 위약금으로 받는다.", "표준 계약서 제11조"),
    pol("BILL-001", "공통", null, "청구", "청구 주기", "월세·관리비는 입주일 기준 매월 같은 날 선불로 청구하고, 납기 5일 전에 청구서를 보낸다.", "운영 회의 2026-03"),
    pol("BILL-002", "공통", null, "청구", "일할 계산", "중도 입주·퇴실 달은 사용일수 ÷ 그 달 일수로 나눠 청구한다.", "Q&A 확정 답변"),
    pol("BILL-003", "공통", null, "청구", "법인 부가세", "법인 대납 계약은 공급가 + 부가세 10%로 청구하고 세금계산서를 발행한다.", "부가가치세법 제32조"),
    pol("PAY-001", "공통", null, "수납", "입금 맞추기", "입금자명이 계약자·납부자와 다르면 '안 맞춘 입금'에 두고 담당자가 직접 맞춘다.", "내부 운영 기준"),
    pol("PAY-002", "공통", null, "수납", "연체 안내", "납기 3일 뒤 1차 안내, 10일 뒤 2차 안내, 30일 넘으면 보증금 차감을 검토한다.", "운영 회의 2026-05", "draft", 1),
    pol("SETTLE-001", "공통", null, "정산", "보증금 반환", "퇴실 점검 뒤 7일 안에 미납·청소비·원상복구비를 빼고 반환한다.", "표준 계약서 제12조"),
    pol("SC-001", "지점", "b_sc", "운영", "신촌 · 공용 주방", "공용 주방은 23시까지 사용한다. 2주에 한 번 냉장고를 비운다.", "지점 운영 회의"),
    pol("SS-001", "지점", "b_ss", "운영", "성수 · 반려동물", "5층 일부 호실만 소형 반려동물 동반 가능. 추가 청소비 5만원.", "지점 운영 회의", "draft", 1),
    pol("PG-001", "지점", "b_pg", "청구", "판교 · 법인 장기 할인", "제휴 법인 12개월 계약은 월세 5% 할인.", "법인 제휴 계약"),
  ];
  const templates: ReplyTemplate[] = [
    { id: id("tp"), branch_id: null, title: "첫 답장 · 빈 방 안내", shortcut: "빈방", body: "안녕하세요 {지점명}입니다. 문의 주셔서 감사합니다.\n희망하신 {입주일}부터 입주 가능한 방은 아래와 같습니다.\n투어는 평일 10~19시에 가능하니 편한 시간을 알려주세요.", updated_at: iso(plusDays(today, -30)) },
    { id: id("tp"), branch_id: null, title: "투어 확정", shortcut: "투어", body: "{이름}님, {투어일시} 투어가 확정되었습니다. 지점 주소는 {지점 주소}입니다.", updated_at: iso(plusDays(today, -12)) },
    { id: id("tp"), branch_id: null, title: "계약서 서명 요청", shortcut: "서명", body: "전자계약서를 보내드렸습니다. 메일의 링크에서 서명해 주시면 계약금 안내를 드리겠습니다.", updated_at: iso(plusDays(today, -50)) },
    { id: id("tp"), branch_id: null, title: "입주 안내", shortcut: "입주", body: "입주일 14시부터 체크인 가능합니다. 현관 비밀번호는 입주 당일 오전에 문자로 보내드립니다.", updated_at: iso(plusDays(today, -8)) },
    { id: id("tp"), branch_id: null, title: "연체 1차 안내", shortcut: "연체", body: "{이름}님, {청구월} 청구 금액 {금액}이 아직 확인되지 않았습니다. 확인 부탁드립니다.", updated_at: iso(plusDays(today, -3)) },
    { id: id("tp"), branch_id: "b_sc", title: "신촌 · 주차 안내", shortcut: "주차", body: "신촌점은 건물 주차장이 없어 인근 공영주차장(연세로 공영)을 안내드립니다.", updated_at: iso(plusDays(today, -90)) },
    { id: id("tp"), branch_id: null, title: "English · Room availability", shortcut: "en", body: "Hello, thank you for reaching out to {지점 영문}. Here are the rooms available from your move-in date.", updated_at: iso(plusDays(today, -40)) },
  ];
  const files: PreparedFile[] = [
    { id: id("f"), branch_id: null, name: "MR.K_입주안내서_2026.pdf", size: 2_480_000, kind: "pdf", updated_at: iso(plusDays(today, -20)) },
    { id: id("f"), branch_id: null, name: "MR.K_House_Guide_EN.pdf", size: 2_120_000, kind: "pdf", updated_at: iso(plusDays(today, -20)) },
    { id: id("f"), branch_id: null, name: "표준임대차계약서_샘플.pdf", size: 640_000, kind: "pdf", updated_at: iso(plusDays(today, -60)) },
    { id: id("f"), branch_id: "b_sc", name: "신촌_룸타입별_사진.zip", size: 18_400_000, kind: "image", updated_at: iso(plusDays(today, -45)) },
    { id: id("f"), branch_id: "b_ss", name: "성수_층별_평면도.pdf", size: 1_200_000, kind: "pdf", updated_at: iso(plusDays(today, -15)) },
    { id: id("f"), branch_id: "b_pg", name: "판교_법인제휴_요금표.docx", size: 84_000, kind: "doc", updated_at: iso(plusDays(today, -5)) },
  ];
  const signatures: Signature[] = [
    { id: id("sg"), branch_id: null, body_ko: "{보내는 직원} 드림\n{지점명} | {지점 주소}\n{지점 받는 메일 주소}", body_en: "Best regards,\n{보내는 직원}\n{지점 영문} | {지점 영문 주소}" },
    { id: id("sg"), branch_id: "b_sc", body_ko: "{보내는 직원} 드림\nMR.K 신촌 — 연세대 정문 도보 5분\n{지점 받는 메일 주소}", body_en: null },
  ];

  const memos: Memo[] = [
    { id: id("mm"), target_kind: "lease", target_id: recentLeases[0].id, body: "입주자 요청으로 매트리스 교체(10/02). 비용은 지점 부담.", author: "김하늘", at: iso(plusDays(today, -19)) },
    { id: id("mm"), target_kind: "unit", target_id: units[5].id, body: "욕실 배관 누수 — 업체 2차 방문 예정.", author: "최민준", at: iso(plusDays(today, -6)) },
  ];

  return {
    version: DB_VERSION,
    seeded_on: today,
    me: { id: "s_ko", name: "고상철", email: "owner@mrk-living.example.com", role: "owner", permissions: ["integrity_read", "billing_write", "policy_write"] },
    staff,
    branches,
    buildings,
    unit_types: unitTypes,
    units,
    blocks,
    parties,
    inquiries,
    leases,
    charges,
    payments,
    allocations,
    settlements,
    qa,
    policies,
    templates,
    files,
    signatures,
    memos,
    history,
    readiness_confirms: [],
  };
}
