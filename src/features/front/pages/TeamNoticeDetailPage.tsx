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
import './TeamPages.css';

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
    <div className="season-content-page team-notice-detail-page">
      <section className="team-profile-section team-notice-detail__notice">
        <div className="team-profile-section__header team-notice-detail__header">
          <div>
            <span className="team-page-kicker">TEAM NOTICE</span>
            <h1>팀 공지</h1>
            <p>{teamName} · 팀 공지 상세</p>
          </div>
          <Link to={`/teams/${teamDocId}`} className="team-profile-action">
            팀 페이지로 돌아가기
          </Link>
        </div>

        {loadingNotice ? (
          <div className="team-profile-empty">공지 내용을 불러오는 중...</div>
        ) : noticeAccessDenied ? (
          <div className="team-profile-access-denied">
            팀 공지는 해당 팀 선수/감독만 열람할 수 있습니다.
          </div>
        ) : notice ? (
          <article className="team-notice-detail__article">
            <div className="team-notice-detail__title-row">
              <div className="team-notice-detail__tags">
                {notice.pinned && <span className="team-notice-tag team-notice-tag--pinned">고정</span>}
                {notice.category && (
                  <span className={`team-notice-tag${notice.category === '긴급' ? ' team-notice-tag--urgent' : ''}`}>
                    {notice.category}
                  </span>
                )}
              </div>
              <h2>{notice.title}</h2>
            </div>
            <div className="team-notice-detail__meta">
              {notice.createdAt ? new Date(notice.createdAt).toLocaleString('ko-KR') : '날짜 미정'} · {notice.createdByName ?? '운영진'}
            </div>
            <div className="team-rich-text team-rich-text--notice">
              <RichTextViewer content={notice.content} />
            </div>
          </article>
        ) : (
          <div className="team-profile-empty">해당 공지를 찾을 수 없습니다.</div>
        )}
      </section>

      <section className="team-profile-section team-comments-section">
        <div className="team-profile-section__header">
          <h2>댓글</h2>
          <span className="team-notice-count">{visibleCommentCount}개</span>
        </div>

        {liveAlert && (
          <div className="team-feedback team-feedback--info" role="status" aria-live="polite">
            {liveAlert}
          </div>
        )}
        {commentStatus && (
          <div className="team-feedback team-feedback--success" role="status">
            {commentStatus}
          </div>
        )}
        {commentError && (
          <div className="team-feedback team-feedback--error" role="alert">
            {commentError}
          </div>
        )}

        {user ? (
          <div className="team-comment-composer">
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
              className="team-profile-action team-profile-action--primary"
            >
              댓글 등록
            </button>
          </div>
        ) : (
          <div className="team-profile-muted">로그인 후 댓글을 작성할 수 있습니다.</div>
        )}

        {loadingComments ? (
          <div className="team-profile-empty">댓글을 불러오는 중...</div>
        ) : commentsAccessDenied ? (
          <div className="team-profile-access-denied">댓글은 팀 소속 사용자만 볼 수 있습니다.</div>
        ) : groupedComments.roots.length ? (
          <div className="team-comment-list">
            {groupedComments.roots.map((comment) => {
              const likeCount = comment.likeCount ?? comment.likedBy?.length ?? 0;
              const hasLiked = Boolean(user && comment.likedBy?.includes(user.uid));
              const replies = groupedComments.repliesMap.get(comment.id) ?? [];
              const isCollapsed = collapsedReplies[comment.id] ?? false;
              return (
                <article key={comment.id} className="team-comment-card">
                  <header className="team-comment-card__header">
                    <strong>{comment.author}</strong>
                    <time>
                      {new Date(comment.createdAt).toLocaleString('ko-KR')}
                    </time>
                  </header>
                  <div className="team-rich-text team-rich-text--comment">
                    <RichTextViewer content={comment.content} />
                  </div>
                  <div className="team-comment-actions">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(comment)}
                      disabled={!user || commentBusy}
                      className={`team-profile-action${hasLiked ? ' is-active' : ''}`}
                      aria-pressed={hasLiked}
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
                        className="team-profile-action"
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
                          className="team-profile-action"
                        >
                          신고
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleModerationAction('block', comment)}
                          disabled={commentBusy}
                          className="team-profile-action team-profile-action--danger"
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
                        className="team-profile-action team-profile-action--danger"
                      >
                        댓글 삭제
                      </button>
                    )}
                  </div>

                  {replies.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCollapsedReplies((prev) => ({ ...prev, [comment.id]: !isCollapsed }))}
                      className="team-profile-action team-comment-replies-toggle"
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? `답글 ${replies.length}개 보기` : `답글 ${replies.length}개 접기`}
                    </button>
                  )}

                  {replyTo === comment.id && user && (
                    <div className="team-comment-reply-editor">
                      <RichTextEditor
                        mini
                        value={replyInput}
                        onChange={setReplyInput}
                        placeholder="답글을 입력하세요."
                        minHeight={60}
                      />
                      <div className="team-comment-actions">
                        <button
                          type="button"
                          onClick={() => handleAddReply(comment.id)}
                          disabled={commentBusy}
                          className="team-profile-action team-profile-action--primary"
                        >
                          답글 등록
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTo(null);
                            setReplyInput('');
                          }}
                          className="team-profile-action"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}

                  {replies.length > 0 && !isCollapsed && (
                    <div className="team-comment-replies">
                      {replies.map((reply) => {
                        const replyLikeCount = reply.likeCount ?? reply.likedBy?.length ?? 0;
                        const replyHasLiked = Boolean(user && reply.likedBy?.includes(user.uid));
                        return (
                          <article key={reply.id} className="team-comment-reply">
                            <header className="team-comment-card__header">
                              <strong>{reply.author}</strong>
                              <time>
                                {new Date(reply.createdAt).toLocaleString('ko-KR')}
                              </time>
                            </header>
                            <div className="team-rich-text team-rich-text--comment">
                              <RichTextViewer content={reply.content} />
                            </div>
                            <div className="team-comment-actions">
                              <button
                                type="button"
                                onClick={() => handleToggleLike(reply)}
                                disabled={!user || commentBusy}
                                className={`team-profile-action${replyHasLiked ? ' is-active' : ''}`}
                                aria-pressed={replyHasLiked}
                              >
                                좋아요 {replyLikeCount}
                              </button>
                              {user && user.uid !== reply.uid && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleModerationAction('report', reply)}
                                    disabled={commentBusy}
                                    className="team-profile-action"
                                  >
                                    신고
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleModerationAction('block', reply)}
                                    disabled={commentBusy}
                                    className="team-profile-action team-profile-action--danger"
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
                                  className="team-profile-action team-profile-action--danger"
                                >
                                  댓글 삭제
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="team-profile-empty">등록된 댓글이 없습니다.</div>
        )}
      </section>
    </div>
  );
}
