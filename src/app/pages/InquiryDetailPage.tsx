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

  if (loading) return <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center' }}>로딩 중...</div>;
  if (!post) return <div style={{ color: '#f87171', padding: '40px', textAlign: 'center' }}>게시글이 없습니다.</div>;

  const canEdit = currentUser?.uid === post.uid || isAdmin;
  const isBlockedPost = blockedUserIds.has(post.uid);
  const visibleComments = comments.filter((comment) => !blockedUserIds.has(comment.uid));

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
      {/* 상단 네비 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/community/inquiry')}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 700 }}
        >
          &larr; 목록으로
        </button>
        {canEdit && !isEditing && (
          <div style={{ display: 'flex', gap: '8px' }}>
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
          </div>
        )}
      </div>

      {/* 본문 카드 */}
      <article style={{
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '16px',
        padding: '32px',
        marginBottom: '32px',
      }}>
        {isEditing ? (
          /* 수정 모드 */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 플랫폼 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['app', 'web'] as InquiryPlatform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setEditPlatform(p)}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '20px',
                    border: 'none',
                    background: editPlatform === p ? (p === 'app' ? '#818cf8' : '#34d399') : '#334155',
                    color: editPlatform === p ? '#0f172a' : '#94a3b8',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {p === 'app' ? '앱' : '웹'}
                </button>
              ))}
            </div>
            {/* 분류 */}
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as InquiryCategory)}
              style={{ ...inputStyle, fontWeight: 700, cursor: 'pointer' }}
            >
              {CATEGORIES.map((c) => <option key={c} value={c} style={{ background: '#1e293b' }}>{c}</option>)}
            </select>
            {/* 제목 */}
            <input
              style={{ ...inputStyle, fontSize: '18px', fontWeight: 700 }}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            {/* 본문 */}
            <RichTextEditor value={editContent} onChange={setEditContent} minHeight={250} />
            {/* 비밀글 */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editIsPrivate}
                onChange={(e) => setEditIsPrivate(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
              />
              <span style={{ color: '#cbd5e1' }}>비밀글</span>
            </label>
            {/* 저장/취소 */}
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
        ) : !isAccessible ? (
          /* 비밀글 접근 불가 */
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
            <p style={{ fontSize: '18px', fontWeight: 700 }}>비밀글입니다.</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>작성자와 관리자만 열람할 수 있습니다.</p>
          </div>
        ) : isBlockedPost ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#fecaca' }}>
            <p style={{ fontSize: '18px', fontWeight: 700 }}>차단한 사용자의 게시글입니다.</p>
            <p style={{ fontSize: '14px', marginTop: '8px', color: '#94a3b8' }}>
              계정 화면에서 차단을 해제하면 다시 볼 수 있습니다.
            </p>
          </div>
        ) : (
          /* 보기 모드 */
          <>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '12px', padding: '3px 9px', borderRadius: '5px', fontWeight: 800,
                background: post.platform === 'app' ? '#818cf8' : '#34d399',
                color: '#0f172a',
              }}>
                {post.platform === 'app' ? '앱' : '웹'}
              </span>
              <span style={{
                fontSize: '12px', padding: '3px 9px', borderRadius: '5px', fontWeight: 800,
                background: getCategoryColor(post.category),
                color: '#0f172a',
              }}>
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
                  style={{
                    padding: '3px 8px',
                    borderRadius: '5px',
                    border: `1px solid ${getStatusColor(post.status ?? '미처리')}60`,
                    background: getStatusBg(post.status ?? '미처리'),
                    color: getStatusColor(post.status ?? '미처리'),
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {STATUSES.map((s) => <option key={s} value={s} style={{ background: '#1e293b', color: '#fff' }}>{s}</option>)}
                </select>
              ) : (
                <span style={{
                  fontSize: '12px', padding: '3px 9px', borderRadius: '5px', fontWeight: 800,
                  background: getStatusBg(post.status ?? '미처리'),
                  color: getStatusColor(post.status ?? '미처리'),
                  border: `1px solid ${getStatusColor(post.status ?? '미처리')}40`,
                }}>
                  {post.status ?? '미처리'}
                </span>
              )}
              {post.isPrivate && (
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>🔒 비밀글</span>
              )}
              <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '13px' }}>
                {new Date(post.createdAt).toLocaleString()} · {post.author}
              </span>
            </div>
            {currentUser && currentUser.uid !== post.uid && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
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
                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(59,130,246,0.2)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.5)', cursor: 'pointer' }}
                >
                  게시글 신고
                </button>
                <button
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
                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.18)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.45)', cursor: 'pointer' }}
                >
                  작성자 차단
                </button>
              </div>
            )}
            <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 24px 0', lineHeight: 1.3 }}>{post.title}</h1>
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', paddingTop: '24px' }}>
              <RichTextViewer content={post.content} style={{ fontSize: '15px', lineHeight: 1.8 }} />
            </div>
          </>
        )}
      </article>

      {/* 댓글 섹션 (접근 가능한 경우만) */}
      {isAccessible && !isBlockedPost && (
        <section style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', padding: '24px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            댓글 <span style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 400 }}>{visibleComments.length}</span>
          </h3>

          {/* 댓글 입력 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <RichTextEditor
                value={commentText}
                onChange={setCommentText}
                mini
                placeholder={currentUser ? '댓글을 남겨주세요.' : '로그인이 필요합니다.'}
                minHeight={60}
              />
            </div>
            <button
              onClick={handleWriteComment}
              disabled={!currentUser || !commentText.trim()}
              style={{
                padding: '0 18px',
                borderRadius: '8px',
                background: currentUser && commentText.trim() ? '#3b82f6' : '#475569',
                color: currentUser && commentText.trim() ? '#fff' : '#94a3b8',
                border: 'none',
                fontWeight: 700,
                cursor: currentUser && commentText.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              등록
            </button>
          </div>

          {/* 댓글 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {visibleComments.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', padding: '16px 0' }}>아직 댓글이 없습니다.</div>
            ) : (
              visibleComments.map((comment) => (
                <div key={comment.id} style={{ padding: '14px 16px', background: '#1e293b', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '14px' }}>{comment.author}</span>
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
                                contentDomain: 'inquiryComment',
                                contentId: comment.id,
                                parentContentId: post.id,
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
                                contentDomain: 'inquiryComment',
                                contentId: comment.id,
                                parentContentId: post.id,
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
                  <RichTextViewer content={comment.content} style={{ fontSize: '14px', lineHeight: 1.5, color: '#cbd5e1' }} />
                </div>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function getCategoryColor(category: string) {
  switch (category) {
    case '기능 개선': return '#60a5fa';
    case '버그 신고': return '#f87171';
    case '사용 문의': return '#4ade80';
    default: return '#94a3b8';
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case '미처리': return '#f87171';
    case '처리 중': return '#fbbf24';
    case '처리 완료': return '#4ade80';
    default: return '#94a3b8';
  }
}

function getStatusBg(status: string) {
  switch (status) {
    case '미처리': return 'rgba(248,113,113,0.12)';
    case '처리 중': return 'rgba(251,191,36,0.12)';
    case '처리 완료': return 'rgba(74,222,128,0.12)';
    default: return 'rgba(148,163,184,0.12)';
  }
}
