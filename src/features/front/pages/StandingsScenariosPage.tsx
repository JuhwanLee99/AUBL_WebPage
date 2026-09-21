import { useEffect, useMemo, useState } from 'react';
import { useContent } from '@shared/state/contentProvider';
import { useDemoStore } from '@shared/state/demoStore';
import { buildSeason2026Groups, fetchSeason2026RecordPayload } from '../components/season2026/homeData';
import type { Season2026RecordPayload } from '../components/season2026/types';
import StandingsScenariosView from '../components/season2026/StandingsScenariosView';
import '../styles/season2026-home.css';

export default function StandingsScenariosPage() {
  const { state, actions } = useDemoStore();
  const { content } = useContent();
  const { loadFullSchedule } = actions;
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{ request: number; payload?: Season2026RecordPayload; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([loadFullSchedule(), fetchSeason2026RecordPayload()]).then(([schedule, payload]) => {
      if (!active) return;
      setResult({ request, payload, ...(schedule.status !== 'ready' || payload.phase === 'unavailable' ? { error: '최신 경기·순위 자료를 확인하지 못해 계산을 보류했습니다.' } : {}) });
    }).catch(() => { if (active) setResult({ request, error: '자료를 불러오지 못했습니다.' }); });
    return () => { active = false; };
  }, [loadFullSchedule, request]);
  const loading = result?.request !== request;
  const groups = useMemo(() => loading || result?.error || !result?.payload ? [] : buildSeason2026Groups(result.payload.standings, content.teams.entries, state.matches), [loading, result, content.teams.entries, state.matches]);
  return <StandingsScenariosView groups={groups} loading={loading} error={result?.request === request ? result.error : undefined} checkedAt={result?.payload?.checkedAt} onRetry={() => setRequest(value => value + 1)} />;
}
