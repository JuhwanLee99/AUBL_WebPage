import { useMemo, useState } from 'react';

type PitcherStat = {
  name: string;
  team: string;
  year: number;
  era: number;
  ip: number;
  whip: number;
  so: number;
  bb: number;
  sv: number;
  war: number;
};

const PITCHER_STATS: PitcherStat[] = [
  { name: '임동현', team: 'Epsilon Eagles', year: 2024, era: 1.45, ip: 86.1, whip: 0.92, so: 108, bb: 21, sv: 0, war: 3.8 },
  { name: '이도현', team: 'Alpha College', year: 2024, era: 2.35, ip: 82.0, whip: 1.04, so: 102, bb: 28, sv: 0, war: 3.1 },
  { name: '최민재', team: 'Beta University', year: 2024, era: 2.88, ip: 76.0, whip: 1.11, so: 88, bb: 24, sv: 0, war: 2.3 },
  { name: '이수안', team: 'Gamma Tech', year: 2024, era: 3.05, ip: 74.2, whip: 1.17, so: 81, bb: 26, sv: 2, war: 1.9 },
  { name: '문하림', team: 'Gamma Tech', year: 2023, era: 3.42, ip: 68.1, whip: 1.25, so: 73, bb: 31, sv: 9, war: 1.3 },
  { name: '임동현', team: 'Epsilon Eagles', year: 2023, era: 1.95, ip: 79.0, whip: 0.99, so: 95, bb: 22, sv: 0, war: 2.8 },
  { name: '강현우', team: 'Delta Dragons', year: 2024, era: 3.65, ip: 71.0, whip: 1.28, so: 76, bb: 33, sv: 4, war: 1.6 },
  { name: '마준호', team: 'Beta University', year: 2023, era: 3.21, ip: 70.0, whip: 1.18, so: 69, bb: 27, sv: 1, war: 1.5 },
  { name: '한지훈', team: 'Delta Dragons', year: 2023, era: 4.02, ip: 66.0, whip: 1.32, so: 62, bb: 30, sv: 0, war: 1.1 },
];

export default function PitcherRecordPage() {
  const years = useMemo(() => Array.from(new Set(PITCHER_STATS.map((p) => p.year))).sort((a, b) => b - a), []);
  const [selectedYear, setSelectedYear] = useState(years[0]);

  const rows = useMemo(() => {
    return PITCHER_STATS
      .filter((p) => p.year === selectedYear)
      .sort((a, b) => a.era - b.era || b.war - a.war)
      .map((p, idx) => ({
        ...p,
        rank: idx + 1,
        kbb: p.bb === 0 ? p.so : p.so / p.bb,
      }));
  }, [selectedYear]);

  return (
    <div style={{ display: 'grid', gap: '22px' }}>
      <header
        style={{
          padding: '26px',
          borderRadius: '22px',
          background: 'linear-gradient(130deg, rgba(59,130,246,0.18) 0%, rgba(15,23,42,0.92) 70%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
          display: 'grid',
          gap: '10px',
        }}
      >
        <span style={{ padding: '7px 12px', borderRadius: '999px', background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.45)', color: '#bfdbfe', fontWeight: 800, letterSpacing: '0.03em', width: 'fit-content' }}>
          투수 기록
        </span>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900 }}>기록원 입력 기반 – 투수 세부 랭킹</h1>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
            실시간 입력된 방어율, 이닝, WHIP, 삼진/볼넷, 세이브를 집계해 순위를 제공합니다. 연도별로 필터링해 시즌별 에이스를 빠르게 확인하세요.
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
          padding: '0',
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
          <span>ERA</span>
          <span>IP</span>
          <span>WHIP</span>
          <span>K</span>
          <span>BB</span>
          <span>K/BB</span>
          <span>SV</span>
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
                background: row.rank <= 3 ? 'rgba(59,130,246,0.08)' : 'transparent',
              }}
            >
              <span style={{ fontWeight: 900, color: row.rank <= 3 ? '#60a5fa' : '#e2e8f0' }}>#{row.rank}</span>
              <span style={{ fontWeight: 800 }}>{row.name}</span>
              <span style={{ color: '#cbd5e1', fontWeight: 700 }}>{row.team}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.era.toFixed(2)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.ip.toFixed(1)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.whip.toFixed(2)}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.so}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.bb}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: row.kbb >= 4 ? '#34d399' : '#eab308' }}>
                {row.kbb.toFixed(2)}
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#e2e8f0' }}>{row.sv}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#f97316', fontWeight: 800 }}>{row.war.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
