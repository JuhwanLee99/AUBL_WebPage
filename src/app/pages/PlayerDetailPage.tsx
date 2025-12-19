import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { TEAMS } from '../../shared/lib/mockData';

export default function PlayerDetailPage() {
  const { name } = useParams<{ name: string }>();
  const displayName = decodeURIComponent(name ?? '알 수 없음');
  const team = useMemo(() => {
    return TEAMS[(displayName.charCodeAt(0) || 0) % TEAMS.length];
  }, [displayName]);

  return (
    <div
      style={{
        padding: '20px',
        borderRadius: '18px',
        background: 'linear-gradient(135deg, #0f172a 0%, #0b1220 100%)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        color: '#e2e8f0',
        boxShadow: '0 24px 60px rgba(0,0,0,0.36)',
        display: 'grid',
        gap: '12px',
      }}
    >
      <Link to={-1 as unknown as string} style={{ color: '#94a3b8', fontWeight: 700, textDecoration: 'underline' }}>
        ← 돌아가기
      </Link>
      <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>{displayName}</h1>
      <div
        style={{
          display: 'grid',
          gap: '10px',
          padding: '14px',
          borderRadius: '14px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <span style={{ fontWeight: 800, color: '#cbd5e1' }}>팀</span>
        <span style={{ fontWeight: 800 }}>{team.name}</span>
        <span style={{ color: '#94a3b8' }}>모의 상세 페이지 · 추후 실제 기록/스카우팅 리포트 연동</span>
      </div>
    </div>
  );
}
