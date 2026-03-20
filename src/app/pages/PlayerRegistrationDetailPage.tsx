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

  if (roleLoading || loading) return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>로딩 중...</div>;
  if (!post) return <div style={{ color: '#f87171', padding: '40px', textAlign: 'center' }}>게시글이 없습니다.</div>;

  if (!isPlayerOrAbove) {
    return <div style={{ color: '#f87171', padding: '40px', textAlign: 'center' }}>선수/기록원 등급 이상만 접근할 수 있습니다.</div>;
  }

  const isBlockedPost = blockedUserIds.has(post.uid);
  if (isBlockedPost) {
    return (
      <div style={{ color: '#f8fafc', maxWidth: '900px', margin: '0 auto', paddingBottom: '40px' }}>
        <div
          style={{
            borderRadius: '14px',
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(127,29,29,0.35)',
            color: '#fecaca',
            padding: '18px 20px',
            lineHeight: 1.7,
            fontWeight: 700,
          }}
        >
          차단한 사용자의 게시글입니다. 계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    background: '#1e293b',
    border: '1px solid #334155',
    color: '#fff',
    borderRadius: '8px',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', color: '#f8fafc', paddingBottom: '40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/community/player-registration')}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 700 }}
        >
          &larr; 목록으로
        </button>
        {!isEditing ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            {currentUser && currentUser.uid !== post.uid && (
              <>
                <button
                  onClick={() => void handleModerationAction('report')}
                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(59,130,246,0.2)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.5)', cursor: 'pointer' }}
                >
                  게시글 신고
                </button>
                <button
                  onClick={() => void handleModerationAction('block')}
                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.18)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.45)', cursor: 'pointer' }}
                >
                  작성자 차단
                </button>
              </>
            )}
            {canEdit && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  style={{ padding: '6px 12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  수정
                </button>
                <button
                  onClick={handleDelete}
                  style={{ padding: '6px 12px', borderRadius: '6px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}
                >
                  삭제
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <article
        style={{
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '32px',
        }}
      >
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as PlayerRegistrationCategory)}
              style={{ ...inputStyle, fontWeight: 700, cursor: 'pointer' }}
            >
              {editableCategories.map((c) => (
                <option key={c} value={c} style={{ background: '#1e293b' }}>
                  {c}
                </option>
              ))}
            </select>
            <input
              style={{ ...inputStyle, fontSize: '18px', fontWeight: 700 }}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <RichTextEditor value={editContent} onChange={setEditContent} minHeight={260} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setIsEditing(false)}
                style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                onClick={handleUpdate}
                style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
              >
                저장하기
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '12px',
                  padding: '3px 9px',
                  borderRadius: '5px',
                  fontWeight: 800,
                  background: getCategoryColor(post.category),
                  color: '#0f172a',
                }}
              >
                {post.category}
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900, lineHeight: 1.3 }}>{post.title}</h1>
            <div style={{ color: '#94a3b8', marginTop: '10px', marginBottom: '20px' }}>
              {post.author} · {new Date(post.createdAt).toLocaleString()}
            </div>
            <RichTextViewer content={post.content} />
          </>
        )}
      </article>
    </div>
  );
}

function getCategoryColor(category: PlayerRegistrationCategory) {
  switch (category) {
    case '선수 등록':
      return '#f87171';
    case '유니폼 등록':
      return '#34d399';
    default:
      return '#94a3b8';
  }
}
