import { auth, firestore } from '../firebase/client';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { normalizeEvents, normalizeFeed } from './demoStore.normalize';
import { mergeMatches, normalizeMatches, projectSpectatorMatch } from './demoStore.schedule';
import { normalizeState, snapshotState } from './demoStore.state';
import { applyLineupVisibility, mergeOwnerLineups } from './demoStore.visibility';
import {
  ADMIN_EMAILS,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_POLL_INTERVAL_MS,
  PRESENCE_TTL_MS,
  SCORER_FEED_LIMIT,
  SCORER_LOCK_HEARTBEAT_MS,
  SCORER_LOCK_TTL_MS,
} from './demoStore.constants';
import { resolveUserRole } from './demoStore.auth';
import { WRITE_DEBOUNCE_MS } from './demoStore.constants';
import { pruneUndefined } from './demoStore.helpers';
import type { DemoState, MatchSchedule, PlayEvent, PlayLog, SharedGameState } from './demoStore';

type RefLike<T> = { current: T };

type DemoDispatchAction =
  | { type: 'setMatches'; matches: MatchSchedule[] }
  | { type: 'syncActiveMatch'; matchId: string | null }
  | { type: 'hydrate'; state: DemoState }
  | { type: 'setFeed'; feed: PlayLog[] }
  | { type: 'setEvents'; events: PlayEvent[] }
  | { type: 'setOnlineViewerCount'; count: number };

type DemoDispatch = (action: DemoDispatchAction) => void;

const isMatchCompleted = (match?: MatchSchedule | null) =>
  match?.status === 'completed' || match?.status === 'canceled';

export function subscribeMatchesSnapshot(params: {
  isAdmin: boolean;
  stateRef: RefLike<DemoState>;
  skipMatchesWriteRef: RefLike<boolean>;
  matchesReadyRef: RefLike<boolean>;
  skipFirestoreWriteRef: RefLike<boolean>;
  notifiedMatchStartRef: RefLike<Set<string>>;
  dispatch: DemoDispatch;
}) {
  const {
    isAdmin,
    stateRef,
    skipMatchesWriteRef,
    matchesReadyRef,
    skipFirestoreWriteRef,
    notifiedMatchStartRef,
    dispatch,
  } = params;
  const liveQuery = query(collection(firestore, 'matches'), orderBy('startTime', 'asc'));

  return onSnapshot(
    liveQuery,
    (snap) => {
      const incoming = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Partial<MatchSchedule>),
      }));
      const normalized = normalizeMatches(incoming);
      const projected = isAdmin ? normalized : normalized.map(projectSpectatorMatch);
      const merged = isAdmin
        ? projected
        : mergeMatches(
            stateRef.current.matches.filter((match) => match.status !== 'inProgress'),
            projected,
          );

      skipMatchesWriteRef.current = true;
      matchesReadyRef.current = true;
      dispatch({ type: 'setMatches', matches: merged });

      if (!stateRef.current.activeMatchId) {
        const live = merged.find((match) => match.status === 'inProgress');
        if (live) {
          skipFirestoreWriteRef.current = true;
          dispatch({ type: 'syncActiveMatch', matchId: live.id });
        }
      }

      if (typeof window !== 'undefined' && typeof Notification !== 'undefined') {
        const started = projected.filter((match) => match.status === 'inProgress');
        started.forEach((match) => {
          if (notifiedMatchStartRef.current.has(match.id)) return;
          const permission = Notification.permission;
          const show = () => {
            const title = '경기 시작';
            const body = `${match.homeTeamName} vs ${match.awayTeamName} · ${new Date(match.startTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
            try {
              new Notification(title, { body });
              notifiedMatchStartRef.current.add(match.id);
            } catch {
              // ignore notification failures
            }
          };
          if (permission === 'granted') {
            show();
          } else if (permission === 'default') {
            void Notification.requestPermission().then((result) => {
              if (result === 'granted') show();
            });
          }
        });
      }
    },
    (error) => {
      console.error('[firestore] matches snapshot error', error);
    },
  );
}

export function subscribeCurrentMatchPointer(params: {
  stateRef: RefLike<DemoState>;
  skipFirestoreWriteRef: RefLike<boolean>;
  dispatch: DemoDispatch;
}) {
  const { stateRef, skipFirestoreWriteRef, dispatch } = params;
  const currentRef = doc(firestore, 'app', 'current');
  return onSnapshot(
    currentRef,
    (snap) => {
      const data = snap.data();
      if (!data) return;
      const nextId = typeof data.activeMatchId === 'string' ? data.activeMatchId : null;
      if (nextId === stateRef.current.activeMatchId) return;
      skipFirestoreWriteRef.current = true;
      dispatch({ type: 'syncActiveMatch', matchId: nextId });
    },
    () => {
      // ignore errors
    },
  );
}

export function subscribeActiveMatchState(params: {
  activeMatchId: string | null;
  isAdmin: boolean;
  scorerMode: boolean;
  stateRef: RefLike<DemoState>;
  skipFirestoreWriteRef: RefLike<boolean>;
  dispatch: DemoDispatch;
  initialState: DemoState;
}) {
  const {
    activeMatchId,
    isAdmin,
    scorerMode,
    stateRef,
    skipFirestoreWriteRef,
    dispatch,
    initialState,
  } = params;
  if (!activeMatchId) return () => {};

  const matchId = activeMatchId;
  const stateDoc = doc(firestore, 'matchStates', matchId);

  const hydrateCoreState = (core: Omit<SharedGameState, 'feed' | 'events'>) => {
    skipFirestoreWriteRef.current = true;
    dispatch({
      type: 'hydrate',
      state: normalizeState(initialState, {
        ...stateRef.current,
        ...core,
        matches: stateRef.current.matches,
      }),
    });
  };

  const sanitizeSpectatorState = (data: SharedGameState): SharedGameState => {
    const active = stateRef.current.matches.find((match) => match.id === matchId);
    return applyLineupVisibility(data, active, isAdmin);
  };

  const shouldSkipSnapshotForScorer = () => {
    if (!scorerMode) return false;
    const currentUid = auth.currentUser?.uid ?? null;
    if (!currentUid) return false;
    const isScorer = stateRef.current.scorerUid === currentUid;
    if (!isScorer) return false;
    return stateRef.current.lineups.home.some((slot) => slot.name.trim() !== '')
      || stateRef.current.lineups.away.some((slot) => slot.name.trim() !== '');
  };

  void getDoc(stateDoc)
    .then((snap) => {
      if (!snap.exists()) return;
      if (stateRef.current.activeMatchId !== matchId) return;
      if (shouldSkipSnapshotForScorer()) return;
      const raw = snap.data() as SharedGameState;
      const merged = mergeOwnerLineups(raw, matchId, stateRef.current);
      const data = sanitizeSpectatorState(merged);
      const { feed: _feed, events: _events, ...core } = data as SharedGameState & {
        feed?: unknown;
        events?: unknown;
      };
      hydrateCoreState(core);
    })
    .catch(() => {
      // ignore initial fetch errors; realtime listener below will retry on updates
    });

  return onSnapshot(
    stateDoc,
    (snap) => {
      if (!snap.exists()) return;
      if (stateRef.current.activeMatchId !== matchId) return;
      if (shouldSkipSnapshotForScorer()) return;
      const raw = snap.data() as SharedGameState;
      const merged = mergeOwnerLineups(raw, matchId, stateRef.current);
      const data = sanitizeSpectatorState(merged);
      const { feed: _feed, events: _events, ...core } = data as SharedGameState & {
        feed?: unknown;
        events?: unknown;
      };
      hydrateCoreState(core);
    },
    () => {
      // ignore snapshot errors
    },
  );
}

export function subscribeFeedAndEvents(params: {
  activeMatchId: string | null;
  scorerMode: boolean;
  spectatorFeedLimit: number;
  stateRef: RefLike<DemoState>;
  skipFirestoreWriteRef: RefLike<boolean>;
  lastFeedLengthRef: RefLike<number>;
  lastEventsLengthRef: RefLike<number>;
  dispatch: DemoDispatch;
}) {
  const {
    activeMatchId,
    scorerMode,
    spectatorFeedLimit,
    stateRef,
    skipFirestoreWriteRef,
    lastFeedLengthRef,
    lastEventsLengthRef,
    dispatch,
  } = params;
  if (!activeMatchId) return () => {};

  const matchId = activeMatchId;
  const isScorer = stateRef.current.scorerUid === (auth.currentUser?.uid ?? null);
  if (isScorer && scorerMode) return () => {};

  const activeMatch = stateRef.current.matches.find((match) => match.id === matchId);
  const completed = isMatchCompleted(activeMatch) || stateRef.current.gameOver;
  const maxEntries = isScorer && scorerMode ? SCORER_FEED_LIMIT : spectatorFeedLimit;

  const feedQuery = completed
    ? query(collection(firestore, 'matchStates', matchId, 'feed'), orderBy('createdAt', 'asc'))
    : query(collection(firestore, 'matchStates', matchId, 'feed'), orderBy('createdAt', 'desc'), limit(maxEntries));
  const eventsQuery = completed
    ? query(collection(firestore, 'matchStates', matchId, 'events'), orderBy('createdAt', 'asc'))
    : query(collection(firestore, 'matchStates', matchId, 'events'), orderBy('createdAt', 'desc'), limit(maxEntries));

  const prime = async () => {
    try {
      const [feedSnap, eventsSnap] = await Promise.all([getDocs(feedQuery), getDocs(eventsQuery)]);
      const fallback = { inning: stateRef.current.inning, half: stateRef.current.half };
      const feedEntries = normalizeFeed(feedSnap.docs.map((docSnap) => docSnap.data()), fallback);
      const eventEntries = normalizeEvents(eventsSnap.docs.map((docSnap) => docSnap.data()), fallback);
      if (stateRef.current.activeMatchId !== matchId) return;
      skipFirestoreWriteRef.current = true;
      lastFeedLengthRef.current = feedEntries.length;
      lastEventsLengthRef.current = eventEntries.length;
      dispatch({ type: 'setFeed', feed: feedEntries });
      dispatch({ type: 'setEvents', events: eventEntries });
    } catch {
      // ignore prefetch errors; realtime listener below will retry on updates
    }
  };
  void prime();

  if (completed) return () => {};

  const unsubFeed = onSnapshot(
    feedQuery,
    (snap) => {
      const fallback = { inning: stateRef.current.inning, half: stateRef.current.half };
      const feedEntries = normalizeFeed(snap.docs.map((docSnap) => docSnap.data()), fallback);
      if (stateRef.current.activeMatchId !== matchId) return;
      skipFirestoreWriteRef.current = true;
      lastFeedLengthRef.current = feedEntries.length;
      dispatch({ type: 'setFeed', feed: feedEntries });
    },
    () => {
      // ignore feed snapshot errors
    },
  );

  const unsubEvents = onSnapshot(
    eventsQuery,
    (snap) => {
      const fallback = { inning: stateRef.current.inning, half: stateRef.current.half };
      const eventEntries = normalizeEvents(snap.docs.map((docSnap) => docSnap.data()), fallback);
      if (stateRef.current.activeMatchId !== matchId) return;
      skipFirestoreWriteRef.current = true;
      lastEventsLengthRef.current = eventEntries.length;
      dispatch({ type: 'setEvents', events: eventEntries });
    },
    () => {
      // ignore events snapshot errors
    },
  );

  return () => {
    unsubFeed();
    unsubEvents();
  };
}

export function syncScorerLock(params: {
  scorerMode: boolean;
  activeMatchId: string | null;
  stateRef: RefLike<DemoState>;
  skipFirestoreWriteRef: RefLike<boolean>;
  dispatch: DemoDispatch;
  initialState: DemoState;
}) {
  const { scorerMode, activeMatchId, stateRef, skipFirestoreWriteRef, dispatch, initialState } = params;
  if (!scorerMode) return;
  const matchId = activeMatchId;
  const user = auth.currentUser;
  if (!matchId || !user) return;
  const run = async () => {
    const stateDoc = doc(firestore, 'matchStates', matchId);
    const now = Date.now();
    const roleLabel = await resolveUserRole(user, ADMIN_EMAILS);
    await runTransaction(firestore, async (tx) => {
      const snap = await tx.get(stateDoc);
      const data = snap.exists()
        ? (snap.data() as SharedGameState & {
            scorerUid?: string | null;
            scorerName?: string | null;
            scorerEmail?: string | null;
            scorerLockedAt?: number | null;
            scorerRole?: string | null;
          })
        : null;
      const owner = data?.scorerUid;
      const lockedAt = data?.scorerLockedAt ?? 0;
      const expired = !lockedAt || now - lockedAt > SCORER_LOCK_TTL_MS;
      if (owner && owner !== user.uid && !expired) {
        return;
      }
      tx.set(
        stateDoc,
        {
          scorerUid: user.uid,
          scorerName: user.displayName ?? null,
          scorerEmail: user.email ?? null,
          scorerLockedAt: now,
          scorerRole: data?.scorerRole ?? roleLabel,
        },
        { merge: true },
      );
    });
    if (stateRef.current.activeMatchId !== matchId) return;
    skipFirestoreWriteRef.current = true;
    dispatch({
      type: 'hydrate',
      state: normalizeState(initialState, {
        ...stateRef.current,
        scorerUid: user.uid,
        scorerName: user.displayName ?? null,
        scorerEmail: user.email ?? null,
        scorerLockedAt: stateRef.current.scorerLockedAt ?? now,
        scorerRole: stateRef.current.scorerRole ?? roleLabel,
        matches: stateRef.current.matches,
      }),
    });
  };
  void run().catch(() => {
    // ignore lock acquisition errors
  });
}

export function syncScorerLockHeartbeat(params: {
  scorerMode: boolean;
  activeMatchId: string | null;
  scorerUid: string | null;
  scorerLockedAt: number | null;
  heartbeatTimerRef: RefLike<ReturnType<typeof setInterval> | null>;
}) {
  const { scorerMode, activeMatchId, scorerUid, scorerLockedAt, heartbeatTimerRef } = params;
  if (!scorerMode) return;
  const matchId = activeMatchId;
  const user = auth.currentUser;
  const isOwner = matchId && user && scorerUid === user.uid;
  const expired = !scorerLockedAt || Date.now() - scorerLockedAt > SCORER_LOCK_TTL_MS;
  if (!isOwner || !matchId) return;

  if (expired) {
    void setDoc(
      doc(firestore, 'matchStates', matchId),
      { scorerUid: user!.uid, scorerLockedAt: Date.now() },
      { merge: true },
    ).catch(() => {});
  }

  heartbeatTimerRef.current = setInterval(() => {
    const now = Date.now();
    void setDoc(
      doc(firestore, 'matchStates', matchId),
      { scorerUid: user!.uid, scorerLockedAt: now },
      { merge: true },
    ).catch(() => {});
  }, SCORER_LOCK_HEARTBEAT_MS);

  return () => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
  };
}

export function syncOnlineViewerCount(params: {
  activeMatchId: string | null;
  dispatch: DemoDispatch;
}) {
  const { activeMatchId, dispatch } = params;
  const matchId = activeMatchId;
  if (!matchId) {
    dispatch({ type: 'setOnlineViewerCount', count: 0 });
    return;
  }

  const presenceCol = collection(firestore, 'matchStates', matchId, 'presence');
  let cancelled = false;

  const pollViewerCount = async () => {
    try {
      const now = Date.now();
      const countQuery = query(presenceCol, where('expiresAt', '>=', now));
      const aggregate = await getCountFromServer(countQuery);
      if (cancelled) return;
      dispatch({ type: 'setOnlineViewerCount', count: aggregate.data().count });
    } catch {
      // ignore count errors
    }
  };

  void pollViewerCount();
  const timer = setInterval(() => {
    void pollViewerCount();
  }, PRESENCE_POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

export function syncPresenceHeartbeat(params: {
  activeMatchId: string | null;
  visitorIdRef: RefLike<string | null>;
  presenceTimerRef: RefLike<ReturnType<typeof setInterval> | null>;
}) {
  const { activeMatchId, visitorIdRef, presenceTimerRef } = params;
  const matchId = activeMatchId;
  if (!matchId) return;

  const getVisitorId = (): string => {
    if (visitorIdRef.current) return visitorIdRef.current;
    const user = auth.currentUser;
    if (user) {
      visitorIdRef.current = user.uid;
      return user.uid;
    }
    const storageKey = 'aubl-visitor-id';
    let visitorId = sessionStorage.getItem(storageKey);
    if (!visitorId) {
      visitorId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(storageKey, visitorId);
    }
    visitorIdRef.current = visitorId;
    return visitorId;
  };

  const visitorId = getVisitorId();
  const presenceDocRef = doc(firestore, 'matchStates', matchId, 'presence', visitorId);

  const updatePresence = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = Date.now();
    void setDoc(
      presenceDocRef,
      {
        visitorId,
        isAnonymous: auth.currentUser == null,
        lastHeartbeat: now,
        expiresAt: now + PRESENCE_TTL_MS,
      },
      { merge: true },
    ).catch(() => {});
  };

  const stopHeartbeat = () => {
    if (!presenceTimerRef.current) return;
    clearInterval(presenceTimerRef.current);
    presenceTimerRef.current = null;
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    presenceTimerRef.current = setInterval(() => {
      updatePresence();
    }, PRESENCE_HEARTBEAT_MS);
  };

  const handleVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      stopHeartbeat();
      return;
    }
    updatePresence();
    startHeartbeat();
  };

  updatePresence();
  startHeartbeat();

  const handleBeforeUnload = () => {
    void deleteDoc(presenceDocRef).catch(() => {});
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  window.addEventListener('beforeunload', handleBeforeUnload);

  return () => {
    stopHeartbeat();
    window.removeEventListener('beforeunload', handleBeforeUnload);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    void deleteDoc(presenceDocRef).catch(() => {});
  };
}

export function syncGameStateWrite(params: {
  state: DemoState;
  scorerMode: boolean;
  isAdmin: boolean;
  stateRef: RefLike<DemoState>;
  skipFirestoreWriteRef: RefLike<boolean>;
  lastStateKeyRef: RefLike<string>;
  lastFeedLengthRef: RefLike<number>;
  lastEventsLengthRef: RefLike<number>;
  writeTimerRef: RefLike<ReturnType<typeof setTimeout> | null>;
}) {
  const {
    state,
    scorerMode,
    isAdmin,
    stateRef,
    skipFirestoreWriteRef,
    lastStateKeyRef,
    lastFeedLengthRef,
    lastEventsLengthRef,
    writeTimerRef,
  } = params;
  if (!scorerMode) return;
  if (!isAdmin) return;
  const matchId = state.activeMatchId;
  const currentUid = auth.currentUser?.uid ?? null;
  if (!matchId || !currentUid) return;
  if (state.scorerUid && state.scorerUid !== currentUid) return;
  if (skipFirestoreWriteRef.current) {
    skipFirestoreWriteRef.current = false;
    lastStateKeyRef.current = '';
    lastFeedLengthRef.current = state.feed.length;
    lastEventsLengthRef.current = state.events.length;
    return;
  }
  if (writeTimerRef.current) clearTimeout(writeTimerRef.current);

  writeTimerRef.current = setTimeout(() => {
    const run = async () => {
      const snapshot = snapshotState(stateRef.current);
      const { matches: _matches, feed: _feed, events: _events, onlineViewerCount: _onlineViewerCount, ...core } = snapshot;
      const key = JSON.stringify({ matchId, core });

      if (key !== lastStateKeyRef.current) {
        lastStateKeyRef.current = key;
        const payload = {
          ...pruneUndefined({
            ...core,
            updatedAt: Date.now(),
          }),
          feed: deleteField(),
          events: deleteField(),
        };
        await setDoc(doc(firestore, 'matchStates', matchId), payload, { merge: true });
      }

      const newFeedCount = stateRef.current.feed.length - lastFeedLengthRef.current;
      const newEventCount = stateRef.current.events.length - lastEventsLengthRef.current;
      const needsFeedDelete = newFeedCount < 0;
      const needsEventDelete = newEventCount < 0;
      const needsFeedAdd = newFeedCount > 0;
      const needsEventAdd = newEventCount > 0;

      if (!needsFeedDelete && !needsEventDelete && !needsFeedAdd && !needsEventAdd) {
        lastFeedLengthRef.current = stateRef.current.feed.length;
        lastEventsLengthRef.current = stateRef.current.events.length;
        return;
      }

      const deleteLatest = async (collectionName: 'feed' | 'events', count: number) => {
        if (count <= 0) return;
        const q = query(
          collection(firestore, 'matchStates', matchId, collectionName),
          orderBy('createdAt', 'desc'),
          limit(count),
        );
        const snap = await getDocs(q);
        if (snap.empty) return;
        const batch = writeBatch(firestore);
        snap.docs.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      };

      if (needsFeedDelete) {
        await deleteLatest('feed', Math.abs(newFeedCount));
      }
      if (needsEventDelete) {
        await deleteLatest('events', Math.abs(newEventCount));
      }

      if (needsFeedAdd || needsEventAdd) {
        const batch = writeBatch(firestore);
        const now = Date.now();

        if (needsFeedAdd) {
          const newEntries = stateRef.current.feed.slice(-newFeedCount);
          newEntries.forEach((entry, idx) => {
            const createdAt =
              typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
                ? entry.createdAt
                : now + idx;
            batch.set(
              doc(collection(firestore, 'matchStates', matchId, 'feed')),
              pruneUndefined({ ...entry, createdAt }),
            );
          });
        }

        if (needsEventAdd) {
          const newEntries = stateRef.current.events.slice(0, newEventCount);
          newEntries.forEach((entry, idx) => {
            const createdAt =
              typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
                ? entry.createdAt
                : now + idx;
            batch.set(
              doc(collection(firestore, 'matchStates', matchId, 'events')),
              pruneUndefined({ ...entry, createdAt }),
            );
          });
        }

        await batch.commit();
      }

      lastFeedLengthRef.current = stateRef.current.feed.length;
      lastEventsLengthRef.current = stateRef.current.events.length;
    };

    void run().catch(() => {
      // ignore sync errors; will retry on next state change
    });
  }, WRITE_DEBOUNCE_MS);

  return () => {
    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current);
      writeTimerRef.current = null;
    }
  };
}

export function syncScheduleMatchesWrite(params: {
  matches: MatchSchedule[];
  isAdmin: boolean;
  matchesReadyRef: RefLike<boolean>;
  skipMatchesWriteRef: RefLike<boolean>;
  lastMatchesKeyRef: RefLike<string>;
}) {
  const { matches, isAdmin, matchesReadyRef, skipMatchesWriteRef, lastMatchesKeyRef } = params;
  if (!isAdmin) return;
  if (!matchesReadyRef.current) return;
  if (skipMatchesWriteRef.current) {
    skipMatchesWriteRef.current = false;
    return;
  }

  const key = JSON.stringify(
    matches.map((match) => ({
      id: match.id,
      status: match.status,
      startTime: match.startTime,
      notes: match.notes ?? null,
      division: match.division ?? null,
      venue: match.venue,
      recordMode: match.recordMode ?? 'official',
      homeTeamName: match.homeTeamName,
      awayTeamName: match.awayTeamName,
      liveVideoUrl: match.liveVideoUrl ?? null,
      liveDelaySeconds: match.liveDelaySeconds ?? null,
      deleted: match.deleted ?? false,
      deletedAt: match.deletedAt ?? null,
      purgeAt: match.purgeAt ?? null,
      lineupPublic: match.lineupPublic ?? false,
      lineups: match.lineups ?? null,
      benches: match.benches ?? null,
      postGame: match.postGame ?? null,
    })),
  );
  if (key === lastMatchesKeyRef.current) return;
  lastMatchesKeyRef.current = key;

  const syncMatches = async () => {
    const batch = writeBatch(firestore);
    const filterEmptySlots = (lineup: MatchSchedule['lineups']['home']) =>
      lineup.filter((slot) => slot.name && slot.name.trim() !== '');

    matches.forEach((match) => {
      const preserveEmptySlots = (match.recordMode ?? 'official') === 'practice';
      const cleanedMatch = {
        ...match,
        lineups: match.lineups
          ? preserveEmptySlots
            ? match.lineups
            : {
                home: filterEmptySlots(match.lineups.home),
                away: filterEmptySlots(match.lineups.away),
              }
          : undefined,
      };
      batch.set(doc(firestore, 'matches', match.id), pruneUndefined(cleanedMatch), { merge: true });
    });
    await batch.commit();
  };
  void syncMatches().catch(() => {});
}

export function syncLiveScorePatch(params: {
  isAdmin: boolean;
  activeMatchId: string | null;
  matches: MatchSchedule[];
  homeScore: number;
  awayScore: number;
  lastLiveScoreSyncKeyRef: RefLike<string>;
  pushMatchUpdate: (matchId: string, overrides?: Partial<MatchSchedule>) => Promise<unknown> | unknown;
}) {
  const { isAdmin, activeMatchId, matches, homeScore, awayScore, lastLiveScoreSyncKeyRef, pushMatchUpdate } = params;
  if (!isAdmin) return;
  const matchId = activeMatchId;
  if (!matchId) return;
  const activeMatch = matches.find((match) => match.id === matchId);
  if (!activeMatch || activeMatch.status !== 'inProgress') return;
  const scoreKey = `${matchId}:${homeScore}:${awayScore}`;
  if (scoreKey === lastLiveScoreSyncKeyRef.current) return;
  lastLiveScoreSyncKeyRef.current = scoreKey;
  void pushMatchUpdate(matchId, { homeScore, awayScore }).catch(() => {});
}

export function autoPurgeExpiredMatches(params: {
  matches: MatchSchedule[];
  purgeMatchFromFirestore: (matchId: string) => Promise<void>;
}) {
  const { matches, purgeMatchFromFirestore } = params;
  const now = Date.now();
  const expired = matches.filter((match) => match.deleted && match.purgeAt && match.purgeAt <= now);
  if (!expired.length) return;
  expired.forEach((entry) => {
    void purgeMatchFromFirestore(entry.id).catch(() => {});
  });
}
