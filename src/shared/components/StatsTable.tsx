import type { BatterStatLine, PitcherStatLine } from '../types/scoreStats';

type StatsTableDensity = 'compact' | 'regular';

type StatsTableProps = {
  title: string;
  stats: BatterStatLine[] | PitcherStatLine[];
  variant: 'batter' | 'pitcher';
  density?: StatsTableDensity;
};

type StyleSet = {
  containerRadius: string;
  containerPadding: string;
  containerGap: string;
  titleFontSize: string;
  subtitleFontSize: string;
  subtitleLabel: string;
  tableFontSize: string;
  tableMinWidthBatter: string;
  tableMinWidthPitcher: string;
  headerPadding: string;
  cellPadding: string;
  tableRadius: string;
  nameWidth: string;
};

const stylesByDensity: Record<StatsTableDensity, StyleSet> = {
  compact: {
    containerRadius: '12px',
    containerPadding: '10px',
    containerGap: '8px',
    titleFontSize: '14px',
    subtitleFontSize: '11px',
    subtitleLabel: '실시간 자동 집계',
    tableFontSize: '11px',
    tableMinWidthBatter: '680px',
    tableMinWidthPitcher: '620px',
    headerPadding: '6px 5px',
    cellPadding: '6px 5px',
    tableRadius: '8px',
    nameWidth: '100px',
  },
  regular: {
    containerRadius: '14px',
    containerPadding: '12px',
    containerGap: '10px',
    titleFontSize: '16px',
    subtitleFontSize: '12px',
    subtitleLabel: '실시간 자동 집계 (타석 기준)',
    tableFontSize: '12px',
    tableMinWidthBatter: '720px',
    tableMinWidthPitcher: '660px',
    headerPadding: '6px 4px',
    cellPadding: '6px 4px',
    tableRadius: '10px',
    nameWidth: '90px',
  },
};

const formatFloat = (val: number) => (Number.isFinite(val) ? val.toFixed(3).replace(/^0/, '') : '-');
const formatEra = (val: number) => (Number.isFinite(val) ? val.toFixed(2) : '-');

export default function StatsTable({ title, stats, variant, density = 'regular' }: StatsTableProps) {
  const isBatter = variant === 'batter';
  const styles = stylesByDensity[density];
  const columns = isBatter
    ? [
        { key: 'order', label: '타순', width: '50px' },
        { key: 'name', label: '선수', width: styles.nameWidth },
        { key: 'pa', label: '타석' },
        { key: 'ab', label: '타수' },
        { key: 'h', label: '안타' },
        { key: 'r', label: '득점' },
        { key: 'rbi', label: '타점' },
        { key: 'singles', label: '1루타' },
        { key: 'doubles', label: '2루타' },
        { key: 'triples', label: '3루타' },
        { key: 'hr', label: '홈런' },
        { key: 'bb', label: '볼넷' },
        { key: 'ci', label: '타격방해' },
        { key: 'fc', label: '야수선택' },
        { key: 'hbp', label: '사구' },
        { key: 'so', label: '삼진' },
        { key: 'sac', label: density === 'regular' ? '희생플라이' : '희생' },
        { key: 'avg', label: '타율' },
        { key: 'obp', label: '출루율' },
      ]
    : [
        { key: 'appearanceLabel', label: '등판', width: '60px' },
        { key: 'name', label: '선수', width: styles.nameWidth },
        { key: 'bf', label: '타자상대' },
        { key: 'pitchCombo', label: '투구수(S/B)' },
        { key: 'outs', label: '이닝' },
        { key: 'h', label: '피안타' },
        { key: 'hr', label: '피홈런' },
        { key: 'bb', label: '볼넷' },
        { key: 'hbp', label: '사구' },
        { key: 'so', label: '탈삼진' },
        { key: 'r', label: '실점' },
        { key: 'er', label: '자책' },
        { key: 'era', label: 'ERA' },
      ];

  const rows = isBatter
    ? (stats as BatterStatLine[]).map((stat) => {
        const avg = stat.ab > 0 ? stat.h / stat.ab : 0;
        const obpDen = stat.ab + stat.bb + stat.hbp + stat.sac + stat.ci;
        const obp = obpDen > 0 ? (stat.h + stat.bb + stat.hbp + stat.ci) / obpDen : 0;
        return { ...stat, avg: stat.ab > 0 ? formatFloat(avg) : '-', obp: obpDen > 0 ? formatFloat(obp) : '-' };
      })
    : (stats as PitcherStatLine[]).map((stat) => {
        const ip = `${Math.floor(stat.outs / 3)}.${stat.outs % 3}`;
        const era = stat.outs > 0 ? formatEra((stat.er * 27) / stat.outs) : '-';
        return {
          ...stat,
          outsIp: ip,
          era,
          pitchCombo: `${stat.pitches} (${stat.strikes}/${stat.balls})`,
          appearanceLabel:
            stat.appearanceLabel ?? (stat.appearanceOrder === 0 ? '선발' : stat.appearanceOrder ? `계투(${stat.appearanceOrder})` : '-'),
        };
      });

  return (
    <div
      style={{
        background: '#0b0f1a',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: styles.containerRadius,
        padding: styles.containerPadding,
        display: 'grid',
        gap: styles.containerGap,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 900, color: '#e2e8f0', fontSize: styles.titleFontSize }}>{title}</span>
        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: styles.subtitleFontSize }}>{styles.subtitleLabel}</span>
      </div>
      <div
        style={{
          overflowX: 'auto',
          borderRadius: styles.tableRadius,
          border: '1px solid rgba(148, 163, 184, 0.15)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            color: '#e2e8f0',
            fontSize: styles.tableFontSize,
            minWidth: isBatter ? styles.tableMinWidthBatter : styles.tableMinWidthPitcher,
          }}
        >
          <thead style={{ background: 'rgba(255,255,255,0.04)' }}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.key === 'name' ? 'left' : 'center',
                    padding: styles.headerPadding,
                    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                    minWidth: col.width ?? '50px',
                    fontWeight: 800,
                    color: '#cbd5e1',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.name + idx}
                style={{
                  background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.5)' : 'rgba(15, 23, 42, 0.3)',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: styles.cellPadding,
                      textAlign: col.key === 'name' ? 'left' : 'center',
                      borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                      fontWeight: col.key === 'name' ? 800 : 700,
                      color: col.key === 'name' ? '#e2e8f0' : '#cbd5e1',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.key === 'name' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span>
                          {row.name}
                          {(row as BatterStatLine | PitcherStatLine).pos ? (
                            <span style={{ color: '#94a3b8', marginLeft: '4px', fontWeight: 700 }}>
                              ({(row as BatterStatLine | PitcherStatLine).pos?.toUpperCase?.()})
                            </span>
                          ) : null}
                        </span>
                        {/* 선출 뱃지 */}
                        {(row as BatterStatLine | PitcherStatLine).isElite && (
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '999px',
                              border: '1px solid rgba(249, 115, 22, 0.5)',
                              background: 'rgba(249, 115, 22, 0.15)',
                              color: '#fb923c',
                              fontWeight: 900,
                              fontSize: '10px',
                              lineHeight: 1.2,
                            }}
                          >
                            선출
                          </span>
                        )}
                        {(() => {
                          const status = (row as BatterStatLine | PitcherStatLine).status;
                          // if (status) {
                          //   console.log(`[StatsTable] ${row.name} - status: ${status}`);
                          // }
                          if (!status) return null;

                          const badgeStyles = {
                            out: {
                              border: '1px solid rgba(239,68,68,0.4)',
                              background: 'rgba(239,68,68,0.12)',
                              color: '#ef4444',
                              text: 'out',
                            },
                            대수비: {
                              border: '1px solid rgba(59,130,246,0.4)',
                              background: 'rgba(59,130,246,0.12)',
                              color: '#3b82f6',
                              text: '대수비',
                            },
                            대타: {
                              border: '1px solid rgba(34,197,94,0.4)',
                              background: 'rgba(34,197,94,0.12)',
                              color: '#22c55e',
                              text: '대타',
                            },
                            대주자: {
                              border: '1px solid rgba(251,146,60,0.4)',
                              background: 'rgba(251,146,60,0.12)',
                              color: '#fb923c',
                              text: '대주자',
                            },
                          };

                          const badge = badgeStyles[status];
                          if (!badge) return null;

                          return (
                            <span
                              style={{
                                padding: '2px 6px',
                                borderRadius: '999px',
                                border: badge.border,
                                background: badge.background,
                                color: badge.color,
                                fontWeight: 900,
                                fontSize: '10px',
                                lineHeight: 1.2,
                              }}
                            >
                              {badge.text}
                            </span>
                          );
                        })()}
                      </span>
                    ) : (
                      (() => {
                        if (isBatter && col.key === 'order') {
                          return (row as BatterStatLine).order ?? '-';
                        }
                        if (!isBatter && col.key === 'outs') {
                          return (row as PitcherStatLine & { outsIp?: string }).outsIp ?? (row as PitcherStatLine).outs;
                        }
                        return (row as Record<string, string | number | undefined>)[col.key] ?? '-';
                      })()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
