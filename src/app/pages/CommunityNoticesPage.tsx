// src/app/pages/CommunityNoticesPage.tsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import type { Notice } from '../../shared/types';

export default function CommunityNoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchNotices = async () => {
      const q = query(collection(firestore, 'notices'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice)));
    };
    void fetchNotices();
  }, []);

  return (
    <div style={{ color: '#f8fafc', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900 }}>📢 공지사항</h2>
        {isAdmin && (
          <button
            onClick={() => navigate('new')}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            글쓰기
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        {notices.map(notice => (
          <div 
            key={notice.id}
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
              borderRadius: '12px',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{
                fontSize: '12px',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 800,
                background: getCategoryColor(notice.category),
                color: '#0f172a'
              }}>
                {notice.category}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                {new Date(notice.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>{notice.title}</h3>
            <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {notice.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getCategoryColor(category: string) {
  // (위와 동일한 컬러 로직)
  switch(category) {
    case '긴급': return '#f87171';
    case '징계': return '#fb923c';
    case '경기공지': return '#60a5fa';
    default: return '#94a3b8';
  }
}