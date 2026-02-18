import { useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDemoStore } from '@shared/state/demoStore';

type Props = {
  summaryTime: string;
  summaryVenue: string;
  showViewerBadge?: boolean;
  viewerCount?: number;
};

export default function MatchSelectorBar({ summaryTime, summaryVenue, showViewerBadge = false, viewerCount = 0 }: Props) {
  const { state, actions } = useDemoStore();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const filterParam = searchParams.get('filter');

  // URL 쿼리 파라미터로 필터링: ?filter=live이면 진행 중인 경기만
  const matches = useMemo(() => {
    const allMatches = state.matches.filter((m) => !m.deleted);
    if (filterParam === 'live') {
      return allMatches.filter((m) => m.status === 'inProgress');
    }
    return allMatches;
  }, [state.matches, filterParam]);

  const hasActive = Boolean(state.activeMatchId);
  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const isPracticeMode = (activeMatch?.recordMode ?? 'official') === 'practice';
  const basePath = useMemo(() => {
    if (location.pathname.startsWith('/scoreboard-text')) return '/scoreboard-text';
    if (location.pathname.startsWith('/live-overlay')) return '/live-overlay';
    if (location.pathname.startsWith('/scorekeeper')) return '/scorekeeper';
    return '/scoreboard';
  }, [location.pathname]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap' as const,
        background: '#0b1220',
        border: '1px solid #1f2937',
        borderRadius: '12px',
        padding: 'clamp(6px, 1.4vw, 10px) clamp(8px, 1.8vw, 14px)',
        color: '#cbd5e1',
        fontWeight: 800,
        fontSize: 'clamp(12px, 1.8vw, 14px)',
        textAlign: 'left',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <select
          value={hasActive ? state.activeMatchId ?? '' : ''}
          onChange={(e) => {
            const nextId = e.target.value || null;
            actions.selectMatch(nextId);
            const suffix = nextId ? `/${nextId}` : '';
            navigate(`${basePath}${suffix}${location.search}`);
          }}
          style={{
            padding: '8px 10px',
            borderRadius: '10px',
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15,23,42,0.9)',
            color: '#e2e8f0',
            minWidth: 'min(220px, 100%)',
            width: '100%',
            maxWidth: '300px',
          }}
        >
          {!hasActive ? (
            <option value="" disabled>
              중계로 볼 경기 선택
            </option>
          ) : null}
          {matches.map((match) => (
            <option key={match.id} value={match.id}>
              {match.awayTeamName} vs {match.homeTeamName} {match.status === 'inProgress' ? '· 진행중' : ''}
            </option>
          ))}
        </select>
        {showViewerBadge ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              background: 'rgba(34, 197, 94, 0.08)',
              borderRadius: '999px',
              border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
              fontWeight: 700,
              fontSize: '12px',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '12px' }}>👥</span>
            현재 {viewerCount}명 시청 중
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {isPracticeMode ? (
          <span
            style={{
              padding: '3px 9px',
              borderRadius: '999px',
              border: '1px solid rgba(251,191,36,0.55)',
              background: 'rgba(251,191,36,0.16)',
              color: '#fcd34d',
              fontWeight: 900,
              fontSize: '11px',
              letterSpacing: '-0.01em',
            }}
          >
            연습경기
          </span>
        ) : null}
        <span style={{ color: '#94a3b8', fontWeight: 700 }}>
          {summaryTime} · {summaryVenue}
        </span>
      </div>
    </div>
  );
}
