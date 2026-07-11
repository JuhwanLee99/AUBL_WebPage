import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

const SECTIONS = [
  {
    title: '1. 개인정보의 수집 항목 및 수집 방법',
    items: [
      '회원가입 시 수집 항목: 이메일 주소, 이름(소셜 로그인 시 제공되는 경우), 계정 고유 식별자(UID)',
      '서비스 이용 과정에서 자동 수집: 기기 식별 정보, 앱 버전, OS 종류 및 버전, FCM 푸시 토큰',
      '커뮤니티(건의/문의) 이용 시 수집 항목: 게시글/댓글 내용, 작성 시각, 작성자 식별 정보(UID, 표시명)',
      '신고/차단 기능 이용 시 수집 항목: 신고 사유 및 상세 설명, 신고자/대상자 식별 정보(UID, 표시명), 대상 콘텐츠 식별 정보(도메인/콘텐츠 ID/미리보기), 처리 상태 및 검토 이력(처리 시각·처리자·처리 메모)',
      '올스타·루키 투표 참여 시 처리 항목: Firebase 인증에서 확인한 Google 계정 식별값을 HMAC 처리한 가명 중복 방지 키, 이벤트·부문·후보 버전, 선택 후보, 제출 시각 및 적용된 투표 주기(계정당 1회 또는 1일 1회)',
      '수집 방법: 이메일·비밀번호 회원가입 또는 Google/Apple 소셜 로그인을 통한 수집, Firebase Authentication 및 Firestore 서비스 이용 과정에서의 자동 생성·수집',
    ],
  },
  {
    title: '2. 개인정보의 수집 및 이용 목적',
    items: [
      '회원 식별 및 가입 의사 확인',
      '리그 경기 일정·결과·기록 조회 서비스 제공',
      '커뮤니티 게시글 작성·관리',
      '건의/문의 접수, 답변, 처리 상태 안내',
      '부적절 콘텐츠 신고 접수, 악성 사용자 차단 처리, 신고 건 운영 검토(원칙적 24시간 내) 및 위반 콘텐츠/계정 조치',
      '팀 공지사항 및 경기 알림(푸시 알림) 발송',
      '올스타·루키 투표 참여 자격 확인, 계정별 중복 투표 방지, 결과 집계 및 이의 처리',
      '서비스 운영·유지·개선 및 오류 대응',
    ],
  },
  {
    title: '3. 개인정보의 보유 및 이용 기간',
    items: [
      '회원 정보는 회원 탈퇴 시까지 보유하며, 탈퇴 요청 시 지체 없이 파기합니다. 다만 아래의 투표 기록과 법령상 보존 대상은 각 보유 기준을 따릅니다.',
      '다만, 관련 법령에 의해 보존 의무가 있는 경우 해당 기간 동안 보관합니다.',
      '신고/차단 및 운영 처리 기록은 서비스 운영 정책 준수 확인, 분쟁 대응, 재발 방지 목적 범위에서 필요한 기간 동안 보관될 수 있습니다.',
      '투표 중복 방지 키와 선택 내역은 해당 투표 결과 확정 및 이의 처리에 필요한 기간 동안 보관하며, 목적 달성 후 삭제하거나 개인을 식별할 수 없는 집계 정보만 남깁니다.',
      '전자상거래법에 의한 계약·거래 기록: 5년 (해당 시)',
      '통신비밀보호법에 의한 로그 기록: 3개월',
    ],
  },
  {
    title: '4. 개인정보의 제3자 제공',
    items: [
      '원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.',
      '다만, 이용자의 동의가 있는 경우 또는 법령에 의해 요구되는 경우에 한해 제공합니다.',
    ],
  },
  {
    title: '5. 개인정보의 처리 위탁',
    items: [
      'Firebase (Google LLC): 인증, 데이터 저장, 푸시 알림 서비스 운영',
      'Google Cloud Platform: 클라우드 함수 실행 및 데이터 처리',
      'Cloudflare, Inc.: API 보안 및 전송 최적화(리버스 프록시, CDN, WAF, DDoS 방어)',
      'AUBL 운영 MariaDB 서버: 종료 경기 및 과거 시즌 기록 데이터 저장·조회 API 운영',
      '위탁 업체는 위탁 목적 범위 내에서만 개인정보를 처리하며, 계약 종료 시 파기합니다.',
    ],
  },
  {
    title: '6. 이용자의 권리와 행사 방법',
    items: [
      '이용자는 언제든지 자신의 개인정보를 조회·수정·삭제할 수 있습니다.',
      '회원 탈퇴를 원하는 경우 앱 내 "더보기 → 계정 → 회원 탈퇴"에서 직접 처리하거나, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)를 통해 요청할 수 있습니다.',
      '개인정보 열람·정정·삭제·처리정지 요구 시 지체 없이 조치합니다.',
    ],
  },
  {
    title: '7. 개인정보의 파기 절차 및 방법',
    items: [
      '보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기합니다.',
      '전자적 파일: 복구 불가능한 방법으로 영구 삭제',
      '서면 자료: 분쇄기로 분쇄 또는 소각',
    ],
  },
  {
    title: '8. 개인정보 보호를 위한 기술적·관리적 대책',
    items: [
      '전송 데이터 암호화(HTTPS/TLS)',
      'Firebase Security Rules를 통한 접근 제어',
      '인증된 Cloud Functions 트랜잭션을 통한 투표 유효성·중복 검증 및 원본 UID·Google 계정 식별값 비저장',
      '관리자 계정 분리 및 최소 권한 원칙 적용',
      '정기적인 보안 점검',
    ],
  },
  {
    title: '9. 개인정보 보호책임자',
    items: [
      '책임자: 이주환 (AUBL 기록팀장)',
      '이메일: aublcau@gmail.com',
      '개인정보 관련 문의사항은 위 연락처로 문의해 주시기 바랍니다.',
    ],
  },
  {
    title: '10. 개인정보 처리방침의 변경',
    items: [
      '본 방침은 시행일로부터 적용되며, 변경 시 앱 내 공지 또는 웹사이트를 통해 사전 고지합니다.',
      '시행일: 2026년 7월 11일',
    ],
  },
];

export default function PrivacyPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.privacy-chunk');
      if (blocks) {
        gsap.fromTo(
          blocks,
          { y: 20, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power2.out' },
        );
      }
    });
    return () => ctx.revert();
  }, []);

  return (
    <div style={{ display: 'grid', gap: '24px', maxWidth: '800px', margin: '0 auto' }} ref={pageRef}>
      {/* 헤더 */}
      <section
        className="privacy-chunk"
        style={{
          display: 'grid',
          gap: '12px',
          padding: 'clamp(20px, 5vw, 32px)',
          borderRadius: '16px',
          background: 'linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              fontWeight: 800,
              fontSize: '11px',
              letterSpacing: '0.05em',
              background: 'rgba(96,165,250,0.16)',
              color: '#bfdbfe',
              border: '1px solid rgba(96,165,250,0.35)',
            }}
          >
            PRIVACY POLICY
          </span>
        </div>
        <h1
          style={{
            fontSize: 'clamp(22px, 4vw, 30px)',
            fontWeight: 900,
            color: '#f1f5f9',
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          개인정보 처리방침
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>
          전국대학아마추어야구연합회(AUBL)는 이용자의 개인정보를 중요시하며, 「개인정보 보호법」을 준수합니다.
          본 방침은 AUBL이 제공하는 모바일 앱 및 웹 서비스에 적용됩니다.
        </p>
      </section>

      {/* 본문 섹션 */}
      {SECTIONS.map((section) => (
        <section
          key={section.title}
          className="privacy-chunk"
          style={{
            padding: 'clamp(16px, 4vw, 24px)',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 800,
              color: '#e2e8f0',
              margin: '0 0 12px 0',
            }}
          >
            {section.title}
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: '20px',
              display: 'grid',
              gap: '8px',
            }}
          >
            {section.items.map((item, i) => (
              <li
                key={i}
                style={{
                  fontSize: '14px',
                  color: '#94a3b8',
                  lineHeight: 1.7,
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* 하단 네비게이션 */}
      <div
        className="privacy-chunk"
        style={{ display: 'flex', gap: '12px', justifyContent: 'center', padding: '12px 0 24px' }}
      >
        <Link
          to="/account-deletion"
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            background: 'rgba(148,163,184,0.12)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          계정 삭제 안내
        </Link>
        <Link
          to="/terms"
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            background: 'rgba(148,163,184,0.12)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: '#94a3b8',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          이용약관
        </Link>
        <Link
          to="/"
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.35)',
            color: '#93c5fd',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
