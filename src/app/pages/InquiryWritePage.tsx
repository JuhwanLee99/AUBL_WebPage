import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import type { InquiryPlatform, InquiryCategory } from '../../shared/types';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import './CommunityPages.css';

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

  return (
    <div className="season-content-page community-ui community-inquiry-write">
      <header className="community-page-header">
        <div className="community-page-header__copy">
          <p className="community-eyebrow">AUBL SUPPORT</p>
          <h1>건의/문의 작성</h1>
          <p className="community-page-header__description">문의 대상을 선택하고 필요한 내용을 자세히 남겨주세요.</p>
        </div>
      </header>

      <div className="community-info-note">
        이미지/동영상은 툴바의 📷 / 🎬 버튼으로 URL을 입력하여 삽입할 수 있습니다.<br />
        스크린샷 등 파일 첨부가 필요한 경우, 게시글 등록 후 <strong>aublcau@gmail.com</strong>으로 전송해 주세요.
      </div>

      <form onSubmit={handleSubmit} className="community-notice-form community-inquiry-form">

        {/* 플랫폼 선택 */}
        <fieldset className="community-field community-fieldset">
          <legend>플랫폼</legend>
          <div className="community-segmented community-segmented--form">
            {(['app', 'web'] as InquiryPlatform[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={platform === p ? 'is-active' : undefined}
                aria-pressed={platform === p}
              >
                {p === 'app' ? '앱' : '웹'}
              </button>
            ))}
          </div>
        </fieldset>

        {/* 말머리 */}
        <label className="community-field">
          <span>분류</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InquiryCategory)}
            className="community-input community-select"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        {/* 제목 */}
        <label className="community-field">
          <span>제목</span>
          <input
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="community-input community-title-input"
            maxLength={100}
          />
        </label>

        {/* 본문 */}
        <div className="community-field">
          <span>내용</span>
          <div className="community-editor">
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="내용을 입력하세요"
              minHeight={280}
            />
          </div>
        </div>

        {/* 비밀글 */}
        <label className="community-check-field">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <span>
            비밀글 (작성자와 관리자만 내용을 볼 수 있습니다)
          </span>
        </label>

        {/* 버튼 */}
        <div className="community-form-actions">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="community-action community-action--quiet"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !content.trim()}
            className="community-action community-action--primary"
          >
            {submitting ? '저장 중...' : '작성 완료'}
          </button>
        </div>
      </form>
    </div>
  );
}
