import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import type { NoticeCategory } from '../../shared/types';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import './CommunityPages.css';
// sendFCMNotification 등 필요한 import 유지

const CATEGORIES: NoticeCategory[] = ['일반', '심판/기록원 모집', '경기공지', '징계', '긴급'];

export default function NoticeWritePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NoticeCategory>('일반');
  const [content, setContent] = useState('');
  const [allowComments, setAllowComments] = useState(true); // [추가] 기본값 true
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isDeltaEmpty(content)) return;
    
    setSubmitting(true);
    try {
      await addDoc(collection(firestore, 'notices'), {
        title,
        category,
        content,
        uid: auth.currentUser?.uid ?? '',
        authorUid: auth.currentUser?.uid ?? '',
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
    <div className="season-content-page community-ui community-notice-write">
      <header className="community-page-header">
        <div className="community-page-header__copy">
          <p className="community-eyebrow">LEAGUE NOTICE</p>
          <h1>공지사항 작성</h1>
          <p className="community-page-header__description">경기 운영과 리그 이용에 필요한 안내를 작성합니다.</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="community-notice-form">
        {/* 카테고리 선택 */}
        <fieldset className="community-field community-fieldset">
          <legend>카테고리</legend>
          <div className="community-category-options">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={category === cat ? 'is-active' : undefined}
                aria-pressed={category === cat}
              >
                {cat}
              </button>
            ))}
          </div>
        </fieldset>

        {/* 제목 입력 */}
        <label className="community-field">
          <span>제목</span>
          <input
            placeholder="제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="community-input community-title-input"
          />
        </label>

        {/* 본문 입력 */}
        <div className="community-field">
          <span>본문</span>
          <div className="community-editor">
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="내용을 입력하세요"
              minHeight={300}
            />
          </div>
        </div>
        <p className="community-form-help">
          이미지/동영상은 툴바의 📷 / 🎬 버튼으로 URL을 입력하여 삽입할 수 있습니다.
        </p>

        {/* [추가] 댓글 허용 옵션 */}
        <label className="community-check-field">
          <input
            type="checkbox"
            checked={allowComments}
            onChange={(e) => setAllowComments(e.target.checked)}
          />
          <span>댓글 허용</span>
        </label>

        {/* 버튼 그룹 */}
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
            disabled={submitting}
            className="community-action community-action--primary"
          >
            {submitting ? '저장 중...' : '작성 완료'}
          </button>
        </div>
      </form>
    </div>
  );
}
