import { useEffect, useState } from 'react';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import RichTextViewer from '../../shared/components/editor/RichTextViewer';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import {
  blockUserAndReport,
  buildContentPreview,
  currentUserLabel,
  promptModerationReason,
  reportContent,
} from '../../shared/moderation/moderationService';
import type { InquiryPost, InquiryComment, InquiryPlatform, InquiryCategory, InquiryStatus } from '../../shared/types';
import type { ModerationReportPayload } from '../../shared/types';
import './CommunityPages.css';

const STATUSES: InquiryStatus[] = ['미처리', '처리 중', '처리 완료'];

const CATEGORIES: InquiryCategory[] = ['기능 개선', '버그 신고', '사용 문의', '기타'];

export default function InquiryDetailPage() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();

  const [post, setPost] = useState<InquiryPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  // 수정 모드
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPlatform, setEditPlatform] = useState<InquiryPlatform>('app');
  const [editCategory, setEditCategory] = useState<InquiryCategory>('기능 개선');
  const [editIsPrivate, setEditIsPrivate] = useState(false);

  // 댓글
  const [comments, setComments] = useState<InquiryComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const { blockedUserIds } = useBlockedUserIds();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!inquiryId) return;
    const fetchPost = async () => {
      try {
        const ref = doc(firestore, 'inquiries', inquiryId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as InquiryPost;
          const loaded = { ...data, id: snap.id };
          setPost(loaded);
          setEditTitle(data.title);
          setEditContent(data.content);
          setEditPlatform(data.platform);
          setEditCategory(data.category);
          setEditIsPrivate(data.isPrivate);
        }
      } catch (err) {
        console.error('건의/문의 로딩 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchPost();
  }, [inquiryId]);

  useEffect(() => {
    if (!inquiryId) return;
    const q = query(
      collection(firestore, 'inquiries', inquiryId, 'comments'),
      orderBy('createdAt', 'asc'),
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InquiryComment)));
    });
    return () => unsubscribe();
  }, [inquiryId]);

  const isAccessible = !post?.isPrivate || currentUser?.uid === post?.uid || isAdmin;

  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(firestore, 'inquiries', inquiryId!));
      navigate('/community/inquiry');
    } catch (err) {
      alert('삭제 실패: ' + String(err));
    }
  };

  const handleUpdate = async () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    try {
      await updateDoc(doc(firestore, 'inquiries', inquiryId!), {
        title: editTitle.trim(),
        content: editContent.trim(),
        platform: editPlatform,
        category: editCategory,
        isPrivate: editIsPrivate,
        updatedAt: Date.now(),
      });
      setPost((prev) =>
        prev
          ? { ...prev, title: editTitle.trim(), content: editContent.trim(), platform: editPlatform, category: editCategory, isPrivate: editIsPrivate }
          : null,
      );
      setIsEditing(false);
    } catch (err) {
      alert('수정 실패: ' + String(err));
    }
  };

  const handleWriteComment = async () => {
    if (isDeltaEmpty(commentText)) return;
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    try {
      await addDoc(collection(firestore, 'inquiries', inquiryId!, 'comments'), {
        content: commentText.trim(),
        author: currentUser.displayName || currentUser.email?.split('@')[0] || '익명',
        uid: currentUser.uid,
        createdAt: Date.now(),
      });
      setCommentText('');
    } catch (err) {
      alert('댓글 등록 실패: ' + String(err));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(firestore, 'inquiries', inquiryId!, 'comments', commentId));
    } catch (err) {
      alert('댓글 삭제 실패: ' + String(err));
    }
  };

  const handleModerationAction = async ({
    action,
    targetUid,
    targetLabel,
    contentDomain,
    contentId,
    contentPreview,
    parentContentId,
  }: {
    action: 'report' | 'block';
    targetUid: string;
    targetLabel: string;
    contentDomain: string;
    contentId: string;
    contentPreview: string;
    parentContentId?: string;
  }) => {
    if (!currentUser) {
      window.alert('로그인 후 신고/차단할 수 있습니다.');
      return;
    }
    if (!targetUid) {
      window.alert('작성자 정보가 없어 신고/차단할 수 없습니다.');
      return;
    }
    if (targetUid === currentUser.uid) {
      window.alert('본인 계정은 신고하거나 차단할 수 없습니다.');
      return;
    }

    const reason = await promptModerationReason(action === 'block' ? '차단' : '신고');
    if (!reason) return;

    const payload: ModerationReportPayload = {
      action,
      reasonType: reason.reasonCode,
      reasonDetail: reason.detail,
      targetUid,
      targetLabel,
      contentDomain,
      contentId,
      parentContentId,
      contextId: inquiryId,
      contentPreview,
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

  if (loading) return <div className="season-content-page community-ui community-state-message" role="status">게시글을 불러오는 중입니다.</div>;
  if (!post) return <div className="season-content-page community-ui community-state-message is-error" role="alert">게시글이 없습니다.</div>;

  const canEdit = currentUser?.uid === post.uid || isAdmin;
  const isBlockedPost = blockedUserIds.has(post.uid);
  const visibleComments = comments.filter((comment) => !blockedUserIds.has(comment.uid));

  return (
    <div className="season-content-page community-ui community-inquiry-detail">
      {/* 상단 네비 */}
      <div className="community-detail-toolbar">
        <button
          type="button"
          onClick={() => navigate('/community/inquiry')}
          className="community-action community-action--quiet"
        >
          &larr; 목록으로
        </button>
        {canEdit && !isEditing && (
          <div className="community-detail-toolbar__actions">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="community-action"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="community-action community-action--danger"
            >
              삭제
            </button>
          </div>
        )}
      </div>

      {/* 본문 카드 */}
      <article className="community-notice-article community-inquiry-article">
        {isEditing ? (
          /* 수정 모드 */
          <div className="community-edit-form">
            {/* 플랫폼 */}
            <fieldset className="community-field community-fieldset">
              <legend>플랫폼</legend>
              <div className="community-segmented community-segmented--form">
                {(['app', 'web'] as InquiryPlatform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setEditPlatform(p)}
                    className={editPlatform === p ? 'is-active' : undefined}
                    aria-pressed={editPlatform === p}
                  >
                    {p === 'app' ? '앱' : '웹'}
                  </button>
                ))}
              </div>
            </fieldset>
            {/* 분류 */}
            <label className="community-field">
              <span>분류</span>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value as InquiryCategory)}
                className="community-input community-select"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {/* 제목 */}
            <label className="community-field">
              <span>제목</span>
              <input
                className="community-input community-title-input"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            {/* 본문 */}
            <div className="community-field">
              <span>내용</span>
              <div className="community-editor">
                <RichTextEditor value={editContent} onChange={setEditContent} minHeight={250} />
              </div>
            </div>
            {/* 비밀글 */}
            <label className="community-check-field">
              <input
                type="checkbox"
                checked={editIsPrivate}
                onChange={(e) => setEditIsPrivate(e.target.checked)}
              />
              <span>비밀글</span>
            </label>
            {/* 저장/취소 */}
            <div className="community-form-actions">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="community-action community-action--quiet"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                className="community-action community-action--primary"
              >
                저장하기
              </button>
            </div>
          </div>
        ) : !isAccessible ? (
          /* 비밀글 접근 불가 */
          <div className="community-private-state">
            <strong>비밀글입니다.</strong>
            <p>작성자와 관리자만 열람할 수 있습니다.</p>
          </div>
        ) : isBlockedPost ? (
          <div className="community-private-state is-blocked">
            <strong>차단한 사용자의 게시글입니다.</strong>
            <p>
              계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.
            </p>
          </div>
        ) : (
          /* 보기 모드 */
          <>
            <div className="community-inquiry-meta">
              <span className="community-label">
                {post.platform === 'app' ? '앱' : '웹'}
              </span>
              <span className="community-label">
                {post.category}
              </span>
              {/* 처리 상태 */}
              {isAdmin ? (
                <select
                  value={post.status ?? '미처리'}
                  onChange={async (e) => {
                    const newStatus = e.target.value as InquiryStatus;
                    try {
                      await updateDoc(doc(firestore, 'inquiries', inquiryId!), { status: newStatus, updatedAt: Date.now() });
                      setPost((prev) => prev ? { ...prev, status: newStatus } : null);
                    } catch (err) {
                      alert('상태 변경 실패: ' + String(err));
                    }
                  }}
                  className={`community-inquiry-status-select ${getStatusClass(post.status ?? '미처리')}`}
                  aria-label="문의 처리 상태"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <span className={`community-inquiry-status ${getStatusClass(post.status ?? '미처리')}`}>
                  {post.status ?? '미처리'}
                </span>
              )}
              {post.isPrivate && (
                <span className="community-label is-private">비공개</span>
              )}
              <span className="community-inquiry-meta__byline">
                {new Date(post.createdAt).toLocaleString()} · {post.author}
              </span>
            </div>
            {currentUser && currentUser.uid !== post.uid && (
              <div className="community-moderation-actions">
                <button
                  type="button"
                  onClick={() =>
                    void handleModerationAction({
                      action: 'report',
                      targetUid: post.uid,
                      targetLabel: post.author || post.uid,
                      contentDomain: 'inquiryPost',
                      contentId: post.id,
                      contentPreview: buildContentPreview(`${post.title}\n${post.content}`),
                    })
                  }
                  className="community-action"
                >
                  게시글 신고
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleModerationAction({
                      action: 'block',
                      targetUid: post.uid,
                      targetLabel: post.author || post.uid,
                      contentDomain: 'inquiryPost',
                      contentId: post.id,
                      contentPreview: buildContentPreview(`${post.title}\n${post.content}`),
                    })
                  }
                  className="community-action community-action--danger"
                >
                  작성자 차단
                </button>
              </div>
            )}
            <h1 className="community-notice-title">{post.title}</h1>
            <div className="community-notice-body">
              <div className="community-richtext"><RichTextViewer content={post.content} /></div>
            </div>
          </>
        )}
      </article>

      {/* 댓글 섹션 (접근 가능한 경우만) */}
      {isAccessible && !isBlockedPost && (
        <section className="community-comments">
          <h2 className="community-comments__heading">
            댓글 <span>{visibleComments.length}</span>
          </h2>

          {/* 댓글 입력 */}
          <div className="community-comment-composer">
            <div className="community-editor">
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                mini
                placeholder={currentUser ? '댓글을 남겨주세요.' : '로그인이 필요합니다.'}
                minHeight={60}
              />
            </div>
            <button
              type="button"
              onClick={handleWriteComment}
              disabled={!currentUser || !commentText.trim()}
              className="community-action community-action--primary"
            >
              등록
            </button>
          </div>

          {/* 댓글 목록 */}
          <div className="community-comment-list">
            {visibleComments.length === 0 ? (
              <div className="community-empty">아직 댓글이 없습니다.</div>
            ) : (
              visibleComments.map((comment) => (
                <article key={comment.id} className="community-comment">
                  <div className="community-comment__header">
                    <div className="community-comment__identity">
                      <strong>{comment.author}</strong>
                      <time dateTime={new Date(comment.createdAt).toISOString()}>
                        {new Date(comment.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <div className="community-comment-actions">
                      {currentUser && currentUser.uid !== comment.uid && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void handleModerationAction({
                                action: 'report',
                                targetUid: comment.uid,
                                targetLabel: comment.author || comment.uid,
                                contentDomain: 'inquiryComment',
                                contentId: comment.id,
                                parentContentId: post.id,
                                contentPreview: buildContentPreview(comment.content),
                              })
                            }
                          >
                            신고
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() =>
                              void handleModerationAction({
                                action: 'block',
                                targetUid: comment.uid,
                                targetLabel: comment.author || comment.uid,
                                contentDomain: 'inquiryComment',
                                contentId: comment.id,
                                parentContentId: post.id,
                                contentPreview: buildContentPreview(comment.content),
                              })
                            }
                          >
                            차단
                          </button>
                        </>
                      )}
                      {(currentUser?.uid === comment.uid || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="community-richtext"><RichTextViewer content={comment.content} /></div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function getStatusClass(status: string) {
  switch (status) {
    case '미처리': return 'is-pending';
    case '처리 중': return 'is-progress';
    case '처리 완료': return 'is-complete';
    default: return 'is-neutral';
  }
}
