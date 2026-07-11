import type { ReactNode } from 'react';
import type { RecordsTab } from '../types';

interface RecordsHubShellProps {
  yearLabel: string;
  tab: RecordsTab;
  tabs: Array<{ value: RecordsTab; label: string }>;
  onTabChange: (tab: RecordsTab) => void;
  filterBar: ReactNode;
  playoffFilterEnabled: boolean;
  tabExtraBeforePower?: ReactNode;
}

export default function RecordsHubShell({
  yearLabel,
  tab,
  tabs,
  onTabChange,
  filterBar,
  playoffFilterEnabled,
  tabExtraBeforePower,
}: RecordsHubShellProps) {
  return (
    <section
      className="record-hub-section"
      style={{
        borderRadius: '22px',
        padding: '24px',
        background:
          'radial-gradient(circle at 10% 15%, rgba(59,130,246,0.16), transparent 32%), radial-gradient(circle at 90% 5%, rgba(249,115,22,0.16), transparent 28%), linear-gradient(135deg, #0f172a 0%, #111827 100%)',
        border: '1px solid rgba(148,163,184,0.24)',
        boxShadow: '0 22px 56px rgba(0,0,0,0.3)',
        display: 'grid',
        gap: '14px',
      }}
    >
      <span
        style={{
          width: 'fit-content',
          padding: '7px 12px',
          borderRadius: '999px',
          border: '1px solid rgba(59,130,246,0.35)',
          background: 'rgba(59,130,246,0.14)',
          color: '#bfdbfe',
          fontWeight: 800,
          fontSize: '12px',
          letterSpacing: '0.03em',
        }}
      >
        RECORDS HUB
      </span>

      <h1 style={{ margin: 0, fontWeight: 900, fontSize: '30px' }}>{yearLabel}</h1>

      <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
        기록/순위/파워랭킹을 하나의 페이지에서 통합 조회합니다. 표 셀을 직접 클릭해 필터를 즉시 적용할 수 있습니다.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {tabs.map((option) => {
          const isPowerTab = option.value === 'power';
          const active = tab === option.value;
          return (
            <span key={option.value} style={{ display: 'inline-flex', gap: '8px' }}>
              {isPowerTab && tabExtraBeforePower}
              <button
                type="button"
                onClick={() => onTabChange(option.value)}
                style={{
                  borderRadius: '999px',
                  border: active ? '1px solid rgba(96,165,250,0.7)' : '1px solid rgba(148,163,184,0.35)',
                  background: active ? 'rgba(59,130,246,0.2)' : 'rgba(15,23,42,0.6)',
                  color: active ? '#dbeafe' : '#cbd5e1',
                  padding: '8px 14px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            </span>
          );
        })}
      </div>

      {filterBar}

      {!playoffFilterEnabled && (
        <span style={{ color: '#fbbf24', fontSize: '12px', fontWeight: 700 }}>
          현재 API 응답에 플레이오프 메타데이터가 부족하여 일부 필터가 자동 보정됩니다.
        </span>
      )}
    </section>
  );
}
