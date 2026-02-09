import { useEffect, useMemo, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useContent } from '../../shared/state/contentProvider';
import { buildTeamDirectory, decodeTeamId } from '../../shared/lib/teamDirectory';
import { TEAM_GROUPS } from '../../shared/lib/teamGroups';
import { useDemoStore } from '../../shared/state/demoStore';
import type { MatchSchedule } from '../../shared/state/demoStore';

const cardBase: CSSProperties = {
  borderRadius: '16px',
  padding: '16px',
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.7)',
  display: 'grid',
  gap: '12px',
};

const statusLabel = (match: MatchSchedule) => {
  if (match.status === 'inProgress') return { text: '진행 중', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' };
  if (match.status === 'completed') return { text: '경기 종료', color: '#f97316', bg: 'rgba(249,115,22,0.14)' };
  if (match.status === 'canceled') return { text: '취소', color: '#94a3b8', bg: 'rgba(148,163,184,0.18)' };
  return { text: '예정', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' };
};

const safeScore = (value?: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value : '-');

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const { content } = useContent();
  const { state, actions } = useDemoStore();
  const teamName = decodeTeamId(teamId ?? '');
  const teamEntries = content.teams.entries.length ? content.teams.entries : TEAM_GROUPS;
  const directory = useMemo(() => buildTeamDirectory(teamEntries), [teamEntries]);
  const team = useMemo(() => directory.find((entry) => entry.name === teamName) ?? null, [directory, teamName]);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  const upcoming = useMemo(
    () =>
      state.matches
        .filter(
          (match) =>
            !match.deleted &&
            (match.homeTeamName === teamName || match.awayTeamName === teamName) &&
            (match.status === 'scheduled' || match.status === 'inProgress'),
        )
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [state.matches, teamName],
  );

  const recentResults = useMemo(
    () =>
      state.matches
        .filter(
          (match) =>
            !match.deleted &&
            (match.homeTeamName === teamName || match.awayTeamName === teamName) &&
            (match.status === 'completed' || match.status === 'canceled'),
        )
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [state.matches, teamName],
  );

  const record = useMemo(() => {
    const finished = state.matches.filter(
      (match) =>
        !match.deleted &&
        (match.homeTeamName === teamName || match.awayTeamName === teamName) &&
        match.status === 'completed',
    );
    return finished.reduce(
      (acc, match) => {
        const homeScore = match.homeScore;
        const awayScore = match.awayScore;
        if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return acc;
        const isHome = match.homeTeamName === teamName;
        const teamScore = isHome ? homeScore : awayScore;
        const oppScore = isHome ? awayScore : homeScore;
        if (teamScore > oppScore) acc.wins += 1;
        else if (teamScore < oppScore) acc.losses += 1;
        else acc.draws += 1;
        return acc;
      },
      { wins: 0, losses: 0, draws: 0 },
    );
  }, [state.matches, teamName]);

  if (!team) {
    return (
      <section style={{ ...cardBase, maxWidth: '640px' }}>
        <h2 style={{ margin: 0, color: '#f97316', fontWeight: 900 }}>팀을 찾을 수 없습니다</h2>
        <p style={{ margin: 0, color: '#cbd5e1' }}>요청한 팀 페이지가 존재하지 않습니다. 팀 목록으로 돌아가 다시 선택해 주세요.</p>
        <Link
          to="/teams"
          style={{
            width: 'fit-content',
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(148,163,184,0.4)',
            background: 'rgba(255,255,255,0.04)',
            color: '#e2e8f0',
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          팀 허브로 돌아가기
        </Link>
      </section>
    );
  }

  const totalGames = record.wins + record.losses + record.draws;

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* ── HERO ── */}
      <section
        style={{
          borderRadius: '24px',
          padding: '26px',
          background:
            `radial-gradient(circle at 10% 20%, ${team.color}22, transparent 30%), radial-gradient(circle at 88% 5%, rgba(56,189,248,0.12), transparent 26%), linear-gradient(130deg, #0f172a 0%, #0b1220 100%)`,
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
          display: 'grid',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: `${team.color}22`,
              color: team.color,
              border: `1px solid ${team.color}55`,
              fontSize: '12px',
            }}
          >
            {team.group}조
          </span>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>TEAM PROFILE</span>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 6vw, 36px)', fontWeight: 900 }}>{team.name}</h1>
          <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 600 }}>
            최근 경기, 팀 성적, 시즌 정보 요약을 확인할 수 있는 팀 페이지입니다.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '13px',
          }}>총 {totalGames}경기</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.35)',
            color: '#bbf7d0',
            fontWeight: 800,
            fontSize: '13px',
          }}>승 {record.wins}</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.35)',
            color: '#fecaca',
            fontWeight: 800,
            fontSize: '13px',
          }}>패 {record.losses}</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(148,163,184,0.18)',
            border: '1px solid rgba(148,163,184,0.35)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '13px',
          }}>무 {record.draws}</div>
        </div>
      </section>

      {/* ── 일정 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>예정/진행 경기</h2>
          <Link
            to="/schedule"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '12px',
              textDecoration: 'none',
            }}
          >
            전체 일정 보기
          </Link>
        </div>
        {upcoming.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {upcoming.map((match) => {
              const badge = statusLabel(match);
              return (
                <div
                  key={match.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {match.awayTeamName} <span style={{ color: '#94a3b8' }}>vs</span> {match.homeTeamName}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {new Date(match.startTime).toLocaleString('ko-KR')} · {match.venue || '장소 미정'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: '#e2e8f0' }}>
                    {safeScore(match.awayScore)} : {safeScore(match.homeScore)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>예정된 경기가 아직 없습니다.</div>
        )}
      </section>

      {/* ── 결과 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>최근 경기 결과</h2>
          <Link
            to="/schedule/results"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '12px',
              textDecoration: 'none',
            }}
          >
            결과 페이지 보기
          </Link>
        </div>
        {recentResults.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {recentResults.map((match) => {
              const badge = statusLabel(match);
              return (
                <div
                  key={match.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {match.awayTeamName} <span style={{ color: '#94a3b8' }}>vs</span> {match.homeTeamName}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {new Date(match.startTime).toLocaleString('ko-KR')} · {match.venue || '장소 미정'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: '#e2e8f0' }}>
                    {safeScore(match.awayScore)} : {safeScore(match.homeScore)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>최근 경기 결과가 아직 없습니다.</div>
        )}
      </section>

      {/* ── 로스터 ── */}
      <section style={cardBase}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>로스터</h2>
        <div style={{ color: '#94a3b8', fontWeight: 700 }}>선수 명단 정보는 준비 중입니다.</div>
      </section>

      {/* ── 기록 ── */}
      <section style={cardBase}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>시즌 기록</h2>
        <div style={{ color: '#94a3b8', fontWeight: 700 }}>팀/선수 기록 통계는 준비 중입니다.</div>
      </section>

      {/* ── 안내 ── */}
      <section
        style={{
          borderRadius: '14px',
          padding: '16px',
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(255,255,255,0.02)',
          color: '#94a3b8',
          fontSize: '13px',
          lineHeight: 1.7,
        }}
      >
        감독 권한 기능, 팀 공지, 팀원 관리 기능은 추후 제공될 예정입니다.
      </section>
    </div>
  );
}
