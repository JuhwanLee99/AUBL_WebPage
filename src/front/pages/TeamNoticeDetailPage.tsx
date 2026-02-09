import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction } from 'firebase/firestore';
import { firestore } from '../../shared/firebase/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { useAdmin } from '../../shared/auth/useAdmin';
import { useTeamRole } from '../../shared/auth/useTeamRole';
import { decodeTeamId } from '../../shared/lib/teamDirectory';
import type { TeamNotice, TeamNoticeComment } from '../../shared/types';

const cardBase: React.CSSProperties = {
  borderRadius: '16px',
  padding: '16px',
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.7)',
  display: 'grid',
  gap: '12px',
};

export default function TeamNoticeDetailPage() {
  const { teamId, noticeId } = useParams();
  const { user } = useAuth();
  const { isAdmin } = useAdmin();
  const { isCoach, coachTeamId } = useTeamRole();
  const teamDocId = teamId ?? '';
  const teamName = teamDocId ? decodeTeamId(teamDocId) : '팀';
  const canManage = Boolean(teamDocId && (isAdmin || (isCoach && coachTeamId === teamDocId)));

  const [notice, setNotice] = useState<TeamNotice | null>(null);
  const [noticeAccessDenied, setNoticeAccessDenied] = useState(false);
  const [comments, setComments] = useState<TeamNoticeComment[]>([]);
  const [commentsAccessDenied, setCommentsAccessDenied] = useState(false);
  const [loadingNotice, setLoadingNotice] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyInput, setReplyInput] = useState('');
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);

  useEffect(() => {
    if (!teamDocId || !noticeId) return;
    const ref = doc(firestore, 'teams', teamDocId, 'notices', noticeId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setNotice({ id: snap.id, ...(snap.data() as Omit<TeamNotice, 'id'>) });
        } else {
          setNotice(null);
        }
        setNoticeAccessDenied(false);
        setLoadingNotice(false);
      },
      () => {
        setNotice(null);
        setNoticeAccessDenied(true);
        setLoadingNotice(false);
      },
    );
    return () => unsub();
  }, [teamDocId, noticeId]);

  useEffect(() => {
    if (!teamDocId || !noticeId) return;
    const q = query(collection(firestore, 'teams', teamDocId, 'notices', noticeId, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TeamNoticeComment, 'id'>) }));
        setComments(next);
        setCommentsAccessDenied(false);
        setLoadingComments(false);
      },
      () => {
        setComments([]);
        setCommentsAccessDenied(true);
        setLoadingComments(false);
      },
    );
    return () => unsub();
  }, [teamDocId, noticeId]);

  const handleAddComment = async () => {
    if (!user || !teamDocId || !noticeId) return;
    const content = commentInput.trim();
    if (!content) {
      setCommentError('댓글 내용을 입력해주세요.');
      return;
    }
    setCommentError(null);
    setCommentStatus(null);
    setCommentBusy(true);
    try {
      await addDoc(collection(firestore, 'teams', teamDocId, 'notices', noticeId, 'comments'), {
        noticeId,
        uid: user.uid,
        author: user.displayName ?? user.email ?? '익명',
        content,
        createdAt: Date.now(),
        parentId: null,
        likedBy: [],
        likeCount: 0,
      });
      setCommentInput('');
      setCommentStatus('댓글을 등록했습니다.');
    } catch {
      setCommentError('댓글 등록 중 문제가 발생했습니다.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleAddReply = async (parentId: string) => {
    if (!user || !teamDocId || !noticeId) return;
    const content = replyInput.trim();
    if (!content) {
      setCommentError('답글 내용을 입력해주세요.');
      return;
    }
    setCommentError(null);
    setCommentStatus(null);
    setCommentBusy(true);
    try {
      await addDoc(collection(firestore, 'teams', teamDocId, 'notices', noticeId, 'comments'), {
        noticeId,
        uid: user.uid,
        author: user.displayName ?? user.email ?? '익명',
        content,
        createdAt: Date.now(),
        parentId,
        likedBy: [],
        likeCount: 0,
      });
      setReplyInput('');
      setReplyTo(null);
      setCommentStatus('답글을 등록했습니다.');
    } catch {
      setCommentError('답글 등록 중 문제가 발생했습니다.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!teamDocId || !noticeId) return;
    setCommentError(null);
    setCommentStatus(null);
    setCommentBusy(true);
    try {
      await deleteDoc(doc(firestore, 'teams', teamDocId, 'notices', noticeId, 'comments', commentId));
      setCommentStatus('댓글을 삭제했습니다.');
    } catch {
      setCommentError('댓글 삭제 중 문제가 발생했습니다.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleToggleLike = async (comment: TeamNoticeComment) => {
    if (!user || !teamDocId || !noticeId) return;
    setCommentError(null);
    setCommentStatus(null);
    setCommentBusy(true);
    const ref = doc(firestore, 'teams', teamDocId, 'notices', noticeId, 'comments', comment.id);
    try {
      await runTransaction(firestore, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data() as TeamNoticeComment;
        const likedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
        const hasLiked = likedBy.includes(user.uid);
        const baseCount = typeof data.likeCount === 'number' ? data.likeCount : likedBy.length;
        if (hasLiked) {
          tx.update(ref, { likedBy: likedBy.filter((id) => id !== user.uid), likeCount: Math.max(0, baseCount - 1) });
        } else {
          tx.update(ref, { likedBy: [...likedBy, user.uid], likeCount: baseCount + 1 });
        }
      });
    } catch {
      setCommentError('좋아요 처리 중 문제가 발생했습니다.');
    } finally {
      setCommentBusy(false);
    }
  };

  const canDeleteComment = useMemo(
    () => (comment: TeamNoticeComment) => Boolean(user && (comment.uid === user.uid || canManage)),
    [user, canManage],
  );

  const groupedComments = useMemo(() => {
    const roots: TeamNoticeComment[] = [];
    const repliesMap = new Map<string, TeamNoticeComment[]>();
    comments.forEach((comment) => {
      if (!comment.parentId) {
        roots.push(comment);
        return;
      }
      if (!repliesMap.has(comment.parentId)) repliesMap.set(comment.parentId, []);
      repliesMap.get(comment.parentId)!.push(comment);
    });
    roots.sort((a, b) => a.createdAt - b.createdAt);
    repliesMap.forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));
    return { roots, repliesMap };
  }, [comments]);

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <section style={cardBase}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900 }}>팀 공지</h1>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>{teamName} · 팀 공지 상세</div>
          </div>
          <Link
            to={`/teams/${teamDocId}`}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '12px',
              textDecoration: 'none',
            }}
          >
            팀 페이지로 돌아가기
          </Link>
        </div>

        {loadingNotice ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>공지 내용을 불러오는 중...</div>
        ) : noticeAccessDenied ? (
          <div style={{ color: '#fca5a5', fontWeight: 700 }}>
            팀 공지는 해당 팀 선수/감독 또는 관리자만 열람할 수 있습니다.
          </div>
        ) : notice ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {notice.pinned && (
                <span style={{ padding: '2px 6px', borderRadius: '999px', background: 'rgba(249,115,22,0.16)', color: '#f97316', fontWeight: 800, fontSize: '11px' }}>
                  고정
                </span>
              )}
              {notice.category && (
                <span style={{ padding: '2px 6px', borderRadius: '999px', background: 'rgba(148,163,184,0.2)', color: '#e2e8f0', fontWeight: 800, fontSize: '11px' }}>
                  {notice.category}
                </span>
              )}
              <div style={{ fontWeight: 900, color: '#e2e8f0', fontSize: '18px' }}>{notice.title}</div>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>
              {notice.createdAt ? new Date(notice.createdAt).toLocaleString('ko-KR') : '날짜 미정'} · {notice.createdByName ?? '운영진'}
            </div>
            <div style={{ color: '#cbd5e1', lineHeight: 1.7 }}>{notice.content}</div>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>해당 공지를 찾을 수 없습니다.</div>
        )}
      </section>

      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>댓글</h2>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>{comments.length}개</span>
        </div>

        {commentStatus && (
          <div style={{ color: '#bbf7d0', fontWeight: 800, background: 'rgba(34,197,94,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.35)' }}>
            {commentStatus}
          </div>
        )}
        {commentError && (
          <div style={{ color: '#fecaca', fontWeight: 800, background: 'rgba(248,113,113,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.35)' }}>
            {commentError}
          </div>
        )}

        {user ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            <textarea
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              rows={3}
              placeholder="댓글을 입력하세요."
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.6)',
                color: '#e2e8f0',
                resize: 'vertical',
              }}
            />
            <button
              type="button"
              onClick={handleAddComment}
              disabled={commentBusy}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.05)',
                color: '#e2e8f0',
                fontWeight: 800,
                cursor: commentBusy ? 'not-allowed' : 'pointer',
                width: 'fit-content',
              }}
            >
              댓글 등록
            </button>
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>로그인 후 댓글을 작성할 수 있습니다.</div>
        )}

        {loadingComments ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>댓글을 불러오는 중...</div>
        ) : commentsAccessDenied ? (
          <div style={{ color: '#fca5a5', fontWeight: 700 }}>댓글은 팀 소속 사용자만 볼 수 있습니다.</div>
        ) : groupedComments.roots.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {groupedComments.roots.map((comment) => {
              const likeCount = comment.likeCount ?? comment.likedBy?.length ?? 0;
              const hasLiked = Boolean(user && comment.likedBy?.includes(user.uid));
              const replies = groupedComments.repliesMap.get(comment.id) ?? [];
              return (
                <div
                  key={comment.id}
                  style={{
                    display: 'grid',
                    gap: '8px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 800, color: '#e2e8f0' }}>{comment.author}</div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>{new Date(comment.createdAt).toLocaleString('ko-KR')}</div>
                  </div>
                  <div style={{ color: '#cbd5e1', fontSize: '13px' }}>{comment.content}</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleToggleLike(comment)}
                      disabled={!user || commentBusy}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: hasLiked ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.04)',
                        color: hasLiked ? '#f97316' : '#e2e8f0',
                        fontWeight: 800,
                        cursor: !user || commentBusy ? 'not-allowed' : 'pointer',
                      }}
                    >
                      좋아요 {likeCount}
                    </button>
                    {user && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(comment.id);
                          setReplyInput('');
                        }}
                        disabled={commentBusy}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '10px',
                          border: '1px solid rgba(148,163,184,0.35)',
                          background: 'rgba(255,255,255,0.04)',
                          color: '#e2e8f0',
                          fontWeight: 800,
                          cursor: commentBusy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        답글
                      </button>
                    )}
                    {canDeleteComment(comment) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        disabled={commentBusy}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '10px',
                          border: '1px solid rgba(248,113,113,0.5)',
                          background: 'rgba(248,113,113,0.12)',
                          color: '#fecdd3',
                          fontWeight: 800,
                          cursor: commentBusy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        댓글 삭제
                      </button>
                    )}
                  </div>

                  {replyTo === comment.id && user && (
                    <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
                      <textarea
                        value={replyInput}
                        onChange={(e) => setReplyInput(e.target.value)}
                        rows={2}
                        placeholder="답글을 입력하세요."
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid rgba(148,163,184,0.35)',
                          background: 'rgba(15,23,42,0.6)',
                          color: '#e2e8f0',
                          resize: 'vertical',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleAddReply(comment.id)}
                          disabled={commentBusy}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(255,255,255,0.05)',
                            color: '#e2e8f0',
                            fontWeight: 800,
                            cursor: commentBusy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          답글 등록
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo(null);
                            setReplyInput('');
                          }}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(255,255,255,0.02)',
                            color: '#94a3b8',
                            fontWeight: 800,
                          }}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}

                  {replies.length > 0 && (
                    <div style={{ display: 'grid', gap: '8px', marginLeft: '18px' }}>
                      {replies.map((reply) => {
                        const replyLikeCount = reply.likeCount ?? reply.likedBy?.length ?? 0;
                        const replyHasLiked = Boolean(user && reply.likedBy?.includes(user.uid));
                        return (
                          <div
                            key={reply.id}
                            style={{
                              display: 'grid',
                              gap: '6px',
                              padding: '10px',
                              borderRadius: '10px',
                              border: '1px solid rgba(148,163,184,0.2)',
                              background: 'rgba(255,255,255,0.01)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: 800, color: '#e2e8f0' }}>{reply.author}</div>
                              <div style={{ color: '#94a3b8', fontSize: '12px' }}>{new Date(reply.createdAt).toLocaleString('ko-KR')}</div>
                            </div>
                            <div style={{ color: '#cbd5e1', fontSize: '13px' }}>{reply.content}</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleToggleLike(reply)}
                                disabled={!user || commentBusy}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: '10px',
                                  border: '1px solid rgba(148,163,184,0.35)',
                                  background: replyHasLiked ? 'rgba(249,115,22,0.14)' : 'rgba(255,255,255,0.04)',
                                  color: replyHasLiked ? '#f97316' : '#e2e8f0',
                                  fontWeight: 800,
                                  cursor: !user || commentBusy ? 'not-allowed' : 'pointer',
                                }}
                              >
                                좋아요 {replyLikeCount}
                              </button>
                              {canDeleteComment(reply) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(reply.id)}
                                  disabled={commentBusy}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(248,113,113,0.5)',
                                    background: 'rgba(248,113,113,0.12)',
                                    color: '#fecdd3',
                                    fontWeight: 800,
                                    cursor: commentBusy ? 'not-allowed' : 'pointer',
                                  }}
                                >
                                  댓글 삭제
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>등록된 댓글이 없습니다.</div>
        )}
      </section>
    </div>
  );
}
