import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoStore } from '../../shared/state/demoStore';
import { useAdmin } from '../../shared/auth/useAdmin';
import { TEAM_GROUPS, GROUP_LETTERS, GROUP_COLORS } from '../../shared/lib/teamGroups';
import type { GroupLetter } from '../../shared/lib/teamGroups';
import type { MatchSchedule } from '../../shared/state/demoStore';
import { useContent } from '../../shared/state/contentProvider';

/* ─── 탭 정의 ─── */

type TabKey = 'ALL' | GroupLetter | 'EUTTEUM' | 'BEOGEUM';

interface Tab {
  key: TabKey;
  label: string;
  color: string;
  section: 'group' | 'postseason';
}

const groupTabs: Tab[] = [
  { key: 'ALL', label: '전체', color: '#94a3b8', section: 'group' },
  ...GROUP_LETTERS.map((g): Tab => ({ key: g, label: `${g}조`, color: GROUP_COLORS[g], section: 'group' })),
];

const postseasonTabs: Tab[] = [
  { key: 'EUTTEUM', label: '으뜸', color: '#4f46e5', section: 'postseason' },
  { key: 'BEOGEUM', label: '버금', color: '#10b981', section: 'postseason' },
];

/* ─── 매치 → 조 판별 ─── */

function deriveMatchGroup(match: MatchSchedule, teamNameToGroup: ReadonlyMap<string, GroupLetter>): GroupLetter | null {
  const homeGroup = teamNameToGroup.get(match.homeTeamName);
  const awayGroup = teamNameToGroup.get(match.awayTeamName);
  // 양팀이 같은 조면 → 조별 리그 경기
  if (homeGroup && awayGroup && homeGroup === awayGroup) return homeGroup;
  // 한쪽만 매핑되면 해당 조로 추정
  if (homeGroup && !awayGroup) return homeGroup;
  if (awayGroup && !homeGroup) return awayGroup;
  return null;
}

function isPostseasonMatch(match: MatchSchedule, teamNameToGroup: ReadonlyMap<string, GroupLetter>): boolean {
  // division이 명시적으로 지정된 경우 or 양팀이 다른 조
  if (match.division === 'EUTTEUM' || match.division === 'BEOGEUM') return true;
  const homeGroup = teamNameToGroup.get(match.homeTeamName);
  const awayGroup = teamNameToGroup.get(match.awayTeamName);
  if (homeGroup && awayGroup && homeGroup !== awayGroup) return true;
  return false;
}

/* ─── 컴포넌트 ─── */

const cardBase: React.CSSProperties = {
  borderRadius: '16px',
  padding: '14px',
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.7)',
};

export default function ScheduleGroupsPage() {
  const { content } = useContent();
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const matches = state.matches;
  const teamNameToGroup = useMemo(() => {
    const source = content.teams.entries.length ? content.teams.entries : TEAM_GROUPS;
    return new Map(source.map((entry) => [entry.name, entry.group])) as ReadonlyMap<string, GroupLetter>;
  }, [content.teams.entries]);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  const showBlockedTooltip = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltip({ text: '관리자 로그인이 필요합니다', x: rect.left + rect.width / 2, y: rect.bottom });
  }, []);

  const alive = useMemo(() => matches.filter((m) => !m.deleted), [matches]);

  // 조별 리그 경기 분류
  const groupMatches = useMemo(() => {
    const byGroup: Record<GroupLetter, MatchSchedule[]> = {} as Record<GroupLetter, MatchSchedule[]>;
    GROUP_LETTERS.forEach((g) => { byGroup[g] = []; });
    alive.forEach((match) => {
      if (isPostseasonMatch(match, teamNameToGroup)) return;
      const group = deriveMatchGroup(match, teamNameToGroup);
      if (group) byGroup[group].push(match);
    });
    GROUP_LETTERS.forEach((g) => {
      byGroup[g].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    return byGroup;
  }, [alive, teamNameToGroup]);

  // 포스트시즌 경기 분류
  const postseasonMatches = useMemo(() => {
    const byDiv: Record<'EUTTEUM' | 'BEOGEUM', MatchSchedule[]> = { EUTTEUM: [], BEOGEUM: [] };
    alive.forEach((match) => {
      if (!isPostseasonMatch(match, teamNameToGroup)) return;
      const div = match.division === 'EUTTEUM' || match.division === 'BEOGEUM' ? match.division : null;
      if (div) byDiv[div].push(match);
    });
    (['EUTTEUM', 'BEOGEUM'] as const).forEach((k) => {
      byDiv[k].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    return byDiv;
  }, [alive, teamNameToGroup]);

  const hasPostseason = postseasonMatches.EUTTEUM.length > 0 || postseasonMatches.BEOGEUM.length > 0;

  // 현재 탭에 따른 표시 데이터
  const visibleSections = useMemo(() => {
    if (activeTab === 'ALL') {
      return GROUP_LETTERS.map((g) => ({
        key: g,
        label: `${g}조`,
        color: GROUP_COLORS[g],
        matches: groupMatches[g],
      }));
    }
    if (activeTab === 'EUTTEUM' || activeTab === 'BEOGEUM') {
      const label = activeTab === 'EUTTEUM' ? '으뜸' : '버금';
      const color = activeTab === 'EUTTEUM' ? '#4f46e5' : '#10b981';
      return [{ key: activeTab, label, color, matches: postseasonMatches[activeTab] }];
    }
    // 개별 조
    const g = activeTab as GroupLetter;
    return [{ key: g, label: `${g}조`, color: GROUP_COLORS[g], matches: groupMatches[g] }];
  }, [activeTab, groupMatches, postseasonMatches]);

  const totalGroupCount = useMemo(
    () => GROUP_LETTERS.reduce((sum, g) => sum + groupMatches[g].length, 0),
    [groupMatches],
  );

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y + 10,
            transform: 'translate(-50%, 0)',
            background: 'rgba(15,23,42,0.95)',
            color: '#f97316',
            padding: '8px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(148,163,184,0.35)',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            zIndex: 2000,
          }}
        >
          {tooltip.text}
        </div>
      )}

      {/* ── 헤더 ── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>조별 일정</h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8' }}>
            A~H조 조별 리그{hasPostseason ? ' 및 포스트시즌(으뜸·버금)' : ''} 일정을 확인하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          style={{
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          메인 일정 페이지
        </button>
      </header>

      {/* ── 탭 ── */}
      <section style={{ display: 'grid', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontWeight: 700, fontSize: '12px', marginRight: '4px' }}>조별 리그</span>
          {groupTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key === 'ALL' ? totalGroupCount : groupMatches[tab.key as GroupLetter]?.length ?? 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontWeight: 800,
                  fontSize: '13px',
                  background: isActive ? `${tab.color}22` : 'rgba(255,255,255,0.04)',
                  color: isActive ? tab.color : '#94a3b8',
                  border: isActive ? `1.5px solid ${tab.color}55` : '1.5px solid rgba(148,163,184,0.12)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                {tab.label}
                {count > 0 && <span style={{ marginLeft: '5px', fontSize: '11px', opacity: 0.7 }}>{count}</span>}
              </button>
            );
          })}
        </div>

        {hasPostseason && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontWeight: 700, fontSize: '12px', marginRight: '4px' }}>포스트시즌</span>
            {postseasonTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = postseasonMatches[tab.key as 'EUTTEUM' | 'BEOGEUM']?.length ?? 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '13px',
                    background: isActive ? `${tab.color}22` : 'rgba(255,255,255,0.04)',
                    color: isActive ? tab.color : '#94a3b8',
                    border: isActive ? `1.5px solid ${tab.color}55` : '1.5px solid rgba(148,163,184,0.12)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {tab.label}
                  {count > 0 && <span style={{ marginLeft: '5px', fontSize: '11px', opacity: 0.7 }}>{count}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 경기 목록 ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: activeTab === 'ALL' ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          gap: '14px',
        }}
      >
        {visibleSections.map((section) => (
          <div
            key={section.key}
            style={{
              ...cardBase,
              borderColor: `${section.color}55`,
              background: `linear-gradient(145deg, rgba(15,23,42,0.9), rgba(15,23,42,0.74)), radial-gradient(circle at 12% 16%, ${section.color}26, transparent 42%)`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '999px', background: section.color }} />
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{section.label}</h2>
              </div>
              <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>{section.matches.length} 경기</span>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
              {section.matches.length ? (
                section.matches.map((match) => {
                  const isPast = new Date(match.startTime).getTime() < Date.now();
                  const badge =
                    match.status === 'completed' || isPast
                      ? { text: '종료', color: '#f97316' }
                      : { text: '예정', color: '#22c55e' };
                  return (
                    <div
                      key={match.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '12px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        background: 'rgba(255,255,255,0.03)',
                        display: 'grid',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                          {match.awayTeamName} vs {match.homeTeamName}
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: `${badge.color}22`,
                            color: badge.color,
                            fontWeight: 800,
                            fontSize: '11px',
                          }}
                        >
                          {badge.text}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center',
                          color: '#94a3b8',
                          fontSize: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{new Date(match.startTime).toLocaleDateString('ko-KR')}</span>
                        <span>· {match.venue}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            actions.selectMatch(match.id);
                            navigate('/scoreboard-text');
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(255,255,255,0.04)',
                            color: '#cbd5e1',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          문자중계
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            if (!isAdmin) {
                              showBlockedTooltip(e.currentTarget);
                              return;
                            }
                            actions.selectMatch(match.id);
                            navigate('/scorekeeper');
                          }}
                          onMouseEnter={(e) => {
                            if (!isAdmin) showBlockedTooltip(e.currentTarget);
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          onFocus={(e) => {
                            if (!isAdmin) showBlockedTooltip(e.currentTarget);
                          }}
                          onBlur={() => setTooltip(null)}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(255,255,255,0.04)',
                            color: isAdmin ? '#cbd5e1' : 'rgba(203,213,225,0.6)',
                            fontWeight: 800,
                            cursor: isAdmin ? 'pointer' : 'not-allowed',
                          }}
                        >
                          기록 관리
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px dashed rgba(148,163,184,0.35)',
                    color: '#94a3b8',
                    fontWeight: 700,
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  아직 등록된 {section.label} 일정이 없습니다.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
