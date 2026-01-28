import { useMemo } from 'react';
import { useDemoStore } from '../../shared/state/demoStore';

type Props = {
  summaryTime: string;
  summaryVenue: string;
};

export default function MatchSelectorBar({ summaryTime, summaryVenue }: Props) {
  const { state, actions } = useDemoStore();
  const matches = useMemo(() => state.matches.filter((m) => !m.deleted), [state.matches]);
  const hasActive = Boolean(state.activeMatchId);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        background: '#0b1220',
        border: '1px solid #1f2937',
        borderRadius: '12px',
        padding: '10px 14px',
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
          onChange={(e) => actions.selectMatch(e.target.value || null)}
          style={{
            padding: '8px 10px',
            borderRadius: '10px',
            border: '1px solid rgba(148,163,184,0.35)',
            background: 'rgba(15,23,42,0.9)',
            color: '#e2e8f0',
            minWidth: '220px',
          }}
        >
          {!hasActive ? (
            <option value="" disabled>
              중계로 볼 경기 선택
            </option>
          ) : null}
          {matches.map((match) => (
            <option key={match.id} value={match.id}>
              {match.homeTeamName} vs {match.awayTeamName} {match.status === 'inProgress' ? '· 진행중' : ''}
            </option>
          ))}
        </select>
      </div>
      <span style={{ color: '#94a3b8', fontWeight: 700 }}>
        {summaryTime} · {summaryVenue}
      </span>
    </div>
  );
}
