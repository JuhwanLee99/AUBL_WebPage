// src/app/pages/NoticeDetailPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import type { Notice } from '../../shared/types';

export default function NoticeDetailPage() {
  const { noticeId } = useParams();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!noticeId) return;
    const fetchNotice = async () => {
      try {
        const ref = doc(firestore, 'notices', noticeId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setNotice({ id: snap.id, ...snap.data() } as Notice);
        }
      } catch (err) {
        console.error('공지사항 로딩 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchNotice();
  }, [noticeId]);

  if (loading) return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>로딩 중...</div>;
  if (!notice) return <div style={{ color: '#f87171', padding: '40px', textAlign: 'center' }}>삭제되거나 존재하지 않는 공지사항입니다.</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', color: '#f8fafc', paddingBottom: '40px' }}>
      <button
        onClick={() => navigate('/community/notices')}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          marginBottom: '16px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        &larr; 목록으로 돌아가기
      </button>

      <article
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{
            fontSize: '13px',
            padding: '3px 10px',
            borderRadius: '6px',
            fontWeight: 800,
            background: getCategoryColor(notice.category),
            color: '#0f172a'
          }}>
            {notice.category}
          </span>
          <span style={{ color: '#94a3b8', fontSize: '14px' }}>
            {new Date(notice.createdAt).toLocaleDateString()} · {notice.author}
          </span>
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 24px 0', lineHeight: 1.3 }}>
          {notice.title}
        </h1>

        <div style={{ 
          color: '#e2e8f0', 
          lineHeight: 1.8, 
          fontSize: '16px', 
          whiteSpace: 'pre-wrap', 
          borderTop: '1px solid rgba(148,163,184,0.1)',
          paddingTop: '24px'
        }}>
          {notice.content}
        </div>
      </article>
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