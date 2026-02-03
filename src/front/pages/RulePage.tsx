import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

/* ─── 회칙 데이터 ─── */

type Article = { title: string; body: string[] };
type Chapter = { id: string; title: string; accent: string; articles: Article[] };

const CHAPTERS: Chapter[] = [
  {
    id: 'ch1',
    title: '제1장 총회',
    accent: '#60a5fa',
    articles: [
      { title: '제1조 (명칭)', body: ['본 회는 "전국 대학 아마추어 야구 연합회"라 한다.'] },
      { title: '제2조 (목적)', body: ['본 회는 회원 상호 친목과 상부상조를 도모하고, 학교체육 발전에 기여함을 목적으로 한다.'] },
      {
        title: '제3조 (사업)',
        body: [
          '본 회의 목적 달성을 위해 다음의 사업을 수행한다.',
          '1. 연합회 간 경기 주최',
          '2. 후원 사업',
          '3. 친목 사업',
          '4. 체육 발전 사업',
          '5. 기타 부대사업',
        ],
      },
      {
        title: '제4조 (소재지)',
        body: ['본 회의 사무소는 회장교에 설치하며, 필요에 따라 지부를 운영할 수 있다.'],
      },
    ],
  },
  {
    id: 'ch2',
    title: '제2장 회원',
    accent: '#a855f7',
    articles: [
      {
        title: '제5조 (회원자격)',
        body: [
          '본 회의 회원은 각 대학의 본부에 동아리로 등록된 야구회의 구성원으로 한다.',
          '• 휴학생 및 군 복무자도 참가 가능하나, 대학원생은 원칙적으로 불허한다.',
          '• 외국인학생은 정식 학부생 교환학생에 한해 참가 가능하다.',
          '• 해외 고등학교를 졸업한 내국인은 증빙서류 제출 시 일반선수로 등록 가능하다.',
          '• 신규 가입은 기존 회원 3분의 2 이상의 찬성이 필요하다.',
          '• 가입보증금은 500,000원이며, 1년간 무위반 시 반환한다.',
          '• 캠퍼스가 다른 경우 중복 명칭을 피하여 구분한다.',
        ],
      },
      {
        title: '제6조 (권리 및 의무)',
        body: [
          '회원은 의결권과 선거권을 갖는다.',
          '• 회칙을 준수하고, 연회비 50,000원을 납부해야 한다.',
          '• 신규 입회금은 50,000원이다.',
        ],
      },
    ],
  },
  {
    id: 'ch3',
    title: '제3장 기관 및 회의',
    accent: '#34d399',
    articles: [
      {
        title: '제7조 (기관)',
        body: ['본 회의 최고 의결 기관은 운영위원회로 하며, 각 학교 대표자 1명으로 구성한다.'],
      },
      {
        title: '제8조 (회의소집)',
        body: ['매년 3월 및 9월에 정기회의를 소집하며, 필요 시 임시회의를 소집할 수 있다.'],
      },
      {
        title: '제9조 (정족수)',
        body: ['회의 정족수는 전년도 리그 참가 팀수를 기준으로 한다.'],
      },
    ],
  },
  {
    id: 'ch4',
    title: '제4장 임원 및 부서',
    accent: '#f97316',
    articles: [
      {
        title: '제10조 (집행부서)',
        body: [
          '본 회의 집행 부서는 다음과 같다.',
          '1. 운영부',
          '2. 심판부',
          '3. 기록부',
          '4. 주무부',
          '5. 기타 필요 시 추가 운영',
        ],
      },
    ],
  },
  {
    id: 'ch5',
    title: '제5장 재정',
    accent: '#38bdf8',
    articles: [
      {
        title: '제11조 (재정)',
        body: ['본 회의 재정은 회비, 입회비, 사업수입, 찬조금 등으로 충당한다.'],
      },
      {
        title: '제12조 (회계연도)',
        body: ['회계연도는 회장교 인수인계 시부터 차년도 인수인계까지로 한다.'],
      },
      {
        title: '제13조 (감사)',
        body: [
          '연합회비 사용 시 영수증을 첨부해야 한다.',
          '• 2개교가 감사를 수행한다.',
          '• 부정 사용 시 2배수를 회수한다.',
        ],
      },
    ],
  },
  {
    id: 'ch7',
    title: '제7장 상벌',
    accent: '#ef4444',
    articles: [
      {
        title: '제15조 (상벌)',
        body: [
          '▸ 출전불가 사유별 규정',
          '• 통보 없이 공식 리그 미출전 시: 1년 출전정지',
          '• 재참가 시: 회원교 3분의 2 찬성 + 100,000원 범칙금',
          '• 불참 인정 사유: 학교 존립 문제, 동아리 존립 문제, 교내 대회, 지역 대회 등',
          '',
          '▸ 회비 연체',
          '• 예선경기 1개월 후까지 미완납 시 몰수게임 처리',
          '',
          '▸ 유니폼 위반',
          '• 유니폼이 통일되지 않은 팀은 출전 금지',
          '',
          '▸ 시합구',
          '• 3개 미지참 시 몰수, 1~2개 미지참 시 상대팀에 공 1개당 30,000원 배상',
          '',
          '▸ 대회 불참: 100,000원 벌과금',
          '',
          '▸ 예선 3게임 미참가: 당해 리그 불참 인정',
          '',
          '▸ 부정선수',
          '• 정의: 연합회 명단에 등록되지 않은 선수, 타인으로 출전, 고등학교선수 출신 미명시',
          '• 발각 시: 해당 게임 모두 몰수',
          '• 선수 개인: 8경기 출전정지, 당해 토너먼트 정지',
          '• 팀: 150,000원 벌과금, 다음 년도 1년 정지',
          '',
          '▸ 라인업 오류',
          '• 정의: 명단 등록 후 라인업지 미명시, 고등학교선수 3명 이상 기재, 출신 미명시',
          '• 라인업지 제출 후 적발 시: 즉시 몰수패 + 50,000원 벌금',
          '',
          '▸ 운동장 제공',
          '• 2경기: 3팀이 시합구 1개씩',
          '• 3경기: 5팀이 시합구 1개씩',
          '• 경기 없을 시: 1경기 시합구 6개, 2경기 배트 1타 보상',
          '',
          '▸ 당일 취소: 경기 3시간 전 통보 필수',
          '',
          '▸ 대표자회의 불참: 100,000원 벌과금',
          '',
          '▸ 리그 도중 탈퇴',
          '• 사유 불인정 시: 200,000원',
          '• 동조팀: 각 100,000원',
          '',
          '▸ 심판 오심: 30,000원 벌과금',
          '',
          '▸ 라인업 오류 사후 적발: 몰수패 + 50,000원',
        ],
      },
    ],
  },
  {
    id: 'ch9',
    title: '제9장 경기규칙',
    accent: '#facc15',
    articles: [
      {
        title: '제17조 (경기규칙)',
        body: ['본 회의 공식 경기는 다음 규칙에 따라 운영한다.'],
      },
      {
        title: '경기시간',
        body: [
          '• 3경기 시: 09시, 12시, 15시',
          '• 2경기 시: 10시 30분, 13시 30분',
          '• 한 경기의 시간 제한은 2시간 30분을 기준으로 한다.',
          '• 경기 종료 10분 전 새 이닝 불가',
        ],
      },
      {
        title: '게임 진행',
        body: [
          '• 조별 예선: 시간제한, 콜드게임 있는 7이닝',
          '• 예선 콜드: 4회 15점, 5회 10점, 6회 7점',
          '• 토너먼트 8강/4강: 예선 동일 규정 적용',
          '• 4강 이후: 시간제한 없음',
        ],
      },
      {
        title: '경기 불참 · 몰수',
        body: [
          '• 개시 20분 미참: 몰수게임',
          '• 무단 불참: 몰수게임 + 상대팀에 150,000원 벌과금',
          '• 몰수승 점수: +7, 몰수패 점수: -7',
          '• 기권패: 70,000원',
          '• 우천 시: 추후 경기로 배정',
        ],
      },
      {
        title: '시합구',
        body: [
          '• 골드볼파크의 공을 사용한다.',
          '• GBPCL 등급 이상',
          '• 경기 전 양팀 3개씩 제출',
        ],
      },
      {
        title: '고등학교선수 출신 (선출) 규정',
        body: [
          '• 한 경기 후보를 포함하여 라인업지에 최대 2명',
          '• 투수 및 포수 불가',
          '• 여자선수: 선출 여부와 무관하게 일반선수 자격 부여',
          '• 조별 예선 1/3 이상 참여 시 본선 출전 자격',
        ],
      },
      {
        title: '배트 규정',
        body: [
          '▸ 일반선수',
          '• 나무 및 알로이 배트만 사용 가능',
          '• 컴포짓, 카본, 코어, 투피스 배트 사용 불가',
          '• 5드롭 미만 규제 (여자 비선출 제외)',
          '• 부정 배트 적발 시: 타자 아웃, 주자 무효',
          '',
          '▸ 고등학교선수 출신',
          '• 나무 배트만 사용 가능',
          '• 위반 시: 즉시 퇴장 + 100,000원 벌과금',
          '• 나무 배트 2개 이상 지참 필수',
        ],
      },
      {
        title: '심판 · 기록원',
        body: [
          '• 순환식 운영',
          '• 경기 30분 전 도착',
          '• 2경기: 4심제 2기록원 (홈팀 — 주심·2루심·기록원 / 원정팀 — 1루심·3루심·기록원)',
          '• 3경기: 세부 규정별 배정',
          '• 1경기: 사회인 심판 또는 연합회원',
        ],
      },
      {
        title: '심판 자격',
        body: [
          '• 주심: 2학년 2학기부터 또는 2년 전 입학자',
          '• 루심: 2학년부터',
          '• 신규 학교: 3년 예외 기간 (주심 불가)',
          '• 심판 교체: 주심 1회, 루심 2회 (부상 시 추가 1회)',
        ],
      },
      {
        title: '게임원 등록',
        body: [
          '• 심판·기록원 정보: 경기 다음 주 수요일 정오까지 등록',
          '• 기록 등록: 경기 다음 주 수요일 정오까지',
          '• 미등록: 불가일 1일 차감',
          '• 기록 수정: 기록 업로드 다음 주 수요일 정오까지',
          '• 기록 실수: 70,000원 벌과금 (개인 지원 시 50,000원)',
        ],
      },
      {
        title: '불가일',
        body: [
          '• 각 팀마다 1년당 4회씩 부여',
          '• 사용 시: 사용일 1주일 전 금요일 낮 12시 이전 통보',
          '• 공휴일, 개강 1주 전, 기말고사 1주 후는 차감하지 않음',
        ],
      },
      {
        title: '동률 판정',
        body: [
          '▸ 2팀 동률: 승률 → 승자승 → 득실차 → 결정 경기',
          '▸ 3팀 동률: 승률 → 승자승 → 득실차 → 다득점 → 최소 실점 → 조 전체 득실차',
        ],
      },
      {
        title: '우천 콜드 · 일몰',
        body: [
          '• 1시간 30분 또는 4회 이후 4심 합의로 강우 콜드 선언',
          '• 기상청 일몰 시간 기준 서스펜디드 선언',
        ],
      },
      {
        title: '기타 규정',
        body: [
          '• 투수 보크: 1루 또는 3루에 송구 시늉만 하고 미송구 시 보크, 해당 베이스 쪽 직접 발을 내딛고 미송구 시 보크',
          '• 두부사구: 주심 1차 경고, 2차 교체 또는 포지션 변경',
          '• 토너먼트 홈팀: 조별 예선 순위와 성적, 동률 시 득실차, 재동률 시 파워랭킹',
          '• 외부 구장: 해당 구장 로컬룰이 AUBL 회칙보다 상위',
          '• 오타니룰: 선발투수 타순 진입 시 경기 중 지명타자로 공격 가능',
          '• 회칙 미규정 사항: KBO 규정집 적용',
        ],
      },
    ],
  },
  {
    id: 'ch10',
    title: '제10장 사안가결',
    accent: '#94a3b8',
    articles: [
      {
        title: '제18조 (사안가결)',
        body: ['징계 대상 학교 및 기권표는 투표에 포함하지 않는다.'],
      },
    ],
  },
];

const HOST_ORDER = [
  '서강대', '홍익대', '고려대', '연세대', '한양대(서울)', '서울과학기술대',
  '한성대', '세종대', '명지대(서울)', '가톨릭대', '단국대(천안)', '경기대',
  '건국대(글로컬)', '서울시립대', '백석대', '명지대(용인)/강남대', '상명대',
  '경희대(서울)', '한국공학대', '한신대', '한국항공대', '인천대', '인하대',
  '숭실대', '한국외국어대(서울)', '국민대', '성균관대', '건국대(서울)',
  '동국대', '경희대(국제)', '단국대(죽전)', '아주대', '중앙대(서울)',
  '광운대', '한양대(에리카)', '한국외국어대(글로벌)', '백석대', '한국교통대',
  '한국체육대', '가천대',
];

/* ─── 아코디언 컴포넌트 ─── */

function ChapterAccordion({ chapter, defaultOpen }: { chapter: Chapter; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bodyRef.current) return;
    if (open) {
      gsap.fromTo(bodyRef.current, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: 0.35, ease: 'power2.out' });
    } else {
      gsap.to(bodyRef.current, { height: 0, opacity: 0, duration: 0.25, ease: 'power2.in' });
    }
  }, [open]);

  return (
    <div
      style={{
        borderRadius: '16px',
        border: `1px solid ${open ? chapter.accent + '55' : 'rgba(148,163,184,0.2)'}`,
        background: open ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
        transition: 'border-color 0.3s, background 0.3s',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '18px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#e2e8f0',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              backgroundColor: chapter.accent,
              boxShadow: `0 0 0 5px ${chapter.accent}30`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 800, fontSize: 'clamp(15px, 4vw, 17px)' }}>{chapter.title}</span>
        </span>
        <span
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#94a3b8',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s',
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>

      <div ref={bodyRef} style={{ height: defaultOpen ? 'auto' : 0, opacity: defaultOpen ? 1 : 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gap: '16px', padding: '0 20px 20px' }}>
          {chapter.articles.map((article) => (
            <div key={article.title} style={{ display: 'grid', gap: '8px' }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '15px', color: chapter.accent }}>{article.title}</p>
              <div style={{ display: 'grid', gap: '4px' }}>
                {article.body.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      color: '#cbd5e1',
                      lineHeight: 1.7,
                      fontSize: 'clamp(13px, 3.4vw, 14px)',
                      paddingLeft: line.startsWith('•') || line.startsWith('▸') ? '8px' : 0,
                      ...(line === '' ? { height: '8px' } : {}),
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── 메인 페이지 ─── */

export default function RulePage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.rule-chunk');
      if (blocks) {
        gsap.fromTo(blocks, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' });
      }
    });
    return () => ctx.revert();
  }, []);

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      {/* ── 헤더 ── */}
      <section
        className="rule-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: 'clamp(24px, 6vw, 34px)',
          borderRadius: 'var(--surface-radius-lg, 24px)',
          background:
            'radial-gradient(circle at 10% 20%, rgba(249,115,22,0.14), transparent 30%), radial-gradient(circle at 88% 5%, rgba(96,165,250,0.12), transparent 24%), linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: 'rgba(249,115,22,0.16)',
              color: '#fed7aa',
              border: '1px solid rgba(249,115,22,0.35)',
              fontSize: 'clamp(11px, 2.8vw, 12px)',
            }}
          >
            AUBL · RULES
          </span>
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px, 5.5vw, 32px)', lineHeight: 1.25, fontWeight: 900 }}>
          전국대학아마추어야구연합회 회칙
        </h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '800px', fontSize: 'clamp(14px, 3.6vw, 15px)' }}>
          1997년 추계 제정 · 2024년까지 연차별 개정. 모든 AUBL 공식 경기는 본 회칙에 따라 운영되며, 회칙에 규정되지 않은 사항은 KBO 규정집을 적용합니다.
        </p>
        <Link
          to="/intro"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#93c5fd',
            fontWeight: 700,
            fontSize: 'clamp(13px, 3.4vw, 14px)',
          }}
        >
          ← 리그 소개로 돌아가기
        </Link>
      </section>

      {/* ── 장별 아코디언 ── */}
      <section className="rule-chunk" style={{ display: 'grid', gap: '12px' }}>
        {CHAPTERS.map((ch) => (
          <ChapterAccordion key={ch.id} chapter={ch} />
        ))}
      </section>

      {/* ── 주최 순서 ── */}
      <section
        className="rule-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: '24px',
          borderRadius: '18px',
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249,115,22,0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>주최 순서</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {HOST_ORDER.map((name, i) => (
            <span
              key={`${name}-${i}`}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'rgba(249,115,22,0.08)',
                border: '1px solid rgba(249,115,22,0.2)',
                color: '#e2e8f0',
                fontWeight: 700,
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ color: '#f97316', fontWeight: 800, fontSize: '11px' }}>{i + 1}</span>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── 부칙 ── */}
      <section
        className="rule-chunk"
        style={{
          padding: '20px 24px',
          borderRadius: '14px',
          border: '1px solid rgba(148,163,184,0.15)',
          background: 'rgba(255,255,255,0.02)',
          color: '#94a3b8',
          fontSize: 'clamp(12px, 3vw, 13px)',
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: 0 }}>
          <strong style={{ color: '#cbd5e1' }}>부칙</strong> — 본 회칙은 1997년 추계에 제정되었으며, 이후 대표자회의 의결을 거쳐 2024년까지 연차별로 개정되었다.
          회칙에 규정되지 않은 사항은 KBO 규정집을 적용한다.
        </p>
      </section>
    </div>
  );
}
