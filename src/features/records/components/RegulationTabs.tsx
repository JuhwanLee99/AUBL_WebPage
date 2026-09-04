import type { RecordRegulation } from '../../../shared/api/backendClient';

interface RegulationTabsProps {
  value: Exclude<RecordRegulation, 'ALL'>;
  onChange: (value: Exclude<RecordRegulation, 'ALL'>) => void;
}

const OPTIONS: Array<{ value: Exclude<RecordRegulation, 'ALL'>; label: string }> = [
  { value: 'IN', label: '규정 IN' },
  { value: 'OUT', label: '규정 OUT' },
];

export default function RegulationTabs({ value, onChange }: RegulationTabsProps) {
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--season-line)' }}>
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              minHeight: '44px',
              borderRadius: '2px',
              border: active ? '1px solid var(--season-primary-fill)' : '1px solid var(--season-line-strong)',
              background: active ? 'var(--season-primary-fill)' : 'var(--season-surface)',
              color: active ? 'var(--season-on-primary)' : 'var(--season-ink)',
              padding: '9px 14px',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
