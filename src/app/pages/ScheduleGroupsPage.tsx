import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
  SeasonLinkButton,
} from '../../shared/components/season';
import { useAdmin } from '../../shared/auth/useAdmin';
import { useContent } from '../../shared/state/contentProvider';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';
import { TEAM_GROUPS, GROUP_LETTERS } from '../../shared/lib/teamGroups';
import type { GroupLetter } from '../../shared/lib/teamGroups';
import './SchedulePublicPages.css';

type TabKey = 'ALL' | GroupLetter | 'EUTTEUM' | 'BEOGEUM';
type ScheduleListTab = Exclude<TabKey, 'ALL'>;

const GROUP_MATCH_PAGE_SIZE = 8;

const groupTabs: { key: 'ALL' | GroupLetter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  ...GROUP_LETTERS.map((group) => ({ key: group, label: `${group}조` })),
];

const postseasonTabs: { key: 'EUTTEUM' | 'BEOGEUM'; label: string }[] = [
  { key: 'EUTTEUM', label: '으뜸' },
  { key: 'BEOGEUM', label: '버금' },
];

function deriveMatchGroup(
  match: MatchSchedule,
  teamNameToGroup: ReadonlyMap<string, GroupLetter>,
): GroupLetter | null {
  const homeGroup = teamNameToGroup.get(match.homeTeamName);
  const awayGroup = teamNameToGroup.get(match.awayTeamName);
  if (homeGroup && awayGroup && homeGroup === awayGroup) return homeGroup;
  if (homeGroup && !awayGroup) return homeGroup;
  if (awayGroup && !homeGroup) return awayGroup;
  return null;
}

function isPostseasonMatch(
  match: MatchSchedule,
  teamNameToGroup: ReadonlyMap<string, GroupLetter>,
): boolean {
  if (match.division === 'EUTTEUM' || match.division === 'BEOGEUM') return true;
  const homeGroup = teamNameToGroup.get(match.homeTeamName);
  const awayGroup = teamNameToGroup.get(match.awayTeamName);
  if (homeGroup && awayGroup && homeGroup !== awayGroup) return true;
  return false;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시간 미정';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

export default function ScheduleGroupsPage() {
  const { content } = useContent();
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const { canUseScorekeeper } = useAdmin();
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [visibleCountByTab, setVisibleCountByTab] = useState<
    Partial<Record<ScheduleListTab, number>>
  >({});
  const matches = state.matches;

  const teamNameToGroup = useMemo(() => {
    const source = content.teams.entries.length ? content.teams.entries : TEAM_GROUPS;
    return new Map(source.map((entry) => [entry.name, entry.group])) as ReadonlyMap<
      string,
      GroupLetter
    >;
  }, [content.teams.entries]);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  const alive = useMemo(() => matches.filter((match) => !match.deleted), [matches]);

  const groupMatches = useMemo(() => {
    const byGroup: Record<GroupLetter, MatchSchedule[]> = {} as Record<
      GroupLetter,
      MatchSchedule[]
    >;
    GROUP_LETTERS.forEach((group) => {
      byGroup[group] = [];
    });
    alive.forEach((match) => {
      if (isPostseasonMatch(match, teamNameToGroup)) return;
      const group = deriveMatchGroup(match, teamNameToGroup);
      if (group) byGroup[group].push(match);
    });
    GROUP_LETTERS.forEach((group) => {
      byGroup[group].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    });
    return byGroup;
  }, [alive, teamNameToGroup]);

  const postseasonMatches = useMemo(() => {
    const byDivision: Record<'EUTTEUM' | 'BEOGEUM', MatchSchedule[]> = {
      EUTTEUM: [],
      BEOGEUM: [],
    };
    alive.forEach((match) => {
      if (!isPostseasonMatch(match, teamNameToGroup)) return;
      const division =
        match.division === 'EUTTEUM' || match.division === 'BEOGEUM'
          ? match.division
          : null;
      if (division) byDivision[division].push(match);
    });
    (['EUTTEUM', 'BEOGEUM'] as const).forEach((division) => {
      byDivision[division].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      );
    });
    return byDivision;
  }, [alive, teamNameToGroup]);

  const hasPostseason =
    postseasonMatches.EUTTEUM.length > 0 || postseasonMatches.BEOGEUM.length > 0;

  const visibleSections = useMemo(() => {
    if (activeTab === 'ALL') return [];
    if (activeTab === 'EUTTEUM' || activeTab === 'BEOGEUM') {
      const label = activeTab === 'EUTTEUM' ? '으뜸' : '버금';
      return [{ key: activeTab, label, matches: postseasonMatches[activeTab] }];
    }
    const group = activeTab as GroupLetter;
    return [{ key: group, label: `${group}조`, matches: groupMatches[group] }];
  }, [activeTab, groupMatches, postseasonMatches]);

  const totalGroupCount = useMemo(
    () => GROUP_LETTERS.reduce((sum, group) => sum + groupMatches[group].length, 0),
    [groupMatches],
  );
  const activeListTab: ScheduleListTab | null = activeTab === 'ALL' ? null : activeTab;
  const activeVisibleCount = activeListTab
    ? visibleCountByTab[activeListTab] ?? GROUP_MATCH_PAGE_SIZE
    : 0;

  const openMatch = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scoreboard-text/${matchId}`);
  };

  const openScorekeeper = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scorekeeper/${matchId}`);
  };

  return (
    <div className="schedule-public schedule-public--groups">
      <PageHero
        eyebrow="2026 SEASON · GROUPS"
        title="조별 일정"
        description={
          <p>
            A~H조 조별 리그{hasPostseason ? '와 으뜸·버금 포스트시즌' : ''}를 조 단위로
            나누어 경기 흐름을 확인할 수 있습니다.
          </p>
        }
        actions={
          <SeasonLinkButton to="/schedule" variant="secondary">
            전체 일정 보기
          </SeasonLinkButton>
        }
        aside={
          <div className="schedule-public__hero-aside" aria-label="조별 일정 요약">
            <span>GROUP STAGE</span>
            <strong>A–H</strong>
            <small>{totalGroupCount} 경기 등록</small>
          </div>
        }
      />

      <nav className="schedule-public__tabs" aria-label="조 및 포스트시즌 선택">
        <div className="schedule-public__tab-group">
          <span className="schedule-public__tab-label">조별 리그</span>
          <div role="group" aria-label="조 선택">
            {groupTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const count =
                tab.key === 'ALL' ? totalGroupCount : groupMatches[tab.key as GroupLetter].length;
              return (
                <button
                  id={`schedule-tab-${tab.key}`}
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  className={isActive ? 'is-active' : ''}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>
        </div>

        {hasPostseason ? (
          <div className="schedule-public__tab-group">
            <span className="schedule-public__tab-label">포스트시즌</span>
            <div role="group" aria-label="포스트시즌 선택">
              {postseasonTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    id={`schedule-tab-${tab.key}`}
                    key={tab.key}
                    type="button"
                    aria-pressed={isActive}
                    className={isActive ? 'is-active' : ''}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <span>{tab.label}</span>
                    <small>{postseasonMatches[tab.key].length}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </nav>

      {activeTab === 'ALL' ? (
        <section className="schedule-public__group-overview" aria-labelledby="group-overview-title">
          <SectionHeader
            eyebrow="GROUP OVERVIEW"
            title="A~H조 한눈에 보기"
            description="조를 선택하면 해당 조의 경기만 넓은 화면으로 볼 수 있습니다."
            headingId="group-overview-title"
          />
          <div className="schedule-public__group-summary-grid">
            {GROUP_LETTERS.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setActiveTab(group)}
                aria-label={`${group}조 ${groupMatches[group].length}경기만 보기`}
              >
                <span>{group}</span>
                <strong>{group}조</strong>
                <small>{groupMatches[group].length} 경기</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeListTab ? (
        <div id="schedule-group-panel" className="schedule-public__group-list">
          {visibleSections.map((section) => {
            const visibleMatches = section.matches.slice(0, activeVisibleCount);
            const shownCount = visibleMatches.length;
            const hasMore = shownCount < section.matches.length;
            const canCollapse = activeVisibleCount > GROUP_MATCH_PAGE_SIZE;

            return (
              <section key={section.key} className="schedule-public__group-board">
                <SectionHeader
                  eyebrow="GROUP SCHEDULE"
                  title={section.label}
                  description="경기 날짜와 시간, 장소, 양 팀 정보를 시간 순서대로 표시합니다."
                  action={<SeasonBadge tone="muted">{section.matches.length} 경기</SeasonBadge>}
                />

                {section.matches.length ? (
                  <>
                    <div
                      id={`schedule-${activeListTab.toLowerCase()}-match-list`}
                      className="schedule-public__match-list"
                    >
                      {visibleMatches.map((match) => {
                        const isPast = new Date(match.startTime).getTime() < Date.now();
                        const badge =
                          match.status === 'completed' || isPast
                            ? { text: '종료' as const, tone: 'navy' as const }
                            : { text: '예정' as const, tone: 'muted' as const };
                        return (
                          <article key={match.id} className="schedule-public__match schedule-public__match--group">
                            <div className="schedule-public__match-date">
                              <time dateTime={match.startTime}>{formatDate(match.startTime)}</time>
                              <strong>{formatTime(match.startTime)}</strong>
                              <span>{match.venue || '장소 미정'}</span>
                            </div>

                            <div className="schedule-public__score" aria-label={`${match.awayTeamName} 대 ${match.homeTeamName}`}>
                              <div>
                                <span>원정</span>
                                <strong>{match.awayTeamName}</strong>
                                <b>{match.awayScore ?? '-'}</b>
                              </div>
                              <div>
                                <span>홈</span>
                                <strong>{match.homeTeamName}</strong>
                                <b>{match.homeScore ?? '-'}</b>
                              </div>
                            </div>

                            <div className="schedule-public__match-actions">
                              <SeasonBadge tone={badge.tone}>{badge.text}</SeasonBadge>
                              <SeasonButton variant="secondary" size="compact" onClick={() => openMatch(match.id)}>
                                문자중계
                              </SeasonButton>
                              {canUseScorekeeper ? (
                                <SeasonButton variant="ghost" size="compact" onClick={() => openScorekeeper(match.id)}>
                                  기록 관리
                                </SeasonButton>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    {(hasMore || canCollapse) ? (
                      <div className="schedule-public__more">
                        <div className="schedule-public__more-actions">
                          {canCollapse ? (
                            <SeasonButton
                              variant="ghost"
                              size="compact"
                              aria-controls={`schedule-${activeListTab.toLowerCase()}-match-list`}
                              onClick={() =>
                                setVisibleCountByTab((current) => ({
                                  ...current,
                                  [activeListTab]: GROUP_MATCH_PAGE_SIZE,
                                }))
                              }
                            >
                              접기
                            </SeasonButton>
                          ) : null}
                          {hasMore ? (
                            <SeasonButton
                              variant="secondary"
                              size="compact"
                              aria-controls={`schedule-${activeListTab.toLowerCase()}-match-list`}
                              onClick={() =>
                                setVisibleCountByTab((current) => ({
                                  ...current,
                                  [activeListTab]:
                                    (current[activeListTab] ?? GROUP_MATCH_PAGE_SIZE) +
                                    GROUP_MATCH_PAGE_SIZE,
                                }))
                              }
                            >
                              {Math.min(GROUP_MATCH_PAGE_SIZE, section.matches.length - shownCount)}경기 더 보기
                            </SeasonButton>
                          ) : null}
                        </div>
                        <span aria-live="polite">{shownCount} / {section.matches.length} 경기 표시</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="schedule-public__empty" role="status">
                    <strong>아직 등록된 {section.label} 일정이 없습니다.</strong>
                    <span>일정이 확정되면 이곳에 표시됩니다.</span>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
