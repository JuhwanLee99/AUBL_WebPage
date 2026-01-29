// src/app/pages/CommunityPage.tsx
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import type { Notice } from '../../shared/types';

// 스타일 상수
const cardStyle = {
  background: 'rgba(15, 23, 42, 0.6)',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  borderRadius: '18px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '16px',
  height: '100%',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
};

const titleStyle = {
  fontSize: '20px',
  fontWeight: 900,
  color: '#f8fafc',
  margin: 0,
};

const linkStyle = {
  textDecoration: 'none',
  color: '#60a5fa',
  fontWeight: 700,
  fontSize: '14px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};

export default function CommunityPage() {
  const [recentNotices, setRecentNotices] = useState<Notice[]>([]);

  useEffect(() => {
    // 최근 공지사항 5개만 가져오기
    const fetchRecent = async () => {
      try {
        const q = query(collection(firestore, 'notices'), orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice));
        setRecentNotices(list);
      } catch (err) {
        console.error('Failed to fetch recent notices', err);
      }
    };
    void fetchRecent();
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', minHeight: '60vh' }}>
      
      {/* 왼쪽: AUBL 갤러리 미리보기 */}
      <section style={cardStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>⚾ AUBL 갤러리</h2>
          <Link to="gallery" style={linkStyle}>
            전체보기 &rarr;
          </Link>
        </div>
        <div style={{ flex: 1, background: '#fff', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
          {/* iframe 클릭 방지 및 미리보기용 오버레이 */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'transparent' }} />
          <iframe
            title="Gallery Preview"
            src="https://gall.dcinside.com/mgallery/board/lists/?id=aubl"
            style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none', opacity: 0.7 }}
            tabIndex={-1}
          />
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            background: 'rgba(15, 23, 42, 0.9)',
            padding: '10px 20px',
            borderRadius: '20px',
            color: '#fff',
            fontWeight: 700,
            fontSize: '14px',
            whiteSpace: 'nowrap'
          }}>
            <Link to="gallery" style={{ color: 'inherit', textDecoration: 'none' }}>갤러리 입장하기</Link>
          </div>
        </div>
      </section>

      {/* 오른쪽: 공지사항 미리보기 */}
      <section style={cardStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>📢 공지사항</h2>
          <Link to="notices" style={linkStyle}>
            더보기 &rarr;
          </Link>
        </div>
        <div style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
          {recentNotices.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>등록된 공지사항이 없습니다.</p>
          ) : (
            recentNotices.map(notice => (
              <Link 
                key={notice.id} 
                to={`notices/${notice.id}`}
                style={{ 
                  textDecoration: 'none',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'background 0.2s'
                }}
              >
                <span style={{ 
                  fontSize: '12px', 
                  padding: '2px 6px', 
                  borderRadius: '4px', 
                  fontWeight: 800,
                  background: getCategoryColor(notice.category),
                  color: '#0f172a'
                }}>
                  {notice.category}
                </span>
                <span style={{ color: '#e2e8f0', fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {notice.title}
                </span>
                <span style={{ color: '#64748b', fontSize: '12px' }}>
                  {new Date(notice.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function getCategoryColor(category: string) {
  switch(category) {
    case '긴급': return '#f87171';
    case '징계': return '#fb923c';
    case '경기공지': return '#60a5fa';
    default: return '#94a3b8';
  }
}