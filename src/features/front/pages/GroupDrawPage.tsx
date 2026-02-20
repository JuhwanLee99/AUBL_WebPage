import { useState, useEffect, useRef } from 'react';
import { GROUP_LETTERS, GROUP_COLORS } from '@shared/lib/teamGroups';
import type { GroupLetter } from '@shared/lib/teamGroups';

/* ─── 시드 데이터 (2026 AUBL 파워랭킹 기준) ─── */

interface SeededTeam {
  name: string;
  seed: number;
  rank: number;
}

const SEEDED_TEAMS: SeededTeam[] = [
  // 1시드 (1~8위)
  { name: '세종대학교 세종킹스', seed: 1, rank: 1 },
  { name: '연세대학교 EAGLES', seed: 1, rank: 2 },
  { name: '한양대학교 불새', seed: 1, rank: 3 },
  { name: '경희대국제 LIONS', seed: 1, rank: 4 },
  { name: '경희대학교(서울) BRAVES', seed: 1, rank: 5 },
  { name: '한국외대(서울) 야구부', seed: 1, rank: 6 },
  { name: '홍익대학교 위너스', seed: 1, rank: 7 },
  { name: '숭실대학교 oners', seed: 1, rank: 8 },
  // 2시드 (9~16위)
  { name: '중앙대학교 랑데뷰', seed: 2, rank: 9 },
  { name: '고려대학교 백구회', seed: 2, rank: 10 },
  { name: '건국대(서울) 불소야구', seed: 2, rank: 11 },
  { name: '서울시립대학교FALCONS', seed: 2, rank: 12 },
  { name: '경기대학교 KGB', seed: 2, rank: 13 },
  { name: '국민대학교 윈드밀스', seed: 2, rank: 14 },
  { name: '아주대학교 ABBA', seed: 2, rank: 15 },
  { name: '서강대학교 야구반 알바트로스', seed: 2, rank: 16 },
  // 3시드 (17~24위)
  { name: '인천대학교 바이킹', seed: 3, rank: 17 },
  { name: '인하대학교 비룡', seed: 3, rank: 18 },
  { name: '가천 WIND', seed: 3, rank: 19 },
  { name: '상명대BUCKS', seed: 3, rank: 20 },
  { name: '백석대학교 칼로스', seed: 3, rank: 21 },
  { name: '서울과학기술대 미르', seed: 3, rank: 22 },
  { name: '동국대학교 LAE', seed: 3, rank: 23 },
  { name: '명지대학교(서울) 나이너스', seed: 3, rank: 24 },
  // 4시드 (25~32위)
  { name: '외대(글로벌) 유니온', seed: 4, rank: 25 },
  { name: '성균관대학교 킹고야구반', seed: 4, rank: 26 },
  { name: '한국항공대 Astros', seed: 4, rank: 27 },
  { name: '단국대 PANDAS', seed: 4, rank: 28 },
  { name: '건국대 팬서스', seed: 4, rank: 29 },
  { name: '단국대학교 하운드', seed: 4, rank: 30 },
  { name: '한양대ERICA HIBA', seed: 4, rank: 31 },
  { name: '한국공학대학교 WINNERS', seed: 4, rank: 32 },
  // 5시드 (33~40위)
  { name: '강남대학교 타키온즈', seed: 5, rank: 33 },
  { name: '한성대학교 TURTLES', seed: 5, rank: 34 },
  { name: '서경대학교 적시타', seed: 5, rank: 35 },
  { name: '가톨릭대학교 텀블러즈', seed: 5, rank: 36 },
  { name: '한신대학교 갱스터', seed: 5, rank: 37 },
  { name: '한국체대 루나틱스', seed: 5, rank: 38 },
  { name: '한국교통대학교 스윙스', seed: 5, rank: 39 },
  { name: '광운대학교 페가수스', seed: 5, rank: 40 },
];

const SEED_COLORS: Record<number, string> = {
  1: '#f59e0b',
  2: '#94a3b8',
  3: '#f97316',
  4: '#34d399',
  5: '#60a5fa',
  6: '#a855f7',
};

const SEED_LABELS: Record<number, string> = {
  1: '1시드',
  2: '2시드',
  3: '3시드',
  4: '4시드',
  5: '5시드',
  6: '6시드 · 신규',
};

type AssignedTeam = { name: string; seed: number; rank?: number };
type GroupResult = Record<GroupLetter, AssignedTeam[]>;

const emptyGroups = (): GroupResult => {
  const r: Partial<GroupResult> = {};
  GROUP_LETTERS.forEach((g) => (r[g] = []));
  return r as GroupResult;
};

/* ─── 메인 페이지 ─── */

const STORAGE_KEY = 'aubl_draw_2026';

function loadState(): { groups: GroupResult; newcomer1: string; newcomer2: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { groups: emptyGroups(), newcomer1: '', newcomer2: '' };
    const parsed = JSON.parse(raw);
    // 그룹 키가 모두 존재하는지 검증
    const groups = emptyGroups();
    GROUP_LETTERS.forEach((g) => {
      if (Array.isArray(parsed.groups?.[g])) groups[g] = parsed.groups[g];
    });
    return {
      groups,
      newcomer1: parsed.newcomer1 ?? '',
      newcomer2: parsed.newcomer2 ?? '',
    };
  } catch {
    return { groups: emptyGroups(), newcomer1: '', newcomer2: '' };
  }
}

export default function GroupDrawPage() {
  const initial = loadState();
  const [newcomer1, setNewcomer1] = useState(initial.newcomer1);
  const [newcomer2, setNewcomer2] = useState(initial.newcomer2);
  const [groups, setGroups] = useState<GroupResult>(initial.groups);
  const [selected, setSelected] = useState<AssignedTeam | null>(null);
  const [activeSeed, setActiveSeed] = useState<number | null>(null);
  const [notif, setNotif] = useState<{ name: string; seed: number; group: GroupLetter } | null>(null);
  const [notifVisible, setNotifVisible] = useState(false);
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage 동기화
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups, newcomer1, newcomer2 }));
  }, [groups, newcomer1, newcomer2]);

  // 시드 전환 시 선택 초기화
  useEffect(() => { setSelected(null); }, [activeSeed]);

  // 언마운트 시 타이머 정리
  useEffect(() => () => { if (notifTimer.current) clearTimeout(notifTimer.current); }, []);

  const showNotif = (name: string, seed: number, group: GroupLetter) => {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    setNotif({ name, seed, group });
    setNotifVisible(true);
    notifTimer.current = setTimeout(() => {
      setNotifVisible(false);
      setTimeout(() => setNotif(null), 350);
    }, 3000);
  };

  const newcomers: AssignedTeam[] = [
    ...(newcomer1.trim() ? [{ name: newcomer1.trim(), seed: 6 }] : []),
    ...(newcomer2.trim() ? [{ name: newcomer2.trim(), seed: 6 }] : []),
  ];

  const assignedNames = new Set(
    GROUP_LETTERS.flatMap((g) => groups[g].map((t) => t.name)),
  );

  const totalTeams = SEEDED_TEAMS.length + newcomers.length;
  const assignedCount = assignedNames.size;
  const isComplete = assignedCount === totalTeams && totalTeams > 0;

  // 활성 시드의 팀 목록
  const activeSeedTeams: AssignedTeam[] =
    activeSeed === 6
      ? newcomers
      : activeSeed !== null
        ? SEEDED_TEAMS.filter((t) => t.seed === activeSeed)
        : [];

  const availableSeeds = [1, 2, 3, 4, 5, ...(newcomers.length > 0 ? [6] : [])];

  // 핸들러
  const handleTeamClick = (team: AssignedTeam) => {
    if (assignedNames.has(team.name)) return;
    setSelected((prev) => (prev?.name === team.name ? null : team));
  };

  const handleGroupClick = (group: GroupLetter) => {
    if (!selected) return;
    setGroups((prev) => ({ ...prev, [group]: [...prev[group], selected] }));
    showNotif(selected.name, selected.seed, group);
    setSelected(null);
  };

  const handleRemove = (group: GroupLetter, teamName: string) => {
    setGroups((prev) => ({
      ...prev,
      [group]: prev[group].filter((t) => t.name !== teamName),
    }));
  };

  const handleReset = () => {
    setGroups(emptyGroups());
    setNewcomer1('');
    setNewcomer2('');
    setSelected(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleDownload = () => {
    const lines: string[] = ['2026 AUBL 조추첨 결과', ''];
    GROUP_LETTERS.forEach((g) => {
      const teams = groups[g];
      if (teams.length === 0) return;
      lines.push(`[${g}조]`);
      teams
        .slice()
        .sort((a, b) => a.seed - b.seed)
        .forEach((t) => lines.push(`  ${SEED_LABELS[t.seed]}  ${t.name}`));
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '2026_AUBL_조추첨결과.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const goNextSeed = () => {
    if (activeSeed === null) return;
    const idx = availableSeeds.indexOf(activeSeed);
    const next = availableSeeds[idx + 1] ?? null;
    setActiveSeed(next);
  };

  const activeSeedDone =
    activeSeed !== null &&
    activeSeedTeams.length > 0 &&
    activeSeedTeams.every((t) => assignedNames.has(t.name));

  const seedColor = activeSeed !== null ? SEED_COLORS[activeSeed] : '#94a3b8';

  return (
    <div style={{ display: 'grid', gap: '22px' }}>

      {/* ── 헤더 ── */}
      <section
        style={{
          padding: 'clamp(20px, 5vw, 30px) clamp(20px, 5vw, 32px)',
          borderRadius: '20px',
          background:
            'radial-gradient(circle at 10% 20%, rgba(249,115,22,0.16), transparent 30%), radial-gradient(circle at 88% 8%, rgba(168,85,247,0.13), transparent 26%), linear-gradient(140deg, #1a0a2e 0%, #0f0f2e 100%)',
          border: '1px solid rgba(168,85,247,0.28)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{ padding: '5px 12px', borderRadius: '999px', fontWeight: 800, background: 'rgba(168,85,247,0.18)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,0.35)', fontSize: '12px', letterSpacing: '0.05em' }}>
                AUBL · 2026 조추첨
              </span>
              {isComplete && (
                <span style={{ padding: '5px 12px', borderRadius: '999px', fontWeight: 800, background: 'rgba(52,211,153,0.18)', color: '#34d399', border: '1px solid rgba(52,211,153,0.38)', fontSize: '12px' }}>
                  전체 편성 완료
                </span>
              )}
            </div>
            <h1 style={{ margin: 0, fontSize: 'clamp(22px, 5vw, 32px)', fontWeight: 900, lineHeight: 1.2 }}>
              2026 시즌 조추첨식
            </h1>
          </div>

          {/* 진행 현황 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>전체 진행</span>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#94a3b8' }}>{assignedCount} / {totalTeams}</span>
            </div>
            <div style={{ height: '7px', borderRadius: '999px', background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%', borderRadius: '999px',
                  width: `${totalTeams > 0 ? (assignedCount / totalTeams) * 100 : 0}%`,
                  background: isComplete ? 'linear-gradient(90deg, #34d399, #10b981)' : 'linear-gradient(90deg, #f97316, #a855f7)',
                  transition: 'width 350ms ease',
                }}
              />
            </div>
            {assignedCount > 0 && (
              <button
                type="button"
                onClick={handleReset}
                style={{
                  alignSelf: 'flex-end', padding: '5px 10px', borderRadius: '8px',
                  fontWeight: 800, fontSize: '11px',
                  background: 'rgba(248,113,113,0.1)', color: '#fca5a5',
                  border: '1px solid rgba(248,113,113,0.28)', cursor: 'pointer',
                }}
              >
                전체 초기화
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 신규 가입팀 입력 ── */}
      <section
        style={{
          padding: '16px 20px', borderRadius: '14px',
          background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: SEED_COLORS[6], flexShrink: 0 }} />
          <span style={{ fontWeight: 800, fontSize: '14px', color: '#d8b4fe' }}>당일 신규 가입팀 (6시드)</span>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>최대 2팀</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {[{ val: newcomer1, set: setNewcomer1, label: '신규팀 1' }, { val: newcomer2, set: setNewcomer2, label: '신규팀 2' }].map(({ val, set, label }) => (
            <input
              key={label}
              type="text"
              placeholder={`${label} 학교명`}
              value={val}
              onChange={(e) => set(e.target.value)}
              style={{
                flex: '1 1 200px', padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(168,85,247,0.28)',
                color: '#e2e8f0', fontSize: '14px', fontWeight: 700, outline: 'none', fontFamily: 'inherit',
              }}
            />
          ))}
        </div>
      </section>

      {/* ── 시드 선택 탭 ── */}
      <section>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {availableSeeds.map((seed) => {
            const seedTeams: AssignedTeam[] = seed === 6 ? newcomers : SEEDED_TEAMS.filter((t) => t.seed === seed);
            const doneCount = seedTeams.filter((t) => assignedNames.has(t.name)).length;
            const isDone = doneCount === seedTeams.length && seedTeams.length > 0;
            const isActive = activeSeed === seed;
            const c = SEED_COLORS[seed];
            return (
              <button
                key={seed}
                type="button"
                onClick={() => setActiveSeed(isActive ? null : seed)}
                style={{
                  padding: '12px 18px', borderRadius: '14px', fontWeight: 900, fontSize: '14px',
                  background: isActive ? `${c}22` : isDone ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? c : isDone ? '#34d399' : '#64748b',
                  border: isActive ? `2px solid ${c}65` : isDone ? '1.5px solid rgba(52,211,153,0.3)' : '1.5px solid rgba(148,163,184,0.18)',
                  cursor: 'pointer', transition: 'all 160ms ease',
                  boxShadow: isActive ? `0 0 18px ${c}22` : 'none',
                }}
              >
                {SEED_LABELS[seed]}
                <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: 700, opacity: 0.75 }}>
                  {doneCount}/{seedTeams.length}{isDone ? ' ✓' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 메인 뷰 ── */}
      {activeSeed !== null ? (
        /* ── 시드 추첨 뷰 (2단 분할) ── */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '18px', alignItems: 'start' }}>

          {/* 왼쪽: 선택된 시드 팀 목록 */}
          <section>
            {/* 시드 헤더 */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                marginBottom: '14px', flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  padding: '8px 18px', borderRadius: '12px', fontWeight: 900, fontSize: '17px',
                  background: `${seedColor}20`, color: seedColor,
                  border: `2px solid ${seedColor}50`,
                  letterSpacing: '0.03em',
                }}
              >
                {SEED_LABELS[activeSeed]}
              </div>
              {selected ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      padding: '6px 12px', borderRadius: '9px', fontWeight: 800, fontSize: '13px',
                      background: `${seedColor}18`, color: seedColor,
                      border: `1.5px solid ${seedColor}40`,
                    }}
                  >
                    {selected.name}
                  </span>
                  <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 600 }}>선택됨</span>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    style={{
                      padding: '5px 9px', borderRadius: '7px', fontSize: '12px', fontWeight: 800,
                      background: 'rgba(148,163,184,0.12)', color: '#94a3b8',
                      border: '1px solid rgba(148,163,184,0.22)', cursor: 'pointer',
                    }}
                  >
                    취소
                  </button>
                </div>
              ) : (
                <span style={{ color: '#475569', fontSize: '13px', fontWeight: 600 }}>
                  {activeSeedDone ? '이 시드 편성 완료' : '팀을 클릭해 선택하세요'}
                </span>
              )}
            </div>

            {/* 팀 카드 목록 */}
            <div style={{ display: 'grid', gap: '8px' }}>
              {activeSeedTeams.map((team) => {
                const isAssigned = assignedNames.has(team.name);
                const isSelected = selected?.name === team.name;
                const assignedGroup = GROUP_LETTERS.find((g) =>
                  groups[g].some((t) => t.name === team.name),
                );
                return (
                  <button
                    key={team.name}
                    type="button"
                    onClick={() => handleTeamClick(team)}
                    disabled={isAssigned}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '16px',
                      padding: '16px 20px', borderRadius: '14px', textAlign: 'left',
                      background: isSelected ? `${seedColor}1e` : 'rgba(255,255,255,0.04)',
                      border: isSelected ? `2px solid ${seedColor}` : '1.5px solid rgba(148,163,184,0.14)',
                      cursor: isAssigned ? 'default' : 'pointer',
                      transition: 'all 160ms ease', width: '100%',
                      filter: isAssigned ? 'grayscale(1) opacity(0.35)' : 'none',
                      boxShadow: isSelected ? `0 0 22px ${seedColor}28, 0 4px 14px rgba(0,0,0,0.2)` : '0 2px 8px rgba(0,0,0,0.15)',
                    }}
                  >
                    {team.rank !== undefined && (
                      <span
                        style={{
                          flexShrink: 0, width: '36px', height: '36px', borderRadius: '10px',
                          background: `${seedColor}18`, color: isSelected ? seedColor : '#94a3b8',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 900, fontSize: '16px',
                          border: `1.5px solid ${seedColor}25`,
                        }}
                      >
                        {team.rank}
                      </span>
                    )}
                    <span
                      style={{
                        flex: 1, fontSize: 'clamp(14px, 2.2vw, 17px)', fontWeight: 800,
                        color: isSelected ? seedColor : '#e2e8f0',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {team.name}
                    </span>
                    {assignedGroup && (
                      <span
                        style={{
                          flexShrink: 0, padding: '5px 13px', borderRadius: '9px',
                          fontSize: '14px', fontWeight: 900,
                          background: `${GROUP_COLORS[assignedGroup]}20`,
                          color: GROUP_COLORS[assignedGroup],
                          border: `1.5px solid ${GROUP_COLORS[assignedGroup]}40`,
                        }}
                      >
                        {assignedGroup}조
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 다음 시드 버튼 */}
            {activeSeedDone && (
              <div style={{ marginTop: '14px' }}>
                {availableSeeds.indexOf(activeSeed) < availableSeeds.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNextSeed}
                    style={{
                      width: '100%', padding: '14px', borderRadius: '13px',
                      fontWeight: 900, fontSize: '15px',
                      background: 'linear-gradient(120deg, rgba(52,211,153,0.2), rgba(16,185,129,0.2))',
                      color: '#34d399', border: '1.5px solid rgba(52,211,153,0.4)',
                      cursor: 'pointer',
                    }}
                  >
                    다음 시드로 →
                  </button>
                ) : (
                  <div
                    style={{
                      padding: '14px', borderRadius: '13px', textAlign: 'center',
                      fontWeight: 900, fontSize: '15px', color: '#34d399',
                      background: 'rgba(52,211,153,0.1)', border: '1.5px solid rgba(52,211,153,0.35)',
                    }}
                  >
                    모든 시드 편성 완료
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 오른쪽: 조 편성 패널 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#e2e8f0' }}>조 편성</h2>
              {selected && (
                <span
                  style={{
                    padding: '5px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '13px',
                    background: `${seedColor}15`, color: seedColor,
                    border: `1px solid ${seedColor}35`,
                  }}
                >
                  배정할 조를 클릭하세요
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {GROUP_LETTERS.map((group) => {
                const gc = GROUP_COLORS[group];
                const assignedTeams = groups[group];
                const isTarget = !!selected;
                const hasThisSeed = assignedTeams.some((t) => t.seed === activeSeed);
                return (
                  <div
                    key={group}
                    onClick={() => handleGroupClick(group)}
                    style={{
                      padding: '16px 18px', borderRadius: '16px',
                      background: isTarget
                        ? `radial-gradient(circle at 85% 12%, ${gc}1a, transparent 55%), rgba(255,255,255,0.04)`
                        : hasThisSeed
                          ? `radial-gradient(circle at 85% 12%, ${gc}10, transparent 50%), rgba(255,255,255,0.03)`
                          : 'rgba(255,255,255,0.025)',
                      border: isTarget ? `2px solid ${gc}65` : hasThisSeed ? `1.5px solid ${gc}40` : `1.5px solid ${gc}22`,
                      cursor: isTarget ? 'pointer' : 'default',
                      transition: 'all 200ms ease',
                      minHeight: '140px',
                      boxShadow: isTarget ? `0 0 22px ${gc}1a` : 'none',
                    }}
                  >
                    {/* 조 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <div
                        style={{
                          width: '44px', height: '44px', borderRadius: '12px',
                          background: `${gc}1e`, color: gc,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 900, fontSize: '24px',
                          border: `2px solid ${gc}40`,
                          flexShrink: 0,
                        }}
                      >
                        {group}
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 900, fontSize: '16px', color: gc }}>{group}조</p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#475569', fontWeight: 600 }}>
                          {assignedTeams.length}팀
                          {isTarget && <span style={{ color: gc, marginLeft: '4px' }}>← 클릭 배정</span>}
                        </p>
                      </div>
                    </div>

                    {/* 배정된 팀 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                      {assignedTeams.map((team) => (
                        <div
                          key={team.name}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '6px 8px', borderRadius: '9px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(148,163,184,0.1)',
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              flexShrink: 0, width: '18px', height: '18px', borderRadius: '5px',
                              background: `${SEED_COLORS[team.seed]}1e`, color: SEED_COLORS[team.seed],
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 900, fontSize: '10px',
                            }}
                          >
                            {team.seed}
                          </span>
                          <span style={{ flex: 1, fontSize: '13px', fontWeight: 900, color: '#e2e8f0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {team.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRemove(group, team.name); }}
                            style={{
                              flexShrink: 0, width: '16px', height: '16px', borderRadius: '4px',
                              background: 'rgba(248,113,113,0.12)', color: '#fca5a5',
                              border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {assignedTeams.length === 0 && (
                        <div
                          style={{
                            padding: '12px 8px', textAlign: 'center',
                            color: isTarget ? gc : '#2a3547',
                            fontSize: '12px', fontWeight: 700, borderRadius: '8px',
                            border: isTarget ? `1.5px dashed ${gc}50` : '1.5px dashed rgba(148,163,184,0.1)',
                            transition: 'all 200ms ease',
                          }}
                        >
                          {isTarget ? '클릭하여 배정' : '미배정'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        /* ── 시드 미선택 개요 화면 ── */
        <section
          style={{
            padding: '28px', borderRadius: '18px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(148,163,184,0.12)',
          }}
        >
          <p style={{ margin: '0 0 20px', fontWeight: 900, fontSize: '17px', color: '#94a3b8' }}>
            위에서 추첨할 시드를 선택하세요
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {availableSeeds.map((seed) => {
              const seedTeams: AssignedTeam[] = seed === 6 ? newcomers : SEEDED_TEAMS.filter((t) => t.seed === seed);
              const doneCount = seedTeams.filter((t) => assignedNames.has(t.name)).length;
              const isDone = doneCount === seedTeams.length && seedTeams.length > 0;
              const c = SEED_COLORS[seed];
              return (
                <button
                  key={seed}
                  type="button"
                  onClick={() => setActiveSeed(seed)}
                  style={{
                    padding: '18px', borderRadius: '14px', textAlign: 'left',
                    background: isDone ? 'rgba(52,211,153,0.07)' : `${c}08`,
                    border: isDone ? '1.5px solid rgba(52,211,153,0.3)' : `1.5px solid ${c}28`,
                    cursor: 'pointer', transition: 'all 160ms ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 900, fontSize: '15px', color: isDone ? '#34d399' : c }}>
                      {SEED_LABELS[seed]}
                    </span>
                    {isDone && <span style={{ color: '#34d399', fontSize: '14px' }}>✓</span>}
                  </div>
                  <div style={{ height: '5px', borderRadius: '999px', background: 'rgba(148,163,184,0.15)', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%', borderRadius: '999px',
                        width: `${seedTeams.length > 0 ? (doneCount / seedTeams.length) * 100 : 0}%`,
                        background: isDone ? '#34d399' : c,
                      }}
                    />
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                    {doneCount} / {seedTeams.length} 배정 완료
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 편성 결과 요약 표 ── */}
      {assignedCount > 0 && (
        <section
          style={{
            padding: '22px', borderRadius: '16px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(148,163,184,0.14)',
            overflowX: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#e2e8f0' }}>편성 결과 요약</h3>
            <button
              type="button"
              onClick={handleDownload}
              style={{
                padding: '8px 16px', borderRadius: '10px',
                fontWeight: 800, fontSize: '13px',
                background: 'rgba(96,165,250,0.12)', color: '#93c5fd',
                border: '1.5px solid rgba(96,165,250,0.32)', cursor: 'pointer',
              }}
            >
              텍스트 다운로드
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: '#475569', fontWeight: 800, fontSize: '14px', borderBottom: '1px solid rgba(148,163,184,0.13)', whiteSpace: 'nowrap' }}>시드</th>
                {GROUP_LETTERS.map((g) => (
                  <th key={g} style={{ padding: '10px 3px', color: GROUP_COLORS[g], fontWeight: 900, fontSize: '17px', borderBottom: `1px solid ${GROUP_COLORS[g]}28`, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {g}조
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4, 5, 6] as const).map((seed) => {
                const hasAny = GROUP_LETTERS.some((g) => groups[g].some((t) => t.seed === seed));
                if (!hasAny) return null;
                return (
                  <tr key={seed}>
                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', padding: '4px 11px', borderRadius: '8px', fontWeight: 900, fontSize: '13px', background: `${SEED_COLORS[seed]}18`, color: SEED_COLORS[seed], border: `1px solid ${SEED_COLORS[seed]}32` }}>
                        {SEED_LABELS[seed]}
                      </span>
                    </td>
                    {GROUP_LETTERS.map((g) => {
                      const team = groups[g].find((t) => t.seed === seed);
                      return (
                        <td key={g} style={{ padding: '7px 3px', textAlign: 'center', color: '#e2e8f0', fontWeight: 900, fontSize: '18px', lineHeight: 1.35 }}>
                          {team?.name ?? <span style={{ color: '#2a3547' }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* ── 안내 ── */}
      <section style={{ padding: '14px 18px', borderRadius: '11px', border: '1px solid rgba(148,163,184,0.1)', background: 'rgba(255,255,255,0.015)', color: '#475569', fontSize: '12px', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          <strong style={{ color: '#64748b' }}>안내</strong> — 조추첨식 현장 수동 편성 페이지입니다. 시드 배정은 2026 AUBL 파워랭킹 기준이며, 편성 결과는 저장되지 않습니다.
        </p>
      </section>

      {/* ── 배정 알림 팝업 ── */}
      {notif && (
        <div
          style={{
            position: 'fixed', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, pointerEvents: 'none',
            opacity: notifVisible ? 1 : 0,
            transition: 'opacity 350ms ease',
            background: notifVisible ? 'rgba(5,8,18,0.55)' : 'transparent',
          }}
        >
          <div
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px',
              padding: 'clamp(40px, 6vw, 64px) clamp(48px, 8vw, 96px)',
              borderRadius: '32px',
              background: 'linear-gradient(145deg, rgba(10,14,28,0.98), rgba(15,22,42,0.98))',
              border: `2px solid ${SEED_COLORS[notif.seed]}55`,
              boxShadow: `0 48px 120px rgba(0,0,0,0.75), 0 0 80px ${SEED_COLORS[notif.seed]}18`,
              backdropFilter: 'blur(24px)',
              maxWidth: 'min(640px, 88vw)',
              width: '100%',
              transform: notifVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(16px)',
              transition: 'opacity 350ms ease, transform 350ms cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {/* 시드 배지 */}
            <span
              style={{
                padding: '8px 22px', borderRadius: '999px',
                fontWeight: 900, fontSize: '16px', letterSpacing: '0.06em',
                background: `${SEED_COLORS[notif.seed]}22`,
                color: SEED_COLORS[notif.seed],
                border: `2px solid ${SEED_COLORS[notif.seed]}55`,
              }}
            >
              {SEED_LABELS[notif.seed]}
            </span>

            {/* 학교명 */}
            <div
              style={{
                fontSize: 'clamp(28px, 5vw, 52px)', fontWeight: 900,
                color: '#f1f5f9', textAlign: 'center', lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              {notif.name}
            </div>

            {/* 화살표 */}
            <div style={{ fontSize: '28px', color: '#334155', lineHeight: 1 }}>↓</div>

            {/* 조 배정 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: 'clamp(72px, 10vw, 96px)', height: 'clamp(72px, 10vw, 96px)',
                  borderRadius: '22px',
                  background: `${GROUP_COLORS[notif.group]}22`,
                  color: GROUP_COLORS[notif.group],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 'clamp(44px, 7vw, 64px)',
                  border: `3px solid ${GROUP_COLORS[notif.group]}60`,
                  boxShadow: `0 0 40px ${GROUP_COLORS[notif.group]}35`,
                }}
              >
                {notif.group}
              </div>
              <span
                style={{
                  fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 900,
                  color: GROUP_COLORS[notif.group],
                  letterSpacing: '-0.01em',
                }}
              >
                조 배정
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
