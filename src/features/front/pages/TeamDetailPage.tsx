import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { useContent } from '@shared/state/contentProvider';
import { buildTeamDirectory, decodeTeamId, encodeTeamId } from '@shared/lib/teamDirectory';
import { TEAM_GROUPS } from '@shared/lib/teamGroups';
import {
  normalizeExternalImageUrl,
  shouldForceLogoContrastBoost,
} from '@shared/lib/imageUrl';
import { useDemoStore } from '@shared/state/demoStore';
import type { MatchSchedule } from '@shared/state/demoStore';
import { firestore } from '@shared/firebase/client';
import { useTeamRole } from '@shared/auth/useTeamRole';
import { useAdmin } from '@shared/auth/useAdmin';
import { useAuth } from '@shared/auth/AuthProvider';
import type { TeamMember, TeamNotice, TeamNoticeCategory, UserProfile } from '@shared/types';

const cardBase: CSSProperties = {
  borderRadius: '16px',
  padding: '16px',
  border: '1px solid rgba(148,163,184,0.25)',
  background: 'rgba(15,23,42,0.7)',
  display: 'grid',
  gap: '12px',
};

const statusLabel = (match: MatchSchedule) => {
  if (match.status === 'inProgress') return { text: '진행 중', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' };
  if (match.status === 'completed') return { text: '경기 종료', color: '#f97316', bg: 'rgba(249,115,22,0.14)' };
  if (match.status === 'canceled') return { text: '취소', color: '#94a3b8', bg: 'rgba(148,163,184,0.18)' };
  return { text: '예정', color: '#22c55e', bg: 'rgba(34,197,94,0.14)' };
};

const safeScore = (value?: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value : '-');
const MEMBER_ROLE_LABELS: Record<TeamMember['role'], string> = {
  player: '선수',
  staff: '스태프',
  coach: '감독',
};
const NOTICE_CATEGORIES: TeamNoticeCategory[] = ['일반', '훈련', '경기', '긴급'];
const NOTICE_CATEGORY_STYLE: Record<TeamNoticeCategory, { color: string; bg: string }> = {
  일반: { color: '#e2e8f0', bg: 'rgba(148,163,184,0.2)' },
  훈련: { color: '#38bdf8', bg: 'rgba(56,189,248,0.16)' },
  경기: { color: '#f97316', bg: 'rgba(249,115,22,0.16)' },
  긴급: { color: '#f87171', bg: 'rgba(248,113,113,0.16)' },
};

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const { content } = useContent();
  const { state, actions } = useDemoStore();
  const { user } = useAuth();
  const teamName = decodeTeamId(teamId ?? '');
  const teamEntries = content.teams.entries.length ? content.teams.entries : TEAM_GROUPS;
  const directory = useMemo(() => buildTeamDirectory(teamEntries), [teamEntries]);
  const team = useMemo(() => directory.find((entry) => entry.name === teamName) ?? null, [directory, teamName]);
  const teamDocId = team ? encodeTeamId(team.name) : null;
  const { isCoach, coachTeamId, loading: roleLoading } = useTeamRole();
  const { isAdmin } = useAdmin();
  const canManage = Boolean(teamDocId && (isAdmin || (isCoach && coachTeamId === teamDocId)));
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<'player' | 'staff'>('player');
  const [memberStatus, setMemberStatus] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberEdits, setMemberEdits] = useState<Record<string, Partial<TeamMember>>>({});
  const [teamInfo, setTeamInfo] = useState<{
    shortIntro?: string;
    longIntro?: string;
    emblemUrl?: string;
    history?: string;
  } | null>(null);
  const [teamInfoDraft, setTeamInfoDraft] = useState({
    shortIntro: '',
    longIntro: '',
    emblemUrl: '',
    history: '',
  });
  const [teamInfoStatus, setTeamInfoStatus] = useState<string | null>(null);
  const [teamInfoError, setTeamInfoError] = useState<string | null>(null);
  const [teamInfoBusy, setTeamInfoBusy] = useState(false);
  const [notices, setNotices] = useState<TeamNotice[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [noticesAccessDenied, setNoticesAccessDenied] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeCategory, setNoticeCategory] = useState<TeamNoticeCategory>('일반');
  const [noticePinned, setNoticePinned] = useState(false);
  const [noticeFilter, setNoticeFilter] = useState<'ALL' | TeamNoticeCategory>('ALL');
  const [noticeSearchQuery, setNoticeSearchQuery] = useState('');
  const [noticeStatus, setNoticeStatus] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [noticeBusy, setNoticeBusy] = useState(false);

  useEffect(() => {
    void actions.loadFullSchedule();
  }, [actions]);

  useEffect(() => {
    setMemberStatus(null);
    setMemberError(null);
    setMemberEmail('');
    setTeamInfoStatus(null);
    setTeamInfoError(null);
    setNoticeStatus(null);
    setNoticeError(null);
    setNoticeTitle('');
    setNoticeContent('');
    setNoticeCategory('일반');
    setNoticePinned(false);
    setNoticeFilter('ALL');
    setNoticeSearchQuery('');
  }, [teamDocId]);

  useEffect(() => {
    if (!teamDocId) {
      setTeamInfo(null);
      setTeamInfoDraft({ shortIntro: '', longIntro: '', emblemUrl: '', history: '' });
      return;
    }
    const ref = doc(firestore, 'teams', teamDocId);
    getDoc(ref)
      .then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as {
          shortIntro?: string;
          longIntro?: string;
          emblemUrl?: string;
          history?: string;
        };
        setTeamInfo(data);
        setTeamInfoDraft({
          shortIntro: data.shortIntro ?? '',
          longIntro: data.longIntro ?? '',
          emblemUrl: data.emblemUrl ?? '',
          history: data.history ?? '',
        });
      })
      .catch(() => {});
  }, [teamDocId]);

  useEffect(() => {
    if (!teamDocId) {
      setMembers([]);
      setMembersLoading(false);
      return;
    }
    setMembersLoading(true);
    const q = query(collection(firestore, 'teams', teamDocId, 'members'), orderBy('joinedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => ({ ...(docSnap.data() as TeamMember), uid: docSnap.id }));
        setMembers(next);
        setMembersLoading(false);
      },
      () => {
        setMembers([]);
        setMembersLoading(false);
      },
    );
    return () => unsub();
  }, [teamDocId]);

  useEffect(() => {
    if (!teamDocId) {
      setNotices([]);
      setNoticesLoading(false);
      return;
    }
    setNoticesLoading(true);
    const q = query(collection(firestore, 'teams', teamDocId, 'notices'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => ({ ...(docSnap.data() as Omit<TeamNotice, 'id'>), id: docSnap.id }));
        setNotices(next);
        setNoticesLoading(false);
        setNoticesAccessDenied(false);
      },
      () => {
        setNotices([]);
        setNoticesLoading(false);
        setNoticesAccessDenied(true);
      },
    );
    return () => unsub();
  }, [teamDocId]);

  const upcoming = useMemo(
    () =>
      state.matches
        .filter(
          (match) =>
            !match.deleted &&
            (match.homeTeamName === teamName || match.awayTeamName === teamName) &&
            (match.status === 'scheduled' || match.status === 'inProgress'),
        )
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [state.matches, teamName],
  );

  const recentResults = useMemo(
    () =>
      state.matches
        .filter(
          (match) =>
            !match.deleted &&
            (match.homeTeamName === teamName || match.awayTeamName === teamName) &&
            (match.status === 'completed' || match.status === 'canceled'),
        )
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    [state.matches, teamName],
  );

  const record = useMemo(() => {
    const finished = state.matches.filter(
      (match) =>
        !match.deleted &&
        (match.homeTeamName === teamName || match.awayTeamName === teamName) &&
        match.status === 'completed',
    );
    return finished.reduce(
      (acc, match) => {
        const homeScore = match.homeScore;
        const awayScore = match.awayScore;
        if (typeof homeScore !== 'number' || typeof awayScore !== 'number') return acc;
        const isHome = match.homeTeamName === teamName;
        const teamScore = isHome ? homeScore : awayScore;
        const oppScore = isHome ? awayScore : homeScore;
        if (teamScore > oppScore) acc.wins += 1;
        else if (teamScore < oppScore) acc.losses += 1;
        else acc.draws += 1;
        return acc;
      },
      { wins: 0, losses: 0, draws: 0 },
    );
  }, [state.matches, teamName]);

  const handleAddMember = async () => {
    if (!team || !teamDocId) return;
    setMemberError(null);
    setMemberStatus(null);
    const emailLower = memberEmail.trim().toLowerCase();
    if (!emailLower) {
      setMemberError('추가할 팀원 이메일을 입력해주세요.');
      return;
    }
    if (!canManage) {
      setMemberError('팀원 관리 권한이 없습니다.');
      return;
    }
    setMemberBusy(true);
    try {
      const userQuery = query(collection(firestore, 'users'), where('emailLower', '==', emailLower));
      const userSnap = await getDocs(userQuery);
      if (userSnap.empty) {
        setMemberError('해당 이메일로 가입된 계정을 찾지 못했습니다.');
        return;
      }
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data() as UserProfile;
    const nameSeed = userData.displayName ?? userData.email ?? emailLower;
    const fallbackName = nameSeed?.split('@')[0] ?? '선수';
    const inputName = memberName.trim();
    const safeName = inputName.length ? inputName : fallbackName;

      await setDoc(
        doc(firestore, 'teams', teamDocId),
        { name: team.name, group: team.group, updatedAt: Date.now() },
        { merge: true },
      );

      await setDoc(
        doc(firestore, 'teams', teamDocId, 'members', userDoc.id),
        {
          uid: userDoc.id,
          name: safeName,
          role: memberRole,
          number: '',
          position: '',
          bats: 'R',
          throws: 'R',
          profileImageUrl: '',
          profileBio: '',
          joinedAt: Date.now(),
          status: 'active',
        },
        { merge: true },
      );

      setMemberStatus('팀원을 추가했습니다.');
      setMemberEmail('');
      setMemberName('');
    } catch {
      setMemberError('팀원 추가 중 문제가 발생했습니다.');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (!teamDocId) return;
    setMemberError(null);
    setMemberStatus(null);
    if (!canManage) {
      setMemberError('팀원 관리 권한이 없습니다.');
      return;
    }
    setMemberBusy(true);
    try {
      await deleteDoc(doc(firestore, 'teams', teamDocId, 'members', uid));
      setMemberStatus('팀원 정보를 삭제했습니다.');
    } catch {
      setMemberError('팀원 삭제 중 문제가 발생했습니다.');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleSaveMember = async (uid: string) => {
    if (!teamDocId) return;
    setMemberError(null);
    setMemberStatus(null);
    if (!canManage) {
      setMemberError('팀원 관리 권한이 없습니다.');
      return;
    }
    const edits = memberEdits[uid];
    if (!edits) return;
    setMemberBusy(true);
    try {
      const payload: Partial<TeamMember> = {};
      if (Object.prototype.hasOwnProperty.call(edits, 'number')) payload.number = edits.number ?? '';
      if (Object.prototype.hasOwnProperty.call(edits, 'position')) payload.position = edits.position ?? '';
      if (Object.prototype.hasOwnProperty.call(edits, 'bats')) payload.bats = edits.bats ?? 'R';
      if (Object.prototype.hasOwnProperty.call(edits, 'throws')) payload.throws = edits.throws ?? 'R';
      if (Object.prototype.hasOwnProperty.call(edits, 'profileImageUrl')) {
        payload.profileImageUrl = normalizeExternalImageUrl(edits.profileImageUrl ?? '');
      }
      if (Object.prototype.hasOwnProperty.call(edits, 'profileBio')) payload.profileBio = edits.profileBio ?? '';

      await setDoc(
        doc(firestore, 'teams', teamDocId, 'members', uid),
        payload,
        { merge: true },
      );
      setMemberStatus('팀원 정보를 저장했습니다.');
      setMemberEdits((prev) => {
        const next = { ...prev };
        delete next[uid];
        return next;
      });
    } catch {
      setMemberError('팀원 정보 저장 중 문제가 발생했습니다.');
    } finally {
      setMemberBusy(false);
    }
  };

  const handleSaveTeamInfo = async () => {
    if (!team || !teamDocId) return;
    setTeamInfoError(null);
    setTeamInfoStatus(null);
    if (!canManage) {
      setTeamInfoError('팀 정보 수정 권한이 없습니다.');
      return;
    }
    setTeamInfoBusy(true);
    try {
      const normalizedEmblemUrl = normalizeExternalImageUrl(teamInfoDraft.emblemUrl);
      const nextTeamInfo = {
        shortIntro: teamInfoDraft.shortIntro.trim(),
        longIntro: teamInfoDraft.longIntro.trim(),
        emblemUrl: normalizedEmblemUrl,
        history: teamInfoDraft.history.trim(),
      };
      await setDoc(
        doc(firestore, 'teams', teamDocId),
        {
          name: team.name,
          group: team.group,
          ...nextTeamInfo,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      setTeamInfoStatus('팀 정보를 저장했습니다.');
      setTeamInfo(nextTeamInfo);
      setTeamInfoDraft(nextTeamInfo);
    } catch {
      setTeamInfoError('팀 정보 저장 중 문제가 발생했습니다.');
    } finally {
      setTeamInfoBusy(false);
    }
  };

  const handleAddNotice = async () => {
    if (!teamDocId) return;
    setNoticeError(null);
    setNoticeStatus(null);
    if (!canManage) {
      setNoticeError('팀 공지 작성 권한이 없습니다.');
      return;
    }
    const title = noticeTitle.trim();
    const content = noticeContent.trim();
    if (!title || !content) {
      setNoticeError('제목과 내용을 모두 입력해주세요.');
      return;
    }
    setNoticeBusy(true);
    try {
      await addDoc(collection(firestore, 'teams', teamDocId, 'notices'), {
        title,
        content,
        createdAt: Date.now(),
        createdByUid: user?.uid ?? null,
        createdByName: user?.displayName ?? user?.email ?? null,
        category: noticeCategory,
        pinned: noticePinned,
      });
      setNoticeStatus('팀 공지를 등록했습니다.');
      setNoticeTitle('');
      setNoticeContent('');
      setNoticeCategory('일반');
      setNoticePinned(false);
    } catch {
      setNoticeError('공지 등록 중 문제가 발생했습니다.');
    } finally {
      setNoticeBusy(false);
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    if (!teamDocId) return;
    setNoticeError(null);
    setNoticeStatus(null);
    if (!canManage) {
      setNoticeError('팀 공지 삭제 권한이 없습니다.');
      return;
    }
    setNoticeBusy(true);
    try {
      await deleteDoc(doc(firestore, 'teams', teamDocId, 'notices', noticeId));
      setNoticeStatus('팀 공지를 삭제했습니다.');
    } catch {
      setNoticeError('공지 삭제 중 문제가 발생했습니다.');
    } finally {
      setNoticeBusy(false);
    }
  };

  const handleTogglePinned = async (noticeId: string, pinned: boolean) => {
    if (!teamDocId) return;
    setNoticeError(null);
    setNoticeStatus(null);
    if (!canManage) {
      setNoticeError('팀 공지 수정 권한이 없습니다.');
      return;
    }
    setNoticeBusy(true);
    try {
      await setDoc(doc(firestore, 'teams', teamDocId, 'notices', noticeId), { pinned }, { merge: true });
      setNoticeStatus(pinned ? '공지 고정을 설정했습니다.' : '공지 고정을 해제했습니다.');
    } catch {
      setNoticeError('공지 고정 변경 중 문제가 발생했습니다.');
    } finally {
      setNoticeBusy(false);
    }
  };

  const sortedNotices = useMemo(() => {
    const categoryFiltered = noticeFilter === 'ALL' ? notices : notices.filter((notice) => (notice.category ?? '일반') === noticeFilter);
    const query = noticeSearchQuery.trim().toLowerCase();
    const filtered = !query
      ? categoryFiltered
      : categoryFiltered.filter((notice) =>
          `${notice.title} ${notice.content} ${notice.createdByName ?? ''}`.toLowerCase().includes(query),
        );
    const copy = [...filtered];
    copy.sort((a, b) => {
      const pinnedA = a.pinned ? 1 : 0;
      const pinnedB = b.pinned ? 1 : 0;
      if (pinnedA !== pinnedB) return pinnedB - pinnedA;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
    return copy;
  }, [notices, noticeFilter, noticeSearchQuery]);

  if (!team) {
    return (
      <section style={{ ...cardBase, maxWidth: '640px' }}>
        <h2 style={{ margin: 0, color: '#f97316', fontWeight: 900 }}>팀을 찾을 수 없습니다</h2>
        <p style={{ margin: 0, color: '#cbd5e1' }}>요청한 팀 페이지가 존재하지 않습니다. 팀 목록으로 돌아가 다시 선택해 주세요.</p>
        <Link
          to="/teams"
          style={{
            width: 'fit-content',
            padding: '10px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(148,163,184,0.4)',
            background: 'rgba(255,255,255,0.04)',
            color: '#e2e8f0',
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          팀 허브로 돌아가기
        </Link>
      </section>
    );
  }

  const resolvedTeamDocId = teamDocId ?? '';
  const totalGames = record.wins + record.losses + record.draws;
  const emblemUrl = normalizeExternalImageUrl(teamInfo?.emblemUrl ?? '');
  const emblemForceBoost = shouldForceLogoContrastBoost(emblemUrl);
  const shortIntro = teamInfo?.shortIntro ?? '팀 소개 문구가 준비 중입니다.';
  const longIntro = teamInfo?.longIntro ?? '팀 소개 상세 내용이 준비 중입니다.';
  const historyText = teamInfo?.history ?? '연혁 정보가 아직 등록되지 않았습니다.';

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* ── HERO ── */}
      <section
        style={{
          borderRadius: '24px',
          padding: '26px',
          background:
            `radial-gradient(circle at 10% 20%, ${team.color}22, transparent 30%), radial-gradient(circle at 88% 5%, rgba(56,189,248,0.12), transparent 26%), linear-gradient(130deg, #0f172a 0%, #0b1220 100%)`,
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.34)',
          display: 'grid',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: `${team.color}22`,
              color: team.color,
              border: `1px solid ${team.color}55`,
              fontSize: '12px',
            }}
          >
            {team.group}조
          </span>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>TEAM HOME</span>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 6vw, 36px)', fontWeight: 900 }}>{team.name}</h1>
          <p style={{ margin: 0, color: '#cbd5e1', fontWeight: 600 }}>
            팀 공지, 로스터, 경기 일정/결과를 한눈에 확인할 수 있는 팀 전용 페이지입니다.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '13px',
          }}>총 {totalGames}경기</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.35)',
            color: '#bbf7d0',
            fontWeight: 800,
            fontSize: '13px',
          }}>승 {record.wins}</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(248,113,113,0.12)',
            border: '1px solid rgba(248,113,113,0.35)',
            color: '#fecaca',
            fontWeight: 800,
            fontSize: '13px',
          }}>패 {record.losses}</div>
          <div style={{
            padding: '10px 12px',
            borderRadius: '12px',
            background: 'rgba(148,163,184,0.18)',
            border: '1px solid rgba(148,163,184,0.35)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '13px',
          }}>무 {record.draws}</div>
        </div>
      </section>

      {/* ── 팀 정보 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>팀 정보</h2>
          {canManage && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(34,197,94,0.14)',
                color: '#bbf7d0',
                border: '1px solid rgba(34,197,94,0.4)',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.04em',
              }}
            >
              EDITABLE
            </span>
          )}
        </div>

        {teamInfoStatus && (
          <div style={{ color: '#bbf7d0', fontWeight: 800, background: 'rgba(34,197,94,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.35)' }}>
            {teamInfoStatus}
          </div>
        )}
        {teamInfoError && (
          <div style={{ color: '#fecaca', fontWeight: 800, background: 'rgba(248,113,113,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.35)' }}>
            {teamInfoError}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '14px', alignItems: 'center' }}>
          {emblemUrl ? (
            <img
              src={emblemUrl}
              alt={`${team.name} emblem`}
              referrerPolicy="no-referrer"
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '18px',
                objectFit: 'cover',
                border: '1px solid rgba(148,163,184,0.35)',
                background: emblemForceBoost
                  ? 'radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0.92) 24%, rgba(255,255,255,0.5) 42%, rgba(255,255,255,0.1) 58%, rgba(255,255,255,0) 76%), rgba(15,23,42,0.6)'
                  : 'rgba(15,23,42,0.6)',
              }}
            />
          ) : (
            <div
              style={{
                width: '84px',
                height: '84px',
                borderRadius: '18px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: `${team.color}22`,
                color: team.color,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                fontSize: '22px',
              }}
            >
              {team.name.slice(0, 2)}
            </div>
          )}
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ fontWeight: 800, color: '#e2e8f0' }}>{shortIntro}</div>
            <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6 }}>{longIntro}</div>
          </div>
        </div>
        <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.7 }}>{historyText}</div>

        {canManage && (
          <div
            style={{
              display: 'grid',
              gap: '10px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>엠블럼 URL</label>
              <input
                value={teamInfoDraft.emblemUrl}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, emblemUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>한 줄 소개</label>
              <input
                value={teamInfoDraft.shortIntro}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, shortIntro: e.target.value }))}
                placeholder="팀을 한 문장으로 소개해 주세요."
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>상세 소개</label>
              <textarea
                value={teamInfoDraft.longIntro}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, longIntro: e.target.value }))}
                rows={3}
                placeholder="팀 상세 소개를 입력하세요."
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                  resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>연혁</label>
              <textarea
                value={teamInfoDraft.history}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, history: e.target.value }))}
                rows={4}
                placeholder="연혁/주요 성과를 입력하세요."
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                  resize: 'vertical',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSaveTeamInfo}
                disabled={teamInfoBusy}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  cursor: teamInfoBusy ? 'not-allowed' : 'pointer',
                }}
              >
                팀 정보 저장
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 팀 공지 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>팀 공지</h2>
          {canManage && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(34,197,94,0.14)',
                color: '#bbf7d0',
                border: '1px solid rgba(34,197,94,0.4)',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.04em',
              }}
            >
              COACH MODE
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setNoticeFilter('ALL')}
            style={{
              padding: '6px 10px',
              borderRadius: '10px',
              border: noticeFilter === 'ALL' ? '1px solid #f97316' : '1px solid rgba(148,163,184,0.35)',
              background: noticeFilter === 'ALL' ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.03)',
              color: noticeFilter === 'ALL' ? '#f97316' : '#94a3b8',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            전체
          </button>
          {NOTICE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setNoticeFilter(cat)}
              style={{
                padding: '6px 10px',
                borderRadius: '10px',
                border: noticeFilter === cat ? `1px solid ${NOTICE_CATEGORY_STYLE[cat].color}` : '1px solid rgba(148,163,184,0.35)',
                background: noticeFilter === cat ? NOTICE_CATEGORY_STYLE[cat].bg : 'rgba(255,255,255,0.03)',
                color: noticeFilter === cat ? NOTICE_CATEGORY_STYLE[cat].color : '#94a3b8',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={noticeSearchQuery}
              onChange={(e) => setNoticeSearchQuery(e.target.value)}
              placeholder="제목, 내용, 작성자 검색"
              style={{
                width: '100%',
                padding: '10px 76px 10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(15,23,42,0.6)',
                color: '#e2e8f0',
                fontWeight: 600,
              }}
            />
            {noticeSearchQuery.trim() && (
              <button
                type="button"
                onClick={() => setNoticeSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(51,65,85,0.85)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                초기화
              </button>
            )}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            {sortedNotices.length}개 공지
          </div>
        </div>

        {noticeStatus && (
          <div style={{ color: '#bbf7d0', fontWeight: 800, background: 'rgba(34,197,94,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.35)' }}>
            {noticeStatus}
          </div>
        )}
        {noticeError && (
          <div style={{ color: '#fecaca', fontWeight: 800, background: 'rgba(248,113,113,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.35)' }}>
            {noticeError}
          </div>
        )}

        {canManage && (
          <div
            style={{
              display: 'grid',
              gap: '10px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(255,255,255,0.02)',
            }}
            >
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>공지 제목</label>
              <input
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder="공지 제목"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                }}
              />
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>카테고리</label>
                <select
                  value={noticeCategory}
                  onChange={(e) => setNoticeCategory(e.target.value as TeamNoticeCategory)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: 'rgba(15,23,42,0.6)',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  {NOTICE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gap: '6px' }}>
                <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>공지 내용</label>
              <textarea
                value={noticeContent}
                onChange={(e) => setNoticeContent(e.target.value)}
                rows={3}
                placeholder="공지 내용을 입력하세요."
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                  resize: 'vertical',
                }}
              />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={noticePinned}
                  onChange={(e) => setNoticePinned(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                상단 고정 공지
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleAddNotice}
                  disabled={noticeBusy}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  cursor: noticeBusy ? 'not-allowed' : 'pointer',
                }}
              >
                공지 등록
              </button>
            </div>
          </div>
        )}

        {noticesLoading ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>팀 공지를 불러오는 중...</div>
        ) : noticesAccessDenied ? (
          <div style={{ color: '#fca5a5', fontWeight: 700 }}>
            팀 공지는 해당 팀 선수/감독만 열람할 수 있습니다.
          </div>
        ) : sortedNotices.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {sortedNotices.map((notice) => {
              const category = notice.category ?? '일반';
              const badgeStyle = NOTICE_CATEGORY_STYLE[category];
              return (
              <div
                key={notice.id}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {notice.pinned && (
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '999px',
                          background: 'rgba(249,115,22,0.16)',
                          color: '#f97316',
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        고정
                      </span>
                    )}
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '999px',
                        background: badgeStyle.bg,
                        color: badgeStyle.color,
                        fontWeight: 800,
                        fontSize: '11px',
                      }}
                    >
                      {category}
                    </span>
                    <Link
                      to={`/teams/${resolvedTeamDocId}/notices/${notice.id}`}
                      style={{ fontWeight: 800, color: '#e2e8f0', textDecoration: 'none' }}
                    >
                      {notice.title}
                    </Link>
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                    {notice.createdAt ? new Date(notice.createdAt).toLocaleString('ko-KR') : '날짜 미정'}
                  </div>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6 }}>{notice.content}</div>
                {canManage ? (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleTogglePinned(notice.id, !notice.pinned)}
                      disabled={noticeBusy}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.35)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#e2e8f0',
                        fontWeight: 800,
                        cursor: noticeBusy ? 'not-allowed' : 'pointer',
                        width: 'fit-content',
                      }}
                    >
                      {notice.pinned ? '고정 해제' : '공지 고정'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNotice(notice.id)}
                      disabled={noticeBusy}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(248,113,113,0.5)',
                        background: 'rgba(248,113,113,0.12)',
                        color: '#fecdd3',
                        fontWeight: 800,
                        cursor: noticeBusy ? 'not-allowed' : 'pointer',
                        width: 'fit-content',
                      }}
                    >
                      공지 삭제
                    </button>
                  </div>
                ) : (
                  <Link
                    to={`/teams/${resolvedTeamDocId}/notices/${notice.id}`}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(148,163,184,0.35)',
                      background: 'rgba(255,255,255,0.04)',
                      color: '#e2e8f0',
                      fontWeight: 800,
                      textDecoration: 'none',
                      fontSize: '12px',
                      width: 'fit-content',
                    }}
                  >
                    상세 보기
                  </Link>
                )}
              </div>
            )})}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>
            {noticeSearchQuery.trim() ? '검색 결과가 없습니다.' : '등록된 팀 공지가 없습니다.'}
          </div>
        )}
      </section>

      {/* ── 일정 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>예정/진행 경기</h2>
          <Link
            to="/schedule"
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
            전체 일정 보기
          </Link>
        </div>
        {upcoming.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {upcoming.map((match) => {
              const badge = statusLabel(match);
              return (
                <div
                  key={match.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {match.awayTeamName} <span style={{ color: '#94a3b8' }}>vs</span> {match.homeTeamName}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {new Date(match.startTime).toLocaleString('ko-KR')} · {match.venue || '장소 미정'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: '#e2e8f0' }}>
                    {safeScore(match.awayScore)} : {safeScore(match.homeScore)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>예정된 경기가 아직 없습니다.</div>
        )}
      </section>

      {/* ── 결과 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>최근 경기 결과</h2>
          <Link
            to="/schedule/results"
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
            결과 페이지 보기
          </Link>
        </div>
        {recentResults.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {recentResults.map((match) => {
              const badge = statusLabel(match);
              return (
                <div
                  key={match.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '10px',
                    alignItems: 'center',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>
                        {match.awayTeamName} <span style={{ color: '#94a3b8' }}>vs</span> {match.homeTeamName}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: badge.bg,
                          color: badge.color,
                          fontWeight: 800,
                          fontSize: '11px',
                        }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {new Date(match.startTime).toLocaleString('ko-KR')} · {match.venue || '장소 미정'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900, color: '#e2e8f0' }}>
                    {safeScore(match.awayScore)} : {safeScore(match.homeScore)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>최근 경기 결과가 아직 없습니다.</div>
        )}
      </section>

      {/* ── 로스터 ── */}
      <section style={cardBase}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>로스터</h2>
          {canManage && (
            <span
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(34,197,94,0.14)',
                color: '#bbf7d0',
                border: '1px solid rgba(34,197,94,0.4)',
                fontWeight: 800,
                fontSize: '11px',
                letterSpacing: '0.04em',
              }}
            >
              COACH MODE
            </span>
          )}
        </div>

        {memberStatus && (
          <div style={{ color: '#bbf7d0', fontWeight: 800, background: 'rgba(34,197,94,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(34,197,94,0.35)' }}>
            {memberStatus}
          </div>
        )}
        {memberError && (
          <div style={{ color: '#fecaca', fontWeight: 800, background: 'rgba(248,113,113,0.1)', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(248,113,113,0.35)' }}>
            {memberError}
          </div>
        )}

        {canManage && (
          <div
            style={{
              display: 'grid',
              gap: '10px',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>팀원 이메일</label>
              <input
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="player@example.com"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>팀원 이름</label>
              <input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="선수 실명"
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                }}
              />
            </div>
            <div style={{ display: 'grid', gap: '6px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>역할</label>
              <select
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value as 'player' | 'staff')}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(15,23,42,0.6)',
                  color: '#e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <option value="player">선수</option>
                <option value="staff">스태프</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAddMember}
                disabled={memberBusy}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  cursor: memberBusy ? 'not-allowed' : 'pointer',
                }}
              >
                팀원 추가
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: '10px' }}>
          {membersLoading ? (
            <div style={{ color: '#94a3b8', fontWeight: 700 }}>로스터를 불러오는 중...</div>
          ) : members.length ? (
            members.map((member) => {
              const edits = memberEdits[member.uid] ?? {};
              const numberValue = edits.number ?? member.number ?? '';
              const positionValue = edits.position ?? member.position ?? '';
              const batsValue = edits.bats ?? member.bats ?? 'R';
              const throwsValue = edits.throws ?? member.throws ?? 'R';
              const profileImageValue = normalizeExternalImageUrl(edits.profileImageUrl ?? member.profileImageUrl ?? '');
              const profileBioValue = edits.profileBio ?? member.profileBio ?? '';
              return (
                <div
                  key={member.uid}
                  style={{
                    display: 'grid',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {profileImageValue ? (
                        <img
                          src={profileImageValue}
                          alt={`${member.name} profile`}
                          referrerPolicy="no-referrer"
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            objectFit: 'cover',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(148,163,184,0.12)',
                            color: '#e2e8f0',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 800,
                            fontSize: '14px',
                          }}
                        >
                          {member.name.slice(0, 2)}
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <div style={{ fontWeight: 800, color: '#e2e8f0' }}>{member.name}</div>
                        <div style={{ color: '#94a3b8', fontSize: '12px' }}>{MEMBER_ROLE_LABELS[member.role]}</div>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.uid)}
                        disabled={memberBusy}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '10px',
                          border: '1px solid rgba(248,113,113,0.5)',
                          background: 'rgba(248,113,113,0.12)',
                          color: '#fecdd3',
                          fontWeight: 800,
                          cursor: memberBusy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        제거
                      </button>
                    )}
                  </div>

                  {canManage ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                        <input
                          value={numberValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], number: e.target.value } }))}
                          placeholder="등번호"
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                          }}
                        />
                        <input
                          value={positionValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], position: e.target.value } }))}
                          placeholder="포지션"
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                          }}
                        />
                        <select
                          value={batsValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], bats: e.target.value } }))}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="R">타 R</option>
                          <option value="L">타 L</option>
                          <option value="S">타 S</option>
                        </select>
                        <select
                          value={throwsValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], throws: e.target.value } }))}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="R">투 R</option>
                          <option value="L">투 L</option>
                        </select>
                      </div>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <input
                          value={profileImageValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], profileImageUrl: e.target.value } }))}
                          placeholder="프로필 이미지 URL"
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                          }}
                        />
                        <textarea
                          value={profileBioValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], profileBio: e.target.value } }))}
                          placeholder="프로필 한 줄 소개"
                          rows={2}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '10px',
                            border: '1px solid rgba(148,163,184,0.35)',
                            background: 'rgba(15,23,42,0.6)',
                            color: '#e2e8f0',
                            resize: 'vertical',
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveMember(member.uid)}
                        disabled={memberBusy}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '10px',
                          border: '1px solid rgba(148,163,184,0.35)',
                          background: 'rgba(255,255,255,0.05)',
                          color: '#e2e8f0',
                          fontWeight: 800,
                          cursor: memberBusy ? 'not-allowed' : 'pointer',
                          width: 'fit-content',
                        }}
                      >
                        정보 저장
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {member.profileBio && (
                        <div style={{ color: '#cbd5e1', fontSize: '13px' }}>{member.profileBio}</div>
                      )}
                      <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                        #{member.number || '-'} · {member.position || '-'} · 타 {member.bats || '-'} / 투 {member.throws || '-'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ color: '#94a3b8', fontWeight: 700 }}>등록된 팀원이 없습니다.</div>
          )}
        </div>

        {!canManage && !roleLoading && (
          <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700 }}>
            감독 계정으로 로그인하면 팀원 관리를 사용할 수 있습니다.
          </div>
        )}
      </section>

      {/* ── 기록 ── */}
      <section style={cardBase}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>시즌 기록</h2>
        <div style={{ color: '#94a3b8', fontWeight: 700 }}>팀/선수 기록 통계는 준비 중입니다.</div>
      </section>

      {/* ── 안내 ── */}
      <section
        style={{
          borderRadius: '14px',
          padding: '16px',
          border: '1px solid rgba(148,163,184,0.2)',
          background: 'rgba(255,255,255,0.02)',
          color: '#94a3b8',
          fontSize: '13px',
          lineHeight: 1.7,
        }}
      >
        팀 공지/팀 정보/로스터 편집은 감독 계정에서만 사용할 수 있습니다. 시즌 기록 상세는 추후 제공될 예정입니다.
      </section>
    </div>
  );
}
