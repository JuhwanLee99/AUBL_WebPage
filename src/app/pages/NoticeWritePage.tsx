// src/app/pages/NoticeWritePage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import type { NoticeCategory } from '../../shared/types';

const CATEGORIES: NoticeCategory[] = ['일반', '경기공지', '징계', '긴급'];

export default function NoticeWritePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NoticeCategory>('일반');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    
    setSubmitting(true);
    try {
      await addDoc(collection(firestore, 'notices'), {
        title,
        category,
        content,
        author: auth.currentUser?.email ?? 'Admin',
        createdAt: Date.now(),
      });
      navigate('/community/notices');
    } catch (err) {
      alert('저장 실패: ' + err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', color: '#f8fafc' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>공지사항 작성</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
        
        {/* 카테고리 선택 */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700 }}>분류</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid ' + (category === cat ? '#3b82f6' : 'rgba(148,163,184,0.3)'),
                  background: category === cat ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: category === cat ? '#60a5fa' : '#94a3b8',
                  cursor: 'pointer',
                  fontWeight: 700
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700 }}>제목</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(15,23,42,0.6)',
              border: '1px solid rgba(148,163,184,0.3)',
              color: '#fff'
            }}
            placeholder="제목을 입력하세요"
          />
        </div>

        {/* 내용 */}
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700 }}>내용</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            style={{
              width: '100%',
              minHeight: '300px',
              padding: '12px',
              borderRadius: '8px',
              background: 'rgba(15,23,42,0.6)',
              border: '1px solid rgba(148,163,184,0.3)',
              color: '#fff',
              lineHeight: 1.6
            }}
            placeholder="내용을 입력하세요"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1
            }}
          >
            {submitting ? '저장 중...' : '등록하기'}
          </button>
        </div>
      </form>
    </div>
  );
}