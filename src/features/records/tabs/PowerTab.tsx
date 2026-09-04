import type { PowerRankingApiRow } from '../../../shared/api/backendClient';
import {
  emptyTextStyle,
  tableCardStyle,
  tableStyle,
  tableTitleStyle,
  tbodyRowStyle,
  tdStyle,
  thStyle,
  theadRowStyle,
} from '../components/recordStyles';

interface PowerTabProps {
  rows: PowerRankingApiRow[];
  loading: boolean;
  error: string | null;
  rankingYear: number | null;
}

export default function PowerTab({ rows, loading, error, rankingYear }: PowerTabProps) {
  return (
    <section className="record-hub-section" style={tableCardStyle}>
      <div style={tableTitleStyle}>파워랭킹 ({rankingYear ?? '-'})</div>

      {loading && <p style={emptyTextStyle}>파워랭킹을 계산된 집계 API에서 불러오는 중입니다...</p>}
      {error && <p style={{ ...emptyTextStyle, color: 'var(--season-danger)' }}>오류: {error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle(960)}>
            <thead>
              <tr style={theadRowStyle}>
                <th style={thStyle('center')}>#</th>
                <th style={thStyle('left')}>팀</th>
                <th style={thStyle('center')}>총점</th>
                <th style={thStyle('center')}>Y1</th>
                <th style={thStyle('center')}>Y2</th>
                <th style={thStyle('center')}>Y3</th>
                <th style={thStyle('center')}>윈도우</th>
                <th style={thStyle('left')}>계산 버전</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.teamId}-${row.rank}`} style={tbodyRowStyle(index)}>
                  <td style={tdStyle('center')}>{row.rank || index + 1}</td>
                  <td style={tdStyle('left')}>{row.teamName}</td>
                  <td style={tdStyle('center')}>{row.weightedScore.toFixed(1)}</td>
                  <td style={tdStyle('center')}>{row.y1Score.toFixed(1)}</td>
                  <td style={tdStyle('center')}>{row.y2Score.toFixed(1)}</td>
                  <td style={tdStyle('center')}>{row.y3Score.toFixed(1)}</td>
                  <td style={tdStyle('center')}>{row.windowYears.length > 0 ? row.windowYears.join(', ') : '-'}</td>
                  <td style={tdStyle('left')}>{row.calcVersion ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <p style={emptyTextStyle}>파워랭킹 데이터가 없습니다. 백엔드 배치 적재 결과를 확인해 주세요.</p>
      )}
    </section>
  );
}
