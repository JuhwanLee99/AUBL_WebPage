import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { auth, firestore } from '../../shared/firebase/client';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import type { PlayerRegistrationCategory } from '../../shared/types';

export default function PlayerRegistrationWritePage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PlayerRegistrationCategory>('선수 등록');
  const [submitting, setSubmitting] = useState(false);
  const {
    loading: roleLoading,
    canWritePlayerRegistration,
    canWriteUniformRegistration,
    isPlayerOrAbove,
  } = useCommunityAccess();

  const writableCategories = useMemo(() => {
    const categories: PlayerRegistrationCategory[] = [];
    if (canWritePlayerRegistration) categories.push('선수 등록');
    if (canWriteUniformRegistration) categories.push('유니폼 등록');
    return categories;
  }, [canWritePlayerRegistration, canWriteUniformRegistration]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (!user) navigate('/login');
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (writableCategories.length === 0) return;
    if (!writableCategories.includes(category)) setCategory(writableCategories[0]);
  }, [category, writableCategories]);

  const canWriteSelected =
    category === '선수 등록' ? canWritePlayerRegistration : canWriteUniformRegistration;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isDeltaEmpty(content) || !canWriteSelected) return;
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(firestore, 'playerRegistrationPosts'), {
        title: title.trim(),
        content: content.trim(),
        author: currentUser.displayName || currentUser.email?.split('@')[0] || '익명',
        uid: currentUser.uid,
        category,
        createdAt: Date.now(),
      });
      navigate('/community/player-registration');
    } catch (err) {
      alert('저장 실패: ' + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (roleLoading || !currentUser) return null;

  if (!isPlayerOrAbove || writableCategories.length === 0) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', color: '#f8fafc', padding: '20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '16px' }}>🧢 선수 등록 게시판</h2>
        <div
          style={{
            borderRadius: '12px',
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(127,29,29,0.35)',
            color: '#fecaca',
            padding: '16px',
            lineHeight: 1.6,
            fontWeight: 700,
          }}
        >
          현재 계정은 글쓰기 권한이 없습니다. `선수 등록`: 관리자만, `유니폼 등록`: 감독/관리자
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    padding: '14px',
    borderRadius: '8px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#fff',
    fontSize: '15px',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', color: '#f8fafc', padding: '20px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>🧢 선수 등록 게시글 작성</h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            분류
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PlayerRegistrationCategory)}
            style={{
              ...inputStyle,
              fontWeight: 700,
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%2394a3b8' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 14px center',
              paddingRight: '36px',
            }}
          >
            {writableCategories.map((cat) => (
              <option key={cat} value={cat} style={{ background: '#1e293b' }}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            제목
          </label>
          <input
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ ...inputStyle, fontWeight: 700 }}
            maxLength={100}
          />
        </div>

        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            내용
          </label>
          <RichTextEditor value={content} onChange={setContent} placeholder="내용을 입력하세요" minHeight={280} />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              flex: 1,
              padding: '13px',
              borderRadius: '8px',
              background: '#334155',
              color: '#94a3b8',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || isDeltaEmpty(content) || !canWriteSelected}
            style={{
              flex: 2,
              padding: '13px',
              borderRadius: '8px',
              background: submitting || !title.trim() || isDeltaEmpty(content) || !canWriteSelected ? '#334155' : '#3b82f6',
              color: submitting || !title.trim() || isDeltaEmpty(content) || !canWriteSelected ? '#64748b' : '#fff',
              border: 'none',
              fontWeight: 700,
              cursor:
                submitting || !title.trim() || isDeltaEmpty(content) || !canWriteSelected ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '저장 중...' : '작성 완료'}
          </button>
        </div>
      </form>
    </div>
  );
}
