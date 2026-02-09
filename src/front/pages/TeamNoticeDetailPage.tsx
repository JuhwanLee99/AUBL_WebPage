import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
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
  const [comments, setComments] = useState<TeamNoticeComment[]>([]);
  const [loadingNotice, setLoadingNotice] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentInput, setCommentInput] = useState('');
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
        setLoadingNotice(false);
      },
      () => {
        setNotice(null);
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
        setLoadingComments(false);
      },
      () => {
        setComments([]);
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
      });
      setCommentInput('');
      setCommentStatus('댓글을 등록했습니다.');
    } catch {
      setCommentError('댓글 등록 중 문제가 발생했습니다.');
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

  const canDeleteComment = useMemo(
    () => (comment: TeamNoticeComment) => Boolean(user && (comment.uid === user.uid || canManage)),
    [user, canManage],
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
        ) : comments.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {comments.map((comment) => (
              <div
                key={comment.id}
                style={{
                  display: 'grid',
                  gap: '6px',
                  padding: '10px 12px',
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
                      width: 'fit-content',
                    }}
                  >
                    댓글 삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>등록된 댓글이 없습니다.</div>
        )}
      </section>
    </div>
  );
}
