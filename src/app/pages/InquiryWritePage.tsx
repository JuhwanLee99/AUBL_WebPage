import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import type { InquiryPlatform, InquiryCategory } from '../../shared/types';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';

const CATEGORIES: InquiryCategory[] = ['기능 개선', '버그 신고', '사용 문의', '경기/기록 오류', '기타'];

export default function InquiryWritePage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState<InquiryPlatform>('web');
  const [category, setCategory] = useState<InquiryCategory>('기능 개선');
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (!user) navigate('/login');
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isDeltaEmpty(content)) return;
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      navigate('/login');
      return;
    }

    setSubmitting(true);
    try {
      await addDoc(collection(firestore, 'inquiries'), {
        title: title.trim(),
        content: content.trim(),
        author: currentUser.displayName || currentUser.email?.split('@')[0] || '익명',
        uid: currentUser.uid,
        platform,
        category,
        isPrivate,
        status: '미처리',
        createdAt: Date.now(),
      });
      navigate('/community/inquiry');
    } catch (err) {
      alert('저장 실패: ' + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) return null;

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
      <h2 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '24px' }}>💬 건의/문의 작성</h2>

      <div
        style={{
          marginBottom: '16px',
          padding: '12px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(59,130,246,0.35)',
          background: 'rgba(59,130,246,0.12)',
          color: '#bfdbfe',
          fontSize: '13px',
          lineHeight: 1.7,
          fontWeight: 600,
        }}
      >
        이미지/동영상은 툴바의 📷 / 🎬 버튼으로 URL을 입력하여 삽입할 수 있습니다.<br />
        스크린샷 등 파일 첨부가 필요한 경우, 게시글 등록 후 <strong>aublcau@gmail.com</strong>으로 전송해 주세요.
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* 플랫폼 선택 */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            플랫폼
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['app', 'web'] as InquiryPlatform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '20px',
                  border: 'none',
                  background: platform === p
                    ? (p === 'app' ? '#818cf8' : '#34d399')
                    : '#334155',
                  color: platform === p ? '#0f172a' : '#94a3b8',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {p === 'app' ? '앱' : '웹'}
              </button>
            ))}
          </div>
        </div>

        {/* 말머리 */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            분류
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InquiryCategory)}
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
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat} style={{ background: '#1e293b' }}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* 제목 */}
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

        {/* 본문 */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
            내용
          </label>
          <RichTextEditor
            value={content}
            onChange={setContent}
            placeholder="내용을 입력하세요"
            minHeight={280}
          />
        </div>

        {/* 비밀글 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
          />
          <span style={{ color: '#cbd5e1', fontSize: '15px' }}>
            🔒 비밀글 (작성자와 관리자만 내용을 볼 수 있습니다)
          </span>
        </label>

        {/* 버튼 */}
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
            disabled={submitting || !title.trim() || !content.trim()}
            style={{
              flex: 2,
              padding: '13px',
              borderRadius: '8px',
              background: submitting || !title.trim() || !content.trim() ? '#334155' : '#3b82f6',
              color: submitting || !title.trim() || !content.trim() ? '#64748b' : '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: submitting || !title.trim() || !content.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '저장 중...' : '작성 완료'}
          </button>
        </div>
      </form>
    </div>
  );
}
