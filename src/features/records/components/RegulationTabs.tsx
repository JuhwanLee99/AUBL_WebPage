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
    <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              borderRadius: '999px',
              border: active ? '1px solid rgba(96,165,250,0.7)' : '1px solid rgba(148,163,184,0.35)',
              background: active ? 'rgba(59,130,246,0.2)' : 'rgba(15,23,42,0.6)',
              color: active ? '#dbeafe' : '#cbd5e1',
              padding: '8px 12px',
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
