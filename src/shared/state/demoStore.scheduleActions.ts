import { useMemo } from 'react';
import { auth, firestore } from '../firebase/client';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { SCORER_FEED_LIMIT, SCORER_LOCK_TTL_MS, TRASH_RETENTION_MS } from './demoStore.constants';
import { getSpectatorFeedLimitForMatch, isCompletedMatch, pruneUndefined } from './demoStore.helpers';
import { cloneBenches, cloneLineups, hasActualPlayers } from './demoStore.lineup';
import { normalizeEvents, normalizeFeed } from './demoStore.normalize';
import { mergeMatches, normalizeMatches, projectSpectatorMatch } from './demoStore.schedule';
import { normalizeState } from './demoStore.state';
import { applyLineupVisibility, mergeOwnerLineups } from './demoStore.visibility';
import type { DemoState, MatchSchedule, PlayEvent, PlayLog, PlayerSlot, SharedGameState } from './demoStore';

type ScheduleAction =
  | { type: 'addMatch'; match: MatchSchedule }
  | { type: 'updateMatch'; matchId: string; updates: Partial<MatchSchedule> }
  | { type: 'deleteMatch'; matchId: string }
  | { type: 'moveMatchToTrash'; matchId: string; entry: MatchSchedule }
  | { type: 'restoreMatch'; matchId: string }
  | { type: 'purgeTrash'; matchId: string }
  | {
      type: 'saveMatchLineups';
      matchId: string;
      lineups: { home: PlayerSlot[]; away: PlayerSlot[] };
      benches: { home: PlayerSlot[]; away: PlayerSlot[] };
    }
  | { type: 'selectMatch'; matchId: string | null; followCurrent?: boolean }
  | { type: 'setMatches'; matches: MatchSchedule[] }
  | { type: 'setFeed'; feed: PlayLog[] }
  | { type: 'setEvents'; events: PlayEvent[] }
  | { type: 'hydrate'; state: DemoState }
  | { type: 'releaseLock' }
  | {
      type: 'resumeLock';
      payload: {
        scorerUid: string;
        scorerName: string | null;
        scorerEmail: string | null;
        scorerRole: string | null;
        lockedAt: number;
      };
    };

type Dispatch = (action: ScheduleAction) => void;

export function useScheduleActions(params: {
  dispatch: Dispatch;
  getState: () => DemoState;
  isAdmin: boolean;
  markMatchesReady: () => void;
  markSkipMatchesWrite: () => void;
  markSkipFirestoreWrite: () => void;
  setLastFeedLength: (length: number) => void;
  setLastEventsLength: (length: number) => void;
  pushMatchUpdate: (matchId: string, overrides?: Partial<MatchSchedule>) => Promise<unknown> | unknown;
  purgeMatchFromFirestore: (matchId: string) => Promise<void>;
  updateCurrentMatchPointer: (matchId: string | null) => void;
  initialState: DemoState;
}) {
  const {
    dispatch,
    getState,
    isAdmin,
    markMatchesReady,
    markSkipMatchesWrite,
    markSkipFirestoreWrite,
    setLastFeedLength,
    setLastEventsLength,
    pushMatchUpdate,
    purgeMatchFromFirestore,
    updateCurrentMatchPointer,
    initialState,
  } = params;

  return useMemo(() => ({
    addMatch: (match: MatchSchedule) => {
      markMatchesReady();

      const dateObj = new Date(match.startTime);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const cleanName = (name: string) => name.trim().replace(/\s+/g, '');
      const home = cleanName(match.homeTeamName || 'Home');
      const away = cleanName(match.awayTeamName || 'Away');
      const customId = `${yyyy}${mm}${dd}-${home}-${away}`;
      const matchWithId = { ...match, id: customId };

      dispatch({ type: 'addMatch', match: matchWithId });
      void setDoc(doc(firestore, 'matches', matchWithId.id), pruneUndefined(matchWithId), { merge: true });

      if (
        matchWithId.lineups &&
        (hasActualPlayers(matchWithId.lineups.home) || hasActualPlayers(matchWithId.lineups.away))
      ) {
        void setDoc(
          doc(firestore, 'matchStates', matchWithId.id),
          pruneUndefined({
            lineups: cloneLineups(matchWithId.lineups),
            benches: matchWithId.benches ? cloneBenches(matchWithId.benches) : undefined,
            updatedAt: Date.now(),
          }),
          { merge: true },
        ).catch(() => {});
      }
    },
    updateMatch: (matchId: string, updates: Partial<MatchSchedule>) => {
      markMatchesReady();
      dispatch({ type: 'updateMatch', matchId, updates });
    },
    deleteMatch: (matchId: string) => {
      markMatchesReady();
      dispatch({ type: 'deleteMatch', matchId });
      if (getState().activeMatchId === matchId) {
        updateCurrentMatchPointer(null);
      }
    },
    moveMatchToTrash: (matchId: string) => {
      const target = getState().matches.find((match) => match.id === matchId);
      if (!target) return;
      const deletedAt = Date.now();
      const payload: MatchSchedule = {
        ...target,
        deleted: true,
        deletedAt,
        purgeAt: deletedAt + TRASH_RETENTION_MS,
        deletedBy: auth.currentUser?.uid,
      };
      markMatchesReady();
      dispatch({ type: 'moveMatchToTrash', matchId, entry: payload });
      void setDoc(doc(firestore, 'matches', matchId), pruneUndefined(payload), { merge: true }).catch(() => {
        dispatch({ type: 'restoreMatch', matchId });
        if (typeof window !== 'undefined') window.alert('삭제 권한을 확인해주세요. (휴지통 이동 실패)');
      });
      if (getState().activeMatchId === matchId) {
        updateCurrentMatchPointer(null);
      }
    },
    restoreMatch: (matchId: string) => {
      const entry = getState().matches.find((match) => match.id === matchId && match.deleted);
      if (!entry) return;
      markMatchesReady();
      dispatch({ type: 'restoreMatch', matchId });
      const restored = { ...entry };
      delete restored.deleted;
      delete restored.deletedAt;
      delete restored.purgeAt;
      delete restored.deletedBy;
      void setDoc(doc(firestore, 'matches', matchId), pruneUndefined(restored), { merge: true }).catch(() => {
        dispatch({ type: 'moveMatchToTrash', matchId, entry });
        if (typeof window !== 'undefined') window.alert('복원 권한을 확인해주세요. (복원 실패)');
      });
    },
    purgeTrash: (matchId: string) => {
      markMatchesReady();
      dispatch({ type: 'purgeTrash', matchId });
      if (getState().activeMatchId === matchId) {
        updateCurrentMatchPointer(null);
      }
      void (async () => {
        try {
          await purgeMatchFromFirestore(matchId);
        } catch (error) {
          console.error('Purge error:', error);
          if (typeof window !== 'undefined') window.alert('영구 삭제 권한을 확인해주세요. (삭제 실패)');
        }
      })();
    },
    saveMatchLineups: (
      matchId: string,
      lineups: { home: PlayerSlot[]; away: PlayerSlot[] },
      benches: { home: PlayerSlot[]; away: PlayerSlot[] },
    ) => {
      markMatchesReady();
      dispatch({ type: 'saveMatchLineups', matchId, lineups, benches });
      void pushMatchUpdate(matchId, { lineups: cloneLineups(lineups), benches: cloneBenches(benches) }).catch(() => {});
      const state = getState();
      const match = state.matches.find((entry) => entry.id === matchId);
      const isActiveMatch = state.activeMatchId === matchId;
      const shouldSyncState = match?.status === 'scheduled' && (!isActiveMatch || !state.gameStarted);
      if (shouldSyncState) {
        void setDoc(
          doc(firestore, 'matchStates', matchId),
          pruneUndefined({
            lineups: cloneLineups(lineups),
            benches: cloneBenches(benches),
            updatedAt: Date.now(),
          }),
          { merge: true },
        ).catch(() => {});
      }
    },
    selectMatch: (matchId: string | null) => {
      const followCurrent = isAdmin;
      markSkipFirestoreWrite();
      dispatch({ type: 'selectMatch', matchId, followCurrent });
      if (isAdmin) updateCurrentMatchPointer(matchId);
      if (!matchId) return;
      const matchIdLocal = matchId;
      void (async () => {
        try {
          const stateDoc = doc(firestore, 'matchStates', matchIdLocal);
          const snap = await getDoc(stateDoc);
          if (snap.exists()) {
            const data = snap.data() as SharedGameState & { feed?: PlayLog[]; events?: PlayEvent[] };
            const current = getState();
            const mergedOwner = mergeOwnerLineups(data, matchIdLocal, current);
            const active = current.matches.find((match) => match.id === matchIdLocal);
            const sanitized = applyLineupVisibility(mergedOwner, active, isAdmin);
            const { feed: _feed, events: _events, ...core } = sanitized as SharedGameState & {
              feed?: unknown;
              events?: unknown;
            };
            markSkipFirestoreWrite();
            dispatch({
              type: 'hydrate',
              state: normalizeState(initialState, {
                ...current,
                ...core,
                matches: current.matches,
              }),
            });
          }
          const current = getState();
          const isScorer = current.scorerUid === (auth.currentUser?.uid ?? null);
          const matchForLimit = current.matches.find((match) => match.id === matchIdLocal);
          const completed = isCompletedMatch(matchForLimit) || current.gameOver;
          const maxEntries = isScorer
            ? SCORER_FEED_LIMIT
            : getSpectatorFeedLimitForMatch(matchForLimit, current.gameOver);
          const fallback = { inning: current.inning, half: current.half as 'top' | 'bottom' };
          const [feedSnap, eventsSnap] = await Promise.all([
            getDocs(
              completed
                ? query(
                    collection(firestore, 'matchStates', matchIdLocal, 'feed'),
                    orderBy('createdAt', 'asc'),
                  )
                : query(
                    collection(firestore, 'matchStates', matchIdLocal, 'feed'),
                    orderBy('createdAt', 'desc'),
                    limit(maxEntries),
                  ),
            ),
            getDocs(
              completed
                ? query(
                    collection(firestore, 'matchStates', matchIdLocal, 'events'),
                    orderBy('createdAt', 'asc'),
                  )
                : query(
                    collection(firestore, 'matchStates', matchIdLocal, 'events'),
                    orderBy('createdAt', 'desc'),
                    limit(maxEntries),
                  ),
            ),
          ]);
          const feedEntries = normalizeFeed(feedSnap.docs.map((docSnap) => docSnap.data()), fallback);
          const eventEntries = normalizeEvents(eventsSnap.docs.map((docSnap) => docSnap.data()), fallback);
          markSkipFirestoreWrite();
          setLastFeedLength(feedEntries.length);
          setLastEventsLength(eventEntries.length);
          dispatch({ type: 'setFeed', feed: feedEntries });
          dispatch({ type: 'setEvents', events: eventEntries });
        } catch {
          // ignore; realtime listener will still try
        }
      })();
    },
    loadFullSchedule: async () => {
      try {
        const snap = await getDocs(
          query(
            collection(firestore, 'matches'),
            where('status', 'in', ['scheduled', 'inProgress', 'completed', 'canceled']),
          ),
        );
        const incoming = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Partial<MatchSchedule>),
        }));
        const normalized = normalizeMatches(incoming);
        const projected = isAdmin ? normalized : normalized.map(projectSpectatorMatch);
        markSkipMatchesWrite();
        markMatchesReady();
        const current = getState();
        dispatch({
          type: 'setMatches',
          matches: mergeMatches(current.matches, projected),
        });
      } catch {
        // ignore fetch errors for spectators; manual retry via action
      }
    },
    releaseLock: () => {
      dispatch({ type: 'releaseLock' });
      const matchId = getState().activeMatchId;
      const user = auth.currentUser;
      if (!matchId || !user) return;
      void setDoc(
        doc(firestore, 'matchStates', matchId),
        {
          scorerUid: null,
          scorerName: null,
          scorerEmail: null,
          scorerLockedAt: null,
          scorerRole: null,
          scorerPaused: true,
          updatedAt: Date.now(),
        },
        { merge: true },
      ).catch(() => {});
    },
    resumeLock: () => {
      const current = getState();
      const matchId = current.activeMatchId;
      const user = auth.currentUser;
      if (!matchId || !user) return;
      const lockedAt = Date.now();
      const payload = {
        scorerUid: user.uid,
        scorerName: user.displayName ?? null,
        scorerEmail: user.email ?? null,
        scorerLockedAt: lockedAt,
        scorerRole: current.scorerRole ?? null,
        scorerPaused: false,
      };
      void runTransaction(firestore, async (tx) => {
        const ref = doc(firestore, 'matchStates', matchId);
        const snap = await tx.get(ref);
        const data = snap.exists() ? (snap.data() as SharedGameState) : null;
        const owner = data?.scorerUid ?? null;
        const locked = data?.scorerLockedAt ?? 0;
        const expired = !locked || Date.now() - locked > SCORER_LOCK_TTL_MS;
        if (owner && owner !== user.uid && !expired) {
          return;
        }
        tx.set(ref, { ...payload, updatedAt: Date.now() }, { merge: true });
      }).catch(() => {});
      dispatch({
        type: 'resumeLock',
        payload: {
          scorerUid: user.uid,
          scorerName: user.displayName ?? null,
          scorerEmail: user.email ?? null,
          scorerRole: current.scorerRole ?? null,
          lockedAt,
        },
      });
    },
  }), [
    dispatch,
    getState,
    isAdmin,
    markMatchesReady,
    markSkipMatchesWrite,
    markSkipFirestoreWrite,
    setLastFeedLength,
    setLastEventsLength,
    pushMatchUpdate,
    purgeMatchFromFirestore,
    updateCurrentMatchPointer,
    initialState,
  ]);
}
