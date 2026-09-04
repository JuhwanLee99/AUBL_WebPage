import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { auth, firestore } from '../../shared/firebase/client';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import type { PlayerRegistrationCategory } from '../../shared/types';
import './PlayerRegistrationPages.css';

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
      <div className="player-registration-page player-registration-access-page">
        <header className="player-registration-header">
          <span className="player-registration-kicker">PLAYER REGISTRATION</span>
          <h1>선수 등록 게시판</h1>
        </header>
        <div className="player-registration-feedback player-registration-feedback--error" role="alert">
          현재 계정은 글쓰기 권한이 없습니다. `선수 등록`: 관리자만, `유니폼 등록`: 감독/관리자
        </div>
      </div>
    );
  }

  return (
    <div className="season-content-page board-write-page player-registration-page player-registration-write">
      <header className="player-registration-header">
        <span className="player-registration-kicker">NEW REQUEST</span>
        <h1>선수 등록 게시글 작성</h1>
        <p>권한이 부여된 분류를 선택해 등록 요청을 작성합니다.</p>
      </header>

      <form onSubmit={handleSubmit} className="player-registration-form">
        <div className="player-registration-field">
          <label htmlFor="player-registration-category">분류</label>
          <select
            id="player-registration-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as PlayerRegistrationCategory)}
          >
            {writableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="player-registration-field">
          <label htmlFor="player-registration-title">제목</label>
          <input
            id="player-registration-title"
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="player-registration-field">
          <label>내용</label>
          <div className="player-registration-editor">
            <RichTextEditor value={content} onChange={setContent} placeholder="내용을 입력하세요" minHeight={280} />
          </div>
        </div>

        <div className="player-registration-form__actions">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="player-registration-action"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || isDeltaEmpty(content) || !canWriteSelected}
            className="player-registration-action player-registration-action--primary"
          >
            {submitting ? '저장 중...' : '작성 완료'}
          </button>
        </div>
      </form>
    </div>
  );
}
