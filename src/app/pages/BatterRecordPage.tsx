import { useMemo, useState } from 'react';

type BatterStat = {
  name: string;
  team: string;
  year: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  hr: number;
  rbi: number;
  sb: number;
  war: number;
};

const BATTER_STATS: BatterStat[] = [
  { name: '서준호', team: 'Epsilon Eagles', year: 2024, avg: 0.331, obp: 0.412, slg: 0.610, ops: 1.022, hr: 14, rbi: 48, sb: 8, war: 3.2 },
  { name: '김하늘', team: 'Alpha College', year: 2024, avg: 0.321, obp: 0.386, slg: 0.512, ops: 0.898, hr: 9, rbi: 41, sb: 10, war: 2.7 },
  { name: '전유진', team: 'Gamma Tech', year: 2024, avg: 0.305, obp: 0.372, slg: 0.521, ops: 0.893, hr: 10, rbi: 37, sb: 4, war: 2.2 },
  { name: '윤태훈', team: 'Beta University', year: 2024, avg: 0.299, obp: 0.392, slg: 0.429, ops: 0.821, hr: 6, rbi: 33, sb: 21, war: 2.5 },
  { name: '박민수', team: 'Alpha College', year: 2024, avg: 0.284, obp: 0.402, slg: 0.386, ops: 0.788, hr: 4, rbi: 24, sb: 26, war: 2.1 },
  { name: '정재원', team: 'Epsilon Eagles', year: 2023, avg: 0.318, obp: 0.401, slg: 0.504, ops: 0.905, hr: 12, rbi: 45, sb: 7, war: 3.5 },
  { name: '신지환', team: 'Alpha College', year: 2023, avg: 0.297, obp: 0.362, slg: 0.489, ops: 0.851, hr: 11, rbi: 39, sb: 9, war: 1.8 },
  { name: '김세인', team: 'Beta University', year: 2023, avg: 0.281, obp: 0.354, slg: 0.348, ops: 0.702, hr: 3, rbi: 27, sb: 6, war: 1.6 },
  { name: '강건우', team: 'Delta Dragons', year: 2024, avg: 0.272, obp: 0.343, slg: 0.367, ops: 0.710, hr: 2, rbi: 22, sb: 22, war: 2.0 },
  { name: '박지온', team: 'Gamma Tech', year: 2024, avg: 0.271, obp: 0.338, slg: 0.373, ops: 0.711, hr: 3, rbi: 19, sb: 18, war: 1.4 },
];

export default function BatterRecordPage() {
  const years = useMemo(() => Array.from(new Set(BATTER_STATS.map((b) => b.year))).sort((a, b) => b - a), []);
  const [selectedYear, setSelectedYear] = useState(years[0]);

  const rows = useMemo(() => {
    return BATTER_STATS
      .filter((b) => b.year === selectedYear)
      .sort((a, b) => b.ops - a.ops || b.war - a.war)
      .map((b, idx) => ({ ...b, rank: idx + 1 }));
  }, [selectedYear]);

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      <header
        style={{
          padding: '26px',
          borderRadius: '22px',
          background: 'linear-gradient(130deg, rgba(236,72,153,0.16) 0%, rgba(15,23,42,0.92) 70%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <span style={{ padding: '7px 12px', borderRadius: '999px', background: 'rgba(236,72,153,0.14)', border: '1px solid rgba(236,72,153,0.45)', color: '#fbcfe8', fontWeight: 800, letterSpacing: '0.03em', width: 'fit-content' }}>
          타자 기록
        </span>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900 }}>기록원 입력 기반 – 타자 세부 랭킹</h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
            타율·출루·장타·OPS, 홈런과 도루까지 한 화면에. 기록원이 남긴 데이터를 즉시 반영해 시즌별 상위 타자를 제공합니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: '6px', fontWeight: 800, color: '#94a3b8', fontSize: '12px' }}>
            시즌 선택
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '11px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(148,163,184,0.35)',
                fontWeight: 800,
              }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year} 시즌
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section
        style={{
          padding: 0,
          borderRadius: '18px',
          border: '1px solid rgba(148,163,184,0.25)',
          overflow: 'hidden',
          background: 'rgba(15,23,42,0.75)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.1fr 0.9fr repeat(8, minmax(70px, 0.6fr))',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            background: 'rgba(255,255,255,0.03)',
            color: '#94a3b8',
            fontWeight: 800,
            fontSize: '13px',
          }}
        >
          <span>순위</span>
          <span>선수</span>
          <span>팀</span>
          <span>AVG</span>
          <span>OBP</span>
          <span>SLG</span>
          <span>OPS</span>
          <span>HR</span>
          <span>RBI</span>
          <span>SB</span>
          <span>WAR</span>
        </div>

        <div style={{ display: 'grid' }}>
          {rows.map((row) => (
            <div
              key={`${row.name}-${row.year}`}
              className="player-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 1.1fr 0.9fr repeat(8, minmax(70px, 0.6fr))',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 18px',
                borderTop: '1px solid rgba(148,163,184,0.14)',
                background: row.rank <= 3 ? 'rgba(236,72,153,0.07)' : 'transparent',
              }}
            >
              <span style={{ fontWeight: 900, color: row.rank <= 3 ? '#f472b6' : '#e2e8f0' }}>#{row.rank}</span>
              <span style={{ fontWeight: 800 }}>{row.name}</span>
              <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{row.team}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.avg.toFixed(3)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.obp.toFixed(3)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.slg.toFixed(3)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#f97316', fontWeight: 800 }}>{row.ops.toFixed(3)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.hr}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.rbi}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: row.sb >= 15 ? '#34d399' : '#e2e8f0' }}>{row.sb}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#fbbf24', fontWeight: 800 }}>{row.war.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
