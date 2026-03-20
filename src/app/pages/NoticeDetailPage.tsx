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

  if (loading) return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>로딩 중...</div>;
  if (!notice) return <div style={{ color: '#f87171', padding: '40px', textAlign: 'center' }}>공지사항이 없습니다.</div>;

  // [중요] 댓글 허용 여부 확인 (undefined면 true로 간주)
  const isCommentsAllowed = notice.allowComments ?? true;
  const noticeOwnerUid = notice.uid ?? notice.authorUid ?? '';
  const isBlockedPost = Boolean(noticeOwnerUid && blockedUserIds.has(noticeOwnerUid));
  const visibleComments = comments.filter((comment) => !blockedUserIds.has(comment.uid));

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', color: '#f8fafc', paddingBottom: '40px' }}>
      {/* 상단 네비게이션 & 관리자 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/community/notices')}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 700 }}
        >
          &larr; 목록으로
        </button>

        {isAdmin && !isEditing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setIsEditing(true)} style={{ padding: '6px 12px', borderRadius: '6px', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>수정</button>
            <button onClick={handleDelete} style={{ padding: '6px 12px', borderRadius: '6px', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>삭제</button>
          </div>
        )}
      </div>

      <article style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '16px', padding: '32px', marginBottom: '32px' }}>
        {isEditing ? (
          /* 수정 모드 UI */
          <div style={{ display: 'grid', gap: '16px' }}>
            <input 
              style={{ width: '100%', padding: '10px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '8px', fontSize: '20px', fontWeight: 700 }}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <RichTextEditor
              value={editContent}
              onChange={setEditContent}
              minHeight={300}
            />
            
            {/* [추가] 수정 모드에서 댓글 허용 설정 */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editAllowComments}
                onChange={(e) => setEditAllowComments(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
              />
              <span style={{ color: '#cbd5e1' }}>댓글 허용</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setIsEditing(false)} style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}>취소</button>
              <button onClick={handleUpdate} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>저장하기</button>
            </div>
          </div>
        ) : (
          /* 보기 모드 UI */
          <>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', padding: '3px 10px', borderRadius: '6px', fontWeight: 800, background: getCategoryColor(notice.category), color: '#0f172a' }}>
                {notice.category}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>
                {new Date(notice.createdAt).toLocaleString()} · {notice.author}
              </span>
            </div>
            {currentUser && (!noticeOwnerUid || noticeOwnerUid !== currentUser.uid) && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
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
                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(59,130,246,0.2)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.5)', cursor: 'pointer' }}
                >
                  게시글 신고
                </button>
                {noticeOwnerUid ? (
                  <button
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
                    style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.18)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.45)', cursor: 'pointer' }}
                  >
                    작성자 차단
                  </button>
                ) : null}
              </div>
            )}
            <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '0 0 24px 0', lineHeight: 1.3 }}>{notice.title}</h1>
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', paddingTop: '24px' }}>
              {isBlockedPost ? (
                <div style={{ color: '#fecaca', lineHeight: 1.8 }}>
                  차단한 사용자의 게시글입니다. 계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.
                </div>
              ) : (
                <RichTextViewer content={notice.content} style={{ fontSize: '16px', lineHeight: 1.8 }} />
              )}
            </div>
          </>
        )}
      </article>

      {/* [수정] 댓글 섹션: allowComments가 false이면 숨김 */}
      {isCommentsAllowed && !isBlockedPost ? (
        <section style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            댓글 <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 400 }}>{visibleComments.length}</span>
          </h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                mini
                placeholder={currentUser ? "댓글을 남겨주세요." : "로그인이 필요합니다."}
                minHeight={60}
              />
            </div>
            <button
              onClick={handleWriteComment}
              disabled={!currentUser}
              style={{
                padding: '0 20px',
                borderRadius: '8px',
                background: currentUser ? '#3b82f6' : '#475569',
                color: currentUser ? '#fff' : '#94a3b8',
                border: 'none',
                fontWeight: 700,
                cursor: currentUser ? 'pointer' : 'not-allowed',
              }}
            >
              등록
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {visibleComments.map((comment) => (
              <div key={comment.id} style={{ padding: '16px', background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{comment.author}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(comment.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {currentUser && currentUser.uid !== comment.uid && (
                      <>
                        <button
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
                          style={{ background: 'transparent', border: 'none', color: '#93c5fd', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          신고
                        </button>
                        <button
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
                          style={{ background: 'transparent', border: 'none', color: '#fca5a5', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          차단
                        </button>
                      </>
                    )}
                    {(currentUser?.uid === comment.uid || isAdmin) && (
                      <button 
                        onClick={() => handleDeleteComment(comment.id)}
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
                <RichTextViewer content={comment.content} style={{ fontSize: '15px', lineHeight: 1.5, color: '#cbd5e1' }} />
              </div>
            ))}
            {visibleComments.length === 0 && (
              <div style={{ textAlign: 'center', color: '#64748b', padding: '20px 0' }}>아직 댓글이 없습니다.</div>
            )}
          </div>
        </section>
      ) : (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px' }}>
          {isBlockedPost ? '차단한 사용자의 게시글이라 댓글이 숨겨졌습니다.' : '댓글 작성이 허용되지 않은 게시글입니다.'}
        </div>
      )}
    </div>
  );
}

function getCategoryColor(category: string) {
  switch(category) {
    case '긴급': return '#f87171';
    case '심판/기록원 모집': return '#22c55e';
    case '징계': return '#fb923c';
    case '경기공지': return '#60a5fa';
    default: return '#94a3b8';
  }
}
