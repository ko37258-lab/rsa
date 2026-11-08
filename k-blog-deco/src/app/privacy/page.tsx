import type { Metadata } from "next";
import { LegalLayout, Section } from "@/components/legal-layout";
import { OPERATOR, TERMS_EFFECTIVE } from "@/lib/legal";

export const metadata: Metadata = { title: "개인정보처리방침 — MR.K-홈형 블로그 만들기" };

const th = "bg-paper-2 px-3 py-2 text-left text-[12px] font-semibold text-ink-3";
const td = "px-3 py-2 align-top text-[13px] text-ink-2";

export default function PrivacyPage() {
  const o = OPERATOR;
  return (
    <LegalLayout title="개인정보처리방침" effective={TERMS_EFFECTIVE}>
      <p>
        {o.name}(이하 &quot;회사&quot;)은 &quot;{o.service}&quot; 서비스(이하 &quot;서비스&quot;)를 제공하면서 「개인정보 보호법」 등 관련 법령을 지키고, 이용자의 개인정보를
        아래와 같이 처리합니다.
      </p>

      <Section n={1} title="수집하는 개인정보와 수집 방법">
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>구분</th>
                <th className={th}>항목</th>
                <th className={th}>수집 시점</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className={td}>회원 정보</td>
                <td className={td}>네이버 회원 식별자, 별명, 프로필 사진, 이메일(네이버에서 제공에 동의한 경우)</td>
                <td className={td}>네이버 로그인 시 네이버로부터 전달</td>
              </tr>
              <tr>
                <td className={td}>서비스 이용 정보</td>
                <td className={td}>이용자가 입력한 블로그 이름·소개·업종·연락처·주소·SNS 주소, 올린 사진과 참고 이미지(영상에서 뽑은 장면 포함), 참고 웹사이트 주소, 만든 디자인과 수정 기록</td>
                <td className={td}>이용자가 서비스 화면에서 직접 입력·업로드</td>
              </tr>
              <tr>
                <td className={td}>자동 수집 정보</td>
                <td className={td}>접속 일시, 요청 기록, AI 생성·수정 호출 기록(횟수·사용량·소요 시간), 브라우저 정보</td>
                <td className={td}>서비스 이용 중 자동 생성</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">네이버 계정의 비밀번호와 네이버 접근 토큰은 저장하지 않습니다. 로그인 유지를 위해 서명된 세션 쿠키 1개(kbd_session, 30일)만 사용합니다.</p>
      </Section>

      <Section n={2} title="개인정보의 이용 목적">
        <ul>
          <li>회원 식별과 로그인, 계정 관리</li>
          <li>AI 디자인 생성·수정, 만든 디자인과 이미지의 보관·표시·내보내기</li>
          <li>내보낸 버튼 위젯 이미지를 네이버 블로그에서 불러올 수 있도록 공개 주소로 제공</li>
          <li>이용 한도 관리, 장애 대응, 부정 이용 방지</li>
          <li>서비스 개선과 통계 (개인을 식별할 수 없는 형태)</li>
        </ul>
      </Section>

      <Section n={3} title="개인정보의 처리 위탁과 국외 이전" id="transfer">
        <p>서비스 운영을 위해 아래 업체에 처리를 맡기며, 이 중 일부는 국외에서 처리됩니다.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>수탁자</th>
                <th className={th}>맡기는 일</th>
                <th className={th}>이전되는 정보</th>
                <th className={th}>국가·시점·방법</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr>
                <td className={td}>Anthropic, PBC</td>
                <td className={td}>AI 디자인 생성·수정</td>
                <td className={td}>이용자가 입력한 블로그 정보와 요청 문장, 참고 이미지, 사진, 현재 디자인</td>
                <td className={td}>미국 · 생성·수정 요청 시 암호화 통신으로 전송 · Anthropic 은 API 입력을 모델 학습에 쓰지 않으며 운영 목적 보관 후 삭제</td>
              </tr>
              <tr>
                <td className={td}>Supabase, Inc.</td>
                <td className={td}>데이터베이스·이미지 파일 저장</td>
                <td className={td}>회원 정보, 서비스 이용 정보 전체</td>
                <td className={td}>대한민국(서울 리전) 서버에 저장 · 서비스 이용 기간 동안</td>
              </tr>
              <tr>
                <td className={td}>Vercel, Inc.</td>
                <td className={td}>웹사이트 호스팅·네트워크 전송</td>
                <td className={td}>접속 기록, 요청 처리 중 거치는 모든 정보</td>
                <td className={td}>미국 등 · 접속 시 암호화 통신으로 전송 · 서버 로그는 단기 보관</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">이용자는 국외 이전을 거부할 수 있으나, 이 경우 AI 생성 등 서비스 이용이 제한됩니다. 거부는 아래 문의처로 알려 주시면 됩니다.</p>
      </Section>

      <Section n={4} title="공개되는 정보">
        <p>
          &quot;내보내기&quot;에서 &quot;위젯 이미지 주소 만들기&quot;를 누르면 버튼 위젯 이미지가 추측하기 어려운 공개 주소({o.site}/files/…)에 올라갑니다. 이 주소는 네이버 블로그에
          붙여넣는 코드에 들어가며, 블로그 방문자 누구나 그 이미지를 볼 수 있습니다. 디자인에 넣은 사진·문구가 공개되어도 되는지 내보내기 전에 확인해 주세요. 공개를 그만두려면 해당 이미지를 삭제하거나
          탈퇴하면 됩니다.
        </p>
      </Section>

      <Section n={5} title="보유 기간과 파기">
        <ul>
          <li>회원 정보와 서비스 이용 정보: 회원 탈퇴 시 지체 없이 삭제합니다. 삭제된 디자인·이미지는 복구할 수 없습니다.</li>
          <li>AI 호출 기록(횟수·사용량): 탈퇴 시 함께 삭제합니다.</li>
          <li>관련 법령에 따라 보관해야 하는 기록(예: 유료 서비스 도입 후 거래 기록)은 해당 법령이 정한 기간 동안 분리 보관합니다.</li>
        </ul>
      </Section>

      <Section n={6} title="이용자의 권리와 행사 방법">
        <ul>
          <li>이용자는 언제든지 자신의 개인정보를 열람·정정하거나, 삭제·처리 정지를 요구할 수 있습니다.</li>
          <li>입력한 블로그 정보와 디자인은 서비스 화면에서 직접 수정·삭제할 수 있고, 계정 전체 삭제(탈퇴)는 &quot;계정&quot; 화면에서 할 수 있습니다.</li>
          <li>그 밖의 요청은 아래 문의처로 보내 주시면 10일 이내에 처리 결과를 알려 드립니다.</li>
        </ul>
      </Section>

      <Section n={7} title="안전성 확보 조치">
        <ul>
          <li>모든 통신은 HTTPS 로 암호화하며, 이미지 저장소는 외부에서 직접 접근할 수 없는 비공개 설정으로 운영합니다.</li>
          <li>API 토큰은 원문을 저장하지 않고 해시만 저장합니다. 모든 데이터는 소유자 본인만 접근할 수 있도록 서버에서 확인합니다.</li>
          <li>접근 권한을 최소한의 인원에게만 부여하고, 접속 기록을 보관합니다.</li>
        </ul>
      </Section>

      <Section n={8} title="개인정보 보호책임자와 문의처">
        <p>
          개인정보 보호책임자: {o.privacyOfficer} · 이메일: <a href={`mailto:${o.email}`}>{o.email}</a>
          <br />
          운영자: {o.name} · 사업자등록번호: {o.bizNo} · 주소: {o.address}
        </p>
        <p className="mt-3">
          개인정보 침해에 대한 신고나 상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118), 개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)에서도 받을 수 있습니다.
        </p>
      </Section>

      <Section n={9} title="방침의 변경">
        <p>이 방침을 바꿀 때는 시행 7일 전부터 서비스 화면에 알립니다. 수집 항목이나 이용 목적이 중요하게 바뀌면 다시 동의를 받습니다.</p>
      </Section>
      <p className="mt-8 text-sm text-ink-3">이 방침은 {TERMS_EFFECTIVE}부터 시행합니다.</p>
    </LegalLayout>
  );
}
