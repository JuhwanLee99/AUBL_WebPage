import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { collection, getDocs } from 'firebase/firestore';
import { GROUP_LETTERS, TEAM_GROUPS } from '@shared/lib/teamGroups';
import type { GroupLetter } from '@shared/lib/teamGroups';
import { TEAM_SEED_INFO } from '@shared/lib/teamSeeds';
import { useContent } from '@shared/state/contentProvider';
import { buildTeamDirectory, encodeTeamId } from '@shared/lib/teamDirectory';
import {
  normalizeExternalImageUrl,
  shouldForceLogoContrastBoost,
} from '@shared/lib/imageUrl';
import { firestore } from '@shared/firebase/client';
import './TeamPages.css';

/* ─── 로컬 타입 ─── */

type GroupKey = 'ALL' | GroupLetter;
type SortKey = 'NAME' | 'GROUP';

const GROUP_TABS: { key: GroupKey; label: string }[] = [
  { key: 'ALL', label: '전체' },
  ...GROUP_LETTERS.map((g) => ({ key: g as GroupKey, label: `${g}조` })),
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

  const renderDirectoryCard = (team: (typeof teams)[number], grouped = false) => {
    const logoUrl = logoForTeam(team.name);
    const needsBoost = logoUrl ? shouldForceLogoContrastBoost(logoUrl) : false;

    return (
      <Link
        key={team.name}
        to={`/teams/${encodeTeamId(team.name)}`}
        className={`team-card team-directory-card${grouped ? ' team-hub-group-card' : ''}`}
      >
        <div className={`team-directory-card__logo${needsBoost ? ' needs-contrast' : ''}`} aria-hidden="true">
          {logoUrl ? (
            <img src={logoUrl} alt="" loading="lazy" />
          ) : (
            <span>{team.name.slice(0, 2)}</span>
          )}
        </div>
        <div className="team-directory-card__body">
          <div className="team-directory-card__meta">
            <span className="team-directory-card__group">{team.group}조</span>
            <span>TEAM PROFILE</span>
          </div>
          <h3>{team.name}</h3>
          <p>일정 · 로스터 · 공지</p>
        </div>
        <span className="team-directory-card__arrow" aria-hidden="true">→</span>
      </Link>
    );
  };

  return (
    <div className="team-hub-page" ref={pageRef}>
      {/* ── HERO ── */}
      <section className="team-hub-section team-page-hero">
        <div className="team-page-hero__copy">
          <div className="team-page-eyebrow">
            <span className="team-page-kicker">TEAM HUB</span>
            <span>팀별 일정 · 로스터 · 공지</span>
          </div>
          <h1>
            {teamsContent.pageTitle || '2026 참가팀 · 조편성'}
          </h1>
          <p>
            {teamsContent.pageDescription ||
              '총 40개 대학이 A~H조 조별 리그에 참가합니다. 조별 상위 2팀은 으뜸 토너먼트 16강, 3·4등은 버금 토너먼트 16강으로 포스트시즌이 진행됩니다.'}
          </p>
        </div>

        <div className="team-page-hero__toolbar">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="팀명으로 검색"
            aria-label="팀명으로 검색"
          />
          <Link to="/schedule/groups" className="team-page-action team-page-action--secondary">
            조별 일정 보기 →
          </Link>
        </div>

        <div className="team-page-summary" aria-label="참가 현황">
          <div><strong>{teams.length}</strong><span>참가팀</span></div>
          <div><strong>8</strong><span>조</span></div>
          <Link to="/intro" className="team-page-action team-page-action--text">
            리그 소개 →
          </Link>
        </div>
      </section>

      {/* ── 그룹 스냅샷 ── */}
      <section className="team-hub-section team-page-section">
        <header className="team-page-section__header">
          <div>
            <h2>조 스냅샷</h2>
            <p>조별 참가팀 수를 빠르게 확인하세요.</p>
          </div>
        </header>
        <div className="team-group-snapshot">
          {GROUP_LETTERS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setActiveGroup(group)}
              className={`team-card team-group-snapshot__button${activeGroup === group ? ' is-active' : ''}`}
              aria-pressed={activeGroup === group}
            >
              <span>{group}조</span>
              <small>{groupCounts[group]}팀</small>
            </button>
          ))}
        </div>
      </section>

      {/* ── 필터 탭 ── */}
      <section className="team-hub-section team-filter-section" aria-label="조 필터">
        <div className="nav-scroll team-filter-scroll">
          <div className="nav-scroll__rail team-filter-rail">
            {GROUP_TABS.map((tab) => {
              const isActive = activeGroup === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveGroup(tab.key)}
                  className={`team-filter-button${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 팀 디렉토리 ── */}
      <section className="team-hub-section team-page-section team-directory">
        <header className="team-directory__header team-page-section__header">
          <div>
            <h2>팀 디렉토리</h2>
            <p>
              {activeGroup === 'ALL' ? '전체 팀을 표시합니다.' : `${activeGroup}조 소속 팀`}
            </p>
          </div>
          <div className="team-directory__controls">
            <div className="team-directory__sort" role="group" aria-label="팀 정렬">
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
                    className={`team-sort-button${isActive ? ' is-active' : ''}`}
                    aria-pressed={isActive}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className="team-directory__count">{visibleTeams.length}팀 표시</span>
          </div>
        </header>

        {visibleTeams.length ? (
          sortKey === 'GROUP' ? (
            <div className="team-directory__groups">
              {groupedVisibleTeams.map((row) => (
                <div
                  key={row.group}
                  className="team-hub-group-row"
                >
                  <div className="team-hub-group-label">
                    {row.group}조
                  </div>
                  <div className="team-hub-group-track">
                    <div className="team-hub-group-grid">
                      {row.teams.map((team) => renderDirectoryCard(team, true))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="team-directory__grid">
              {visibleTeams.map((team) => renderDirectoryCard(team))}
            </div>
          )
        ) : (
          <div className="team-page-empty">조건에 맞는 팀이 없습니다. 검색어나 필터를 확인해주세요.</div>
        )}
      </section>

      {/* ── 안내 ── */}
      <section className="team-hub-section team-page-note">
        <p>
          <strong>참고</strong> — {teamsContent.pageNote || '조편성은 대표자회의 의결에 따라 확정되며, 변경될 수 있습니다. 최종 조편성은 시즌 개막 전 공지됩니다.'}
        </p>
      </section>
    </div>
  );
}
