import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, runTransaction } from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';
import { useAuth } from '@shared/auth/AuthProvider';
import { useAdmin } from '@shared/auth/useAdmin';
import { useTeamRole } from '@shared/auth/useTeamRole';
import { decodeTeamId } from '@shared/lib/teamDirectory';
import { useBlockedUserIds } from '@shared/moderation/useBlockedUsers';
import {
  blockUserAndReport,
  buildContentPreview,
  currentUserLabel,
  promptModerationReason,
  reportContent,
} from '@shared/moderation/moderationService';
import type { TeamNotice, TeamNoticeComment } from '@shared/types';
import RichTextEditor from '@shared/components/editor/RichTextEditor';
import RichTextViewer from '@shared/components/editor/RichTextViewer';
import { isDeltaEmpty } from '@shared/components/editor/quillUtils';

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
  const { blockedUserIds } = useBlockedUserIds();
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
  const [liveAlert, setLiveAlert] = useState<string | null>(null);
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({});
  const prevCommentsRef = useRef<Map<string, TeamNoticeComment>>(new Map());
  const hasInitializedCommentsRef = useRef(false);
  const alertTimerRef = useRef<number | null>(null);

  const pushLiveAlert = useCallback((message: string) => {
    setLiveAlert(message);
    if (alertTimerRef.current) window.clearTimeout(alertTimerRef.current);
    alertTimerRef.current = window.setTimeout(() => setLiveAlert(null), 3500);
  }, []);

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
  }, [teamDocId, noticeId, pushLiveAlert]);

  useEffect(() => {
    if (!teamDocId || !noticeId) return;
    const q = query(collection(firestore, 'teams', teamDocId, 'notices', noticeId, 'comments'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TeamNoticeComment, 'id'>) }));
        if (hasInitializedCommentsRef.current) {
          let newCount = 0;
          let likeDelta = 0;
          next.forEach((comment) => {
            const prev = prevCommentsRef.current.get(comment.id);
            if (!prev) {
              newCount += 1;
              return;
            }
            const prevLikes = typeof prev.likeCount === 'number' ? prev.likeCount : prev.likedBy?.length ?? 0;
            const nextLikes = typeof comment.likeCount === 'number' ? comment.likeCount : comment.likedBy?.length ?? 0;
            if (nextLikes > prevLikes) likeDelta += nextLikes - prevLikes;
          });
          if (newCount || likeDelta) {
            const parts: string[] = [];
            if (newCount) parts.push(`새 댓글 ${newCount}개`);
            if (likeDelta) parts.push(`좋아요 ${likeDelta}개`);
            pushLiveAlert(parts.join(' · '));
          }
        } else {
          hasInitializedCommentsRef.current = true;
        }
        prevCommentsRef.current = new Map(next.map((comment) => [comment.id, comment]));
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
  }, [teamDocId, noticeId, pushLiveAlert]);

  const handleAddComment = async () => {
    if (!user || !teamDocId || !noticeId) return;
    if (isDeltaEmpty(commentInput)) {
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
        content: commentInput,
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
    if (isDeltaEmpty(replyInput)) {
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
        content: replyInput,
        createdAt: Date.now(),
        parentId,
        likedBy: [],
        likeCount: 0,
      });
      setReplyInput('');
      setReplyTo(null);
      setCollapsedReplies((prev) => ({ ...prev, [parentId]: false }));
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

  const handleModerationAction = async (
    action: 'report' | 'block',
    comment: TeamNoticeComment,
  ) => {
    if (!user || !noticeId || !teamDocId) {
      window.alert('로그인 후 신고/차단할 수 있습니다.');
      return;
    }
    if (!comment.uid) {
      window.alert('작성자 정보가 없어 신고/차단할 수 없습니다.');
      return;
    }
    if (comment.uid === user.uid) {
      window.alert('본인 계정은 신고하거나 차단할 수 없습니다.');
      return;
    }

    const reason = await promptModerationReason(action === 'block' ? '차단' : '신고');
    if (!reason) return;

    const payload = {
      action,
      reasonType: reason.reasonCode,
      reasonDetail: reason.detail,
      targetUid: comment.uid,
      targetLabel: comment.author || comment.uid,
      contentDomain: 'teamNoticeComment',
      contentId: comment.id,
      parentContentId: noticeId,
      contextId: `${teamDocId}:${noticeId}`,
      contentPreview: buildContentPreview(comment.content),
    };

    try {
      if (action === 'block') {
        await blockUserAndReport(user.uid, currentUserLabel(user), payload);
        setCommentStatus('사용자를 차단하고 운영팀에 신고했습니다.');
      } else {
        await reportContent(user.uid, currentUserLabel(user), payload);
        setCommentStatus('신고가 접수되었습니다. 운영팀이 확인 후 조치합니다.');
      }
      setCommentError(null);
    } catch {
      setCommentError('신고 처리 중 문제가 발생했습니다.');
    }
  };

  const canDeleteComment = useMemo(
    () => (comment: TeamNoticeComment) => Boolean(user && (comment.uid === user.uid || canManage)),
    [user, canManage],
  );

  const groupedComments = useMemo(() => {
    const visibleComments = comments.filter((comment) => !blockedUserIds.has(comment.uid));
    const roots: TeamNoticeComment[] = [];
    const repliesMap = new Map<string, TeamNoticeComment[]>();
    visibleComments.forEach((comment) => {
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
  }, [comments, blockedUserIds]);
  const visibleCommentCount = useMemo(
    () => comments.filter((comment) => !blockedUserIds.has(comment.uid)).length,
    [comments, blockedUserIds],
  );

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
            팀 공지는 해당 팀 선수/감독만 열람할 수 있습니다.
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
            <RichTextViewer content={notice.content} style={{ lineHeight: 1.7 }} />
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>해당 공지를 찾을 수 없습니다.</div>
        )}
      </section>

      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>댓글</h2>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>{visibleCommentCount}개</span>
        </div>

        {liveAlert && (
          <div style={{ color: '#f97316', fontWeight: 800, background: 'rgba(249,115,22,0.12)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(249,115,22,0.35)' }}>
            {liveAlert}
          </div>
        )}

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
            <RichTextEditor
              mini
              value={commentInput}
              onChange={setCommentInput}
              placeholder="댓글을 입력하세요."
              minHeight={60}
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
              const isCollapsed = collapsedReplies[comment.id] ?? false;
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
                  <RichTextViewer content={comment.content} style={{ fontSize: '13px', color: '#cbd5e1' }} />
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
                          setCollapsedReplies((prev) => ({ ...prev, [comment.id]: false }));
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
                    {user && user.uid !== comment.uid && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleModerationAction('report', comment)}
                          disabled={commentBusy}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(96,165,250,0.45)',
                            background: 'rgba(59,130,246,0.14)',
                            color: '#bfdbfe',
                            fontWeight: 800,
                            cursor: commentBusy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          신고
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleModerationAction('block', comment)}
                          disabled={commentBusy}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(248,113,113,0.5)',
                            background: 'rgba(248,113,113,0.12)',
                            color: '#fecaca',
                            fontWeight: 800,
                            cursor: commentBusy ? 'not-allowed' : 'pointer',
                          }}
                        >
                          차단
                        </button>
                      </>
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

                  {replies.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCollapsedReplies((prev) => ({ ...prev, [comment.id]: !isCollapsed }))}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: 'rgba(255,255,255,0.03)',
                        color: '#94a3b8',
                        fontWeight: 800,
                        width: 'fit-content',
                      }}
                    >
                      {isCollapsed ? `답글 ${replies.length}개 보기` : `답글 ${replies.length}개 접기`}
                    </button>
                  )}

                  {replyTo === comment.id && user && (
                    <div style={{ display: 'grid', gap: '8px', marginTop: '6px' }}>
                      <RichTextEditor
                        mini
                        value={replyInput}
                        onChange={setReplyInput}
                        placeholder="답글을 입력하세요."
                        minHeight={60}
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

                  {replies.length > 0 && !isCollapsed && (
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
                            <RichTextViewer content={reply.content} style={{ fontSize: '13px', color: '#cbd5e1' }} />
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
                              {user && user.uid !== reply.uid && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleModerationAction('report', reply)}
                                    disabled={commentBusy}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: '10px',
                                      border: '1px solid rgba(96,165,250,0.45)',
                                      background: 'rgba(59,130,246,0.14)',
                                      color: '#bfdbfe',
                                      fontWeight: 800,
                                      cursor: commentBusy ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    신고
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleModerationAction('block', reply)}
                                    disabled={commentBusy}
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: '10px',
                                      border: '1px solid rgba(248,113,113,0.5)',
                                      background: 'rgba(248,113,113,0.12)',
                                      color: '#fecaca',
                                      fontWeight: 800,
                                      cursor: commentBusy ? 'not-allowed' : 'pointer',
                                    }}
                                  >
                                    차단
                                  </button>
                                </>
                              )}
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
