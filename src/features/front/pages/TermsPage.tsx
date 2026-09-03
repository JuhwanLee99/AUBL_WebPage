import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

const SECTIONS = [
  {
    title: '제1조 (목적)',
    items: [
      '본 약관은 전국대학아마추어야구연합회(이하 "AUBL")가 제공하는 모바일 앱 및 웹 서비스(이하 "서비스")의 이용 조건과 절차, 회원과 AUBL의 권리·의무를 규정함을 목적으로 합니다.',
    ],
  },
  {
    title: '제2조 (정의)',
    items: [
      '"서비스"란 AUBL이 운영하는 모바일 앱(iOS/Android) 및 웹사이트를 통해 제공하는 경기 일정·결과 조회, 실시간 문자중계, 기록 열람, 커뮤니티, 푸시 알림 등 일체의 서비스를 말합니다.',
      '"회원"이란 본 약관에 동의하고 이메일·비밀번호 또는 Google/Apple 계정을 통해 가입한 이용자를 말합니다.',
      '"비회원"이란 회원 가입 없이 서비스의 일부를 이용하는 자를 말합니다.',
    ],
  },
  {
    title: '제3조 (약관의 효력 및 변경)',
    items: [
      '본 약관은 서비스 내 게시하거나 기타 방법으로 회원에게 공지함으로써 효력이 발생합니다.',
      'AUBL은 합리적인 사유가 있는 경우 약관을 변경할 수 있으며, 변경 시 시행일 7일 전에 앱 내 공지 또는 웹사이트를 통해 사전 고지합니다.',
      '변경된 약관에 동의하지 않는 경우 회원 탈퇴를 할 수 있으며, 고지 후 7일 이내 탈퇴하지 않은 경우 동의한 것으로 간주합니다.',
    ],
  },
  {
    title: '제4조 (회원 가입 및 탈퇴)',
    items: [
      '회원 가입은 이메일·비밀번호 등록 또는 Google/Apple 계정을 통한 소셜 로그인으로 이루어지며, 가입 시 본 약관 및 개인정보 처리방침에 동의한 것으로 간주합니다.',
      '회원은 언제든지 앱 내 "더보기 → 계정 → 회원 탈퇴"에서 탈퇴를 요청할 수 있으며, 웹 계정 삭제 안내 페이지(https://aubl.club/account-deletion)에서도 삭제 절차를 확인할 수 있습니다. 탈퇴 시 회원 정보는 지체 없이 파기하되, 활성화된 투표에 참여한 경우 이의 처리 및 법령상 보존이 필요한 기록은 개인정보 처리방침의 기간을 따릅니다.',
      '탈퇴 후에도 커뮤니티에 작성한 게시글은 삭제되지 않을 수 있으며, 삭제를 원하는 경우 탈퇴 전에 직접 삭제하거나 별도 요청해야 합니다.',
    ],
  },
  {
    title: '제5조 (서비스의 제공 및 변경)',
    items: [
      'AUBL은 다음 서비스를 제공합니다: 경기 일정·결과 조회, 실시간 문자중계, 선수 기록 열람, 커뮤니티(공지·갤러리), 팀 관리, 푸시 알림.',
      'AUBL은 별도로 활성화하고 공지한 이벤트 기간에 올스타·루키 후보 공개 및 투표 기능을 제공할 수 있으며, 이 경우 공지된 참여 주기, 후보와 포지션별 선택 수, 투표 기간에 따라 운영합니다.',
      '종료 경기 및 과거 시즌 기록 데이터는 AUBL 백엔드 API(api.aubl.club)와 운영 MariaDB를 통해 제공될 수 있으며, API 전송 구간에 Cloudflare 인프라가 사용될 수 있습니다.',
      '서비스의 내용은 운영상·기술상 필요에 따라 변경될 수 있으며, 주요 변경 시 사전 공지합니다.',
      '서비스는 무료로 제공되며, 향후 유료 서비스 도입 시 별도 고지 후 동의를 받습니다.',
    ],
  },
  {
    title: '제6조 (서비스의 중단)',
    items: [
      '시스템 점검, 설비 교체, 통신 장애, 천재지변 등 불가피한 사유로 서비스가 일시 중단될 수 있습니다.',
      'AUBL은 비영리 대학생 단체로 운영되며, 운영 여건에 따라 서비스가 종료될 수 있습니다. 이 경우 30일 전 사전 고지합니다.',
    ],
  },
  {
    title: '제7조 (회원의 의무)',
    items: [
      '회원은 관련 법령, 본 약관, 서비스 이용 안내 등을 준수해야 합니다.',
      '다음 행위를 금지합니다: 타인의 개인정보 도용, 허위 정보 등록, 서비스 운영 방해, 욕설·비방·음란물 게시, 상업적 광고 게시, 서비스의 무단 크롤링·스크래핑.',
      '투표 기능이 활성화된 경우 여러 계정, 자동화 도구 또는 인증 우회 수단을 이용해 참여 제한을 회피하거나 결과를 인위적으로 조작해서는 안 됩니다.',
      '위반 시 AUBL은 사전 통지 없이 서비스 이용을 제한하거나 회원 자격을 박탈할 수 있습니다.',
    ],
  },
  {
    title: '제8조 (게시물의 관리)',
    items: [
      '회원이 작성한 게시물의 저작권은 해당 회원에게 귀속됩니다.',
      'AUBL은 다음에 해당하는 게시물을 사전 통지 없이 삭제하거나 비공개 처리할 수 있습니다: 관련 법령 위반, 타인의 권리 침해, 공공질서·미풍양속 위반, 서비스 운영 정책 위반.',
      'AUBL은 사용자 생성 콘텐츠(게시글·댓글)에 대해 신고 기능을 제공하며, 이용자는 부적절하거나 정책 위반 가능성이 있는 콘텐츠를 신고할 수 있습니다.',
      '이용자는 악성 사용자를 차단할 수 있으며, 차단 즉시 차단 대상의 게시글·댓글은 차단한 이용자의 피드 및 상세 화면에서 숨김 처리됩니다.',
      '신고 또는 차단이 수행되면 관련 정보는 운영자 신고 큐에 자동 접수되어 운영 검토 대상으로 처리됩니다.',
      'AUBL은 접수된 신고를 원칙적으로 24시간 이내 검토하며, 위반이 확인될 경우 게시물 삭제/비공개, 계정 이용 제한, 회원 자격 박탈 등 필요한 조치를 할 수 있습니다.',
      '경기 기록·통계 데이터는 AUBL에 귀속되며, 서비스 운영 목적으로 활용됩니다.',
    ],
  },
  {
    title: '제9조 (책임의 제한)',
    items: [
      'AUBL은 비영리 대학생 단체로서 서비스를 "있는 그대로(AS-IS)" 제공하며, 서비스의 완전성·정확성·신뢰성을 보증하지 않습니다.',
      '천재지변, 시스템 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.',
      'Cloudflare, 클라우드 사업자, 통신사, 외부 인프라 장애로 인한 지연·중단은 AUBL의 귀책 사유가 없는 한 책임이 제한될 수 있습니다.',
      '회원 간 또는 회원과 제3자 간의 분쟁에 대해 AUBL은 개입할 의무가 없습니다.',
    ],
  },
  {
    title: '제10조 (준거법 및 분쟁 해결)',
    items: [
      '본 약관은 대한민국 법률에 의하여 규율됩니다.',
      '서비스 이용과 관련하여 분쟁이 발생한 경우 양 당사자 간 원만한 합의를 위해 노력하며, 합의가 이루어지지 않는 경우 민사소송법상의 관할 법원에서 해결합니다.',
      '서비스 관련 문의: aublcau@gmail.com',
    ],
  },
  {
    title: '부칙',
    items: [
      '본 약관은 2026년 7월 11일부터 시행합니다.',
    ],
  },
];

export default function TermsPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.terms-chunk');
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
    <div className="season-content-page legal-page" style={{ display: 'grid', gap: '24px', maxWidth: '800px', margin: '0 auto' }} ref={pageRef}>
      {/* 헤더 */}
      <section
        className="terms-chunk"
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
            TERMS OF SERVICE
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
          이용약관
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>
          전국대학아마추어야구연합회(AUBL) 서비스 이용에 관한 약관입니다.
          서비스를 이용함으로써 본 약관에 동의한 것으로 간주됩니다.
        </p>
      </section>

      {/* 본문 섹션 */}
      {SECTIONS.map((section) => (
        <section
          key={section.title}
          className="terms-chunk"
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
        className="terms-chunk"
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
          to="/privacy"
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
          개인정보 처리방침
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
