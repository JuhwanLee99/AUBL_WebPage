import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import {
  getBatterRankings,
  getPitcherRankings,
  getPlayerSearchIndex,
  getPlayoffSummaries,
  getPowerRankings,
  getRecordFilterOptions,
  getRecordOverview,
  getSeasons,
  getTeamRecordStandings,
  type BatterRanking,
  type BatterRankingSort,
  type PitcherRanking,
  type PitcherRankingSort,
  type PlayoffSummaryRow,
  type PowerRankingApiRow,
  type RecordGroup,
  type RecordPlayoffDivision,
  type RecordRegulation,
  type RecordScope,
  type RecordFilterOptions,
  type RecordsOverview,
  type SeasonSummary,
  type TeamRecordStanding,
} from '../../shared/api/backendClient';
import {
  buildBatterSortOptions,
  buildGroupOptions,
  buildPitcherSortOptions,
  buildPlayoffDivisionOptions,
  buildScopeOptions,
  DEFAULT_RECORD_FILTERS,
  matchesRecordFilters,
  supportsPlayoffFiltering,
  toRecordFilterParams,
  type RecordFilterState,
} from '../../shared/lib/recordFilters';
import RecordsHubShell from '../../features/records/components/RecordsHubShell';
import RecordsFilterBar from '../../features/records/components/RecordsFilterBar';
import {
  noticeCardStyle,
  quickLinkStyle,
} from '../../features/records/components/recordStyles';
import type {
  PlayoffStageSummaryRow,
  RecordsTab,
  TopFiveRow,
} from '../../features/records/types';
import OverviewTab from '../../features/records/tabs/OverviewTab';
import StandingsTab from '../../features/records/tabs/StandingsTab';
import BattersTab from '../../features/records/tabs/BattersTab';
import PitchersTab from '../../features/records/tabs/PitchersTab';
import PowerTab from '../../features/records/tabs/PowerTab';
import { estimateGamesFromStandings, normalizeRound, normalizeTier, toWinPct } from '../../features/records/utils/recordView';

const TAB_OPTIONS: Array<{ value: RecordsTab; label: string }> = [
  { value: 'overview', label: '개요' },
  { value: 'standings', label: '팀순위' },
  { value: 'pitchers', label: '투수기록' },
  { value: 'batters', label: '타자기록' },
  { value: 'power', label: '파워랭킹' },
];

function hasJerseyValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

function applyJerseyFallback<T extends { playerId: number; jerseyNumber: string }>(
  rows: T[],
  jerseyByPlayerId: Map<number, string> | null,
): T[] {
  if (!jerseyByPlayerId || jerseyByPlayerId.size === 0) return rows;
  return rows.map((row) => {
    if (hasJerseyValue(row.jerseyNumber)) return row;
    const fallback = jerseyByPlayerId.get(row.playerId);
    if (!fallback) return row;
    return { ...row, jerseyNumber: fallback };
  });
}

function parseTab(value: string | null): RecordsTab {
  const raw = (value || '').toLowerCase();
  if (raw === 'overview' || raw === 'standings' || raw === 'batters' || raw === 'pitchers' || raw === 'power') {
    return raw;
  }
  return 'overview';
}

function parseScope(value: string | null): RecordScope {
  const raw = (value || '').toUpperCase();
  if (raw === 'ALL' || raw === 'LEAGUE' || raw === 'PLAYOFF') return raw;
  return DEFAULT_RECORD_FILTERS.scope;
}

function parseGroup(value: string | null): RecordGroup {
  const raw = (value || '').toUpperCase();
  if (raw === 'ALL' || raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D' || raw === 'E' || raw === 'F' || raw === 'G' || raw === 'H') {
    return raw;
  }
  return DEFAULT_RECORD_FILTERS.group;
}

function parsePlayoffDivision(value: string | null): RecordPlayoffDivision {
  const raw = (value || '').toUpperCase();
  if (raw === 'ALL' || raw === 'EUTTEUM' || raw === 'BEOGEUM') return raw;
  return DEFAULT_RECORD_FILTERS.playoffDivision;
}

function parseRegulation(value: string | null): Exclude<RecordRegulation, 'ALL'> {
  const raw = (value || 'IN').toUpperCase();
  return raw === 'OUT' ? 'OUT' : 'IN';
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function formatTopBatterValue(row: BatterRanking, sort: BatterRankingSort): string {
  switch (sort) {
    case 'battingAverage':
      return `AVG ${row.battingAverage.toFixed(3)}`;
    case 'hits':
      return `H ${row.hits}`;
    case 'homeRuns':
      return `HR ${row.homeRuns}`;
    case 'rbi':
      return `RBI ${row.runsBattedIn}`;
    case 'onBasePct':
      return `OBP ${row.onBasePct.toFixed(3)}`;
    case 'sluggingPct':
      return `SLG ${row.sluggingPct.toFixed(3)}`;
    case 'ops':
    default:
      return `OPS ${row.ops.toFixed(3)}`;
  }
}

function formatTopPitcherValue(row: PitcherRanking, sort: PitcherRankingSort): string {
  switch (sort) {
    case 'whip':
      return `WHIP ${row.whip.toFixed(2)}`;
    case 'strikeouts':
      return `K ${row.strikeouts}`;
    case 'wins':
      return `W ${row.wins}`;
    case 'saves':
      return `SV ${row.saves}`;
    case 'era':
    default:
      return `ERA ${row.era.toFixed(2)}`;
  }
}

export default function RecordPage() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const jerseyCacheRef = useRef<Map<number, Map<number, string>>>(new Map());
  const [searchParams, setSearchParams] = useSearchParams();

  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [overview, setOverview] = useState<RecordsOverview | null>(null);
  const [teamStandings, setTeamStandings] = useState<TeamRecordStanding[]>([]);
  const [batters, setBatters] = useState<BatterRanking[]>([]);
  const [pitchers, setPitchers] = useState<PitcherRanking[]>([]);
  const [topInBatters, setTopInBatters] = useState<BatterRanking[]>([]);
  const [topInPitchers, setTopInPitchers] = useState<PitcherRanking[]>([]);
  const [playoffRows, setPlayoffRows] = useState<PlayoffSummaryRow[]>([]);
  const [powerRows, setPowerRows] = useState<PowerRankingApiRow[]>([]);

  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [powerLoading, setPowerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [powerError, setPowerError] = useState<string | null>(null);
  const [playoffFilterEnabled, setPlayoffFilterEnabled] = useState(false);
  const [recordFilterOptions, setRecordFilterOptions] = useState<RecordFilterOptions | null>(null);
  const [topBatterSort, setTopBatterSort] = useState<BatterRankingSort>('ops');
  const [topPitcherSort, setTopPitcherSort] = useState<PitcherRankingSort>('era');

  const tab = parseTab(searchParams.get('tab'));
  const scope = parseScope(searchParams.get('scope'));
  const group = parseGroup(searchParams.get('group'));
  const playoffDivision = parsePlayoffDivision(searchParams.get('playoffDivision'));
  const regulation = parseRegulation(searchParams.get('regulation'));
  const seasonIdFromQuery = parsePositiveInt(searchParams.get('seasonId'));
  const searchTerm = searchParams.get('search')?.trim() ?? '';
  const rankingYearFromQuery = parsePositiveInt(searchParams.get('rankingYear'));
  const powerLimit = parsePositiveInt(searchParams.get('powerLimit')) ?? 50;

  const selectedSeason = useMemo(
    () => seasons.find((season) => season.id === seasonIdFromQuery) ?? null,
    [seasons, seasonIdFromQuery],
  );

  const rankingYear = useMemo(() => {
    if (rankingYearFromQuery != null) return rankingYearFromQuery;
    if (!selectedSeason) return null;
    return selectedSeason.year + 1;
  }, [rankingYearFromQuery, selectedSeason]);

  const currentFilters = useMemo<RecordFilterState>(
    () => ({ scope, group, playoffDivision }),
    [scope, group, playoffDivision],
  );

  const batterSortOptions = useMemo(
    () => buildBatterSortOptions(recordFilterOptions),
    [recordFilterOptions],
  );
  const pitcherSortOptions = useMemo(
    () => buildPitcherSortOptions(recordFilterOptions),
    [recordFilterOptions],
  );
  const groupOptions = useMemo(
    () => buildGroupOptions(recordFilterOptions),
    [recordFilterOptions],
  );
  const playoffDivisionOptions = useMemo(
    () => buildPlayoffDivisionOptions(recordFilterOptions),
    [recordFilterOptions],
  );
  const resolvedTopBatterSort = useMemo(
    () =>
      batterSortOptions.some((item) => item.value === topBatterSort)
        ? topBatterSort
        : (batterSortOptions[0]?.value ?? topBatterSort),
    [batterSortOptions, topBatterSort],
  );
  const resolvedTopPitcherSort = useMemo(
    () =>
      pitcherSortOptions.some((item) => item.value === topPitcherSort)
        ? topPitcherSort
        : (pitcherSortOptions[0]?.value ?? topPitcherSort),
    [pitcherSortOptions, topPitcherSort],
  );

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      let changed = false;

      Object.entries(patch).forEach(([key, value]) => {
        const current = next.get(key);
        if (value == null || value === '') {
          if (current != null) {
            next.delete(key);
            changed = true;
          }
          return;
        }
        if (current !== value) {
          next.set(key, value);
          changed = true;
        }
      });

      if (changed) {
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams],
  );

  const setTab = useCallback(
    (nextTab: RecordsTab) => {
      updateParams({ tab: nextTab === 'overview' ? null : nextTab });
    },
    [updateParams],
  );

  const setSeasonId = useCallback(
    (nextSeasonId: number) => {
      updateParams({ seasonId: String(nextSeasonId) });
    },
    [updateParams],
  );

  const setScope = useCallback(
    (nextScope: RecordScope) => {
      const patch: Record<string, string | null> = {
        scope: nextScope === 'ALL' ? null : nextScope,
      };
      if (nextScope !== 'PLAYOFF') {
        patch.playoffDivision = null;
      }
      updateParams(patch);
    },
    [updateParams],
  );

  const setGroup = useCallback(
    (nextGroup: RecordGroup) => {
      updateParams({ group: nextGroup === 'ALL' ? null : nextGroup });
    },
    [updateParams],
  );

  const setPlayoffDivision = useCallback(
    (nextDivision: RecordPlayoffDivision) => {
      if (nextDivision === 'ALL') {
        updateParams({ playoffDivision: null });
        return;
      }
      updateParams({ playoffDivision: nextDivision, scope: 'PLAYOFF' });
    },
    [updateParams],
  );

  const setRegulation = useCallback(
    (nextRegulation: Exclude<RecordRegulation, 'ALL'>) => {
      updateParams({ regulation: nextRegulation });
    },
    [updateParams],
  );

  const toggleTeamSearch = useCallback(
    (teamName: string) => {
      const keyword = teamName.trim();
      if (!keyword) return;
      const current = searchTerm.trim().toLowerCase();
      if (current === keyword.toLowerCase()) {
        updateParams({ search: null });
        return;
      }
      updateParams({ search: keyword });
    },
    [searchTerm, updateParams],
  );

  const toggleRegulationFromCell = useCallback(
    (nextRegulation: Exclude<RecordRegulation, 'ALL'>) => {
      if (regulation === nextRegulation) return;
      setRegulation(nextRegulation);
    },
    [regulation, setRegulation],
  );

  const toggleGroupFromCell = useCallback(
    (nextGroup: Exclude<RecordGroup, 'ALL'> | null) => {
      if (!nextGroup) return;
      setGroup(group === nextGroup ? 'ALL' : nextGroup);
    },
    [group, setGroup],
  );

  const toggleScopeFromCell = useCallback(
    (nextScope: Exclude<RecordScope, 'ALL'> | null) => {
      if (!nextScope) return;
      setScope(scope === nextScope ? 'ALL' : nextScope);
    },
    [scope, setScope],
  );

  const toggleDivisionFromCell = useCallback(
    (nextDivision: RecordPlayoffDivision | null) => {
      if (!nextDivision || nextDivision === 'ALL') return;
      if (scope === 'PLAYOFF' && playoffDivision === nextDivision) {
        updateParams({ scope: null, playoffDivision: null });
        return;
      }
      setPlayoffDivision(nextDivision);
    },
    [playoffDivision, scope, setPlayoffDivision, updateParams],
  );

  useEffect(() => {
    let isMounted = true;

    getSeasons()
      .then((items) => {
        if (!isMounted) return;
        setSeasons(items);
        if (items.length === 0) {
          setError('등록된 시즌이 없습니다. 관리자에서 시즌을 먼저 생성해 주세요.');
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : '시즌 목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!isMounted) return;
        setInitializing(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (seasons.length === 0) return;
    if (selectedSeason) return;
    setSeasonId(seasons[0].id);
  }, [seasons, selectedSeason, setSeasonId]);

  useEffect(() => {
    if (!selectedSeason) return;
    let isMounted = true;
    getRecordFilterOptions(selectedSeason.id)
      .then((options) => {
        if (!isMounted) return;
        setRecordFilterOptions(options);
      })
      .catch(() => {
        if (!isMounted) return;
        setRecordFilterOptions(null);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSeason]);

  useEffect(() => {
    if (group === 'ALL') return;
    if (groupOptions.some((item) => item.value === group)) return;
    updateParams({ group: null });
  }, [group, groupOptions, updateParams]);

  useEffect(() => {
    if (playoffDivision === 'ALL') return;
    if (playoffDivisionOptions.some((item) => item.value === playoffDivision)) return;
    updateParams({ playoffDivision: null });
  }, [playoffDivision, playoffDivisionOptions, updateParams]);

  useEffect(() => {
    if (!selectedSeason) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setWarning(null);

    const filterParams = toRecordFilterParams(currentFilters);
    const battersMainPromise = getBatterRankings({
      seasonId: selectedSeason.id,
      limit: 0,
      sort: 'battingAverage',
      filters: filterParams,
      regulation,
    });
    const pitchersMainPromise = getPitcherRankings({
      seasonId: selectedSeason.id,
      limit: 0,
      sort: 'era',
      filters: filterParams,
      regulation,
    });

    const battersTopPromise = getBatterRankings({
      seasonId: selectedSeason.id,
      limit: 0,
      sort: resolvedTopBatterSort,
      filters: filterParams,
      regulation: 'IN',
    });

    const pitchersTopPromise = getPitcherRankings({
      seasonId: selectedSeason.id,
      limit: 0,
      sort: resolvedTopPitcherSort,
      filters: filterParams,
      regulation: 'IN',
    });

    Promise.allSettled([
      getRecordOverview(selectedSeason.id, filterParams),
      getTeamRecordStandings(selectedSeason.id, filterParams),
      battersMainPromise,
      pitchersMainPromise,
      getPlayoffSummaries(selectedSeason.id, filterParams),
      battersTopPromise,
      pitchersTopPromise,
    ])
      .then(async (results) => {
        if (!isMounted) return;

        const [overviewResult, standingsResult, battersResult, pitchersResult, playoffResult, topBattersResult, topPitchersResult] = results;

        const standingsRows = standingsResult.status === 'fulfilled' ? standingsResult.value : [];
        let batterRows = battersResult.status === 'fulfilled' ? battersResult.value : [];
        let pitcherRows = pitchersResult.status === 'fulfilled' ? pitchersResult.value : [];
        const playoffData = playoffResult.status === 'fulfilled' ? playoffResult.value : [];
        let topBatterSource = topBattersResult.status === 'fulfilled' ? topBattersResult.value : [];
        let topPitcherSource = topPitchersResult.status === 'fulfilled' ? topPitchersResult.value : [];

        const hasMissingJersey = [...batterRows, ...pitcherRows, ...topBatterSource, ...topPitcherSource].some(
          (row) => !hasJerseyValue(row.jerseyNumber),
        );

        if (hasMissingJersey) {
          let jerseyByPlayerId = jerseyCacheRef.current.get(selectedSeason.id) ?? null;
          if (!jerseyByPlayerId) {
            try {
              const players = await getPlayerSearchIndex(selectedSeason.id);
              jerseyByPlayerId = new Map(
                players
                  .map((item) => [item.playerId, (item.jerseyNumber || '').trim()] as const)
                  .filter(([, jersey]) => jersey.length > 0),
              );
              jerseyCacheRef.current.set(selectedSeason.id, jerseyByPlayerId);
            } catch {
              jerseyByPlayerId = null;
            }
          }

          if (!isMounted) return;
          batterRows = applyJerseyFallback(batterRows, jerseyByPlayerId);
          pitcherRows = applyJerseyFallback(pitcherRows, jerseyByPlayerId);
          topBatterSource = applyJerseyFallback(topBatterSource, jerseyByPlayerId);
          topPitcherSource = applyJerseyFallback(topPitcherSource, jerseyByPlayerId);
        }

        const playoffSupported = supportsPlayoffFiltering([
          ...standingsRows.map((row) => ({ seasonType: row.seasonType, scope: row.scope })),
          ...batterRows.map((row) => ({ seasonType: row.seasonType, scope: row.scope })),
          ...pitcherRows.map((row) => ({ seasonType: row.seasonType, scope: row.scope })),
          ...playoffData.map((row) => ({ seasonType: row.seasonType, scope: row.scope })),
          ...topBatterSource.map((row) => ({ seasonType: row.seasonType, scope: row.scope })),
          ...topPitcherSource.map((row) => ({ seasonType: row.seasonType, scope: row.scope })),
        ]);

        setPlayoffFilterEnabled(playoffSupported);

        const effectiveFilters: RecordFilterState = playoffSupported
          ? currentFilters
          : {
              ...currentFilters,
              scope: currentFilters.scope === 'PLAYOFF' ? 'ALL' : currentFilters.scope,
              playoffDivision: 'ALL',
            };

        const filteredStandingsRows = standingsRows.filter((row) =>
          matchesRecordFilters(
            {
              teamName: row.teamName,
              partCode: row.partCode,
              seasonType: row.seasonType,
              scope: row.scope,
            },
            effectiveFilters,
          ),
        );

        const filteredBatterRows = batterRows.filter((row) =>
          matchesRecordFilters(
            {
              teamName: row.teamName,
              partCode: row.partCode,
              seasonType: row.seasonType,
              scope: row.scope,
            },
            effectiveFilters,
          ),
        );

        const filteredPitcherRows = pitcherRows.filter((row) =>
          matchesRecordFilters(
            {
              teamName: row.teamName,
              partCode: row.partCode,
              seasonType: row.seasonType,
              scope: row.scope,
            },
            effectiveFilters,
          ),
        );

        const filteredTopBatterRows = topBatterSource.filter((row) =>
          matchesRecordFilters(
            {
              teamName: row.teamName,
              partCode: row.partCode,
              seasonType: row.seasonType,
              scope: row.scope,
            },
            effectiveFilters,
          ),
        );

        const filteredTopPitcherRows = topPitcherSource.filter((row) =>
          matchesRecordFilters(
            {
              teamName: row.teamName,
              partCode: row.partCode,
              seasonType: row.seasonType,
              scope: row.scope,
            },
            effectiveFilters,
          ),
        );

        const filteredPlayoffRows = playoffData.filter((row) =>
          matchesRecordFilters(
            {
              teamName: row.teamName,
              partCode: row.partCode,
              seasonType: row.seasonType,
              scope: row.scope,
            },
            effectiveFilters,
          ),
        );

        const fallbackOverview: RecordsOverview = {
          seasonId: selectedSeason.id,
          totalGames: estimateGamesFromStandings(filteredStandingsRows),
          totalTeams: filteredStandingsRows.length,
          topBatter: filteredTopBatterRows[0] ?? filteredBatterRows[0] ?? null,
          topPitcher: filteredTopPitcherRows[0] ?? filteredPitcherRows[0] ?? null,
        };

        const mergedOverview =
          overviewResult.status === 'fulfilled'
            ? {
                ...overviewResult.value,
                totalGames:
                  effectiveFilters.scope === 'ALL' &&
                  effectiveFilters.group === 'ALL' &&
                  effectiveFilters.playoffDivision === 'ALL'
                    ? overviewResult.value.totalGames
                    : estimateGamesFromStandings(filteredStandingsRows),
                totalTeams: filteredStandingsRows.length,
                topBatter: filteredTopBatterRows[0] ?? filteredBatterRows[0] ?? null,
                topPitcher: filteredTopPitcherRows[0] ?? filteredPitcherRows[0] ?? null,
              }
            : fallbackOverview;

        setOverview(mergedOverview);
        setTeamStandings(filteredStandingsRows);
        setBatters(filteredBatterRows);
        setPitchers(filteredPitcherRows);
        setTopInBatters(filteredTopBatterRows);
        setTopInPitchers(filteredTopPitcherRows);
        setPlayoffRows(filteredPlayoffRows);

        const primaryFailures = [overviewResult, standingsResult, battersResult, pitchersResult, playoffResult].filter(
          (result) => result.status === 'rejected',
        ).length;
        const allFailures = results.filter((result) => result.status === 'rejected').length;

        if (primaryFailures === 5) {
          setError('기록 데이터를 불러오지 못했습니다.');
          return;
        }
        if (allFailures > 0) {
          setWarning('일부 데이터 소스를 불러오지 못해 일부 항목이 제한될 수 있습니다.');
        }
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSeason, currentFilters, regulation, resolvedTopBatterSort, resolvedTopPitcherSort]);

  useEffect(() => {
    if (playoffFilterEnabled) return;
    if (scope !== 'PLAYOFF' && playoffDivision === 'ALL') return;
    updateParams({ scope: scope === 'PLAYOFF' ? null : scope, playoffDivision: null });
  }, [playoffFilterEnabled, scope, playoffDivision, updateParams]);

  useEffect(() => {
    if (tab !== 'power') return;
    if (rankingYear == null) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPowerLoading(true);
    setPowerError(null);

    getPowerRankings({ rankingYear, limit: powerLimit })
      .then((rows) => {
        if (!isMounted) return;
        setPowerRows(rows);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setPowerRows([]);
        setPowerError(err instanceof Error ? err.message : '파워랭킹 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!isMounted) return;
        setPowerLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tab, rankingYear, powerLimit]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const nodes = sectionRef.current?.querySelectorAll('.record-hub-section');
      if (!nodes) return;
      gsap.fromTo(
        nodes,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.62, stagger: 0.05, ease: 'power2.out' },
      );
    });

    return () => ctx.revert();
  }, [tab, selectedSeason?.id, loading]);

  const filteredStandingsBySearch = useMemo(() => {
    if (!searchTerm) return teamStandings;
    const keyword = searchTerm.toLowerCase();
    return teamStandings.filter((row) => row.teamName.toLowerCase().includes(keyword));
  }, [teamStandings, searchTerm]);

  const filteredBattersBySearch = useMemo(() => {
    if (!searchTerm) return batters;
    const keyword = searchTerm.toLowerCase();
    return batters.filter((row) => `${row.playerName} ${row.teamName}`.toLowerCase().includes(keyword));
  }, [batters, searchTerm]);

  const filteredPitchersBySearch = useMemo(() => {
    if (!searchTerm) return pitchers;
    const keyword = searchTerm.toLowerCase();
    return pitchers.filter((row) => `${row.playerName} ${row.teamName}`.toLowerCase().includes(keyword));
  }, [pitchers, searchTerm]);

  const topBatterRows = useMemo<TopFiveRow[]>(
    () =>
      topInBatters.slice(0, 5).map((row) => ({
        id: `b-${row.playerId}-${row.seasonId}`,
        rank: row.rank,
        name: row.playerName,
        team: `${row.teamName}${row.jerseyNumber ? ` · #${row.jerseyNumber}` : ''}`,
        value: formatTopBatterValue(row, resolvedTopBatterSort),
        link: `/records/player/${row.playerId}`,
      })),
    [resolvedTopBatterSort, topInBatters],
  );

  const topPitcherRows = useMemo<TopFiveRow[]>(
    () =>
      topInPitchers.slice(0, 5).map((row) => ({
        id: `p-${row.playerId}-${row.seasonId}`,
        rank: row.rank,
        name: row.playerName,
        team: `${row.teamName}${row.jerseyNumber ? ` · #${row.jerseyNumber}` : ''}`,
        value: formatTopPitcherValue(row, resolvedTopPitcherSort),
        link: `/records/player/${row.playerId}`,
      })),
    [resolvedTopPitcherSort, topInPitchers],
  );

  const playoffStageSummary = useMemo<PlayoffStageSummaryRow[]>(() => {
    const map = new Map<string, PlayoffStageSummaryRow>();

    playoffRows.forEach((row) => {
      const tier = normalizeTier(row.playoffTier || row.seasonType);
      const round = normalizeRound(row.playoffRound);
      const key = `${tier}::${round}`;
      if (!map.has(key)) {
        map.set(key, {
          tier,
          round,
          count: 0,
          teams: [],
          points: row.finalsPoints,
        });
      }
      const entry = map.get(key)!;
      entry.count += 1;
      entry.teams.push(row.teamName);
      if (row.finalsPoints > entry.points) entry.points = row.finalsPoints;
    });

    return [...map.values()].sort((a, b) => {
      if (a.tier !== b.tier) return a.tier.localeCompare(b.tier, 'ko');
      if (b.points !== a.points) return b.points - a.points;
      return a.round.localeCompare(b.round, 'ko');
    });
  }, [playoffRows]);

  const averageWinPct = useMemo(() => {
    if (filteredStandingsBySearch.length === 0) return 0;
    const total = filteredStandingsBySearch.reduce((sum, row) => sum + toWinPct(row.winPct), 0);
    return total / filteredStandingsBySearch.length;
  }, [filteredStandingsBySearch]);

  const scopeOptions = useMemo(
    () => buildScopeOptions(recordFilterOptions, playoffFilterEnabled),
    [recordFilterOptions, playoffFilterEnabled],
  );

  return (
    <div style={{ display: 'grid', gap: '22px' }} ref={sectionRef}>
      <RecordsHubShell
        yearLabel={selectedSeason ? `${selectedSeason.year} 시즌 기록 허브` : '기록 허브'}
        tab={tab}
        tabs={TAB_OPTIONS}
        onTabChange={setTab}
        playoffFilterEnabled={playoffFilterEnabled}
        tabExtraBeforePower={
          <Link
            to="/records/player"
            style={{
              borderRadius: '999px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(15,23,42,0.6)',
              color: '#cbd5e1',
              padding: '8px 14px',
              fontWeight: 800,
              fontSize: '13px',
              textDecoration: 'none',
            }}
          >
            선수 상세
          </Link>
        }
        filterBar={
          <RecordsFilterBar
            seasons={seasons}
            selectedSeasonId={selectedSeason?.id ?? null}
            onSeasonChange={setSeasonId}
            scope={scope}
            scopeOptions={scopeOptions}
            onScopeChange={setScope}
            group={group}
            groupOptions={groupOptions}
            onGroupChange={setGroup}
            playoffDivision={playoffDivision}
            playoffDivisionOptions={playoffDivisionOptions}
            playoffFilterEnabled={playoffFilterEnabled}
            onPlayoffDivisionChange={setPlayoffDivision}
            searchTerm={searchTerm}
            onSearchChange={(value) => updateParams({ search: value || null })}
            tab={tab}
            rankingYear={rankingYear}
            onRankingYearChange={(value) => {
              const parsed = parsePositiveInt(value);
              updateParams({ rankingYear: parsed ? String(parsed) : null });
            }}
            powerLimit={powerLimit}
            onPowerLimitChange={(value) => {
              const parsed = parsePositiveInt(value);
              updateParams({ powerLimit: parsed ? String(parsed) : null });
            }}
            actions={
              <>
                <Link
                  to="/records/player"
                  style={quickLinkStyle('#e2e8f0', 'rgba(148,163,184,0.2)', 'rgba(148,163,184,0.36)')}
                >
                  선수 상세
                </Link>
                <Link
                  to="/prediction"
                  style={quickLinkStyle('#a7f3d0', 'rgba(16,185,129,0.14)', 'rgba(16,185,129,0.35)')}
                >
                  승부예측
                </Link>
              </>
            }
          />
        }
      />

      {(initializing || loading) && (
        <section className="record-hub-section" style={noticeCardStyle('#94a3b8')}>
          데이터를 불러오는 중입니다...
        </section>
      )}

      {error && (
        <section className="record-hub-section" style={noticeCardStyle('#f87171')}>
          오류: {error}
        </section>
      )}

      {!error && warning && (
        <section className="record-hub-section" style={noticeCardStyle('#facc15')}>
          {warning}
        </section>
      )}

      {!initializing && !loading && !error && tab === 'overview' && (
        <OverviewTab
          totalGames={overview?.totalGames ?? 0}
          totalTeams={overview?.totalTeams ?? teamStandings.length}
          averageWinPct={averageWinPct}
          batterCount={batters.length}
          pitcherCount={pitchers.length}
          topBatters={topBatterRows}
          topPitchers={topPitcherRows}
          topBatterSort={resolvedTopBatterSort}
          topPitcherSort={resolvedTopPitcherSort}
          batterSortOptions={batterSortOptions}
          pitcherSortOptions={pitcherSortOptions}
          onTopBatterSortChange={setTopBatterSort}
          onTopPitcherSortChange={setTopPitcherSort}
        />
      )}

      {!initializing && !loading && !error && tab === 'standings' && (
        <StandingsTab
          rows={filteredStandingsBySearch}
          playoffStageSummary={playoffStageSummary}
          scope={scope}
          group={group}
          playoffDivision={playoffDivision}
          searchTerm={searchTerm}
          onToggleScope={toggleScopeFromCell}
          onToggleGroup={toggleGroupFromCell}
          onToggleDivision={toggleDivisionFromCell}
          onToggleTeamSearch={toggleTeamSearch}
        />
      )}

      {!initializing && !loading && !error && tab === 'batters' && (
        <BattersTab
          rows={filteredBattersBySearch}
          topRows={topBatterRows}
          seasonYear={selectedSeason?.year ?? null}
          scope={scope}
          group={group}
          playoffDivision={playoffDivision}
          regulation={regulation}
          onRegulationChange={setRegulation}
          onToggleScope={toggleScopeFromCell}
          onToggleGroup={toggleGroupFromCell}
          onToggleDivision={toggleDivisionFromCell}
          searchTerm={searchTerm}
          onToggleTeamSearch={toggleTeamSearch}
          onToggleRegulationFromCell={toggleRegulationFromCell}
          topSort={resolvedTopBatterSort}
          topSortOptions={batterSortOptions}
          onTopSortChange={setTopBatterSort}
        />
      )}

      {!initializing && !loading && !error && tab === 'pitchers' && (
        <PitchersTab
          rows={filteredPitchersBySearch}
          topRows={topPitcherRows}
          seasonYear={selectedSeason?.year ?? null}
          scope={scope}
          group={group}
          playoffDivision={playoffDivision}
          regulation={regulation}
          onRegulationChange={setRegulation}
          onToggleScope={toggleScopeFromCell}
          onToggleGroup={toggleGroupFromCell}
          onToggleDivision={toggleDivisionFromCell}
          searchTerm={searchTerm}
          onToggleTeamSearch={toggleTeamSearch}
          onToggleRegulationFromCell={toggleRegulationFromCell}
          topSort={resolvedTopPitcherSort}
          topSortOptions={pitcherSortOptions}
          onTopSortChange={setTopPitcherSort}
        />
      )}

      {!initializing && !loading && !error && tab === 'power' && (
        <PowerTab rows={powerRows} loading={powerLoading} error={powerError} rankingYear={rankingYear} />
      )}
    </div>
  );
}
