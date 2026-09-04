import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import IndependentScoreboardPanel from '../../features/scoreboard/components/IndependentScoreboardPanel';
import {
  PageHero,
  SectionHeader,
  SeasonBadge,
  SeasonButton,
  SeasonLinkButton,
} from '../../shared/components/season';
import { firestore } from '../../shared/firebase/client';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';
import './SchedulePublicPages.css';

function safeMatchTime(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

const formatMatchMeta = (match: MatchSchedule) => {
  const date = new Date(match.startTime);
  const dateLabel = Number.isNaN(date.getTime())
    ? '일정 미정'
    : new Intl.DateTimeFormat('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
  return `${dateLabel} · ${match.venue || '장소 미정'}`;
};

export default function ScheduleLivePage() {
  const { state, actions } = useDemoStore();
  const navigate = useNavigate();
  const [liveMatchesRealtime, setLiveMatchesRealtime] = useState<MatchSchedule[]>([]);

  const liveMatches = useMemo(() => {
    const source = liveMatchesRealtime.length ? liveMatchesRealtime : state.matches;
    return source
      .filter((match) => match.status === 'inProgress')
      .sort((a, b) => safeMatchTime(a.startTime) - safeMatchTime(b.startTime));
  }, [liveMatchesRealtime, state.matches]);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  useEffect(() => {
    const liveQuery = query(
      collection(firestore, 'matches'),
      where('status', '==', 'inProgress'),
    );
    const unsub = onSnapshot(
      liveQuery,
      (snap) => {
        const incoming = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Partial<MatchSchedule>),
        }));
        setLiveMatchesRealtime(
          incoming
            .filter((match) => !match.deleted)
            .sort(
              (a, b) =>
                safeMatchTime(a.startTime || '') - safeMatchTime(b.startTime || ''),
            ) as MatchSchedule[],
        );
      },
      (error) => {
        console.error('[live page] snapshot error', error);
        setLiveMatchesRealtime([]);
      },
    );
    return unsub;
  }, []);

  const openMatch = (matchId: string) => {
    actions.selectMatch(matchId);
    navigate(`/scoreboard-text/${matchId}`);
  };

  return (
    <div className="schedule-public schedule-public--live">
      <PageHero
        eyebrow="2026 SEASON · LIVE CENTER"
        title="실시간 경기 전광판"
        description={<p>진행 중인 모든 경기의 전광판을 한 화면에서 확인할 수 있습니다.</p>}
        actions={
          <>
            <SeasonLinkButton to="/schedule" variant="secondary">
              전체 일정 보기
            </SeasonLinkButton>
            <SeasonLinkButton to="/" variant="ghost">
              홈으로
            </SeasonLinkButton>
          </>
        }
        aside={
          <div className="schedule-public__hero-aside" aria-label="실시간 경기 수">
            <span>LIVE GAMES</span>
            <strong>{liveMatches.length}</strong>
            <small>현재 진행 중</small>
          </div>
        }
      />

      <section className="schedule-public__board schedule-public__live-board" aria-labelledby="live-board-title">
        <SectionHeader
          eyebrow="LIVE SCOREBOARD"
          title="진행 중인 경기"
          description="경기 카드를 선택하면 해당 경기의 문자중계 상세 화면으로 이동합니다."
          headingId="live-board-title"
          action={<SeasonBadge tone={liveMatches.length ? 'blue' : 'muted'}>{liveMatches.length} 경기</SeasonBadge>}
        />

        {liveMatches.length === 0 ? (
          <div className="schedule-public__empty schedule-public__empty--large" role="status">
            <span className="schedule-public__empty-mark" aria-hidden="true">AUBL</span>
            <strong>진행 중인 경기가 없습니다.</strong>
            <span>경기가 시작되면 실시간 전광판이 이곳에 표시됩니다.</span>
          </div>
        ) : (
          <div className={`schedule-public__live-grid${liveMatches.length === 1 ? ' is-single' : ''}`}>
            {liveMatches.map((match) => (
              <article
                key={match.id}
                className="schedule-public__live-card"
                onClick={() => openMatch(match.id)}
              >
                <header className="schedule-public__live-heading">
                  <div>
                    <SeasonBadge tone="blue">LIVE</SeasonBadge>
                    <div>
                      <strong>{match.awayTeamName} vs {match.homeTeamName}</strong>
                      <span>{formatMatchMeta(match)}</span>
                    </div>
                  </div>
                  <div>
                    {match.notes ? <SeasonBadge tone="muted">{match.notes}</SeasonBadge> : null}
                    <SeasonButton
                      variant="secondary"
                      size="compact"
                      onClick={(event) => {
                        event.stopPropagation();
                        openMatch(match.id);
                      }}
                    >
                      중계 보기
                    </SeasonButton>
                  </div>
                </header>

                <div
                  className="schedule-public__scoreboard-preview"
                  onClick={(event) => {
                    event.stopPropagation();
                    openMatch(match.id);
                  }}
                >
                  <IndependentScoreboardPanel
                    matchId={match.id}
                    style={{
                      width: '100%',
                      minHeight: '400px',
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
