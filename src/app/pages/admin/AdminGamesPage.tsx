import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { firestore } from '../../../shared/firebase/client';
import type { MatchSchedule } from '../../../shared/state/demoStore';

const cardStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(148,163,184,0.28)',
  background: 'linear-gradient(135deg, rgba(15,23,42,0.78), rgba(30,41,59,0.78))',
  padding: '20px',
  boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 2fr 80px 90px',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: '10px',
  border: '1px solid rgba(148,163,184,0.15)',
  background: 'rgba(15,23,42,0.45)',
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const labelBadge = (status: string): CSSProperties => ({
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 800,
  background: status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.15)',
  color: status === 'completed' ? '#4ade80' : '#94a3b8',
  border: `1px solid ${status === 'completed' ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.3)'}`,
});

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

export default function AdminGamesPage() {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const q = query(
          collection(firestore, 'matches'),
          where('status', 'in', ['completed', 'canceled']),
        );
        const snap = await getDocs(q);
        const loaded = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MatchSchedule, 'id'>) }))
          .sort((a, b) => (b.startTime > a.startTime ? 1 : -1));
        setMatches(loaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : '경기 목록을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) {
    return <div style={{ color: '#94a3b8', padding: '20px' }}>불러오는 중...</div>;
  }

  if (error) {
    return (
      <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}>
        오류: {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={cardStyle}>
        <h3 style={{ margin: '0 0 4px', color: '#e2e8f0' }}>완료된 경기 목록</h3>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '13px' }}>
          경기를 클릭하면 라인업 · 박스스코어를 수정할 수 있습니다.
        </p>

        {matches.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: '14px', padding: '20px 0' }}>
            완료된 경기가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {/* 헤더 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 2fr 80px 90px',
                gap: '12px',
                padding: '6px 16px',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 800,
              }}
            >
              <span>날짜</span>
              <span>경기</span>
              <span>스코어</span>
              <span>상태</span>
            </div>

            {matches.map((match) => (
              <div
                key={match.id}
                style={rowStyle}
                onClick={() => navigate(`/admin/games/${match.id}`)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(96,165,250,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(15,23,42,0.45)';
                }}
              >
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                  {formatDate(match.startTime)}
                </span>
                <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '14px' }}>
                  {match.awayTeamName} @ {match.homeTeamName}
                </span>
                <span style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 800 }}>
                  {match.awayScore ?? '-'} : {match.homeScore ?? '-'}
                </span>
                <span style={labelBadge(match.status)}>
                  {match.status === 'completed' ? '완료' : '취소'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
