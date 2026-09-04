import { useEffect, useMemo, useState } from 'react';
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
import './TeamPages.css';

const statusLabel = (match: MatchSchedule) => {
  if (match.status === 'inProgress') return { text: '진행 중', tone: 'live' };
  if (match.status === 'completed') return { text: '경기 종료', tone: 'complete' };
  if (match.status === 'canceled') return { text: '취소', tone: 'canceled' };
  return { text: '예정', tone: 'scheduled' };
};

const safeScore = (value?: number | null) => (typeof value === 'number' && Number.isFinite(value) ? value : '-');
const MEMBER_ROLE_LABELS: Record<TeamMember['role'], string> = {
  player: '선수',
  staff: '스태프',
  coach: '감독',
};
const NOTICE_CATEGORIES: TeamNoticeCategory[] = ['일반', '훈련', '경기', '긴급'];

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
      <section className="team-profile-not-found">
        <h2>팀을 찾을 수 없습니다</h2>
        <p className="team-profile-muted">요청한 팀 페이지가 존재하지 않습니다. 팀 목록으로 돌아가 다시 선택해 주세요.</p>
        <Link to="/teams" className="team-profile-action">
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
    <div className="season-content-page team-profile-page">
      {/* ── HERO ── */}
      <section className="team-profile-hero">
        <div className="team-profile-hero__copy">
          <div className="team-page-eyebrow">
            <span className="team-page-kicker">{team.group}조</span>
            <span>TEAM HOME</span>
          </div>
          <h1>{team.name}</h1>
          <p>팀 공지, 로스터, 경기 일정/결과를 한눈에 확인할 수 있는 팀 전용 페이지입니다.</p>
        </div>
        <div className="team-profile-record" aria-label="시즌 전적">
          <div><strong>{totalGames}</strong><span>경기</span></div>
          <div><strong>{record.wins}</strong><span>승</span></div>
          <div><strong>{record.losses}</strong><span>패</span></div>
          <div><strong>{record.draws}</strong><span>무</span></div>
        </div>
      </section>

      {/* ── 팀 정보 ── */}
      <section className="team-profile-section">
        <div className="team-profile-section__header">
          <h2>팀 정보</h2>
          {canManage && (
            <span className="team-access-label">EDITABLE</span>
          )}
        </div>

        {teamInfoStatus && (
          <div className="team-feedback team-feedback--success" role="status">
            {teamInfoStatus}
          </div>
        )}
        {teamInfoError && (
          <div className="team-feedback team-feedback--error" role="alert">
            {teamInfoError}
          </div>
        )}

        <div className="team-profile-identity">
          <div className={`team-profile-emblem${emblemForceBoost ? ' needs-contrast' : ''}`}>
            {emblemUrl ? (
              <img src={emblemUrl} alt={`${team.name} emblem`} referrerPolicy="no-referrer" />
            ) : (
              <span>{team.name.slice(0, 2)}</span>
            )}
          </div>
          <div className="team-profile-identity__copy">
            <div className="team-profile-identity__lead">{shortIntro}</div>
            <div className="team-profile-identity__description">{longIntro}</div>
          </div>
        </div>
        <div className="team-profile-history">{historyText}</div>

        {canManage && (
          <div className="team-profile-form">
            <div className="team-profile-field">
              <label htmlFor="team-emblem-url">엠블럼 URL</label>
              <input
                id="team-emblem-url"
                value={teamInfoDraft.emblemUrl}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, emblemUrl: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-short-intro">한 줄 소개</label>
              <input
                id="team-short-intro"
                value={teamInfoDraft.shortIntro}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, shortIntro: e.target.value }))}
                placeholder="팀을 한 문장으로 소개해 주세요."
              />
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-long-intro">상세 소개</label>
              <textarea
                id="team-long-intro"
                value={teamInfoDraft.longIntro}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, longIntro: e.target.value }))}
                rows={3}
                placeholder="팀 상세 소개를 입력하세요."
              />
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-history">연혁</label>
              <textarea
                id="team-history"
                value={teamInfoDraft.history}
                onChange={(e) => setTeamInfoDraft((prev) => ({ ...prev, history: e.target.value }))}
                rows={4}
                placeholder="연혁/주요 성과를 입력하세요."
              />
            </div>
            <div className="team-profile-form__actions">
              <button
                type="button"
                onClick={handleSaveTeamInfo}
                disabled={teamInfoBusy}
                className="team-profile-action team-profile-action--primary"
              >
                팀 정보 저장
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 팀 공지 ── */}
      <section className="team-profile-section">
        <div className="team-profile-section__header">
          <h2>팀 공지</h2>
          {canManage && (
            <span className="team-access-label">COACH MODE</span>
          )}
        </div>

        <div className="team-notice-filters" role="group" aria-label="공지 카테고리">
          <button
            type="button"
            onClick={() => setNoticeFilter('ALL')}
            className={`team-notice-filter${noticeFilter === 'ALL' ? ' is-active' : ''}`}
            aria-pressed={noticeFilter === 'ALL'}
          >
            전체
          </button>
          {NOTICE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setNoticeFilter(cat)}
              className={`team-notice-filter${noticeFilter === cat ? ' is-active' : ''}`}
              aria-pressed={noticeFilter === cat}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="team-notice-search">
          <input
            value={noticeSearchQuery}
            onChange={(e) => setNoticeSearchQuery(e.target.value)}
            placeholder="제목, 내용, 작성자 검색"
            aria-label="팀 공지 검색"
          />
          {noticeSearchQuery.trim() && (
            <button
              type="button"
              onClick={() => setNoticeSearchQuery('')}
              className="team-profile-action"
            >
              초기화
            </button>
          )}
          <div className="team-notice-count">
            {sortedNotices.length}개 공지
          </div>
        </div>

        {noticeStatus && (
          <div className="team-feedback team-feedback--success" role="status">
            {noticeStatus}
          </div>
        )}
        {noticeError && (
          <div className="team-feedback team-feedback--error" role="alert">
            {noticeError}
          </div>
        )}

        {canManage && (
          <div className="team-profile-form">
            <div className="team-profile-field">
              <label htmlFor="team-notice-title">공지 제목</label>
              <input
                id="team-notice-title"
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder="공지 제목"
              />
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-notice-category">카테고리</label>
              <select
                id="team-notice-category"
                value={noticeCategory}
                onChange={(e) => setNoticeCategory(e.target.value as TeamNoticeCategory)}
              >
                {NOTICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-notice-content">공지 내용</label>
              <textarea
                id="team-notice-content"
                value={noticeContent}
                onChange={(e) => setNoticeContent(e.target.value)}
                rows={3}
                placeholder="공지 내용을 입력하세요."
              />
            </div>
            <label className="team-notice-checkbox">
              <input
                type="checkbox"
                checked={noticePinned}
                onChange={(e) => setNoticePinned(e.target.checked)}
              />
              상단 고정 공지
            </label>
            <div className="team-profile-form__actions">
              <button
                type="button"
                onClick={handleAddNotice}
                disabled={noticeBusy}
                className="team-profile-action team-profile-action--primary"
              >
                공지 등록
              </button>
            </div>
          </div>
        )}

        {noticesLoading ? (
          <div className="team-profile-empty">팀 공지를 불러오는 중...</div>
        ) : noticesAccessDenied ? (
          <div className="team-profile-access-denied">
            팀 공지는 해당 팀 선수/감독만 열람할 수 있습니다.
          </div>
        ) : sortedNotices.length ? (
          <div className="team-notice-list">
            {sortedNotices.map((notice) => {
              const category = notice.category ?? '일반';
              return (
                <article key={notice.id} className="team-notice-card">
                  <div className="team-notice-card__header">
                    <div className="team-notice-card__title">
                      {notice.pinned && <span className="team-notice-tag team-notice-tag--pinned">고정</span>}
                      <span className={`team-notice-tag${category === '긴급' ? ' team-notice-tag--urgent' : ''}`}>
                        {category}
                      </span>
                      <Link to={`/teams/${resolvedTeamDocId}/notices/${notice.id}`}>
                        {notice.title}
                      </Link>
                    </div>
                    <div className="team-notice-card__date">
                      {notice.createdAt ? new Date(notice.createdAt).toLocaleString('ko-KR') : '날짜 미정'}
                    </div>
                  </div>
                  <div className="team-notice-content">{notice.content}</div>
                  {canManage ? (
                    <div className="team-notice-actions">
                      <button
                        type="button"
                        onClick={() => handleTogglePinned(notice.id, !notice.pinned)}
                        disabled={noticeBusy}
                        className="team-profile-action"
                      >
                        {notice.pinned ? '고정 해제' : '공지 고정'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteNotice(notice.id)}
                        disabled={noticeBusy}
                        className="team-profile-action team-profile-action--danger"
                      >
                        공지 삭제
                      </button>
                    </div>
                  ) : (
                    <Link
                      to={`/teams/${resolvedTeamDocId}/notices/${notice.id}`}
                      className="team-profile-action"
                    >
                      상세 보기
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="team-profile-empty">
            {noticeSearchQuery.trim() ? '검색 결과가 없습니다.' : '등록된 팀 공지가 없습니다.'}
          </div>
        )}
      </section>

      {/* ── 일정 ── */}
      <section className="team-profile-section">
        <div className="team-profile-section__header">
          <h2>예정/진행 경기</h2>
          <Link to="/schedule" className="team-profile-action">전체 일정 보기</Link>
        </div>
        {upcoming.length ? (
          <div className="team-match-list">
            {upcoming.map((match) => {
              const badge = statusLabel(match);
              return (
                <div key={match.id} className="team-match-card">
                  <div className="team-match-card__body">
                    <div className="team-match-card__title">
                      <span>{match.awayTeamName} <span className="team-profile-muted">vs</span> {match.homeTeamName}</span>
                      <span className={`team-state-badge team-state-badge--${badge.tone}`}>{badge.text}</span>
                    </div>
                    <div className="team-match-card__meta">
                      {new Date(match.startTime).toLocaleString('ko-KR')} · {match.venue || '장소 미정'}
                    </div>
                  </div>
                  <div className="team-match-card__score">{safeScore(match.awayScore)} : {safeScore(match.homeScore)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="team-profile-empty">예정된 경기가 아직 없습니다.</div>
        )}
      </section>

      {/* ── 결과 ── */}
      <section className="team-profile-section">
        <div className="team-profile-section__header">
          <h2>최근 경기 결과</h2>
          <Link to="/schedule/results" className="team-profile-action">결과 페이지 보기</Link>
        </div>
        {recentResults.length ? (
          <div className="team-match-list">
            {recentResults.map((match) => {
              const badge = statusLabel(match);
              return (
                <div key={match.id} className="team-match-card">
                  <div className="team-match-card__body">
                    <div className="team-match-card__title">
                      <span>{match.awayTeamName} <span className="team-profile-muted">vs</span> {match.homeTeamName}</span>
                      <span className={`team-state-badge team-state-badge--${badge.tone}`}>{badge.text}</span>
                    </div>
                    <div className="team-match-card__meta">
                      {new Date(match.startTime).toLocaleString('ko-KR')} · {match.venue || '장소 미정'}
                    </div>
                  </div>
                  <div className="team-match-card__score">{safeScore(match.awayScore)} : {safeScore(match.homeScore)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="team-profile-empty">최근 경기 결과가 아직 없습니다.</div>
        )}
      </section>

      {/* ── 로스터 ── */}
      <section className="team-profile-section">
        <div className="team-profile-section__header">
          <h2>로스터</h2>
          {canManage && <span className="team-access-label">COACH MODE</span>}
        </div>

        {memberStatus && <div className="team-feedback team-feedback--success" role="status">{memberStatus}</div>}
        {memberError && <div className="team-feedback team-feedback--error" role="alert">{memberError}</div>}

        {canManage && (
          <div className="team-profile-form">
            <div className="team-profile-field">
              <label htmlFor="team-member-email">팀원 이메일</label>
              <input
                id="team-member-email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="player@example.com"
              />
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-member-name">팀원 이름</label>
              <input
                id="team-member-name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="선수 실명"
              />
            </div>
            <div className="team-profile-field">
              <label htmlFor="team-member-role">역할</label>
              <select
                id="team-member-role"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value as 'player' | 'staff')}
              >
                <option value="player">선수</option>
                <option value="staff">스태프</option>
              </select>
            </div>
            <div className="team-profile-form__actions">
              <button
                type="button"
                onClick={handleAddMember}
                disabled={memberBusy}
                className="team-profile-action team-profile-action--primary"
              >
                팀원 추가
              </button>
            </div>
          </div>
        )}

        <div className="team-member-list">
          {membersLoading ? (
            <div className="team-profile-empty">로스터를 불러오는 중...</div>
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
                <div key={member.uid} className="team-member-card">
                  <div className="team-member-card__header">
                    <div className="team-member-identity">
                      <div className="team-member-avatar">
                        {profileImageValue ? (
                          <img src={profileImageValue} alt={`${member.name} profile`} referrerPolicy="no-referrer" />
                        ) : (
                          <span>{member.name.slice(0, 2)}</span>
                        )}
                      </div>
                      <div className="team-member-identity__copy">
                        <div className="team-member-name">{member.name}</div>
                        <div className="team-member-role">{MEMBER_ROLE_LABELS[member.role]}</div>
                      </div>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.uid)}
                        disabled={memberBusy}
                        className="team-profile-action team-profile-action--danger"
                      >
                        제거
                      </button>
                    )}
                  </div>

                  {canManage ? (
                    <div className="team-member-details">
                      <div className="team-member-edit-grid">
                        <input
                          value={numberValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], number: e.target.value } }))}
                          placeholder="등번호"
                          aria-label={`${member.name} 등번호`}
                        />
                        <input
                          value={positionValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], position: e.target.value } }))}
                          placeholder="포지션"
                          aria-label={`${member.name} 포지션`}
                        />
                        <select
                          value={batsValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], bats: e.target.value } }))}
                          aria-label={`${member.name} 타석`}
                        >
                          <option value="R">타 R</option>
                          <option value="L">타 L</option>
                          <option value="S">타 S</option>
                        </select>
                        <select
                          value={throwsValue}
                          onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], throws: e.target.value } }))}
                          aria-label={`${member.name} 투구`}
                        >
                          <option value="R">투 R</option>
                          <option value="L">투 L</option>
                        </select>
                      </div>
                      <input
                        value={profileImageValue}
                        onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], profileImageUrl: e.target.value } }))}
                        placeholder="프로필 이미지 URL"
                        aria-label={`${member.name} 프로필 이미지 URL`}
                      />
                      <textarea
                        value={profileBioValue}
                        onChange={(e) => setMemberEdits((prev) => ({ ...prev, [member.uid]: { ...prev[member.uid], profileBio: e.target.value } }))}
                        placeholder="프로필 한 줄 소개"
                        aria-label={`${member.name} 프로필 소개`}
                        rows={2}
                      />
                      <div className="team-member-actions">
                        <button
                          type="button"
                          onClick={() => handleSaveMember(member.uid)}
                          disabled={memberBusy}
                          className="team-profile-action"
                        >
                          정보 저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="team-member-details">
                      {member.profileBio && <div className="team-member-bio">{member.profileBio}</div>}
                      <div className="team-member-meta">
                        #{member.number || '-'} · {member.position || '-'} · 타 {member.bats || '-'} / 투 {member.throws || '-'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="team-profile-empty">등록된 팀원이 없습니다.</div>
          )}
        </div>

        {!canManage && !roleLoading && (
          <div className="team-profile-muted">감독 계정으로 로그인하면 팀원 관리를 사용할 수 있습니다.</div>
        )}
      </section>

      {/* ── 기록 ── */}
      <section className="team-profile-section">
        <h2>시즌 기록</h2>
        <div className="team-profile-empty">팀/선수 기록 통계는 준비 중입니다.</div>
      </section>

      {/* ── 안내 ── */}
      <section className="team-profile-note">
        팀 공지/팀 정보/로스터 편집은 감독 계정에서만 사용할 수 있습니다. 시즌 기록 상세는 추후 제공될 예정입니다.
      </section>
    </div>
  );
}
