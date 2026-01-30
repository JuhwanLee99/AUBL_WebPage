// src/app/pages/NoticeDetailPage.tsx 수정본
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore'; // updateDoc, deleteDoc 추가
import { firestore } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin'; // 관리자 확인 훅 추가
import type { Notice } from '../../shared/types';

export default function NoticeDetailPage() {
  const { noticeId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin(); // 관리자 권한 확인
  
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false); // 수정 모드 상태
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    if (!noticeId) return;
    const fetchNotice = async () => {
      try {
        const ref = doc(firestore, 'notices', noticeId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as Notice;
          setNotice({ ...snap.data(), id: snap.id } as Notice);
          setEditTitle(data.title);
          setEditContent(data.content);
        }
      } catch (err) {
        console.error('공지사항 로딩 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchNotice();
  }, [noticeId]);

  // 삭제 함수
  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(firestore, 'notices', noticeId!));
      alert('삭제되었습니다.');
      navigate('/community/notices');
    } catch (err) {
      alert('삭제 실패: ' + err);
    }
  };

  // 수정 저장 함수
  const handleUpdate = async () => {
    try {
      const ref = doc(firestore, 'notices', noticeId!);
      await updateDoc(ref, {
        title: editTitle,
        content: editContent,
        updatedAt: Date.now() // 수정일시 기록
      });
      setNotice(prev => prev ? { ...prev, title: editTitle, content: editContent } : null);
      setIsEditing(false);
      alert('수정되었습니다.');
    } catch (err) {
      alert('수정 실패: ' + err);
    }
  };

  if (loading) return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>로딩 중...</div>;
  if (!notice) return <div style={{ color: '#f87171', padding: '40px', textAlign: 'center' }}>삭제되거나 존재하지 않는 공지사항입니다.</div>;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', color: '#f8fafc', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/community/notices')}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          &larr; 목록으로 돌아가기
        </button>

        {/* 관리자에게만 보이는 제어 버튼 */}
        {isAdmin && !isEditing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setIsEditing(true)} style={{ padding: '6px 12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>수정</button>
            <button onClick={handleDelete} style={{ padding: '6px 12px', borderRadius: '6px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '14px' }}>삭제</button>
          </div>
        )}
      </div>

      <article style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
        {isEditing ? (
          /* 수정 모드 UI */
          <div style={{ display: 'grid', gap: '16px' }}>
            <input 
              style={{ width: '100%', padding: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', fontSize: '20px', fontWeight: 700 }}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <textarea 
              style={{ width: '100%', minHeight: '300px', padding: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', lineHeight: 1.6 }}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setIsEditing(false)} style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>취소</button>
              <button onClick={handleUpdate} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>저장하기</button>
            </div>
          </div>
        ) : (
          /* 보기 모드 UI */
          <>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', padding: '3px 10px', borderRadius: '6px', fontWeight: 800, background: getCategoryColor(notice.category), color: '#0f172a' }}>
                {notice.category}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>
                {new Date(notice.createdAt).toLocaleDateString()} · {notice.author}
              </span>
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 24px 0', lineHeight: 1.3 }}>{notice.title}</h1>
            <div style={{ color: '#e2e8f0', lineHeight: 1.8, fontSize: '16px', whiteSpace: 'pre-wrap', borderTop: '1px solid rgba(148,163,184,0.1)', paddingTop: '24px' }}>
              {notice.content}
            </div>
          </>
        )}
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