import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useContent } from '@shared/state/contentProvider';
import { useDemoStore } from '@shared/state/demoStore';
import {
  buildSeason2026Groups,
  fetchSeason2026RecordPayload,
} from '@features/front/components/season2026/homeData';
import type { Season2026RecordPayload, HomeGroupView } from '@features/front/components/season2026/types';

import { bucketTransitions } from '@features/front/components/season2026/bucketTransitions';

const sectionStyle: CSSProperties = {
  borderRadius: '4px',
  border: '1px solid var(--season-line)',
  background: 'var(--season-surface)',
  padding: '16px',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  color: '#93c5fd',
  fontSize: '12px',
  fontWeight: 800,
  padding: '8px 6px',
  borderBottom: '1px solid rgba(148,163,184,0.35)',
};

const tdStyle: CSSProperties = {
  color: '#e2e8f0',
  fontSize: '13px',
  padding: '10px 6px',
  borderBottom: '1px solid rgba(148,163,184,0.2)',
};

const projectionLabel = (bucket: 'eutteum' | 'beogeum' | 'out') => {
  if (bucket === 'eutteum') return '으뜸권';
  if (bucket === 'beogeum') return '버금권';
  return '탈락권';
};

const groupSourceLabel = (source: HomeGroupView['source']) => {
  if (source === 'season-overview') return '2026 통합 스냅샷';
  if (source === 'records-api') return 'records-api 순위';
  if (source === 'schedule') return '일정 기반 산출';
  return '팀 구성 데이터 기반';
};

export default function AdminSeason2026ScenariosPage() {
  const { state, actions } = useDemoStore();
  const [scheduleStatus, setScheduleStatus] = useState('loading');
  useEffect(() => {
    let active = true;
    void actions.loadFullSchedule().then((result) => { if (active) setScheduleStatus(result.status); });
    return () => { active = false; };
  }, [actions.loadFullSchedule]);
  const { content } = useContent();

  const [recordPayload, setRecordPayload] = useState<Season2026RecordPayload | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchSeason2026RecordPayload().then((payload) => {
      if (!active) return;
      setRecordPayload(payload);
    }).catch((error) => {
      if (!active) return;
      setPayloadError(error instanceof Error ? error.message : '2026 순위 데이터 조회 실패');
      setRecordPayload({
        phase: 'unavailable',
        seasonId: null,
        seasonYear: 2026,
        standings: [],
        batters: [],
        pitchers: [],
        checkedAt: Date.now(),
        warnings: ['2026 공식 통계 조회 실패'],
        sourceFreshness: null,
      });
    });

    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(() => {
    if (!recordPayload || scheduleStatus !== 'ready') return [];
    return buildSeason2026Groups(recordPayload.standings, content.teams.entries, state.matches);
  }, [recordPayload, content.teams.entries, state.matches, scheduleStatus]);

  const availablePayload = recordPayload?.phase !== 'unavailable';
  const movementCount = rows.reduce((sum, group) => sum + bucketTransitions(group.rows).reduce((count, item) => count + item.destinations.length, 0), 0);

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <section style={sectionStyle}>
        <h2 style={{ margin: 0 }}>조별 시나리오 분석</h2>
        <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>
          현재 구간에서 으뜸권·버금권·탈락권 경계를 넘을 수 있는 경우만 표시합니다. 같은 구간 안의 순위 변화는 제외하고 같은 이동 방향은 하나로 묶습니다.
          팀 간 2경기에서 완료 경기를 차감하며, 일정 미정 대진도 승/패/무 조합에 포함합니다. 미래 득실점이 필요한 동률은 범위로 표시하며, 탐색 한도에 도달한 결과는 부분 계산입니다.
        </p>
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#cbd5e1' }}>
          데이터 소스: {availablePayload ? `2026 payload(phase=${recordPayload?.phase ?? 'loading'})` : '일정/팀 구성 기반'} · 
          구간 이동 유형: {movementCount}개 (팀별 이동 방향 합계, 경기 결과 조합 수가 아닙니다)
        </div>
      </section>

      {scheduleStatus !== 'ready' ? <section style={sectionStyle}>{scheduleStatus === 'loading' ? '전체 경기 자료를 불러오는 중입니다.' : '최신 경기 자료를 불러오지 못해 계산을 보류합니다. 페이지를 새로고침해 주세요.'}</section> : null}
      {payloadError ? (
        <section style={{ ...sectionStyle, borderColor: 'rgba(239,68,68,0.45)', color: '#fca5a5' }}>
          {payloadError}
        </section>
      ) : null}

      {recordPayload?.warnings.length ? (
        <section style={sectionStyle}>
          <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '14px' }}>경고/점검 메시지</h3>
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px', color: '#94a3b8', lineHeight: 1.7, fontSize: '12px' }}>
            {recordPayload.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {rows.map((group) => {
        const transitions = bucketTransitions(group.rows);
        const movements = transitions.filter((item) => item.destinations.length > 0);
        const unresolved = transitions.filter((item) => item.currentUnresolved || item.incomplete);
        const unchanged = transitions.filter((item) => !item.currentUnresolved && !item.incomplete && item.destinations.length === 0);

        return (
          <section key={group.group} style={sectionStyle}>
            <h3 style={{ margin: '0 0 10px', color: '#e2e8f0' }}>
              {group.group}조 ({groupSourceLabel(group.source)})
            </h3>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '10px' }}>
              완료 경기: {group.completedGames} / 예상 경기: {group.expectedGames}
            </div>

            {group.scenarioWarnings?.map((warning) => <p key={warning} style={{ color: '#fca5a5' }}>계산 보류: {warning}</p>)}
            <details style={{ marginBottom: '12px', color: '#cbd5e1' }}>
              <summary>계산에 사용한 팀별 대진 (팀 간 2경기)</summary>
              {group.matchups?.map((pair) => <div key={JSON.stringify([pair.teamA, pair.teamB])} style={{ padding: '6px 0', fontSize: '13px' }}>
                {pair.teamA} / {pair.teamB}: 완료 {pair.completed} · 남음 {pair.remaining} (등록 {pair.scheduled}, 일정 미정 {pair.unscheduled})
              </div>)}
            </details>
            {movements.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead><tr>
                    <th style={thStyle}>팀 / 현재 승패무</th>
                    <th style={thStyle}>현재 구간</th>
                    <th style={thStyle}>이동 가능한 구간</th>
                    <th style={thStyle}>판정 상태</th>
                  </tr></thead>
                  <tbody>{movements.map(({ row, from, destinations, incomplete }) => (
                    <tr key={row.teamId}>
                      <td style={tdStyle}>{row.teamName}<div>{row.wins}승 {row.losses}패 {row.ties}무</div></td>
                      <td style={tdStyle}>{projectionLabel(from)}</td>
                      <td style={tdStyle}>{destinations.map((destination) => <div key={destination}>{projectionLabel(from)} → {projectionLabel(destination)}</div>)}</td>
                      <td style={tdStyle}>
                        {incomplete ? '부분 탐색: 추가 이동 가능성이 남아 있습니다.' : '탐색 완료'}
                        <div>{row.projection?.tieBreakNotes.filter((note) => !note.includes('구간 고정')).join(' / ')}</div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p style={{ color: '#cbd5e1' }}>{!group.rows.length ? '조별 데이터가 없습니다.' : unresolved.length ? '현재 확인된 이동 유형이 없습니다. 미확정·부분 계산 팀은 아래에서 확인하세요.' : '계산한 모든 결과에서 구간 이동이 없습니다.'}</p>}
            {unresolved.length > 0 ? <div style={{ color: '#fbbf24', fontSize: '13px' }}>
              {unresolved.map(({ row, currentUnresolved, incomplete }) => <p key={row.teamId}>
                {row.teamName}: {currentUnresolved ? '현재 구간이 미확정이므로 이동 여부를 판단하지 않습니다.' : incomplete ? '계산 보류 또는 부분 탐색 상태이며 구간 유지가 확정된 것은 아닙니다.' : ''}
              </p>)}
            </div> : null}
            {unchanged.length > 0 ? <details style={{ color: '#94a3b8', marginTop: '12px' }}>
              <summary>구간 이동 없는 팀 {unchanged.length}개</summary>
              {unchanged.map(({ row, from }) => <p key={row.teamId}>{row.teamName}: {projectionLabel(from)} 유지</p>)}
            </details> : null}
          </section>
        );
      })}
    </div>
  );
}
