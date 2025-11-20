// **`src/pages/StandingsPage.tsx`**
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { TEAMS, MATCHES } from '../shared/lib/mockData';
import { calculateRankings } from '../features/rankings/utils/rankingEngine';

export default function StandingsPage() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = pageRef.current?.querySelectorAll('.standing-chunk');
      if (cards) {
        gsap.fromTo(cards, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.08, ease: 'power2.out' });
      }
    });

    return () => ctx.revert();
  }, []);

  const enrichedRankings = useMemo(() => {
    const base = calculateRankings(TEAMS, MATCHES);
    return base.map((row) => {
      const team = TEAMS.find((item) => item.id === row.teamId);
      const games = row.wins + row.losses + row.draws;
      const winRate = games === 0 ? 0 : Math.round(((row.wins + row.draws * 0.5) / games) * 1000) / 10;
      return {
        ...row,
        games,
        winRate,
        color: team?.logoColor ?? '#f97316',
        division: team?.division ?? 'AUBL',
        founded: team?.founded ?? 1981,
      };
    });
  }, []);

  const topTeam = enrichedRankings[0];
  const avgElo =
    enrichedRankings.reduce((sum, item) => sum + item.eloRating, 0) / Math.max(enrichedRankings.length, 1);

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      <section
        className="standing-chunk"
        style={{
          borderRadius: '22px',
          padding: '26px',
          background:
            'radial-gradient(circle at 8% 20%, rgba(99,102,241,0.16), transparent 34%), radial-gradient(circle at 86% 0%, rgba(249,115,22,0.18), transparent 30%), linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '10px', minWidth: '260px' }}>
            <p style={{ margin: 0, fontSize: '13px', letterSpacing: '0.08em', fontWeight: 800, color: '#f97316' }}>
              LIVE ELO STANDINGS
            </p>
            <h2 style={{ margin: 0, fontSize: '32px', fontWeight: 900 }}>📊 리그 순위 & 전력 지표</h2>
            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
              경기 결과와 점수 차를 반영한 Elo 레이팅을 기반으로 팀 전력을 실시간 정렬합니다. 상위권 흐름과 승률을 한눈에
              확인하세요.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link
                to="/prediction"
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '14px',
                  backgroundColor: '#f97316',
                  color: '#0f172a',
                  boxShadow: '0 14px 32px rgba(249, 115, 22, 0.25)',
                }}
              >
                승부 예측으로 이동
              </Link>
              <Link
                to="/intro"
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontWeight: 800,
                  fontSize: '14px',
                  backgroundColor: 'rgba(148, 163, 184, 0.12)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              >
                리그 소개 보기
              </Link>
            </div>
          </div>

          {topTeam && (
            <div
              style={{
                padding: '18px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                minWidth: '240px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
              }}
            >
              <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.05em', fontSize: '12px' }}>
                CURRENT #1
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                <div style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 900 }}>{topTeam.teamName}</span>
                  <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{topTeam.division} · 창단 {topTeam.founded}</span>
                </div>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    backgroundColor: topTeam.color,
                    boxShadow: '0 0 0 8px rgba(255,255,255,0.04)',
                  }}
                />
              </div>
              <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 700 }}>
                  Elo {topTeam.eloRating} · 승률 {topTeam.winRate}%
                </p>
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    borderRadius: '999px',
                    background: 'rgba(148, 163, 184, 0.25)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (topTeam.eloRating / 2000) * 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #f97316, #a855f7)',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section style={{ display: 'grid', gap: '14px' }} className="standing-chunk">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>STANDINGS TABLE</p>
        </div>
        <div style={{ overflowX: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '18px', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#e2e8f0', minWidth: '680px' }}>
            <thead>
              <tr style={{ color: '#cbd5e1', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px', textAlign: 'left' }}>순위</th>
                <th style={{ padding: '14px', textAlign: 'left' }}>팀</th>
                <th style={{ padding: '14px', textAlign: 'center' }}>경기</th>
                <th style={{ padding: '14px', textAlign: 'center' }}>승/무/패</th>
                <th style={{ padding: '14px', textAlign: 'center' }}>승률</th>
                <th style={{ padding: '14px', textAlign: 'right' }}>Elo</th>
              </tr>
            </thead>
            <tbody>
              {enrichedRankings.map((team, index) => (
                <tr key={team.teamId} style={{ borderTop: '1px solid rgba(148, 163, 184, 0.15)' }}>
                  <td style={{ padding: '14px', fontWeight: 800, color: '#cbd5e1' }}>{index + 1}</td>
                  <td style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 800 }}>
                    <span
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '999px',
                        backgroundColor: team.color,
                        boxShadow: '0 0 0 6px rgba(255,255,255,0.04)',
                      }}
                    />
                    {team.teamName}
                    <span style={{ marginLeft: '6px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>{team.division}</span>
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center', color: '#cbd5e1' }}>{team.games}</td>
                  <td style={{ padding: '14px', textAlign: 'center', color: '#cbd5e1' }}>
                    {team.wins}-{team.draws}-{team.losses}
                  </td>
                  <td style={{ padding: '14px', textAlign: 'center', color: '#22c55e', fontWeight: 800 }}>{team.winRate}%</td>
                  <td style={{ padding: '14px', textAlign: 'right', fontWeight: 900 }}>{team.eloRating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ margin: 0, color: '#94a3b8', textAlign: 'right', fontSize: '13px' }}>
          * Elo Rating은 경기 승패 및 점수 차(Margin of Victory)를 기반으로 자동 산출됩니다.
        </p>
      </section>

      <section
        className="standing-chunk"
        style={{
          display: 'grid',
          gap: '14px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          }}
        >
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.05em', fontSize: '12px' }}>평균 Elo</p>
          <p style={{ margin: '6px 0 0', fontWeight: 900, fontSize: '24px' }}>{Math.round(avgElo)}</p>
          <p style={{ margin: '6px 0 0', color: '#cbd5e1' }}>리그 전반의 전력 밸런스를 나타내는 평균 지표</p>
        </div>
        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          }}
        >
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.05em', fontSize: '12px' }}>참여 팀</p>
          <p style={{ margin: '6px 0 0', fontWeight: 900, fontSize: '24px' }}>{TEAMS.length}개</p>
          <p style={{ margin: '6px 0 0', color: '#cbd5e1' }}>서울·수도권 대학 야구팀으로 구성된 리그</p>
        </div>
        <div
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          }}
        >
          <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, letterSpacing: '0.05em', fontSize: '12px' }}>기록된 경기</p>
          <p style={{ margin: '6px 0 0', fontWeight: 900, fontSize: '24px' }}>{MATCHES.length}경기</p>
          <p style={{ margin: '6px 0 0', color: '#cbd5e1' }}>추후 백엔드 연동 시 실시간으로 누적 예정</p>
        </div>
      </section>
    </div>
  );
}
