import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import type { NoticeCategory } from '../../shared/types';
// sendFCMNotification 등 필요한 import 유지

const CATEGORIES: NoticeCategory[] = ['일반', '경기공지', '징계', '긴급'];

export default function NoticeWritePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NoticeCategory>('일반');
  const [content, setContent] = useState('');
  const [allowComments, setAllowComments] = useState(true); // [추가] 기본값 true
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
        author: auth.currentUser?.email?.split('@')[0] ?? 'Admin', // 이메일 ID 사용
        createdAt: Date.now(),
        allowComments, // [추가] 저장 시 포함
      });

      // (알림 전송 로직이 있다면 여기에 유지)

      navigate('/community/notices');
    } catch (err) {
      alert('저장 실패: ' + err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', color: '#f8fafc', padding: '20px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>공지사항 작성</h2>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 카테고리 선택 */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                background: category === cat ? '#3b82f6' : '#334155',
                color: '#fff',
                fontWeight: category === cat ? 700 : 400,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 제목 입력 */}
        <input
          placeholder="제목을 입력하세요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            padding: '14px',
            borderRadius: '8px',
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 700
          }}
        />

        {/* 본문 입력 */}
        <textarea
          placeholder="내용을 입력하세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            minHeight: '300px',
            padding: '14px',
            borderRadius: '8px',
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#fff',
            fontSize: '15px',
            lineHeight: 1.6,
            resize: 'vertical'
          }}
        />

        {/* [추가] 댓글 허용 옵션 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={allowComments}
            onChange={(e) => setAllowComments(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
          />
          <span style={{ color: '#cbd5e1', fontSize: '15px' }}>댓글 허용</span>
        </label>

        {/* 버튼 그룹 */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: '8px',
              background: '#334155',
              color: '#94a3b8',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: '8px',
              background: submitting ? '#94a3b8' : '#3b82f6',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer'
            }}
          >
            {submitting ? '저장 중...' : '작성 완료'}
          </button>
        </div>
      </form>
    </div>
  );
}