import { useEffect, useState } from 'react';
import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';
import { applyLatestDraw, createTournament, validateTournament, type TournamentConfig } from './model';

const draftRef = () => doc(firestore, 'tournamentDrafts', 'season2026');
const publicRef = () => doc(firestore, 'tournamentPublic', 'season2026');
export interface TournamentVersions { draft: number; published: number }
function revision(data: { revision?: unknown } | undefined): number {
  if (!data) return 0;
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 1) throw new Error('저장 버전을 확인할 수 없습니다. 덮어쓰지 않고 중단합니다.');
  return Number(data.revision);
}

export async function loadTournamentAdmin() {
  const draft = await getDocFromServer(draftRef());
  const published = await getDocFromServer(publicRef());
  const config: unknown = applyLatestDraw(draft.exists() ? draft.data().config as TournamentConfig : createTournament());
  validateTournament(config);
  return { config, enabled: published.data()?.enabled === true,
    versions: { draft: revision(draft.data()), published: revision(published.data()) } };
}

export async function persistTournament(config: TournamentConfig, expected: TournamentVersions, action: 'draft' | 'publish' | 'hide'): Promise<TournamentVersions> {
  if (action !== 'hide') validateTournament(config);
  return runTransaction(firestore, async transaction => {
    const draft = await transaction.get(draftRef());
    const published = await transaction.get(publicRef());
    const current = { draft: revision(draft.data()), published: revision(published.data()) };
    if ((action !== 'hide' && current.draft !== expected.draft)
      || (action !== 'draft' && current.published !== expected.published)) throw new Error('다른 관리자가 변경했습니다. 입력 내용을 별도로 보관한 뒤 최신 자료를 다시 불러오세요.');
    if (action !== 'hide') {
      current.draft += 1;
      transaction.set(draftRef(), { revision: current.draft, config, updatedAt: serverTimestamp() });
    }
    if (action !== 'draft') {
      current.published += 1;
      transaction.set(publicRef(), action === 'publish'
        ? { revision: current.published, enabled: true, config, updatedAt: serverTimestamp() }
        : { revision: current.published, enabled: false, updatedAt: serverTimestamp() });
    }
    return current;
  });
}

export function usePublicTournament() {
  const [state, setState] = useState<{ config: TournamentConfig | null; loading: boolean; error: string | null }>({ config: null, loading: true, error: null });
  useEffect(() => onSnapshot(publicRef(), { includeMetadataChanges: true }, snapshot => {
    // Do not revive a withdrawn publication from a stale offline cache.
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
      setState({ config: null, loading: true, error: null }); return;
    }
    try {
      const data = snapshot.data();
      if (!data || data.enabled !== true) { setState({ config: null, loading: false, error: null }); return; }
      const config = applyLatestDraw(data.config);
      validateTournament(config);
      setState({ config, loading: false, error: null });
    } catch {
      setState({ config: null, loading: false, error: '공개 대진표를 확인할 수 없습니다.' });
    }
  }, () => setState({ config: null, loading: false, error: '대진표 연결을 확인해 주세요.' })), []);
  return state;
}
