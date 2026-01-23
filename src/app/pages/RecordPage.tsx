// src/app/pages/RecordPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { TEAM_RECORDS, TEAMS } from '../../shared/lib/mockData';
import type { TeamSeasonRecord } from '../../shared/types';

interface EnrichedRecord extends TeamSeasonRecord {
  teamName: string;
  division: string;
  color: string;
  founded: number;
}

type DivisionFilter = 'ALL' | 'EUTTEUM' | 'BEOGEUM';

export default function RecordPage() {
  const years = useMemo(
    () =>
      Array.from(new Set(TEAM_RECORDS.map((record) => record.year))).sort((a, b) => b - a),
    [],
  );
  const [selectedYear, setSelectedYear] = useState<number>(years[0]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<DivisionFilter>('ALL');
  const divisionOptions: { key: DivisionFilter; label: string }[] = [
    { key: 'ALL', label: '전체' },
    { key: 'EUTTEUM', label: '으뜸조' },
    { key: 'BEOGEUM', label: '버금조' },
  ];

  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);

  // 데이터 필터링 로직
  const records = useMemo<EnrichedRecord[]>(() => {
    const filtered = TEAM_RECORDS.filter((record) => {
      const isYear = record.year === selectedYear;
      if (!isYear) return false;
      if (selectedDivision === 'ALL') return true;
      const team = TEAMS.find((t) => t.id === record.teamId);
      return team?.division === selectedDivision;
    });

    let enriched = filtered.map((record) => {
      const team = TEAMS.find((t) => t.id === record.teamId);
      return {
        ...record,
        teamName: team?.name ?? 'AUBL Team',
        division: team?.division ?? 'EUTTEUM',
        color: team?.logoColor ?? '#f97316',
        founded: team?.founded ?? 1981,
      };
    });

    if (searchTerm.trim() !== '') {
      const lowerTerm = searchTerm.toLowerCase();
      enriched = enriched.filter((record) => {
        const teamMatch = record.teamName.toLowerCase().includes(lowerTerm);
        const playerMatch = record.players.some((player) =>
          player.name.toLowerCase().includes(lowerTerm)
        );
        return teamMatch || playerMatch;
      });
    }

    return enriched;
  }, [selectedYear, searchTerm, selectedDivision]);

  const topPlayers = useMemo(() => {
    return records
      .flatMap((record) => record.players.map((player) => ({ ...player, teamName: record.teamName })))
      .sort((a, b) => b.war - a.war)
      .slice(0, 8);
  }, [records]);

  const leagueSummary = useMemo(() => {
    if (records.length === 0) return { totalGames: 0, avgERA: 0, avgOPS: 0, stolen: 0 };

    const totalGames = records.reduce((sum, item) => sum + item.wins + item.losses + item.draws, 0);
    const avgERA = records.reduce((sum, item) => sum + item.era, 0) / records.length;
    const avgOPS = records.reduce((sum, item) => sum + item.ops, 0) / records.length;
    const stolen = records.reduce((sum, item) => sum + item.stolenBases, 0);

    return {
      totalGames,
      avgERA: Math.round(avgERA * 100) / 100,
      avgOPS: Math.round(avgOPS * 1000) / 1000,
      stolen,
    };
  }, [records]);

  // 애니메이션 로직: 검색어 입력 시에는 실행되지 않도록 searchTerm 의존성 제거
  useEffect(() => {
    const ctx = gsap.context(() => {
      const heroElements = sectionRef.current?.querySelectorAll('.record-hero');
      if (heroElements) {
        gsap.fromTo(
          heroElements,
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.05, stagger: 0.08, ease: 'power3.out' },
        );
      }

      if (cardsRef.current.length) {
        gsap.fromTo(
          cardsRef.current,
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.9, stagger: 0.06, ease: 'power2.out', delay: 0.1 },
        );
      }
      
      if (tableRef.current) {
        gsap.fromTo(
          tableRef.current.querySelectorAll('.player-row'),
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.85, stagger: 0.04, ease: 'power2.out', delay: 0.2 }
        );
      }
    });

    return () => ctx.revert();
  }, [selectedYear]);

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={sectionRef}>
      <section
        style={{
          borderRadius: '24px',
          padding: '28px',
          background:
            'radial-gradient(circle at 12% 18%, rgba(99,102,241,0.14), transparent 32%), radial-gradient(circle at 84% 0%, rgba(249,115,22,0.14), transparent 26%), linear-gradient(130deg, #0f172a 0%, #0b1220 100%)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.34)',
          display: 'grid',
          gap: '18px',
        }}
      >
        {/* 상단 뱃지 */}
        <div className="record-hero" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '8px 12px',
              borderRadius: '999px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: 'rgba(249, 115, 22, 0.14)',
              color: '#f97316',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              fontSize: '12px',
            }}
          >
            RECORDS
          </span>
          <span style={{ color: '#cbd5e1', fontWeight: 700 }}>연도별 팀·선수 누적 기록</span>
        </div>

        {/* 설명 텍스트 영역 (전체 너비 사용) */}
        <div className="record-hero" style={{ display: 'grid', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '32px', fontWeight: 900 }}>
            전체 리그 현황 — 연도별 팀 스토리와 에이스 퍼포먼스를 한눈에.
          </h2>
          <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>
            기본 뷰는 전체 리그 집계이며, 조(으뜸/버금)를 선택하면 해당 조에 대한 세부 개요로 전환됩니다. 정규시즌 전적, 투·타 스탯, 주요 선수 WAR까지 연도 기준으로 정리했습니다.
          </p>
        </div>

        {/* 검색 및 컨트롤 박스 (설명 텍스트 아래로 배치) */}
        <div
          className="record-hero"
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(148, 163, 184, 0.24)',
            display: 'grid',
            gap: '16px',
          }}
          >
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '6px', flex: '0 0 140px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>YEAR</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  fontWeight: 800,
                  fontSize: '15px',
                  width: '100%',
                  cursor: 'pointer'
                }}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year} 시즌
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: '6px', flex: '0 0 220px' }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>조 선택</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {divisionOptions.map((option) => {
                  const isActive = selectedDivision === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSelectedDivision(option.key)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: isActive ? '1px solid #f97316' : '1px solid rgba(148, 163, 184, 0.35)',
                        background: isActive ? 'rgba(249, 115, 22, 0.12)' : '#0f172a',
                        color: isActive ? '#f97316' : '#e2e8f0',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '6px', flex: 1 }}>
              <label style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>SEARCH</label>
              <input
                type="text"
                placeholder="팀 이름 또는 선수 이름 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: '#0f172a',
                  color: '#e2e8f0',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  fontWeight: 600,
                  fontSize: '15px',
                  width: '100%',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', paddingTop: '4px' }}>
            <Metric label="평균 ERA" value={`${leagueSummary.avgERA}`} />
            <Metric label="평균 OPS" value={`${leagueSummary.avgOPS}`} />
            <Metric label="도루 합계" value={`${leagueSummary.stolen}`} />
            <Metric label="총 경기" value={`${leagueSummary.totalGames}G`} />
          </div>
        </div>
      </section>

      {/* 팀 스토리 카드 섹션 */}
      <section style={{ display: 'grid', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>
            TEAM STORYLINES {searchTerm && `— "${searchTerm}" 검색 결과`}
          </p>
        </div>

        {records.length === 0 ? (
          <div
            style={{
              padding: '60px',
              textAlign: 'center',
              color: '#94a3b8',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '18px',
              border: '1px solid rgba(148, 163, 184, 0.1)',
            }}
          >
            검색된 결과가 없습니다.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {records.map((record, index) => (
              <div
                key={`${record.teamId}-${record.year}`}
                ref={(el) => {
                  if (el) cardsRef.current[index] = el;
                }}
                style={{
                  padding: '20px',
                  borderRadius: '18px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
                  display: 'grid',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <span style={{ fontWeight: 900, fontSize: '18px' }}>{record.teamName}</span>
                    <span style={{ color: '#94a3b8', fontWeight: 700 }}>
                      {record.division} · {record.year}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      backgroundColor: record.color,
                      boxShadow: '0 0 0 8px rgba(255,255,255,0.05)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Pill label="전적" value={`${record.wins}-${record.losses}-${record.draws}`} />
                  <Pill label="ERA" value={record.era.toFixed(2)} />
                  <Pill label="OPS" value={record.ops.toFixed(3)} />
                  <Pill label="SB" value={`${record.stolenBases}`} />
                </div>

                <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6, fontSize: '14px' }}>{record.keyMoment}</p>

                <div style={{ display: 'grid', gap: '10px' }}>
                  {record.players.map((player) => (
                    <div
                      key={player.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 1fr',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background:
                          searchTerm && player.name.toLowerCase().includes(searchTerm.toLowerCase())
                            ? 'rgba(249, 115, 22, 0.15)'
                            : 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(148, 163, 184, 0.16)',
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontWeight: 800, color: '#e2e8f0' }}>{player.name}</p>
                        <p style={{ margin: '4px 0 0', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
                          {player.position} · WAR {player.war}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', color: '#cbd5e1' }}>
                        {player.era && <MiniStat label="ERA" value={player.era.toFixed(2)} />}
                        {player.ops && <MiniStat label="OPS" value={player.ops.toFixed(3)} />}
                        {player.avg && <MiniStat label="AVG" value={player.avg.toFixed(3)} />}
                        {player.note && <span style={{ fontWeight: 600, fontSize: '12px' }}>{player.note}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 선수 리더보드 섹션 */}
      <section
        ref={tableRef}
        style={{
          borderRadius: '20px',
          padding: '22px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(99, 102, 241, 0.08))',
          border: '1px solid rgba(148, 163, 184, 0.24)',
          boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#a855f7',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(168, 85, 247, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>
            PLAYER LEADERBOARD {searchTerm && '(Filtered)'}
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px', color: '#e2e8f0' }}>
            <thead>
              <tr style={{ color: '#cbd5e1', fontSize: '13px', letterSpacing: '0.04em' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>선수</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>팀</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>포지션</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>WAR</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>주요 지표</th>
              </tr>
            </thead>
            <tbody>
              {topPlayers.map((player) => (
                <tr
                  key={`${player.id}-${player.year}`}
                  className="player-row"
                  style={{ borderTop: '1px solid rgba(148, 163, 184, 0.16)' }}
                >
                  <td style={{ padding: '12px', fontWeight: 800 }}>{player.name}</td>
                  <td style={{ padding: '12px', color: '#cbd5e1' }}>{player.teamName}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#cbd5e1' }}>{player.position}</td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 900 }}>{player.war.toFixed(1)}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#cbd5e1', fontWeight: 700 }}>
                    {player.era && `ERA ${player.era.toFixed(2)} `}
                    {player.ops && `OPS ${player.ops.toFixed(3)} `}
                    {player.avg && `AVG ${player.avg.toFixed(3)} `}
                    {player.note && ` · ${player.note}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {topPlayers.length === 0 && (
            <p style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>해당 조건의 선수 기록이 없습니다.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
      }}
    >
      <p style={{ margin: 0, color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontWeight: 900, color: '#e2e8f0' }}>{value}</p>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        padding: '6px 10px',
        borderRadius: '10px',
        background: 'rgba(99,102,241,0.12)',
        color: '#cbd5e1',
        border: '1px solid rgba(99, 102, 241, 0.24)',
        fontWeight: 700,
        fontSize: '12px',
      }}
    >
      {label}: {value}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        padding: '4px 8px',
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        fontWeight: 700,
        fontSize: '12px',
      }}
    >
      {label} {value}
    </span>
  );
}
