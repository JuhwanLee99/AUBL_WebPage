import type { ReactNode } from 'react';
import { ActionButton, PageHero, StatusBadge } from '../../../shared/components/season';
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
    <section className="record-hub-section">
      <PageHero
        eyebrow="시즌 기록"
        title={yearLabel}
        description={<p>팀 순위와 타자·투수 기록을 한곳에서 확인하고, 표의 팀·선수명을 선택해 조건을 좁힐 수 있습니다.</p>}
        aside={<StatusBadge tone="blue">공식 기록</StatusBadge>}
      />

      <nav className="record-hub-tabs" aria-label="기록 분류">
        {tabs.map((option) => {
          const isPowerTab = option.value === 'power';
          const active = tab === option.value;
          return (
            <span key={option.value}>
              {isPowerTab && tabExtraBeforePower}
              <ActionButton
                onClick={() => onTabChange(option.value)}
                variant={active ? 'primary' : 'secondary'}
                size="compact"
                aria-current={active ? 'page' : undefined}
              >
                {option.label}
              </ActionButton>
            </span>
          );
        })}
      </nav>

      <div className="record-hub-filters">{filterBar}</div>

      {!playoffFilterEnabled && (
        <p className="record-hub-note" role="status">
          현재 API 응답에 플레이오프 메타데이터가 부족하여 일부 필터가 자동 보정됩니다.
        </p>
      )}
    </section>
  );
}
