import type { BatterStatLine, PitcherStatLine } from '../types/scoreStats';
import './StatsTable.css';
import { earnedRunsView } from '../lib/earnedRuns';
import { batterRateView } from '../lib/batterRates';

type StatsTableDensity = 'compact' | 'regular';

type StatsTableProps = {
  title: string;
  stats: BatterStatLine[] | PitcherStatLine[];
  variant: 'batter' | 'pitcher';
  density?: StatsTableDensity;
  displayRows?: Array<{ name: string; [key: string]: string | number | null | undefined }>;
  subtitle?: string;
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
    containerRadius: '4px',
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
    tableRadius: '2px',
    nameWidth: '100px',
  },
  regular: {
    containerRadius: '4px',
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
    tableRadius: '2px',
    nameWidth: '90px',
  },
};

const formatFloat = (val: number) => (Number.isFinite(val) ? val.toFixed(3).replace(/^0/, '') : '-');

export default function StatsTable({ title, stats, variant, density = 'regular', displayRows, subtitle }: StatsTableProps) {
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
        { key: 'tb', label: '루타' },
    { key: 'singles', label: '1루타' },
        { key: 'doubles', label: '2루타' },
        { key: 'triples', label: '3루타' },
        { key: 'hr', label: '홈런' },
        { key: 'bb', label: '볼넷' },
    { key: 'ibb', label: '고의4구' },
        { key: 'ci', label: '타격방해' },
        { key: 'fc', label: '야수선택' },
        { key: 'hbp', label: '사구' },
        { key: 'so', label: '삼진' },
        { key: 'sac', label: '희생 합계' },
        { key: 'sh', label: '희생번트' },
        { key: 'sf', label: '희생플라이' },
        { key: 'sb', label: '도루' },
        { key: 'cs', label: '도루실패' },
        { key: 'gdp', label: '병살타' },
        { key: 'avg', label: '타율' },
        { key: 'obp', label: '출루율' },
        { key: 'obpStatus', label: '출루율 상태' },
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
    { key: 'ibb', label: '고의4구' },
        { key: 'hbp', label: '사구' },
        { key: 'so', label: '탈삼진' },
        { key: 'r', label: '실점' },
        { key: 'er', label: '자책' },
        { key: 'era', label: 'ERA' },
        { key: 'earnedRunsLabel', label: '자책 확인' },
      ];

  const rows = displayRows ?? (isBatter
    ? (stats as BatterStatLine[]).map((stat) => {
        const avg = stat.ab > 0 ? stat.h / stat.ab : 0;
        const rates = batterRateView(stat);
        return {
          ...stat,
          avg: stat.ab > 0 ? formatFloat(avg) : '-',
          sh: rates.sh ?? '-',
          sf: rates.sf ?? '-',
          obp: rates.obp !== null ? formatFloat(rates.obp) : '-',
          obpStatus: rates.status,
        };
      })
    : (stats as PitcherStatLine[]).map((stat) => {
        const ip = `${Math.floor(stat.outs / 3)}.${stat.outs % 3}`;
        const earned = earnedRunsView(stat.er, stat.outs, stat.earnedRunsStatus);
        return {
          ...stat,
          outsIp: ip,
          era: earned.era,
          pitchCombo: `${stat.pitches} (${stat.strikes}/${stat.balls})`,
          appearanceLabel:
            stat.appearanceLabel ?? (stat.appearanceOrder === 0 ? '선발' : stat.appearanceOrder ? `계투(${stat.appearanceOrder})` : '-'),
        };
      }));

  return (
    <div
      className={`stats-table-card stats-table-card--${density} stats-table-card--${variant}`}
      style={{
        '--stats-card-radius': styles.containerRadius,
        padding: styles.containerPadding,
        gap: styles.containerGap,
      } as React.CSSProperties}
    >
      <div className="stats-table-card__header">
        <span className="stats-table-card__title" style={{ fontSize: styles.titleFontSize }}>{title}</span>
        <span className="stats-table-card__subtitle" style={{ fontSize: styles.subtitleFontSize }}>{subtitle ?? styles.subtitleLabel}</span>
      </div>
      <div
        className="stats-table-card__scroll"
        style={{
          '--stats-table-radius': styles.tableRadius,
        } as React.CSSProperties}
      >
        <table
          className="stats-table-card__table"
          style={{
            fontSize: styles.tableFontSize,
            minWidth: isBatter ? styles.tableMinWidthBatter : styles.tableMinWidthPitcher,
          }}
        >
          <thead>
            <tr>
              {columns.map((col, columnIndex) => (
                <th
                  key={col.key}
                  className={[
                    columnIndex === 0 ? 'stats-table-card__leading-cell' : '',
                    col.key === 'name' ? 'stats-table-card__name-cell' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    textAlign: col.key === 'name' ? 'left' : 'center',
                    padding: styles.headerPadding,
                    minWidth: col.width ?? '50px',
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
                className={idx % 2 === 0 ? 'is-even' : 'is-odd'}
              >
                {columns.map((col, columnIndex) => (
                  <td
                    key={col.key}
                    className={[
                      columnIndex === 0 ? 'stats-table-card__leading-cell' : '',
                      col.key === 'name' ? 'stats-table-card__name-cell' : '',
                    ].filter(Boolean).join(' ')}
                    style={{
                      padding: styles.cellPadding,
                      textAlign: col.key === 'name' ? 'left' : 'center',
                    }}
                  >
                    {col.key === 'name' ? (
                      <span className="stats-table-card__player">
                        <span>
                          {row.name}
                          {(row as BatterStatLine | PitcherStatLine).pos ? (
                            <span className="stats-table-card__position">
                              ({(row as BatterStatLine | PitcherStatLine).pos?.toUpperCase?.()})
                            </span>
                          ) : null}
                        </span>
                        {(row as BatterStatLine | PitcherStatLine).isElite && (
                          <span className="stats-table-card__badge">
                            선출
                          </span>
                        )}
                        {(() => {
                          const status = (row as BatterStatLine | PitcherStatLine).status;
                          // if (status) {
                          //   console.log(`[StatsTable] ${row.name} - status: ${status}`);
                          // }
                          if (!status) return null;

                          const badgeLabels = {
                            out: {
                              text: 'out',
                            },
                            대수비: {
                              text: '대수비',
                            },
                            대타: {
                              text: '대타',
                            },
                            대주자: {
                              text: '대주자',
                            },
                          };

                          const badge = badgeLabels[status];
                          if (!badge) return null;

                          return (
                            <span className="stats-table-card__badge">
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
                        if (!isBatter && ['er', 'era', 'earnedRunsLabel'].includes(col.key)) {
                          const pitcher = row as PitcherStatLine;
                          const earned = earnedRunsView(pitcher.er, pitcher.outs, pitcher.earnedRunsStatus);
                          return col.key === 'earnedRunsLabel' ? earned.label : earned[col.key as 'er' | 'era'];
                        }
                        if (!isBatter && col.key === 'outs') {
                          return (row as PitcherStatLine & { outsIp?: string }).outsIp ?? (row as PitcherStatLine).outs;
                        }
                        return (row as unknown as Record<string, string | number | undefined>)[col.key] ?? '-';
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
