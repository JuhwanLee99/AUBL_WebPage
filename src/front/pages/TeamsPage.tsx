import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';

/* ─── 팀 데이터 ─── */

type GroupKey = 'ALL' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

interface TeamEntry {
  name: string;
  group: Exclude<GroupKey, 'ALL'>;
}

/**
 * 2026 시즌 조편성 — 대표자회의 확정 후 업데이트.
 * group 값을 변경하면 페이지에 자동 반영됩니다.
 */
const TEAMS: TeamEntry[] = [
  { name: '가천 WIND', group: 'A' },
  { name: '가톨릭대학교 텀블러즈', group: 'A' },
  { name: '강남대학교 타키온즈', group: 'A' },
  { name: '건국대 팬서스', group: 'A' },
  { name: '건국대(서울) 불소야구', group: 'A' },
  { name: '경기대학교 KGB', group: 'B' },
  { name: '경희대국제 LIONS', group: 'B' },
  { name: '경희대학교(서울) BRAVES', group: 'B' },
  { name: '고려대학교 백구회', group: 'B' },
  { name: '광운대학교 페가수스', group: 'B' },
  { name: '국민대학교 윈드밀스', group: 'C' },
  { name: '단국대 PANDAS', group: 'C' },
  { name: '단국대학교 하운드', group: 'C' },
  { name: '동국대학교 LAE', group: 'C' },
  { name: '명지대학교(서울) 나이너스', group: 'C' },
  { name: '백석대학교 칼로스', group: 'D' },
  { name: '상명대BUCKS', group: 'D' },
  { name: '서강대학교 야구반 알바트로스', group: 'D' },
  { name: '서경대학교 적시타', group: 'D' },
  { name: '서울과학기술대 미르', group: 'D' },
  { name: '서울시립대학교FALCONS', group: 'E' },
  { name: '성균관대학교 킹고야구반', group: 'E' },
  { name: '세종대학교 세종킹스', group: 'E' },
  { name: '숭실대학교 oners', group: 'E' },
  { name: '아주대학교 ABBA', group: 'E' },
  { name: '연세대학교 EAGLES', group: 'F' },
  { name: '외대(글로벌) 유니온', group: 'F' },
  { name: '인천대학교 바이킹', group: 'F' },
  { name: '인하대학교 비룡', group: 'F' },
  { name: '중앙대학교 랑데뷰', group: 'F' },
  { name: '한국공학대학교 WINNERS', group: 'G' },
  { name: '한국교통대학교 스윙스', group: 'G' },
  { name: '한국외대(서울) 야구부', group: 'G' },
  { name: '한국체대 루나틱스', group: 'G' },
  { name: '한국항공대 Astros', group: 'G' },
  { name: '한성대학교 TURTLES', group: 'H' },
  { name: '한신대학교 갱스터', group: 'H' },
  { name: '한양대ERICA HIBA', group: 'H' },
  { name: '한양대학교 불새', group: 'H' },
  { name: '홍익대학교 위너스', group: 'H' },
];

const GROUP_TABS: { key: GroupKey; label: string; color: string }[] = [
  { key: 'ALL', label: '전체', color: '#94a3b8' },
  { key: 'A', label: 'A조', color: '#60a5fa' },
  { key: 'B', label: 'B조', color: '#a855f7' },
  { key: 'C', label: 'C조', color: '#34d399' },
  { key: 'D', label: 'D조', color: '#f97316' },
  { key: 'E', label: 'E조', color: '#f43f5e' },
  { key: 'F', label: 'F조', color: '#facc15' },
  { key: 'G', label: 'G조', color: '#38bdf8' },
  { key: 'H', label: 'H조', color: '#fb923c' },
];

const GROUP_COLORS: Record<string, string> = Object.fromEntries(GROUP_TABS.filter((t) => t.key !== 'ALL').map((t) => [t.key, t.color]));

/* ─── 메인 페이지 ─── */

export default function TeamsPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  const [activeGroup, setActiveGroup] = useState<GroupKey>('ALL');

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blocks = pageRef.current?.querySelectorAll('.teams-chunk');
      if (blocks) {
        gsap.fromTo(blocks, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' });
      }
    });
    return () => ctx.revert();
  }, []);

  const filteredTeams = activeGroup === 'ALL' ? TEAMS : TEAMS.filter((t) => t.group === activeGroup);

  // 조별 그룹핑 (전체 보기에서 사용)
  const groupedTeams = activeGroup === 'ALL'
    ? GROUP_TABS.filter((g) => g.key !== 'ALL').map((g) => ({
        ...g,
        teams: TEAMS.filter((t) => t.group === g.key),
      }))
    : null;

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      {/* ── 헤더 ── */}
      <section
        className="teams-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          padding: 'clamp(24px, 6vw, 34px)',
          borderRadius: 'var(--surface-radius-lg, 24px)',
          background:
            'radial-gradient(circle at 10% 20%, rgba(96,165,250,0.14), transparent 30%), radial-gradient(circle at 88% 5%, rgba(168,85,247,0.12), transparent 24%), linear-gradient(140deg, #0a1a3f 0%, #0f2f8f 100%)',
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
              background: 'rgba(96,165,250,0.16)',
              color: '#bfdbfe',
              border: '1px solid rgba(96,165,250,0.35)',
              fontSize: 'clamp(11px, 2.8vw, 12px)',
            }}
          >
            AUBL · TEAMS
          </span>
        </div>
        <h2 style={{ margin: 0, fontSize: 'clamp(22px, 5.5vw, 32px)', lineHeight: 1.25, fontWeight: 900 }}>
          2026 참가팀 · 조편성
        </h2>
        <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.7, maxWidth: '800px', fontSize: 'clamp(14px, 3.6vw, 15px)' }}>
          총 {TEAMS.length}개 대학이 A~H조 조별 리그에 참가합니다. 조별 상위 2팀은 으뜸 토너먼트 16강, 3·4등은 버금 토너먼트 16강으로 포스트시즌이 진행됩니다.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            ← 리그 소개
          </Link>
          <span style={{ color: '#475569' }}>·</span>
          <Link
            to="/schedule/groups"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#93c5fd',
              fontWeight: 700,
              fontSize: 'clamp(13px, 3.4vw, 14px)',
            }}
          >
            조별 일정 보기 →
          </Link>
        </div>
      </section>

      {/* ── 조 필터 탭 ── */}
      <section className="teams-chunk" style={{ display: 'grid', gap: '14px' }}>
        <div
          className="nav-scroll"
          style={{ position: 'relative' }}
        >
          <div
            className="nav-scroll__rail"
            style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
          >
            {GROUP_TABS.map((tab) => {
              const isActive = activeGroup === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveGroup(tab.key)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: 'clamp(13px, 3.4vw, 14px)',
                    background: isActive ? `${tab.color}22` : 'rgba(255,255,255,0.04)',
                    color: isActive ? tab.color : '#94a3b8',
                    border: isActive ? `1.5px solid ${tab.color}55` : '1.5px solid rgba(148,163,184,0.15)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {tab.label}
                  {tab.key !== 'ALL' && (
                    <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>
                      {TEAMS.filter((t) => t.group === tab.key).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 팀 목록 ── */}
      {groupedTeams ? (
        /* 전체 보기: 조별 섹션으로 표시 */
        groupedTeams.map((g) => (
          <section
            key={g.key}
            className="teams-chunk"
            style={{
              display: 'grid',
              gap: '14px',
              padding: '24px',
              borderRadius: '18px',
              border: `1px solid ${g.color}30`,
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '999px',
                  backgroundColor: g.color,
                  boxShadow: `0 0 0 5px ${g.color}25`,
                }}
              />
              <p style={{ margin: 0, fontWeight: 800, fontSize: '16px', color: g.color }}>
                {g.label}
              </p>
              <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
                {g.teams.length}팀
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {g.teams.map((team) => (
                <span
                  key={team.name}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: `${g.color}0c`,
                    border: `1px solid ${g.color}25`,
                    color: '#e2e8f0',
                    fontWeight: 700,
                    fontSize: '14px',
                  }}
                >
                  {team.name}
                </span>
              ))}
            </div>
          </section>
        ))
      ) : (
        /* 단일 조 보기 */
        <section
          className="teams-chunk"
          style={{
            display: 'grid',
            gap: '14px',
            padding: '24px',
            borderRadius: '18px',
            border: `1px solid ${GROUP_COLORS[activeGroup]}30`,
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '999px',
                backgroundColor: GROUP_COLORS[activeGroup],
                boxShadow: `0 0 0 5px ${GROUP_COLORS[activeGroup]}25`,
              }}
            />
            <p style={{ margin: 0, fontWeight: 800, fontSize: '16px', color: GROUP_COLORS[activeGroup] }}>
              {activeGroup}조
            </p>
            <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
              {filteredTeams.length}팀
            </span>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {filteredTeams.map((team, i) => (
              <div
                key={team.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(148,163,184,0.15)',
                }}
              >
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: `${GROUP_COLORS[activeGroup]}18`,
                    color: GROUP_COLORS[activeGroup],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '13px',
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#e2e8f0' }}>{team.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 안내 ── */}
      <section
        className="teams-chunk"
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
          <strong style={{ color: '#cbd5e1' }}>참고</strong> — 조편성은 대표자회의 의결에 따라 확정되며, 변경될 수 있습니다. 최종 조편성은 시즌 개막 전 공지됩니다.
        </p>
      </section>
    </div>
  );
}
