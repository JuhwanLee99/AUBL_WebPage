import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, firestore } from '../../shared/firebase/client';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import RichTextViewer from '../../shared/components/editor/RichTextViewer';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import { useCommunityAccess } from '../../shared/auth/useCommunityAccess';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import {
  blockUserAndReport,
  buildContentPreview,
  currentUserLabel,
  promptModerationReason,
  reportContent,
} from '../../shared/moderation/moderationService';
import type {
  ModerationReportPayload,
  PlayerRegistrationCategory,
  PlayerRegistrationPost,
} from '../../shared/types';
import './PlayerRegistrationPages.css';

export default function PlayerRegistrationDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const {
    loading: roleLoading,
    isAdmin,
    isPlayerOrAbove,
    canWritePlayerRegistration,
    canWriteUniformRegistration,
  } = useCommunityAccess();

  const [post, setPost] = useState<PlayerRegistrationPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<PlayerRegistrationCategory>('유니폼 등록');
  const { blockedUserIds } = useBlockedUserIds();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!postId) return;
    const fetchPost = async () => {
      try {
        const ref = doc(firestore, 'playerRegistrationPosts', postId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as PlayerRegistrationPost;
          const loaded = { ...data, id: snap.id };
          setPost(loaded);
          setEditTitle(data.title);
          setEditContent(data.content);
          setEditCategory(data.category);
        }
      } catch (err) {
        console.error('선수 등록 게시글 로딩 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchPost();
  }, [postId]);

  const editableCategories = useMemo(() => {
    const categories: PlayerRegistrationCategory[] = [];
    if (canWritePlayerRegistration) categories.push('선수 등록');
    if (canWriteUniformRegistration) categories.push('유니폼 등록');
    return categories;
  }, [canWritePlayerRegistration, canWriteUniformRegistration]);

  const canWriteCategory = (category: PlayerRegistrationCategory) =>
    category === '선수 등록' ? canWritePlayerRegistration : canWriteUniformRegistration;

  const canEdit = !!post && !!currentUser && (isAdmin || (currentUser.uid === post.uid && canWriteCategory(post.category)));

  const handleDelete = async () => {
    if (!post || !window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(firestore, 'playerRegistrationPosts', post.id));
      navigate('/community/player-registration');
    } catch (err) {
      alert('삭제 실패: ' + String(err));
    }
  };

  const handleUpdate = async () => {
    if (!post || !editTitle.trim() || isDeltaEmpty(editContent)) return;
    if (!canWriteCategory(editCategory)) {
      alert('선택한 분류를 수정할 권한이 없습니다.');
      return;
    }
    try {
      await updateDoc(doc(firestore, 'playerRegistrationPosts', post.id), {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
        updatedAt: Date.now(),
      });
      setPost((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim(),
              content: editContent.trim(),
              category: editCategory,
              updatedAt: Date.now(),
            }
          : null,
      );
      setIsEditing(false);
    } catch (err) {
      alert('수정 실패: ' + String(err));
    }
  };

  const handleModerationAction = async (action: 'report' | 'block') => {
    if (!post || !currentUser) {
      window.alert('로그인 후 신고/차단할 수 있습니다.');
      return;
    }
    if (post.uid === currentUser.uid) {
      window.alert('본인 계정은 신고하거나 차단할 수 없습니다.');
      return;
    }
    if (action === 'block' && !post.uid) {
      window.alert('작성자 정보가 없어 차단할 수 없습니다.');
      return;
    }

    const reason = await promptModerationReason(action === 'block' ? '차단' : '신고');
    if (!reason) return;

    const payload: ModerationReportPayload = {
      action,
      reasonType: reason.reasonCode,
      reasonDetail: reason.detail,
      targetUid: post.uid,
      targetLabel: post.author || post.uid || '알 수 없는 사용자',
      contentDomain: 'playerRegistrationPost',
      contentId: post.id,
      contentPreview: buildContentPreview(`${post.title}\n${post.content}`),
    };

    try {
      if (action === 'block') {
        await blockUserAndReport(currentUser.uid, currentUserLabel(currentUser), payload);
        window.alert('사용자를 차단하고 운영팀에 신고했습니다.');
      } else {
        await reportContent(currentUser.uid, currentUserLabel(currentUser), payload);
        window.alert('신고가 접수되었습니다. 운영팀이 확인 후 조치합니다.');
      }
    } catch (error) {
      window.alert(`신고 처리 중 오류가 발생했습니다: ${String(error)}`);
    }
  };

  if (roleLoading || loading) return <div className="player-registration-state">로딩 중...</div>;
  if (!post) return <div className="player-registration-state player-registration-state--error">게시글이 없습니다.</div>;

  if (!isPlayerOrAbove) {
    return <div className="player-registration-state player-registration-state--error">선수/기록원 등급 이상만 접근할 수 있습니다.</div>;
  }

  const isBlockedPost = blockedUserIds.has(post.uid);
  if (isBlockedPost) {
    return (
      <div className="player-registration-page player-registration-access-page">
        <div className="player-registration-feedback player-registration-feedback--error" role="alert">
          차단한 사용자의 게시글입니다. 계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="season-content-page detail-board-page player-registration-page player-registration-detail">
      <div className="player-registration-detail__toolbar">
        <button
          type="button"
          onClick={() => navigate('/community/player-registration')}
          className="player-registration-action player-registration-action--text"
        >
          &larr; 목록으로
        </button>
        {!isEditing ? (
          <div className="player-registration-detail__actions">
            {currentUser && currentUser.uid !== post.uid && (
              <>
                <button
                  type="button"
                  onClick={() => void handleModerationAction('report')}
                  className="player-registration-action"
                >
                  게시글 신고
                </button>
                <button
                  type="button"
                  onClick={() => void handleModerationAction('block')}
                  className="player-registration-action player-registration-action--danger"
                >
                  작성자 차단
                </button>
              </>
            )}
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="player-registration-action player-registration-action--primary"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="player-registration-action player-registration-action--danger"
                >
                  삭제
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <article className="player-registration-detail__article">
        {isEditing ? (
          <div className="player-registration-form">
            <div className="player-registration-field">
              <label htmlFor="player-registration-edit-category">분류</label>
              <select
                id="player-registration-edit-category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as PlayerRegistrationCategory)}
              >
                {editableCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="player-registration-field">
              <label htmlFor="player-registration-edit-title">제목</label>
              <input
                id="player-registration-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="player-registration-field">
              <label>내용</label>
              <div className="player-registration-editor">
                <RichTextEditor value={editContent} onChange={setEditContent} minHeight={260} />
              </div>
            </div>
            <div className="player-registration-form__actions player-registration-form__actions--end">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="player-registration-action"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                className="player-registration-action player-registration-action--primary"
              >
                저장하기
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="player-registration-detail__heading">
              <span className="player-registration-category">{post.category}</span>
              <h1>{post.title}</h1>
              <div className="player-registration-detail__meta">
                {post.author} · {new Date(post.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="player-registration-rich-text">
              <RichTextViewer content={post.content} />
            </div>
          </>
        )}
      </article>
    </div>
  );
}
