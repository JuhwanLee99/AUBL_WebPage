import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { collection, getDocs } from 'firebase/firestore';
import { GROUP_LETTERS, GROUP_COLORS, TEAM_GROUPS } from '@shared/lib/teamGroups';
import type { GroupLetter } from '@shared/lib/teamGroups';
import { TEAM_SEED_INFO } from '@shared/lib/teamSeeds';
import { useContent } from '@shared/state/contentProvider';
import { buildTeamDirectory, encodeTeamId } from '@shared/lib/teamDirectory';
import {
  normalizeExternalImageUrl,
  shouldForceLogoContrastBoost,
} from '@shared/lib/imageUrl';
import { firestore } from '@shared/firebase/client';

/* ─── 로컬 타입 ─── */

type GroupKey = 'ALL' | GroupLetter;
type SortKey = 'NAME' | 'GROUP';

const GROUP_TABS: { key: GroupKey; label: string; color: string }[] = [
  { key: 'ALL', label: '전체', color: '#94a3b8' },
  ...GROUP_LETTERS.map((g) => ({ key: g as GroupKey, label: `${g}조`, color: GROUP_COLORS[g] })),
];

/* ─── 메인 페이지 ─── */

export default function TeamHubPage() {
  const { content } = useContent();
  const teamsContent = content.teams;
  const pageRef = useRef<HTMLDivElement>(null);
  const [activeGroup, setActiveGroup] = useState<GroupKey>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('GROUP');
  const [logoById, setLogoById] = useState<Record<string, string>>({});
  const teamEntries = teamsContent.entries.length ? teamsContent.entries : TEAM_GROUPS;
  const teams = buildTeamDirectory(teamEntries);

  useEffect(() => {
    let alive = true;
    getDocs(collection(firestore, 'teams'))
      .then((snap) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() as { emblemUrl?: string };
          if (typeof data.emblemUrl === 'string' && data.emblemUrl.trim()) {
            next[docSnap.id] = normalizeExternalImageUrl(data.emblemUrl);
          }
        });
        setLogoById(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const sections = pageRef.current?.querySelectorAll('.team-hub-section');
      if (sections) {
        gsap.fromTo(sections, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.85, stagger: 0.08, ease: 'power2.out' });
      }
      const cards = pageRef.current?.querySelectorAll('.team-card');
      if (cards) {
        gsap.fromTo(cards, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.03, ease: 'power2.out', delay: 0.12 });
      }
    });
    return () => ctx.revert();
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      if (activeGroup !== 'ALL' && team.group !== activeGroup) return false;
      if (!normalizedSearch) return true;
      return team.name.toLowerCase().includes(normalizedSearch);
    });
  }, [teams, activeGroup, normalizedSearch]);

  const visibleTeams = useMemo(() => {
    return [...filteredTeams].sort((a, b) => {
      if (sortKey === 'GROUP') {
        const groupDiff = a.group.localeCompare(b.group, 'en');
        if (groupDiff !== 0) return groupDiff;
        const aSeed = TEAM_SEED_INFO.get(a.name);
        const bSeed = TEAM_SEED_INFO.get(b.name);
        const seedDiff = (aSeed?.seed ?? 99) - (bSeed?.seed ?? 99);
        if (seedDiff !== 0) return seedDiff;
        const rankDiff = (aSeed?.rank ?? 999) - (bSeed?.rank ?? 999);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' });
      }
      return a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' });
    });
  }, [filteredTeams, sortKey]);

  const groupedVisibleTeams = useMemo(() => {
    if (sortKey !== 'GROUP') return [];
    const grouped: Record<GroupLetter, typeof visibleTeams> = {
      A: [],
      B: [],
      C: [],
      D: [],
      E: [],
      F: [],
      G: [],
      H: [],
    };
    visibleTeams.forEach((team) => {
      grouped[team.group].push(team);
    });

    const targetGroups: GroupLetter[] = activeGroup === 'ALL' ? GROUP_LETTERS : [activeGroup];
    return targetGroups
      .map((group) => ({ group, teams: grouped[group] }))
      .filter((row) => row.teams.length > 0);
  }, [visibleTeams, activeGroup, sortKey]);

  const groupCounts = useMemo(() => {
    const map: Record<GroupLetter, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 };
    teams.forEach((team) => {
      map[team.group] += 1;
    });
    return map;
  }, [teams]);

  const logoForTeam = useMemo(() => {
    return (name: string) => logoById[encodeTeamId(name)];
  }, [logoById]);

  return (
    <div style={{ display: 'grid', gap: '28px' }} ref={pageRef}>
      {/* ── HERO ── */}
      <section
        className="team-hub-section"
        style={{
          display: 'grid',
          gap: '18px',
          padding: 'clamp(26px, 6vw, 38px)',
          borderRadius: '28px',
          background:
            'linear-gradient(140deg, rgba(8,47,73,0.95) 0%, rgba(30,41,59,0.9) 45%, rgba(15,23,42,0.95) 100%)',
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 26px 70px rgba(0,0,0,0.35)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 15% 20%, rgba(56,189,248,0.16), transparent 35%), radial-gradient(circle at 85% 10%, rgba(249,115,22,0.14), transparent 30%)',
            opacity: 0.9,
          }}
        />
        <div style={{ position: 'relative', display: 'grid', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '8px 12px',
                borderRadius: '999px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                background: 'rgba(56,189,248,0.16)',
                color: '#bae6fd',
                border: '1px solid rgba(56,189,248,0.4)',
                fontSize: '11px',
              }}
            >
              TEAM HUB
            </span>
            <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '12px' }}>팀별 일정 · 로스터 · 공지</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px, 6vw, 36px)', fontWeight: 900, lineHeight: 1.2 }}>
            {teamsContent.pageTitle || '2026 참가팀 · 조편성'}
          </h1>
          <p style={{ margin: 0, color: '#cbd5e1', maxWidth: '780px', lineHeight: 1.7 }}>
            {teamsContent.pageDescription ||
              '총 40개 대학이 A~H조 조별 리그에 참가합니다. 조별 상위 2팀은 으뜸 토너먼트 16강, 3·4등은 버금 토너먼트 16강으로 포스트시즌이 진행됩니다.'}
          </p>
        </div>

        <div style={{ position: 'relative', display: 'grid', gap: '12px', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center' }}>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="팀명으로 검색"
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '14px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(15,23,42,0.6)',
              color: '#e2e8f0',
              fontSize: '14px',
            }}
          />
          <Link
            to="/schedule/groups"
            style={{
              padding: '12px 14px',
              borderRadius: '14px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '13px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            조별 일정 보기 →
          </Link>
        </div>

        <div style={{ position: 'relative', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{
            padding: '8px 12px',
            borderRadius: '12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(148,163,184,0.25)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '12px',
          }}>총 {teams.length}팀</div>
          <div style={{
            padding: '8px 12px',
            borderRadius: '12px',
            background: 'rgba(56,189,248,0.14)',
            border: '1px solid rgba(56,189,248,0.35)',
            color: '#bae6fd',
            fontWeight: 800,
            fontSize: '12px',
          }}>8개 조</div>
          <Link
            to="/intro"
            style={{
              padding: '8px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '12px',
              textDecoration: 'none',
            }}
          >
            리그 소개 →
          </Link>
        </div>
      </section>

      {/* ── 그룹 스냅샷 ── */}
      <section className="team-hub-section" style={{ display: 'grid', gap: '14px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>조 스냅샷</h2>
            <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>조별 참가팀 수를 빠르게 확인하세요.</p>
          </div>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {GROUP_LETTERS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setActiveGroup(group)}
              className="team-card"
              style={{
                padding: '14px',
                borderRadius: '16px',
                border: activeGroup === group ? `1.5px solid ${GROUP_COLORS[group]}` : '1px solid rgba(148,163,184,0.25)',
                background: activeGroup === group ? `${GROUP_COLORS[group]}22` : 'rgba(255,255,255,0.03)',
                color: '#e2e8f0',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'grid',
                gap: '8px',
              }}
            >
              <span style={{ fontWeight: 900, fontSize: '16px', color: GROUP_COLORS[group] }}>{group}조</span>
              <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '12px' }}>{groupCounts[group]}팀</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── 필터 탭 ── */}
      <section className="team-hub-section" style={{ display: 'grid', gap: '12px' }}>
        <div className="nav-scroll" style={{ position: 'relative' }}>
          <div className="nav-scroll__rail" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {GROUP_TABS.map((tab) => {
              const isActive = activeGroup === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveGroup(tab.key)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '13px',
                    background: isActive ? `${tab.color}22` : 'rgba(255,255,255,0.04)',
                    color: isActive ? tab.color : '#94a3b8',
                    border: isActive ? `1.5px solid ${tab.color}55` : '1.5px solid rgba(148,163,184,0.15)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 팀 디렉토리 ── */}
      <section className="team-hub-section" style={{ display: 'grid', gap: '14px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900 }}>팀 디렉토리</h2>
            <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '13px' }}>
              {activeGroup === 'ALL' ? '전체 팀을 표시합니다.' : `${activeGroup}조 소속 팀`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { key: 'NAME', label: '가나다' },
                { key: 'GROUP', label: '조별' },
              ].map((option) => {
                const isActive = sortKey === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setSortKey(option.key as SortKey)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '999px',
                      fontWeight: 800,
                      fontSize: '12px',
                      background: isActive ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.04)',
                      color: isActive ? '#bae6fd' : '#94a3b8',
                      border: isActive ? '1px solid rgba(56,189,248,0.5)' : '1px solid rgba(148,163,184,0.2)',
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>{visibleTeams.length}팀 표시</span>
          </div>
        </header>

        {visibleTeams.length ? (
          sortKey === 'GROUP' ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              {groupedVisibleTeams.map((row) => (
                <div
                  key={row.group}
                  className="team-hub-group-row"
                  style={{ display: 'grid', gap: '10px', alignItems: 'start' }}
                >
                  <div
                    className="team-hub-group-label"
                    style={{
                      paddingTop: '8px',
                      color: GROUP_COLORS[row.group],
                      fontSize: '14px',
                      fontWeight: 900,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {row.group}조
                  </div>
                  <div className="team-hub-group-track" style={{ position: 'relative' }}>
                    <div className="team-hub-group-grid" style={{ display: 'grid', gap: '10px' }}>
                      {row.teams.map((team) => {
                        const logoUrl = logoForTeam(team.name);
                        const needsBoost = logoUrl ? shouldForceLogoContrastBoost(logoUrl) : false;
                        return (
                          <Link
                            key={team.name}
                            to={`/teams/${encodeTeamId(team.name)}`}
                            className="team-card team-hub-group-card"
                            style={{
                              padding: '16px',
                              borderRadius: '18px',
                              border: '1px solid rgba(148,163,184,0.25)',
                              backgroundColor: 'rgba(15,23,42,0.65)',
                              backgroundImage: logoUrl
                                ? needsBoost
                                  ? `linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url("${logoUrl}"), radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0.93) 22%, rgba(255,255,255,0.54) 40%, rgba(255,255,255,0.12) 56%, rgba(255,255,255,0) 74%)`
                                  : `linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url("${logoUrl}")`
                                : undefined,
                              backgroundRepeat: logoUrl
                                ? needsBoost
                                  ? 'no-repeat, no-repeat, no-repeat'
                                  : 'no-repeat, no-repeat'
                                : undefined,
                              backgroundPosition: logoUrl
                                ? needsBoost
                                  ? 'center, center, center'
                                  : 'center, center'
                                : undefined,
                              backgroundSize: logoUrl
                                ? needsBoost
                                  ? '100% 100%, 120px auto, 180px 180px'
                                  : '100% 100%, 120px auto'
                                : undefined,
                              color: '#e2e8f0',
                              textDecoration: 'none',
                              display: 'grid',
                              gap: '10px',
                              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '999px',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  background: `${team.color}22`,
                                  color: team.color,
                                  border: `1px solid ${team.color}55`,
                                }}
                              >
                                {team.group}조
                              </span>
                              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>TEAM PAGE</span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '16px' }}>{team.name}</div>
                            <div style={{ color: '#94a3b8', fontSize: '12px' }}>일정 · 로스터 · 공지 확인</div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {visibleTeams.map((team) => {
                const logoUrl = logoForTeam(team.name);
                const needsBoost = logoUrl ? shouldForceLogoContrastBoost(logoUrl) : false;
                return (
                  <Link
                    key={team.name}
                    to={`/teams/${encodeTeamId(team.name)}`}
                    className="team-card"
                    style={{
                      padding: '16px',
                      borderRadius: '18px',
                      border: '1px solid rgba(148,163,184,0.25)',
                      backgroundColor: 'rgba(15,23,42,0.65)',
                      backgroundImage: logoUrl
                        ? needsBoost
                          ? `linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url("${logoUrl}"), radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,255,255,0.93) 22%, rgba(255,255,255,0.54) 40%, rgba(255,255,255,0.12) 56%, rgba(255,255,255,0) 74%)`
                          : `linear-gradient(180deg, rgba(15,23,42,0.7), rgba(15,23,42,0.7)), url("${logoUrl}")`
                        : undefined,
                      backgroundRepeat: logoUrl
                        ? needsBoost
                          ? 'no-repeat, no-repeat, no-repeat'
                          : 'no-repeat, no-repeat'
                        : undefined,
                      backgroundPosition: logoUrl
                        ? needsBoost
                          ? 'center, center, center'
                          : 'center, center'
                        : undefined,
                      backgroundSize: logoUrl
                        ? needsBoost
                          ? '100% 100%, 120px auto, 180px 180px'
                          : '100% 100%, 120px auto'
                        : undefined,
                      color: '#e2e8f0',
                      textDecoration: 'none',
                      display: 'grid',
                      gap: '10px',
                      boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '999px',
                          fontWeight: 800,
                          fontSize: '11px',
                          background: `${team.color}22`,
                          color: team.color,
                          border: `1px solid ${team.color}55`,
                        }}
                      >
                        {team.group}조
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>TEAM PAGE</span>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '16px' }}>{team.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>일정 · 로스터 · 공지 확인</div>
                  </Link>
                );
              })}
            </div>
          )
        ) : (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>조건에 맞는 팀이 없습니다. 검색어나 필터를 확인해주세요.</div>
        )}
      </section>

      {/* ── 안내 ── */}
      <section
        className="team-hub-section"
        style={{
          padding: '20px 24px',
          borderRadius: '14px',
          border: '1px solid rgba(148,163,184,0.15)',
          background: 'rgba(255,255,255,0.02)',
          color: '#94a3b8',
          fontSize: '12px',
          lineHeight: 1.7,
        }}
      >
        <p style={{ margin: 0 }}>
          <strong style={{ color: '#cbd5e1' }}>참고</strong> — {teamsContent.pageNote || '조편성은 대표자회의 의결에 따라 확정되며, 변경될 수 있습니다. 최종 조편성은 시즌 개막 전 공지됩니다.'}
        </p>
      </section>
    </div>
  );
}
