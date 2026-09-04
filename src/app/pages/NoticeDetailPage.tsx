import { useEffect, useState } from 'react';
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
  onSnapshot
} from 'firebase/firestore';
import { firestore, auth } from '../../shared/firebase/client';
import { useAdmin } from '../../shared/auth/useAdmin';
import type { Notice } from '../../shared/types';
import RichTextEditor from '../../shared/components/editor/RichTextEditor';
import RichTextViewer from '../../shared/components/editor/RichTextViewer';
import { isDeltaEmpty } from '../../shared/components/editor/quillUtils';
import { useBlockedUserIds } from '../../shared/moderation/useBlockedUsers';
import {
  blockUserAndReport,
  buildContentPreview,
  currentUserLabel,
  promptModerationReason,
  reportContent,
} from '../../shared/moderation/moderationService';
import type { ModerationReportPayload } from '../../shared/types';
import './CommunityPages.css';

interface Comment {
  id: string;
  content: string;
  author: string;
  uid: string;
  createdAt: number;
}

export default function NoticeDetailPage() {
  const { noticeId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAdmin();
  
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  
  // 수정 모드 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editAllowComments, setEditAllowComments] = useState(true); // [추가] 수정 시 댓글 허용 여부 상태

  // 댓글 관련 상태
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const { blockedUserIds } = useBlockedUserIds();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  // 공지 로드
  useEffect(() => {
    if (!noticeId) return;
    const fetchNotice = async () => {
      try {
        const ref = doc(firestore, 'notices', noticeId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as Notice;
          setNotice({ ...data, id: snap.id });
          setEditTitle(data.title);
          // 기존 plain text 게시글은 Delta로 변환하여 에디터에 로드
          setEditContent(data.content);
          setEditAllowComments(data.allowComments ?? true); // [추가] 기존 값이 없으면 true
        }
      } catch (err) {
        console.error('공지사항 로딩 실패:', err);
      } finally {
        setLoading(false);
      }
    };
    void fetchNotice();
  }, [noticeId]);

  // 댓글 구독
  useEffect(() => {
    if (!noticeId) return;
    const q = query(collection(firestore, 'notices', noticeId, 'comments'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Comment[]);
    });
    return () => unsubscribe();
  }, [noticeId]);

  // 삭제
  const handleDelete = async () => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(firestore, 'notices', noticeId!));
      alert('삭제되었습니다.');
      navigate('/community/notices');
    } catch (err) {
      alert('삭제 실패: ' + err);
    }
  };

  // 수정 저장
  const handleUpdate = async () => {
    try {
      const ref = doc(firestore, 'notices', noticeId!);
      await updateDoc(ref, {
        title: editTitle,
        content: editContent,
        allowComments: editAllowComments, // [추가] 수정된 설정 저장
        updatedAt: Date.now()
      });
      setNotice(prev => prev ? { 
        ...prev, 
        title: editTitle, 
        content: editContent, 
        allowComments: editAllowComments 
      } : null);
      setIsEditing(false);
      alert('수정되었습니다.');
    } catch (err) {
      alert('수정 실패: ' + err);
    }
  };

  // 댓글 작성
  const handleWriteComment = async () => {
    if (isDeltaEmpty(commentText)) return;
    if (!currentUser) {
      alert('로그인이 필요합니다.');
      return;
    }
    try {
      await addDoc(collection(firestore, 'notices', noticeId!, 'comments'), {
        content: commentText,
        author: currentUser.displayName || currentUser.email?.split('@')[0] || '익명',
        uid: currentUser.uid,
        createdAt: Date.now(),
      });
      setCommentText('');
    } catch (err) {
      alert('댓글 등록 실패: ' + err);
    }
  };

  // 댓글 삭제
  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(firestore, 'notices', noticeId!, 'comments', commentId));
    } catch (err) {
      alert('댓글 삭제 실패: ' + err);
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

    if (action === 'block' && !targetUid) {
      window.alert('작성자 정보가 없어 차단할 수 없습니다.');
      return;
    }
    if (targetUid && targetUid === currentUser.uid) {
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
      contextId: noticeId,
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

  if (loading) return <div className="season-content-page community-ui community-state-message" role="status">공지를 불러오는 중입니다.</div>;
  if (!notice) return <div className="season-content-page community-ui community-state-message is-error" role="alert">공지사항이 없습니다.</div>;

  // [중요] 댓글 허용 여부 확인 (undefined면 true로 간주)
  const isCommentsAllowed = notice.allowComments ?? true;
  const noticeOwnerUid = notice.uid ?? notice.authorUid ?? '';
  const isBlockedPost = Boolean(noticeOwnerUid && blockedUserIds.has(noticeOwnerUid));
  const visibleComments = comments.filter((comment) => !blockedUserIds.has(comment.uid));

  return (
    <div className="season-content-page community-ui community-notice-detail">
      {/* 상단 네비게이션 & 관리자 버튼 */}
      <div className="community-detail-toolbar">
        <button
          type="button"
          onClick={() => navigate('/community/notices')}
          className="community-action community-action--quiet"
        >
          &larr; 목록으로
        </button>

        {isAdmin && !isEditing && (
          <div className="community-detail-toolbar__actions">
            <button type="button" onClick={() => setIsEditing(true)} className="community-action">수정</button>
            <button type="button" onClick={handleDelete} className="community-action community-action--danger">삭제</button>
          </div>
        )}
      </div>

      <article className="community-notice-article">
        {isEditing ? (
          /* 수정 모드 UI */
          <div className="community-edit-form">
            <input
              className="community-input community-title-input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              aria-label="공지 제목"
            />
            <div className="community-editor">
              <RichTextEditor
                value={editContent}
                onChange={setEditContent}
                minHeight={300}
              />
            </div>
            
            {/* [추가] 수정 모드에서 댓글 허용 설정 */}
            <label className="community-check-field">
              <input
                type="checkbox"
                checked={editAllowComments}
                onChange={(e) => setEditAllowComments(e.target.checked)}
              />
              <span>댓글 허용</span>
            </label>

            <div className="community-form-actions">
              <button type="button" onClick={() => setIsEditing(false)} className="community-action community-action--quiet">취소</button>
              <button type="button" onClick={handleUpdate} className="community-action community-action--primary">저장하기</button>
            </div>
          </div>
        ) : (
          /* 보기 모드 UI */
          <>
            <div className="community-notice-meta">
              <span className={`community-label${notice.category === '긴급' ? ' is-urgent' : ''}`}>
                {notice.category}
              </span>
              <span className="community-notice-meta__byline">
                {new Date(notice.createdAt).toLocaleString()} · {notice.author}
              </span>
            </div>
            {currentUser && (!noticeOwnerUid || noticeOwnerUid !== currentUser.uid) && (
              <div className="community-moderation-actions">
                <button
                  type="button"
                  onClick={() =>
                    void handleModerationAction({
                      action: 'report',
                      targetUid: noticeOwnerUid,
                      targetLabel: notice.author || noticeOwnerUid || '작성자 미확인',
                      contentDomain: 'noticePost',
                      contentId: notice.id,
                      contentPreview: buildContentPreview(`${notice.title}\n${notice.content}`),
                    })
                  }
                  className="community-action"
                >
                  게시글 신고
                </button>
                {noticeOwnerUid ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleModerationAction({
                        action: 'block',
                        targetUid: noticeOwnerUid,
                        targetLabel: notice.author || noticeOwnerUid,
                        contentDomain: 'noticePost',
                        contentId: notice.id,
                        contentPreview: buildContentPreview(`${notice.title}\n${notice.content}`),
                      })
                    }
                    className="community-action community-action--danger"
                  >
                    작성자 차단
                  </button>
                ) : null}
              </div>
            )}
            <h1 className="community-notice-title">{notice.title}</h1>
            <div className="community-notice-body">
              {isBlockedPost ? (
                <div className="community-blocked-note">
                  차단한 사용자의 게시글입니다. 계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.
                </div>
              ) : (
                <div className="community-richtext"><RichTextViewer content={notice.content} /></div>
              )}
            </div>
          </>
        )}
      </article>

      {/* [수정] 댓글 섹션: allowComments가 false이면 숨김 */}
      {isCommentsAllowed && !isBlockedPost ? (
        <section className="community-comments">
          <h2 className="community-comments__heading">
            댓글 <span>{visibleComments.length}</span>
          </h2>

          <div className="community-comment-composer">
            <div className="community-editor">
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                mini
                placeholder={currentUser ? "댓글을 남겨주세요." : "로그인이 필요합니다."}
                minHeight={60}
              />
            </div>
            <button
              type="button"
              onClick={handleWriteComment}
              disabled={!currentUser}
              className="community-action community-action--primary"
            >
              등록
            </button>
          </div>

          <div className="community-comment-list">
            {visibleComments.map((comment) => (
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
                              contentDomain: 'noticeComment',
                              contentId: comment.id,
                              parentContentId: notice.id,
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
                              contentDomain: 'noticeComment',
                              contentId: comment.id,
                              parentContentId: notice.id,
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
            ))}
            {visibleComments.length === 0 && (
              <div className="community-empty">아직 댓글이 없습니다.</div>
            )}
          </div>
        </section>
      ) : (
        <div className="community-comments-unavailable">
          {isBlockedPost ? '차단한 사용자의 게시글이라 댓글이 숨겨졌습니다.' : '댓글 작성이 허용되지 않은 게시글입니다.'}
        </div>
      )}
    </div>
  );
}
