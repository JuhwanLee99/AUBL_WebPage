import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import Season2026Home from '../components/season2026/Season2026Home';
import {
  buildSeason2026Groups,
  fetchSeason2026RecordPayload,
} from '../components/season2026/homeData';
import type {
  HomeDataPhase,
  HomeSchedulePhase,
  Season2026RecordPayload,
} from '../components/season2026/types';
import '../styles/season2026-home.css';
import { firestore } from '@shared/firebase/client';
import { useAuth } from '@shared/auth/AuthProvider';
import { getMembershipsByUid } from '@shared/auth/membershipLookup';
import { useTeamRole } from '@shared/auth/useTeamRole';
import { useFeatureFlags } from '@shared/config/FeatureFlagsProvider';
import { decodeTeamId } from '@shared/lib/teamDirectory';
import { useContent } from '@shared/state/contentProvider';
import { useDemoStore } from '@shared/state/demoStore';
import type { Notice, TeamNotice } from '@shared/types';

type FeedPhase = 'loading' | 'ready' | 'error';

const normalizeCreatedAt = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  return 0;
};

export default function LandingPage() {
  const { state, actions } = useDemoStore();
  const { content } = useContent();
  const { allstarEnabled } = useFeatureFlags();
  const { user } = useAuth();
  const { isCoach, coachTeamId } = useTeamRole();

  const [schedulePhase, setSchedulePhase] = useState<HomeSchedulePhase>('loading');
  const [recordPhase, setRecordPhase] = useState<HomeDataPhase>('loading');
  const [recordPayload, setRecordPayload] = useState<Season2026RecordPayload | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticePhase, setNoticePhase] = useState<FeedPhase>('loading');
  const [memberTeamState, setMemberTeamState] = useState<{ uid: string; teamId: string | null } | null>(null);
  const [teamNoticeState, setTeamNoticeState] = useState<{
    teamId: string;
    phase: Exclude<FeedPhase, 'loading'>;
    notices: TeamNotice[];
  } | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    void actions.loadFullSchedule().then(
      (result) => {
        if (!active) return;
        setSchedulePhase(result.status);
      },
      () => {
        if (!active) return;
        setSchedulePhase('error');
      },
    );
    return () => {
      active = false;
    };
  }, [actions]);

  useEffect(() => {
    let active = true;
    void fetchSeason2026RecordPayload().then((payload) => {
      if (!active) return;
      setRecordPayload(payload);
      setRecordPhase(payload.phase);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const noticesQuery = query(collection(firestore, 'notices'), orderBy('createdAt', 'desc'), limit(6));
    const unsubscribe = onSnapshot(
      noticesQuery,
      (snapshot) => {
        const next = snapshot.docs.map((document) => {
          const data = document.data() as Partial<Notice> & { createdAt?: unknown };
          return {
            id: document.id,
            title: data.title?.trim() || '제목 없음',
            category: data.category ?? '일반',
            content: data.content ?? '',
            author: data.author ?? '운영진',
            createdAt: normalizeCreatedAt(data.createdAt),
            isImportant: data.isImportant,
            allowComments: data.allowComments,
          } satisfies Notice;
        });
        setNotices(next);
        setNoticePhase('ready');
      },
      () => {
        setNotices([]);
        setNoticePhase('error');
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || isCoach) return;
    let active = true;
    const uid = user.uid;
    void getMembershipsByUid(user.uid, 1)
      .then((snapshot) => {
        if (!active) return;
        const teamRef = snapshot.empty ? null : snapshot.docs[0]?.ref.parent.parent;
        setMemberTeamState({ uid, teamId: teamRef?.id ?? null });
      })
      .catch(() => {
        if (active) setMemberTeamState({ uid, teamId: null });
      });
    return () => {
      active = false;
    };
  }, [isCoach, user]);

  const resolvedMemberTeamId = user && memberTeamState?.uid === user.uid ? memberTeamState.teamId : null;
  const membershipPending = Boolean(user && !isCoach && memberTeamState?.uid !== user.uid);
  const myTeamId = user ? coachTeamId ?? resolvedMemberTeamId : null;
  const myTeamName = useMemo(() => (myTeamId ? decodeTeamId(myTeamId) : null), [myTeamId]);

  useEffect(() => {
    if (!myTeamId) return;
    const teamNoticeQuery = query(
      collection(firestore, 'teams', myTeamId, 'notices'),
      orderBy('createdAt', 'desc'),
      limit(5),
    );
    const unsubscribe = onSnapshot(
      teamNoticeQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((document) => {
            const data = document.data() as Partial<TeamNotice> & { createdAt?: unknown };
            return {
              id: document.id,
              title: data.title?.trim() || '제목 없음',
              content: data.content ?? '',
              createdAt: normalizeCreatedAt(data.createdAt),
              createdByUid: data.createdByUid,
              createdByName: data.createdByName,
              category: data.category,
              pinned: data.pinned,
            } satisfies TeamNotice;
          })
          .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt);
        setTeamNoticeState({ teamId: myTeamId, phase: 'ready', notices: next });
      },
      () => {
        setTeamNoticeState({ teamId: myTeamId, phase: 'error', notices: [] });
      },
    );
    return () => unsubscribe();
  }, [myTeamId]);

  const teamNotices = teamNoticeState?.teamId === myTeamId ? teamNoticeState.notices : [];
  const teamNoticePhase: FeedPhase | 'idle' = membershipPending
    ? 'loading'
    : !myTeamId
      ? 'idle'
      : teamNoticeState?.teamId === myTeamId
        ? teamNoticeState.phase
        : 'loading';

  const groups = useMemo(
    () => buildSeason2026Groups(recordPayload?.standings ?? [], content.teams.entries, state.matches),
    [content.teams.entries, recordPayload?.standings, state.matches],
  );

  return (
    <Season2026Home
      landing={content.landing}
      announcement={content.announcement}
      matches={state.matches}
      schedulePhase={schedulePhase}
      recordPhase={recordPhase}
      recordPayload={recordPayload}
      groups={groups}
      notices={notices}
      noticePhase={noticePhase}
      userSignedIn={Boolean(user)}
      myTeamId={myTeamId}
      myTeamName={myTeamName}
      teamNotices={teamNotices}
      teamNoticePhase={teamNoticePhase}
      allstarEnabled={allstarEnabled}
      nowTs={nowTs}
    />
  );
}
