import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ScoreboardFrame from '../components/ScoreboardFrame';
import MatchSelectorBar from '../components/MatchSelectorBar';
import { CsvRecordPreview, NowPlayingCard, LiveFeed, PostGameSummary, type BatterLine, type PitcherLine, type EventDetail, type DisplayItem } from '../components/LegacyTextComponents';
import { useDemoStore, buildGameRecord } from '@shared/state/demoStore';
import type { PlayEvent, ErrorDetails, RunnerAdvanceOutcome, BattedBallDetails, PlayerSlot, PostGamePitcherLine, PostGameRecord } from '@shared/state/demoStore';
import StatsTable from '@shared/components/StatsTable';
import ScoringIntegrityNotice from '@shared/components/ScoringIntegrityNotice';
import { classifyRecordedPlateAppearance, createScoringEventLookup, recordedMiscPitch } from '@shared/lib/scoringEventFacts';
import { earnedRunsView, normalizeEarnedRunsStatus, serializeEarnedRuns } from '@shared/lib/earnedRuns';
import { batterRateView } from '@shared/lib/batterRates';
import RemovedPlayersPanel from '@shared/components/RemovedPlayersPanel';
import { GameTimerDisplay } from '@shared/components/GameTimerDisplay';
import type { BatterStatLine, PitcherStatLine } from '@shared/types/scoreStats';
import type { MatchSchedule } from '@shared/state/demoStore';
import {
  mergeRebuiltEventsForReplay,
  classifyKboResultCode,
  rebuildEventsFromFeedWithAlternatives,
  selectRebuildEvents,
  rebuildReviewRows,
  scoringReplayAuditRows,
  REJECT_REBUILD_SELECTION,
} from '@shared/lib/playFeedParser';
import { replayScoringEvents } from '@shared/lib/scoringReplay';
import { runnerPlayAuditRows } from '@shared/lib/runnerPlayEngine';
import { createStructuredRunnerIndex } from '@shared/lib/structuredRunnerStats';
import { applyCompositeProjection, normalizeCompositePlay, compositePlayAuditRows } from '@shared/lib/compositePlayEngine';
import { useAdmin } from '@shared/auth/useAdmin';
import { getOfficialGameDetails, type OfficialGameDetailsResponse } from '@core/api/backendClient';
import { OfficialGameDetailView, OfficialGameDetailLoading, OfficialGameDetailMessage } from '../components/OfficialGameDetailView';
import {
  currentResourceForKey,
  findDetailRouteMatch,
  hasMatchingAublLiveRecord,
  isUniquePlayProvider,
  resolveOfficialRequestSource,
} from '../model/officialDetailRoute';
import './ScoreboardTextPage.css';
import { useRecordSource } from '@shared/state/useRecordSource';

type Half = 'top' | 'bottom';



function emptyBatterLine(): BatterLine {
  return { pa: 0, ab: 0, hits: 0, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 0, sac: 0 };
}

function emptyPitcherLine(): PitcherLine {
  return { bf: 0, outs: 0, hits: 0, hr: 0, bb: 0, hbp: 0, so: 0, pitches: 0, strikes: 0, balls: 0 };
}

function toFinite(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIpToOuts(ip: unknown): number {
  const value = Math.max(0, toFinite(ip, 0));
  const whole = Math.trunc(value);
  const decimal = Math.round((value - whole) * 10);
  if (decimal >= 0 && decimal <= 2) {
    return whole * 3 + decimal;
  }
  return Math.round(value * 3);
}

function toManualStatus(slot: string | undefined): BatterStatLine['status'] {
  if (slot === '대수비' || slot === '대타' || slot === '대주자') return slot;
  return undefined;
}

function buildManualPlayerStats(record: PostGameRecord | null | undefined): {
  hitters: { home: BatterStatLine[]; away: BatterStatLine[] };
  pitchers: { home: PitcherStatLine[]; away: PitcherStatLine[] };
} | null {
  if (!record) return null;

  const toBatterArray = (side: 'home' | 'away'): BatterStatLine[] =>
    (record.batters?.[side] ?? [])
      .filter((row) => (row.name ?? '').trim())
      .map((row) => ({
        name: row.name ?? '',
        pos: row.pos ?? '',
        order: row.order ?? null,
        status: toManualStatus(row.slot),
        pa: toFinite(row.pa, 0),
        ab: toFinite(row.ab, 0),
        h: toFinite(row.h, 0),
        singles: toFinite(row.singles, 0),
        doubles: toFinite(row.doubles, 0),
        triples: toFinite(row.triples, 0),
        hr: toFinite(row.hr, 0),
        bb: toFinite(row.bb, 0),
        ci: toFinite(row.ci, 0),
        fc: toFinite(row.fc, 0),
        hbp: toFinite(row.hbp, 0),
        so: toFinite(row.so, 0),
        sac: toFinite(row.sac, 0),
        sh: row.sh,
        sf: row.sf,
        sb: row.sb,
        cs: row.cs,
        gdp: row.gdp,
        r: toFinite(row.r, 0),
        rbi: toFinite(row.rbi, 0),
      }));

  const toPitcherArray = (side: 'home' | 'away'): PitcherStatLine[] =>
    (record.pitchers?.[side] ?? [])
      .filter((row) => (row.name ?? '').trim())
      .map((row, idx) => {
        const slot = (row.slot ?? '').trim();
        const appearanceOrder = slot === '선발' ? 0 : idx + 1;
        return {
          name: row.name ?? '',
          pos: 'P',
          status: slot === '대수비' ? '대수비' : undefined,
          bf: toFinite(row.bf, 0),
          pitches: toFinite(row.pitches, 0),
          strikes: 0,
          balls: 0,
          outs: parseIpToOuts(row.ip),
          h: toFinite(row.h, 0),
          hr: toFinite(row.hr, 0),
          bb: toFinite(row.bb, 0),
          hbp: toFinite(row.hbp, 0),
          so: toFinite(row.so, 0),
          r: toFinite(row.r, 0),
          er: toFinite(row.er, 0),
          earnedRunsStatus: normalizeEarnedRunsStatus(row.earnedRunsStatus, row.er),
          wp: row.wp,
          bk: row.bk,
          sh: row.sh,
          sf: row.sf,
          appearanceOrder,
          appearanceLabel: slot || (idx === 0 ? '선발' : `계투(${idx})`),
        };
      });

  return {
    hitters: {
      home: toBatterArray('home'),
      away: toBatterArray('away'),
    },
    pitchers: {
      home: toPitcherArray('home'),
      away: toPitcherArray('away'),
    },
  };
}

function toIpDecimalFromOuts(outs: number): number {
  const safeOuts = Math.max(0, Math.trunc(toFinite(outs, 0)));
  return Number(`${Math.floor(safeOuts / 3)}.${safeOuts % 3}`);
}

function toPostGamePitcherLineFromLive(row: PitcherStatLine): PostGamePitcherLine {
  const outs = toFinite(row.outs, 0);
  const bb = toFinite(row.bb, 0);
  const hbp = toFinite(row.hbp, 0);
  const bf = toFinite(row.bf, 0);
  const ab = Math.max(0, bf - bb - hbp);
  const earned = serializeEarnedRuns(row.er, outs, row.earnedRunsStatus);
  return {
    name: row.name,
    slot: row.appearanceLabel ?? row.status ?? '',
    ip: toIpDecimalFromOuts(outs),
    bf,
    ab,
    h: toFinite(row.h, 0),
    hr: toFinite(row.hr, 0),
    bb,
    hbp,
    so: toFinite(row.so, 0),
    r: toFinite(row.r, 0),
    ...earned,
    pitches: toFinite(row.pitches, 0),
    wp: row.wp,
    bk: row.bk,
    sh: row.sh,
    sf: row.sf,
  };
}




type JerseyMap = { home: Map<string, { number: string; pos: string }>; away: Map<string, { number: string; pos: string }> };

// [추가] ScorekeeperPage와 동일한 고유 이름 생성 함수
const getUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  if (!number) return name;
  const suffix = `(${number})`;
  if (name.endsWith(suffix)) return name;
  return `${name}${suffix}`;
};

type PlayerNameParts = { raw: string; base: string; number?: string };

function parsePlayerName(raw: string | null | undefined): PlayerNameParts {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/^(.*?)(?:\(([^)]*)\))?\s*$/);
  const base = (match?.[1] ?? '').trim();
  const number = (match?.[2] ?? '').trim();
  return { raw: trimmed, base, number: number || undefined };
}

function formatWithJersey(name: string, jersey?: string): string {
  const parts = parsePlayerName(name);
  const targetNumber = jersey ?? parts.number;
  if (!targetNumber) return parts.raw;
  const suffix = `(${targetNumber})`;
  if (parts.raw.endsWith(suffix)) return parts.raw;
  return `${parts.base}${suffix}`;
}

function isSamePlayerName(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parsePlayerName(a);
  const pb = parsePlayerName(b);
  if (!pa.base || !pb.base) return (pa.raw || '') === (pb.raw || '');
  if (pa.base !== pb.base) return false;
  if (pa.number && pb.number) return pa.number === pb.number;
  return true; 
}

function resolveJersey(jerseyMap: JerseyMap, side: 'home' | 'away', name: string): string | undefined {
  const { base, number } = parsePlayerName(name);
  return (
    jerseyMap[side].get(name)?.number ??
    jerseyMap[side].get(base)?.number ??
    jerseyMap[side].get(formatWithJersey(base, number))?.number ??
    number
  );
}

export default function ScoreboardTextPage() {
  const { state, actions } = useDemoStore();
  const { selectMatch, loadMoreFeed } = actions;
  const { isAdmin } = useAdmin();
  const { matchId } = useParams<{ matchId?: string }>();
  const [showReplay, setShowReplay] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [rebuildReview, setRebuildReview] = useState<{
    scope: string; selections: Record<string, string>; drafts: Record<string, string>;
  }>({ scope: '', selections: {}, drafts: {} });
  const rebuildScope = useMemo(() => JSON.stringify([state.activeMatchId, state.feed]), [state.activeMatchId, state.feed]);
  const rebuildSelections = useMemo(() => rebuildReview.scope === rebuildScope ? rebuildReview.selections : {}, [rebuildReview, rebuildScope]);
  const rebuildDrafts = rebuildReview.scope === rebuildScope ? rebuildReview.drafts : {};
  const changeRebuildReview = (groupId: string, selection: string | null, draft = false) => {
    setRebuildReview((previous) => {
      const current = previous.scope === rebuildScope ? previous : { scope: rebuildScope, selections: {}, drafts: {} };
      const key = draft ? 'drafts' : 'selections';
      const values: Record<string, string> = { ...current[key] };
      if (selection === null) delete values[groupId];
      else values[groupId] = selection;
      return { ...current, [key]: values };
    });
  };
  const [officialDetailResource, setOfficialDetailResource] = useState<{
    requestKey: string;
    state: 'ready' | 'not-found' | 'error';
    payload: OfficialGameDetailsResponse | null;
    error: string | null;
  } | null>(null);
  const [officialDetailAttempt, setOfficialDetailAttempt] = useState(0);
  const replayLoadRef = useRef(false);
  const navigate = useNavigate(); // [수정] 훅 초기화

  const routeMatch = useMemo(
    () => findDetailRouteMatch(state.matches, matchId),
    [matchId, state.matches],
  );
  const routeProviderIsUniquePlay = isUniquePlayProvider(routeMatch?.sourceProvider);
  const recordSource = useRecordSource(routeMatch?.id);
  const officialSourceGameId = resolveOfficialRequestSource(matchId, routeMatch);
  const officialRequestKey = officialSourceGameId
    ? `${officialSourceGameId}\u0000${routeMatch?.seasonId ?? ''}\u0000${officialDetailAttempt}`
    : '';
  const currentOfficialResource = currentResourceForKey(officialDetailResource, officialRequestKey);
  const officialDetailState = !matchId
    ? 'idle'
    : currentOfficialResource?.state ?? 'loading';
  const officialDetail = recordSource.status === 'official'
    ? recordSource.source.official : currentOfficialResource?.payload ?? null;
  const officialDetailError = currentOfficialResource?.error ?? null;

  // URL에서 matchId가 있으면 해당 경기 자동 선택
  useEffect(() => {
    if (routeMatch && routeMatch.id !== state.activeMatchId) {
      selectMatch(routeMatch.id);
    }
  }, [routeMatch, state.activeMatchId, selectMatch]);

  useEffect(() => {
    if (!matchId && state.activeMatchId) {
      const selected = state.matches.find((item) => item.id === state.activeMatchId);
      navigate(`/scoreboard-text/${selected?.sourceGameId ?? state.activeMatchId}`, { replace: true });
    }
  }, [matchId, state.activeMatchId, state.matches, navigate]);

  useEffect(() => {
    if (!officialSourceGameId || !officialRequestKey) return;

    let canceled = false;
    getOfficialGameDetails(officialSourceGameId, routeMatch?.seasonId)
      .then((payload) => {
        if (canceled) return;
        setOfficialDetailResource({
          requestKey: officialRequestKey,
          state: payload ? 'ready' : 'not-found',
          payload,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (canceled) return;
        setOfficialDetailResource({
          requestKey: officialRequestKey,
          state: 'error',
          payload: null,
          error: error instanceof Error ? error.message : '공식 경기 기록을 불러오지 못했습니다.',
        });
      });

    return () => {
      canceled = true;
    };
  }, [officialRequestKey, officialSourceGameId, routeMatch?.seasonId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFeedExpanded(false);
      setShowReplay(false);
    }, 0);
    replayLoadRef.current = false;
    return () => clearTimeout(timer);
  }, [state.activeMatchId]);

  useEffect(() => {
    if (!state.gameOver) {
      replayLoadRef.current = false;
      return;
    }
    if (replayLoadRef.current) return;
    replayLoadRef.current = true;
    const timer = setTimeout(() => setShowReplay(true), 0);
    loadMoreFeed();
    return () => clearTimeout(timer);
  }, [loadMoreFeed, state.gameOver]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const activeMatch = useMemo(
    () => state.matches.find((m) => m.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const isPracticeMode = (activeMatch?.recordMode ?? 'official') === 'practice';
  const isManualInputMode = (activeMatch?.scoreInputMode ?? 'live') === 'manual';
  const lineupVisible = isAdmin || state.gameStarted || Boolean(activeMatch?.lineupPublic);
  const hasLiveOverlay = useMemo(() => Boolean((activeMatch?.liveVideoUrl || '').trim()), [activeMatch?.liveVideoUrl]);
  const noActiveMatch = !activeMatch;
  const routeIsOfficial = Boolean(
    officialDetail
    || routeProviderIsUniquePlay,
  );
  const routeMatchMissing = Boolean(matchId && !routeMatch);
  const routeSelectionPending = Boolean(matchId && routeMatch && routeMatch.id !== state.activeMatchId);
  const hasAublLiveRecord = hasMatchingAublLiveRecord(routeMatch, {
    activeMatchId: state.activeMatchId,
    gameStarted: state.gameStarted,
    eventCount: state.events.length,
  });
  const useFirestoreLiveForOfficial = Boolean(routeMatch && recordSource.status === 'live' && hasAublLiveRecord);
  const feed = useMemo(() => state.feed, [state.feed]);
  const textReplayBuildResult = useMemo(
    () =>
      state.gameOver
        ? rebuildEventsFromFeedWithAlternatives(state.feed, {
            source: { kind: 'text_feed_rebuild', provider: 'shared-text-feed-parser' },
            fallback: { inning: 1, half: 'top' },
          })
        : null,
    [state.feed, state.gameOver],
  );
  const replayResolvedEvents = useMemo(() => {
    if (!textReplayBuildResult) {
      return state.events;
    }
    const selected = selectRebuildEvents(textReplayBuildResult.groups, rebuildSelections);
    return mergeRebuiltEventsForReplay({
      existingEvents: state.events,
      rebuiltEvents: selected,
    });
  }, [textReplayBuildResult, rebuildSelections, state.events]);
  const events = useMemo(() => (state.gameOver ? replayResolvedEvents : state.events), [replayResolvedEvents, state.events, state.gameOver]);
  const hasReplayPendingReview = Boolean(textReplayBuildResult?.groups.some((group) =>
    group.requiresManualResolve && !rebuildSelections[group.groupId]));
  const replayStateAudit = useMemo(() => replayScoringEvents(replayResolvedEvents), [replayResolvedEvents]);
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  
  const defenseAssignments = useMemo(
    () =>
      lineupVisible
        ? getDefenseAssignments(state.lineups[defenseSide] ?? [])
        : [{ name: '라인업 공개 전', pos: 'P', x: 50, y: 50 }],
    [defenseSide, state.lineups, lineupVisible],
  );

  // [수정] 타자 라인업 계산 시 오타니 룰 등을 고려하여 ScorekeeperPage와 유사하게 처리
  // 다만 텍스트 페이지에서는 단순 표시용이므로 기본 로직 유지하되 이름은 고유하게 처리
  const offenseLineup = lineupVisible ? state.lineups[hittingSide] : [];
  // 1~9번 타순은 무조건 포함, 그 외는 투수가 아니거나 타격 가능할 때 (여기선 단순화하여 전체 표시)
  const activeOffense = offenseLineup; 
  
  const currentBatterEntry = activeOffense[state.batterIndex[hittingSide] % (activeOffense.length || 1)];
  // [수정] currentBatter를 고유 이름으로 생성
  const currentBatter = lineupVisible
    ? currentBatterEntry
      ? getUniqueName(currentBatterEntry.name, currentBatterEntry.number)
      : '타자'
    : '라인업 공개 전';

  const currentPitcherEntry = lineupVisible
    ? state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P')
    : null;
  // [수정] currentPitcher를 고유 이름으로 생성
  const currentPitcher = lineupVisible
    ? currentPitcherEntry
      ? getUniqueName(currentPitcherEntry.name, currentPitcherEntry.number)
      : '투수'
    : '라인업 공개 전';

  const currentInning = state.inning;
  
  const jerseyMap = useMemo(() => buildJerseyMap(state.lineups, state.benches, state.removed), [state.lineups, state.benches, state.removed]);

  const recordPayload = useMemo(() => buildGameRecord(state), [state]);

  // [중요] buildPlayerStats가 이제 고유 키 로직을 따름
  const playerStats = useMemo(() => buildPlayerStats(recordPayload, { practiceMode: isPracticeMode }), [recordPayload, isPracticeMode]);
  const postGameDetail = activeMatch?.postGame ?? (isManualInputMode ? activeMatch?.manualEntryDraft ?? null : null);
  const postGamePlayerStats = useMemo(() => buildManualPlayerStats(postGameDetail), [postGameDetail]);
  const displayPlayerStats = postGamePlayerStats ?? playerStats;
  const postGameDetailWithPitcherFallback = useMemo(() => {
    if (!postGameDetail) return null;
    const source = postGameDetail.pitchers;
    const homeExisting = source?.home ?? [];
    const awayExisting = source?.away ?? [];
    const home = homeExisting.length ? homeExisting : displayPlayerStats.pitchers.home.map(toPostGamePitcherLineFromLive);
    const away = awayExisting.length ? awayExisting : displayPlayerStats.pitchers.away.map(toPostGamePitcherLineFromLive);
    if (home === homeExisting && away === awayExisting) return postGameDetail;
    return {
      ...postGameDetail,
      pitchers: { home, away },
    };
  }, [postGameDetail, displayPlayerStats.pitchers.home, displayPlayerStats.pitchers.away]);

  // 현재 타자/투수 기록은 feed 텍스트 파싱이 아니라, 기록원과 동일한 집계(playerStats)에서 조회한다.
  const batterToday = useMemo(() => {
    const stat = displayPlayerStats.hitters[hittingSide].find((line) => isSamePlayerName(line.name, currentBatter));
    if (!stat) return emptyBatterLine();
    return {
      pa: stat.pa,
      ab: stat.ab,
      hits: stat.h,
      hr: stat.hr,
      doubles: stat.doubles,
      triples: stat.triples,
      bb: stat.bb,
      hbp: stat.hbp,
      so: stat.so,
      sac: stat.sac,
    };
  }, [displayPlayerStats.hitters, hittingSide, currentBatter]);

  const pitcherToday = useMemo(() => {
    const stat = displayPlayerStats.pitchers[defenseSide].find((line) => isSamePlayerName(line.name, currentPitcher));
    if (!stat) return emptyPitcherLine();
    return {
      bf: stat.bf,
      outs: stat.outs,
      hits: stat.h,
      hr: stat.hr,
      bb: stat.bb,
      hbp: stat.hbp,
      so: stat.so,
      pitches: stat.pitches,
      strikes: stat.strikes,
      balls: stat.balls,
    };
  }, [displayPlayerStats.pitchers, defenseSide, currentPitcher]);
  
  const postSummary = useMemo(
    () => buildPostGameSummary(displayPlayerStats.hitters, displayPlayerStats.pitchers, state.score),
    [displayPlayerStats.hitters, displayPlayerStats.pitchers, state.score],
  );
  const displayItems = useMemo(() => buildDisplayItems(feed, events, jerseyMap), [feed, events, jerseyMap]);
  const sections = useMemo(() => groupByInning(displayItems), [displayItems]);
  const collapsedMap = useMemo(() => {
    const map: Record<number, boolean> = {};
    sections.forEach((section) => {
      map[section.inning] = section.inning < currentInning;
    });
    return map;
  }, [sections, currentInning]);
  const gameOverInfo = useMemo(() => {
    if (!state.gameOver) return null;
    const home = state.teamNames.home;
    const away = state.teamNames.away;
    const scoreText = `${away} ${state.score.away} - ${home} ${state.score.home}`;
    let resultText = `무승부 (${scoreText})`;
    if (state.score.home > state.score.away) {
      resultText = `${home} 승리 (${scoreText})`;
    } else if (state.score.away > state.score.home) {
      resultText = `${away} 승리 (${scoreText})`;
    }
    return {
      endText: '경기 종료',
      resultText,
    };
  }, [state.gameOver, state.score.away, state.score.home, state.teamNames.away, state.teamNames.home]);

  const csvPreviewContent = useMemo(
    () => (state.gameOver ? buildCsvRecord(recordPayload, { rebuildSelections }) : null),
    [recordPayload, rebuildSelections, state.gameOver],
  );

  // [추가] CSV 다운로드 핸들러
  const handleDownloadCsv = () => {
    if (!state.gameOver) return;
    const csvContent = buildCsvRecord(recordPayload, { rebuildSelections });
    const filename = buildDownloadName('scorecard', state.endedAt);
    downloadCsv(csvContent, filename);
  };

  if (routeMatch && recordSource.status === 'blocked') {
    return <OfficialGameDetailMessage title="기록 공개 상태 확인 필요" description="공개 상태 확인에 실패하여 자체 기록을 표시하지 않습니다. 다시 접속해 주세요." onRetry={() => window.location.reload()} />;
  }

  if (
    (routeMatch && recordSource.status === 'loading')
    || routeSelectionPending
    || (
      officialDetailState === 'loading'
      && recordSource.status !== 'official'
      && (routeMatchMissing || routeIsOfficial)
      && !useFirestoreLiveForOfficial
    )
  ) {
    return <OfficialGameDetailLoading />;
  }

  if (officialDetail && !useFirestoreLiveForOfficial) {
    return (
      <OfficialGameDetailView
        payload={officialDetail}
        onRetry={() => setOfficialDetailAttempt((value) => value + 1)}
        legacyHeader={<MatchSelectorBar
          summaryTime={officialDetail.game.playedAt ? new Date(officialDetail.game.playedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '일시 미정'}
          summaryVenue={officialDetail.game.venue || '경기장 미정'}
          showViewerBadge viewerCount={state.onlineViewerCount}
        />}
      />
    );
  }

  if (!useFirestoreLiveForOfficial && (routeIsOfficial || routeMatchMissing) && officialDetailState === 'error') {
    return (
      <OfficialGameDetailMessage
        title="공식 상세 기록을 불러오지 못했습니다"
        description={officialDetailError ?? '잠시 후 다시 시도해 주세요.'}
        onRetry={() => setOfficialDetailAttempt((value) => value + 1)}
      />
    );
  }

  if (!useFirestoreLiveForOfficial && (routeIsOfficial || routeMatchMissing) && officialDetailState === 'not-found') {
    return (
      <OfficialGameDetailMessage
        title="현재 게시된 공식 상세 기록이 없습니다"
        description="UniquePlay 경기 기록이 수집·검수·게시되면 이 화면에서 확인할 수 있습니다. 기존 AUBL 수기 기록으로 자동 대체하지 않습니다."
        onRetry={() => setOfficialDetailAttempt((value) => value + 1)}
      />
    );
  }

  if (noActiveMatch) {
    return (
      <div
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(148,163,184,0.3)',
          padding: '32px',
          textAlign: 'center',
          color: '#cbd5e1',
          background: '#0b0f1a',
        }}
      >
        현재 선택된 경기가 없습니다. 경기 일정에서 기록할 경기를 선택해 주세요.
      </div>
    );
  }

  return (
    <div className="scoreboard-text-page">
      <ScoringIntegrityNotice events={state.events} allowDetails={isAdmin} />
      <p role="status">AUBL 실시간 참고 기록입니다. 유니크플레이 공식 기록 전환 후에는 관리자 검수용으로만 보관됩니다.</p>
      <div className="main-content-grid">
        <div className={`scoreboard-section ${isMobile ? 'mobile-layout' : ''}`}>
          <div style={{ position: 'relative' }}>
            <ScoreboardFrame
              variant="text"
              hideBases
              showFootnote={false}
              showViewerBadge
              panelStyle={
                isMobile
                  ? { width: '100%', maxWidth: '100%', height: 'auto', minHeight: '500px', overflow: 'hidden' }
                  : { width: '100%', aspectRatio: '4 / 3' }
              }
            />
            <button
              type="button"
              onClick={() => navigate(state.activeMatchId ? `/scoreboard/${state.activeMatchId}` : '/scoreboard')}
              title="전광판 크게 보기"
              aria-label="전광판 크게 보기"
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.45)',
                background: 'rgba(15,23,42,0.82)',
                color: '#e2e8f0',
                fontSize: '16px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              }}
            >
              ⤢
            </button>
          </div>
          <div style={{ marginTop: '20px' }}>
            <NowPlayingCard
              batter={parsePlayerName(currentBatter).raw}
              pitcher={parsePlayerName(currentPitcher).raw}
              batterToday={batterToday}
              pitcherToday={pitcherToday}
              balls={state.balls}
              strikes={state.strikes}
            />
          </div>
        </div>
        <div className={state.gameOver ? 'live-feed-section game-over' : 'live-feed-section'}>
          {state.gameOver ? (
            <>
              {postGameDetailWithPitcherFallback ? (
                <PostGameDetailSection
                  detail={postGameDetailWithPitcherFallback}
                  teams={{ home: state.teamNames.home, away: state.teamNames.away }}
                  actionSlot={
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                        color: '#f8fafc',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        boxShadow: '0 3px 8px rgba(37, 99, 235, 0.2)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      기록지 다운로드 (CSV)
                    </button>
                  }
                />
              ) : (
                <PostGameSummary
                  summary={postSummary}
                  actionSlot={
                    <button
                      type="button"
                      onClick={handleDownloadCsv}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                        color: '#f8fafc',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        boxShadow: '0 3px 8px rgba(37, 99, 235, 0.2)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      기록지 다운로드 (CSV)
                    </button>
                  }
                />
              )}
              {isManualInputMode ? (
                <div
                  style={{
                    border: '1px dashed rgba(148,163,184,0.45)',
                    borderRadius: '12px',
                    padding: '16px',
                    background: 'rgba(148,163,184,0.08)',
                    color: '#cbd5e1',
                    fontWeight: 800,
                    textAlign: 'center',
                  }}
                >
                  문자중계 없음
                </div>
              ) : (
                <div
                  style={{
                    border: '1px solid rgba(148,163,184,0.3)',
                    borderRadius: '12px',
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.02)',
                    display: 'grid',
                    gridTemplateRows: 'auto minmax(0, 1fr)',
                    gap: '6px',
                    minHeight: 0,
                    maxHeight: showReplay ? '1100px' : '240px',
                    transition: 'max-height 180ms ease',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <span style={{ fontWeight: 900, fontSize: '14px', color: '#e2e8f0' }}>문자중계 다시보기</span>
                      <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>경기 종료 후 기록 전체를 확인할 수 있습니다.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (state.activeMatchId) {
                          selectMatch(state.activeMatchId);
                        }
                        actions.loadMoreFeed();
                        setShowReplay(true);
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(59,130,246,0.55)',
                        background: 'rgba(59,130,246,0.12)',
                        color: '#bfdbfe',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                      title="완료 경기 문자중계를 다시 불러옵니다"
                    >
                      문자중계 불러오기
                    </button>
                  </div>
                  {showReplay ? (
                    <div
                      style={{
                        borderRadius: '10px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        background: 'rgba(15,23,42,0.55)',
                        padding: '8px',
                        minHeight: 0,
                        height: '100%',
                        maxHeight: '100%',
                          overflowY: 'auto',
                          alignSelf: 'stretch',
                        }}
                      >
                      {textReplayBuildResult && textReplayBuildResult.groups.length > 0 ? (
                        <div
                          style={{
                            marginBottom: '10px',
                            border: '1px solid rgba(148,163,184,0.25)',
                            borderRadius: '10px',
                            padding: '10px',
                            display: 'grid',
                            gap: '8px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: '12px' }}>문자중계 재해석</span>
                            <span style={{ color: hasReplayPendingReview ? '#f59e0b' : '#94a3b8', fontSize: '11px', fontWeight: 800 }}>
                              {hasReplayPendingReview ? '수동확인 필요 항목 있음' : '자동 반영'}
                            </span>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.5 }}>
                            상태 적용 {replayStateAudit.entries.filter((entry) => entry.status === 'applied').length}건 ·
                            검증 보류 {replayStateAudit.entries.filter((entry) => entry.status === 'pending').length}건 ·
                            반려 {replayStateAudit.entries.filter((entry) => entry.status === 'rejected').length}건
                            <div>확정·제외는 이 화면의 재해석과 CSV에 적용됩니다. 저장된 경기 기록과 선수 집계는 별도 보정이 필요합니다.</div>
                          </div>
                          {textReplayBuildResult.groups
                            .filter(
                              (group) =>
                                group.options.length > 1 ||
                                group.isLowConfidence ||
                                group.requiresManualResolve ||
                                (group.rebuildIssues?.length ?? 0) > 0 || Boolean(rebuildSelections[group.groupId]),
                            )
                            .map((group) => {
                              const decision = rebuildSelections[group.groupId];
                              const selected = rebuildDrafts[group.groupId] ?? (decision !== REJECT_REBUILD_SELECTION ? decision : undefined) ?? group.selectedEventId;
                              const selectedOption =
                                group.options.find((option) => option.eventId === selected) ?? group.options[0];
                              const option = selectedOption?.event;
                              if (!option) return null;
                              const original = state.events.find((event) => event.eventId === option.rebuildOrigin?.eventId && event.inning === option.inning && event.half === option.half);
                              const decisionLabel = decision === REJECT_REBUILD_SELECTION ? '제외' : decision ? '수동 확정' : group.requiresManualResolve ? '확정 대기' : '자동 후보';
                              const groupIssues = group.rebuildIssues ?? [];
                              const reasonText =
                                selectedOption?.reasons?.length
                                  ? selectedOption.reasons.join(', ')
                                  : option.manualResolve?.reasons?.join(', ') || '파서 추론';
                              const evidenceText =
                                selectedOption?.evidence?.length
                                  ? selectedOption.evidence.join(' · ')
                                  : option.evidence?.length
                                    ? option.evidence.join(' · ')
                                    : '근거 없음';
                              return (
                                <div key={group.groupId} style={{ display: 'grid', gap: '6px' }}>
                                  <label style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '12px' }}>
                                    {`${group.sourceText} → `}
                                  </label>
                                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                                    기존 기록: {original ? `${original.type} · ${original.notes ?? ''}` : '대응 기록 없음'}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
                                      <select
                                        value={selected}
                                        aria-label={`${group.sourceText} 판독 후보`}
                                        disabled={!isAdmin}
                                        onChange={(event) => changeRebuildReview(group.groupId, event.target.value, true)}
                                      style={{
                                        width: '100%',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(148,163,184,0.4)',
                                        background: '#0f172a',
                                        color: '#f8fafc',
                                        padding: '6px 8px',
                                      }}
                                    >
                                      {group.options.map((candidate) => (
                                        <option
                                          key={candidate.eventId}
                                          value={candidate.eventId}
                                          title={[...(candidate.reasons ?? []), ...(candidate.evidence ?? [])]
                                            .filter(Boolean)
                                            .join(' / ')}
                                        >
                                          {`${candidate.event.type} (${(candidate.confidence * 100).toFixed(
                                            0,
                                          )}%)${candidate.reasons?.length ? ` · ${candidate.reasons[0]}` : ''}`}
                                        </option>
                                      ))}
                                    </select>
                                    <span style={{ color: option.manualResolve?.required ? '#fb923c' : '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                      {decisionLabel}: {decision && decision !== REJECT_REBUILD_SELECTION ? group.options.find((candidate) => candidate.eventId === decision)?.event.type : option.type}
                                    </span>
                                  </div>
                                  {isAdmin ? (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                      <button type="button" onClick={() => changeRebuildReview(group.groupId, selected)}>후보 확정</button>
                                      <button type="button" onClick={() => changeRebuildReview(group.groupId, REJECT_REBUILD_SELECTION)}>재해석 제외</button>
                                      <button type="button" disabled={!decision} onClick={() => changeRebuildReview(group.groupId, null)}>확정 되돌리기</button>
                                    </div>
                                  ) : null}
                                  <div style={{ color: '#cbd5e1', fontSize: '11px', lineHeight: 1.4 }}>
                                    <div>판정 사유: {reasonText}</div>
                                    <div style={{ color: '#94a3b8' }}>근거: {evidenceText}</div>
                                    {groupIssues.length ? (
                                      <div style={{ color: '#fca5a5' }}>검증 이슈: {groupIssues.join(' · ')}</div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          {replayStateAudit.entries.some((entry) => entry.status === 'rejected') ? (
                            <details style={{ color: '#fca5a5', fontSize: '11px' }}>
                              <summary>상태 반려 내역</summary>
                              {replayStateAudit.entries.filter((entry) => entry.status === 'rejected').map((entry, index) => (
                                <div key={`${entry.eventId}-${index}`}>{entry.eventId}: {entry.reasons.join(' · ')}</div>
                              ))}
                            </details>
                          ) : null}
                          {(state.scoringRejections ?? []).filter((entry) => entry.matchId === state.activeMatchId).length ? (
                            <details style={{ color: '#fca5a5', fontSize: '11px' }}>
                              <summary>입력 시 반려된 기록</summary>
                              {(state.scoringRejections ?? []).filter((entry) => entry.matchId === state.activeMatchId).map((entry) => (
                                <div key={entry.id}>{entry.eventType}: {entry.reason}</div>
                              ))}
                            </details>
                          ) : null}
                          {hasReplayPendingReview ? (
                            <p style={{ margin: 0, color: '#f59e0b', fontSize: '11px', fontWeight: 700 }}>
                              미확정 재해석은 상세 기록에 반영되지 않으며 CSV 감사 내역에 보류로 남습니다. 복합 사건은 모든 조각을 확정해야 반영됩니다.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} isMobile={isMobile} />
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <>
              <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 900, fontSize: '18px' }}>문자 중계</span>
              <GameTimerDisplay
                gameLimitMinutes={state.gameLimitMinutes}
                gameStartTimestamp={state.gameStartTimestamp}
                gamePausedAt={state.gamePausedAt}
                gamePausedDuration={state.gamePausedDuration}
                gameStarted={state.gameStarted}
                style={{
                  padding: '5px 10px',
                  fontSize: '12px',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
                {isManualInputMode ? '수기 입력 모드' : `총 ${feed.length}건`}
              </span>
              {!noActiveMatch && (
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/scoreboard-text/${state.activeMatchId}`;
                    navigator.clipboard.writeText(url).then(() => {
                      alert('링크가 복사되었습니다!\n' + url);
                    }).catch(() => {
                      alert('링크 복사에 실패했습니다.');
                    });
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(34,197,94,0.5)',
                    background: 'rgba(34,197,94,0.12)',
                    color: '#22c55e',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title="이 경기 문자중계 링크 복사"
                >
                  🔗 링크 복사
                </button>
              )}
              {hasLiveOverlay ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(state.activeMatchId ? `/live-overlay/${state.activeMatchId}` : '/live-overlay')
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: 'rgba(148,163,184,0.12)',
                    color: '#e2e8f0',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title="라이브 오버레이 보기"
                >
                  라이브 오버레이
                </button>
              ) : (
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px dashed rgba(248,113,113,0.6)',
                    background: 'rgba(248,113,113,0.08)',
                    color: '#fca5a5',
                    fontWeight: 800,
                    fontSize: '12px',
                  }}
                  title="이 경기에는 라이브 영상 링크가 없습니다"
                >
                  라이브 없음
                </span>
              )}
            </div>
          </div>
          {isManualInputMode ? (
            <div
              style={{
                borderRadius: '14px',
                border: '1px dashed rgba(148,163,184,0.45)',
                background: 'rgba(148,163,184,0.08)',
                padding: '18px 14px',
                color: '#cbd5e1',
                fontWeight: 900,
                textAlign: 'center',
              }}
            >
              문자중계 없음
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    actions.loadMoreFeed();
                    setFeedExpanded(true);
                  }}
                  disabled={feedExpanded}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.5)',
                    background: feedExpanded ? 'rgba(148,163,184,0.12)' : 'rgba(59,130,246,0.12)',
                    color: feedExpanded ? '#94a3b8' : '#93c5fd',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: feedExpanded ? 'not-allowed' : 'pointer',
                  }}
                  title={feedExpanded ? '이전 이닝까지 불러왔습니다' : '이전 이닝 더보기'}
                >
                  {feedExpanded ? '이전 이닝 불러옴' : '이전 이닝 더보기'}
                </button>
              </div>
              <LiveFeed sections={sections} collapsedMap={collapsedMap} gameOverInfo={gameOverInfo} isMobile={isMobile} />
              <div
                style={{
                  borderRadius: '14px',
                  border: '1px solid rgba(148,163,184,0.25)',
                  background: 'rgba(15,23,42,0.5)',
                  padding: '12px',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 900, fontSize: '15px', color: '#e2e8f0' }}>필드 상황</span>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>베이스 · 볼카운트 · 수비 위치</span>
                </div>
                <FieldView
                  bases={state.bases}
                  inning={state.inning}
                  half={state.half}
                  outs={state.outs}
                  balls={state.balls}
                  strikes={state.strikes}
                  batterName={currentBatter}
                  defenseAssignments={defenseAssignments}
                  isMobile={isMobile}
                />
              </div>
            </>
          )}
        </>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div style={{ display: 'grid', gap: '8px' }}>
          <StatsTable title={`${state.teamNames.away} 타자 기록`} stats={displayPlayerStats.hitters.away} variant="batter" density="compact" />
          <StatsTable title={`${state.teamNames.away} 투수 기록`} stats={displayPlayerStats.pitchers.away} variant="pitcher" density="compact" />

        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <StatsTable title={`${state.teamNames.home} 타자 기록`} stats={displayPlayerStats.hitters.home} variant="batter" density="compact" />
          <StatsTable title={`${state.teamNames.home} 투수 기록`} stats={displayPlayerStats.pitchers.home} variant="pitcher" density="compact" />
        </div>
      </div>

      <div className="removed-players-grid">
        <RemovedPlayersPanel title={`교체 out (${state.teamNames.away || 'AWAY'})`} players={state.removed.away} density="compact" />
        <RemovedPlayersPanel title={`교체 out (${state.teamNames.home || 'HOME'})`} players={state.removed.home} density="compact" />
      </div>

      {state.gameOver && csvPreviewContent ? (
        <CsvRecordPreview
          csvContent={csvPreviewContent}
          awayTeamName={recordPayload.meta.awayTeamName || state.teamNames.away}
          homeTeamName={recordPayload.meta.homeTeamName || state.teamNames.home}
        />
      ) : null}
    </div>
  );
}









function FieldView({
  bases,
  inning,
  half,
  outs,
  balls,
  strikes,
  batterName,
  defenseAssignments,
  onSelectRunner,
  onSelectBatter,
  onSelectFielder,
  isMobile,
}: {
  bases: (string | null)[];
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  batterName: string;
  defenseAssignments: { name: string; pos: string; x: number; y: number }[];
  onSelectRunner?: (payload: { base: 0 | 1 | 2; name: string }) => void;
  onSelectBatter?: () => void;
  onSelectFielder?: (payload: { name: string; pos: string }) => void;
  isMobile?: boolean;
}) {
  const label = `${half === 'top' ? '▲' : '▼'} ${inning}`;
  const baseSize = 'clamp(25px, 4vw, 36px)';
  const groundShift = '-4%';
  const positions = {
    second: { x: 50, y: 35 },
    first: { x: 72, y: 63 },
    third: { x: 28, y: 63 },
    home: { x: 50, y: 92 },
    batter: { x: 68, y: 90 },
  };
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '18px',
        background: '#0b0f1a',
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        aspectRatio: '4 / 3',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
        justifySelf: 'start',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${groundShift})`,
          pointerEvents: 'none',
        }}
      >
        <FieldSvg />
        <BaselineSvg />
      </div>
      <span
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(148,163,184,0.3)',
          fontWeight: 900,
          color: '#cbd5e1',
          fontSize: '13px',
        }}
      >
        {label}
      </span>
      <OutLights outs={outs} balls={balls} strikes={strikes} />
      <Base
        occupied={Boolean(bases[1])}
        runnerName={bases[1] ?? undefined}
        top={`${positions.second.y}%`}
        left={`${positions.second.x}%`}
        size={baseSize}
        onSelect={() => bases[1] && onSelectRunner?.({ base: 1, name: bases[1] })}
        isMobile={isMobile}
      />
      <Base
        occupied={Boolean(bases[0])}
        runnerName={bases[0] ?? undefined}
        top={`${positions.first.y}%`}
        left={`${positions.first.x}%`}
        size={baseSize}
        onSelect={() => bases[0] && onSelectRunner?.({ base: 0, name: bases[0] })}
        isMobile={isMobile}
      />
      <Base
        occupied={Boolean(bases[2])}
        runnerName={bases[2] ?? undefined}
        top={`${positions.third.y}%`}
        left={`${positions.third.x}%`}
        size={baseSize}
        onSelect={() => bases[2] && onSelectRunner?.({ base: 2, name: bases[2] })}
        isMobile={isMobile}
      />
      <HomePlate occupied={false} size={baseSize} top={`${positions.home.y}%`} left={`${positions.home.x}%`} />
      <BatterBadge name={batterName} top={`${positions.batter.y}%`} left={`${positions.batter.x}%`} onClick={onSelectBatter} isMobile={isMobile} />
      <PitcherBadge
        name={defenseAssignments.find((player) => player.pos.toUpperCase() === 'P')?.name ?? '투수'}
        top="54%"
        left="50%"
        onClick={onSelectFielder}
        isMobile={isMobile}
      />
      <DefenseLayer
        assignments={defenseAssignments.filter((player) => player.pos.toUpperCase() !== 'P')}
        onSelectFielder={onSelectFielder}
        isMobile={isMobile}
      />
    </div>
  );
}

function Base({
  occupied,
  runnerName,
  top,
  left,
  size,
  onSelect,
  isMobile,
}: {
  occupied?: boolean;
  runnerName?: string;
  top?: string;
  left?: string;
  size?: string;
  onSelect?: () => void;
  isMobile?: boolean;
}) {
  const clickable = occupied && onSelect;
  const parsedRunner = (() => {
    const raw = (runnerName ?? '').trim();
    const match = raw.match(/^(.*?)(?:\(([^)]*)\))?\s*$/);
    return {
      name: (match?.[1] ?? raw).trim(),
      number: (match?.[2] ?? '').trim(),
    };
  })();

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width: size ?? '28px',
        height: size ?? '28px',
        zIndex: occupied ? 5 : 4,
      }}
    >
      {/* 다이아몬드 (시각 + 인터랙션) */}
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: 'rotate(45deg)',
          background: occupied ? '#facc15' : '#f4f4f5',
          borderRadius: '4px',
          border: occupied ? '2px solid #f59e0b' : '2px solid #e5e7eb',
          boxShadow: occupied ? '0 0 0 8px rgba(250, 204, 21, 0.3), 0 8px 18px rgba(245, 158, 11, 0.35)' : undefined,
          cursor: clickable ? 'pointer' : 'default',
          transition: 'transform 120ms ease, box-shadow 120ms ease',
          transformOrigin: 'center',
        }}
        role={clickable ? 'button' : undefined}
        title={occupied ? runnerName : undefined}
        onClick={() => clickable && onSelect?.()}
        onMouseEnter={(e) => {
          if (clickable) {
            (e.currentTarget as HTMLDivElement).style.transform = 'rotate(45deg) scale(1.06)';
          }
        }}
        onMouseLeave={(e) => {
          if (clickable) {
            (e.currentTarget as HTMLDivElement).style.transform = 'rotate(45deg)';
          }
        }}
      />
      {/* 이름/등번호: 다이아몬드 중앙에 절대 위치 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'clamp(44px, 8vw, 58px)',
          display: 'grid',
          justifyItems: 'center',
          gap: '1px',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 900,
            color: occupied ? '#1f2937' : '#6b7280',
            fontSize: isMobile ? '9px' : '11px',
            lineHeight: 1.1,
            maxWidth: '100%',
          }}
          title={runnerName}
        >
          {parsedRunner.name || ' '}
        </span>
        {parsedRunner.number ? (
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 800,
              color: occupied ? '#1f2937' : '#6b7280',
              fontSize: isMobile ? '8px' : '10px',
              lineHeight: 1,
              maxWidth: '100%',
            }}
            title={parsedRunner.number}
          >
            {parsedRunner.number}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HomePlate({ occupied, size, top, left }: { occupied: boolean; size?: string; top?: string; left?: string }) {
  const plateWidth = size ? `calc(${size} * 1.2)` : '34px';
  const plateHeight = size ? `calc(${size} * 1.0)` : '28px';
  return (
    <div
      style={{
        position: 'absolute',
        top: top ?? '72%',
        left: left ?? '50%',
        transform: 'translate(-50%, -50%)',
        width: plateWidth,
        height: plateHeight,
        background: '#e5e7eb',
        clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
        border: occupied ? '2px solid #f97316' : '2px solid #d1d5db',
        boxShadow: occupied ? '0 0 0 8px rgba(249, 115, 22, 0.2)' : undefined,
      }}
    />
  );
}

function BaselineSvg() {
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <polyline
        points="50,72 72,50 50,28 28,50 50,72"
        fill="none"
        stroke="rgba(226,232,240,0.35)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="50" y1="72" x2="2" y2="24" stroke="rgba(226,232,240,0.25)" strokeWidth="1.4" />
      <line x1="50" y1="72" x2="98" y2="24" stroke="rgba(226,232,240,0.25)" strokeWidth="1.4" />
    </svg>
  );
}

function OutLights({ outs, balls, strikes }: { outs: number; balls: number; strikes: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: '12px',
        background: 'rgba(15,23,42,0.8)',
        border: '1px solid rgba(148,163,184,0.3)',
      }}
    >
      <CounterDots label="B" count={balls} max={3} color="#22c55e" />
      <CounterDots label="S" count={strikes} max={2} color="#facc15" />
      <CounterDots label="O" count={outs} max={3} color="#ef4444" />
    </div>
  );
}

function CounterDots({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ color, fontWeight: 900, fontSize: '13px', width: '16px' }}>{label}</span>
      {[...Array(max)].map((_, idx) => (
        <span
          key={idx}
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: count > idx ? color : 'transparent',
            border: `1px solid ${color}80`,
            boxShadow: count > idx ? `0 0 10px ${color}99` : `inset 0 0 0 1px ${color}55`,
          }}
        />
      ))}
    </div>
  );
}

function DefenseLayer({
  assignments,
  onSelectFielder,
  isMobile,
}: {
  assignments: { name: string; pos: string; x: number; y: number }[];
  onSelectFielder?: (payload: { name: string; pos: string }) => void;
  isMobile?: boolean;
}) {
  return (
    <>
      {assignments.map((player) => {
        const isOutfielder = ['LF', 'CF', 'RF'].includes(player.pos.toUpperCase());
        return (
        <div
          key={player.name + player.pos}
          role={onSelectFielder ? 'button' : undefined}
          onClick={() => onSelectFielder?.({ name: player.name, pos: player.pos })}
          style={{
            position: 'absolute',
            top: `${isOutfielder ? player.y + 3 : player.y}%`,
            left: `${player.x}%`,
            transform: 'translate(-50%, -50%)',
            padding: '3px 5px',
            borderRadius: '8px',
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: isMobile ? '10px' : '12px',
            cursor: onSelectFielder ? 'pointer' : 'default',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            pointerEvents: onSelectFielder ? 'auto' : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {player.pos} · {player.name}
        </div>
        );
      })}
    </>
  );
}

function BatterBadge({ name, top, left, onClick, isMobile }: { name: string; top: string; left: string; onClick?: () => void; isMobile?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '5px 8px',
        borderRadius: '10px',
        border: '1px solid rgba(148,163,184,0.35)',
        background: 'rgba(99,102,241,0.18)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: isMobile ? '10px' : '12px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
        pointerEvents: onClick ? 'auto' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      타석 · {name}
    </button>
  );
}

function PitcherBadge({
  name,
  top,
  left,
  onClick,
  isMobile,
}: {
  name: string;
  top: string;
  left: string;
  onClick?: (payload: { name: string; pos: string }) => void;
  isMobile?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.({ name, pos: 'P' })}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '4px 7px',
        borderRadius: '10px',
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(15,23,42,0.75)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: isMobile ? '10px' : '12px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        pointerEvents: onClick ? 'auto' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      투수 · {name}
    </button>
  );
}

function FieldSvg() {
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#166534" />
          <stop offset="100%" stopColor="#0f3d1f" />
        </linearGradient>
        <linearGradient id="dirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b7791f" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grass)" />
      <path d="M 50 72 L 2 24 Q 50 -15 98 24 Z" fill="rgba(22,101,52,0.92)" />
      <polygon points="50,28 72,50 50,72 28,50" fill="url(#dirt)" />
      <circle cx="50" cy="50" r="3.5" fill="#a16207" stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" />
      <circle cx="50" cy="50" r="1.2" fill="#e2e8f0" opacity="0.4" />
      <rect x="43.5" y="64" width="4" height="7" fill="transparent" stroke="rgba(148,163,184,0.5)" strokeWidth="0.6" />
      <rect x="52.5" y="64" width="4" height="7" fill="transparent" stroke="rgba(148,163,184,0.5)" strokeWidth="0.6" />
    </svg>
  );
}

function getDefenseAssignments(lineup: { name: string; pos: string }[]) {
  const posMap: Record<string, { x: number; y: number }> = {
    P: { x: 50, y: 54 },
    C: { x: 50, y: 84 },
    '1B': { x: 76, y: 52 },
    '2B': { x: 62.4, y: 40 },
    SS: { x: 37.6, y: 40 },
    '3B': { x: 24, y: 52 },
    LF: { x: 18, y: 25 },
    CF: { x: 50, y: 17 },
    RF: { x: 82, y: 25 },
  };
  const fallback: { x: number; y: number }[] = [
    { x: 50, y: 54 },
    { x: 50, y: 84 },
    { x: 76, y: 52 },
    { x: 62.4, y: 40 },
    { x: 37.6, y: 40 },
    { x: 24, y: 52 },
    { x: 18, y: 25 },
    { x: 50, y: 17 },
    { x: 82, y: 25 },
  ];
  return lineup
    .filter((slot) => Boolean(posMap[slot.pos.toUpperCase()]))
    .map((slot, idx) => {
      const key = slot.pos.toUpperCase();
      const coords = posMap[key] ?? fallback[idx] ?? { x: 50, y: 56 };
      return { name: slot.name, pos: slot.pos, x: coords.x, y: coords.y };
    });
}

// [수정] ci(타격방해), fc(야수선택) 판별 로직 추가
// Legacy wrapper retained for comparison; callers use the shared classifier directly.
// function classifyResult(result: string) {
//   return classifyRecordedPlateAppearance(result);
// }

function classifyPitch(result: string) {
  const normalized = result.replace(/\s+/g, '');
  const hasPitch =
    normalized.includes('볼') ||
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('아웃') ||
    normalized.includes('타') ||
    normalized.includes('홈런') ||
    normalized.includes('희생') ||
    normalized.includes('몸에맞는공');
  const isBall = normalized.includes('볼') || normalized.includes('볼넷') || normalized.includes('몸에맞는공');
  const isStrike =
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('타') ||
    normalized.includes('홈런') ||
    normalized.includes('아웃');
  return { pitch: hasPitch, ball: isBall, strike: isStrike };
}

function buildJerseyMap(
  lineups: ReturnType<typeof useDemoStore>['state']['lineups'],
  benches?: ReturnType<typeof useDemoStore>['state']['benches'],
  removed?: ReturnType<typeof useDemoStore>['state']['removed'],
): JerseyMap {
  const merge = (
    lineup: { name: string; pos: string; number: string }[],
    bench?: { name: string; pos: string; number: string }[],
    gone?: { name: string; pos: string; number: string }[],
  ) => [...lineup, ...(bench ?? []), ...(gone ?? [])];

  const buildSideMap = (players: { name: string; pos: string; number: string }[]) => {
    const map = new Map<string, { number: string; pos: string }>();
    const setIfEmpty = (key: string | undefined, value: { number: string; pos: string }) => {
      const trimmed = (key ?? '').trim();
      if (!trimmed || map.has(trimmed)) return;
      map.set(trimmed, value);
    };
    players.forEach((p) => {
      if (!p?.name) return;
      const parts = parsePlayerName(p.name);
      const entry = { number: p.number, pos: p.pos };
      setIfEmpty(p.name, entry); // 원본 이름
      setIfEmpty(formatWithJersey(parts.base || p.name, p.number), entry); // 이름+등번호
      setIfEmpty(parts.base, entry); // 등번호 없는 베이스 이름(백업)
    });
    return map;
  };

  return {
    home: buildSideMap(merge(lineups.home, benches?.home, removed?.home)),
    away: buildSideMap(merge(lineups.away, benches?.away, removed?.away)),
  };
}

function formatEntry(entry: ReturnType<typeof useDemoStore>['state']['feed'][number], batterDisplay?: string) {
  const halfLabel = entry.half === 'top' ? '초' : '말';
  const inningLabel = `${entry.inning}회${halfLabel}`;
  const batterLabel = entry.batter ? `${entry.order}번 ${batterDisplay ?? entry.batter} 타석` : '';
  const pitchLabel = entry.pitch > 0 ? `${entry.pitch}구째` : '';
  const parts = [inningLabel, batterLabel, pitchLabel].filter(Boolean).join(' ');
  return parts ? `${parts} ${entry.result}` : entry.result;
}

function eventLookupKey(payload: { inning: number; half: Half; order: number; pitch: number }) {
  return `${payload.inning}-${payload.half}-${payload.order}-${payload.pitch}`;
}

function formatErrorDetail(error: PlayEvent['error']) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  const extraCalls = error.extraCalls?.length
    ? error.extraCalls
      .map((call) => {
        const callLabel = call.type === 'runner_obstruction' ? '주루 방해(수비)' : '주자 수비방해';
        const outcome =
          call.outcome == null
            ? ''
            : `:${typeof call.outcome === 'number' ? (call.outcome >= 4 ? '홈(득점)' : `${call.outcome}루`) : formatRunnerOutcomeLabel(call.outcome)}`;
        return `${callLabel}(${call.base + 1}루${outcome})`;
      })
      .join(' / ')
    : '';
  const parts = [error.errorType, error.fielderPos, error.context, extraCalls]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.join(' · ');
}

function formatEventDetails(event?: PlayEvent): EventDetail[] {
  if (!event) return [];
  const details: EventDetail[] = [];

  const battedBallType = event.battedBall?.type?.trim();
  const battedBallZone = event.battedBall?.zone?.trim();
  const battedBallValue = [battedBallType, battedBallZone]
    .filter((value): value is string => Boolean(value && value !== '선택 안 함'))
    .join(' / ');
  if (battedBallValue) {
    details.push({ label: '타구', value: battedBallValue });
  }

  if (Array.isArray(event.runners) && event.runners.length) {
    details.push({ label: '주자', value: event.runners.join(', ') });
  }

  const errorValue = formatErrorDetail(event.error);
  if (errorValue) {
    details.push({ label: '실책', value: errorValue });
  }

  if (typeof event.rbi === 'number' && event.rbi > 0) {
    details.push({ label: '타점', value: `${event.rbi}` });
  }

  if (Array.isArray(event.dpRoute) && event.dpRoute.length) {
    details.push({ label: '병살 루트', value: event.dpRoute.join('-') });
  }

  if (event.strikeType) {
    details.push({ label: '삼진 판정', value: event.strikeType === 'looking' ? '루킹' : '스윙' });
  }

  if (event.notes?.trim()) {
    details.push({ label: '비고', value: event.notes.trim() });
  }

  if (event.source?.kind === 'text_feed_rebuild') {
    details.push({ label: '재해석', value: '텍스트 기반' });
    details.push({ label: '파서 신뢰도', value: typeof event.confidence === 'number' ? event.confidence.toFixed(2) : 'N/A' });
  }
  if (Array.isArray(event.evidence) && event.evidence.length) {
    details.push({ label: '근거', value: event.evidence.join(' · ') });
  }
  if (Array.isArray(event.corrections) && event.corrections.length) {
    details.push({ label: '근거 문구', value: event.corrections.join(' | ') });
  }
  if (event.penalty && typeof event.penalty === 'object') {
    const kind = (event.penalty as { kind?: string; official?: boolean }).kind ?? '미상';
    const official = (event.penalty as { official?: boolean }).official ? '공식' : '비공식';
    details.push({ label: '패널티', value: `${kind}(${official})` });
  }
  if (event.substitution && typeof event.substitution === 'object') {
    const detail = event.substitution as {
      side?: 'home' | 'away';
      action?: string;
      actor?: string;
      atHalf?: 'top' | 'bottom';
    };
    const side = detail.side ? (detail.side === 'home' ? '홈' : '원정') : '미상';
    const action = detail.action ?? 'substitution';
    const actor = detail.actor ? ` / ${detail.actor}` : '';
    const timing = detail.atHalf ? ` / ${detail.atHalf === 'top' ? '초' : '말'}` : '';
    details.push({ label: '교체', value: `${side}/${action}${actor}${timing}` });
  }
  if (event.officialAdjust === true) {
    details.push({ label: '공식보정', value: '적용' });
  }
  if (event.manualResolve?.required) {
    const reasons = event.manualResolve.reasons?.join(', ') ?? '수동 확인 필요';
    details.push({ label: '검증 상태', value: reasons });
  }
  if (event.outcome === 'manual_review') {
    details.push({ label: '자동 검토', value: '수동 점검 권장' });
  }

  return details;
}

function buildDisplayItems(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  events: ReturnType<typeof useDemoStore>['state']['events'],
  jerseyMap: JerseyMap,
): DisplayItem[] {
  // [수정] demoStore가 이미 올바른 시간순(Oldest -> Newest)으로 정렬되어 있으므로 reverse() 제거
  // createdAt 기반 정렬 덕분에 선수 교체 로그도 정확한 시점에 위치함
  const chronological = feed;
  const eventsById = new Map<string, PlayEvent>();
  const eventsByKey = new Map<string, PlayEvent[]>();
  const eventsChronological = [...events].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  eventsChronological.forEach((event) => {
    if (event.eventId) {
      eventsById.set(event.eventId, event);
    }
    const key = eventLookupKey(event);
    const queue = eventsByKey.get(key) ?? [];
    queue.push(event);
    eventsByKey.set(key, queue);
  });

  const items: DisplayItem[] = [];

  const eventIdsWithPrimaryLog = new Set<string>();
  chronological.forEach((entry) => {
    if (!entry.eventId) return;
    if (!entry.order || entry.order <= 0) return;
    if (!entry.batter?.trim()) return;
    eventIdsWithPrimaryLog.add(entry.eventId);
  });

  const markerText = (inning: number, half: Half, type: 'start' | 'end') => {
    const halfLabel = half === 'top' ? '초' : '말';
    return `${inning}회${halfLabel} ${type === 'start' ? '시작' : '종료'}`;
  };

  let prevHalf: Half | null = null;
  let prevInning: number | null = null;
  let prevBatter: string | null = null;
  const endedInnings = new Set<string>();
  const battingSlots: Record<'home' | 'away', Map<number, string>> = { home: new Map(), away: new Map() };

  chronological.forEach((entry, idx) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const order = entry.order && entry.order > 0 ? entry.order : null;
    const batterName = entry.batter?.trim();

    const isEndMarker = entry.result.includes('종료');
    if (isEndMarker) {
      const label = `${entry.inning}-${entry.half}`;
      if (endedInnings.has(label)) {
        prevHalf = entry.half;
        prevInning = entry.inning;
        return;
      }
      items.push({
        type: 'marker',
        text: entry.result,
        color: '#f87171',
        key: `end-${entry.inning}-${entry.half}-${idx}`,
        inning: entry.inning,
        half: entry.half,
      });
      endedInnings.add(label);
      prevHalf = entry.half;
      prevInning = entry.inning;
      return;
    }

    const isNewHalf = idx === 0 || entry.inning !== prevInning || entry.half !== prevHalf;
    if (isNewHalf) {
      items.push({
        type: 'marker',
        text: markerText(entry.inning, entry.half, 'start'),
        color: '#22c55e',
        key: `start-${entry.inning}-${entry.half}-${idx === 0 ? 'init' : idx}`,
        inning: entry.inning,
        half: entry.half,
      });
      prevBatter = null;
    }

    const isRunnerOnly = !entry.batter?.trim() || !entry.order || entry.order === 0;
    const shouldCollapseRunnerLog =
      isRunnerOnly &&
      entry.eventId &&
      eventIdsWithPrimaryLog.has(entry.eventId) &&
      eventsById.has(entry.eventId);

    if (shouldCollapseRunnerLog) {
      prevHalf = entry.half;
      prevInning = entry.inning;
      return;
    }

    let isSubstitute = false;
    // [수정] 교체 상태 변수 추가
    let subStatus: 'out' | '대수비' | '대타' | '대주자' | undefined;

    if (batterName && order) {
      const slot = battingSlots[offenseSide];
      const prevOccupant = slot.get(order);
      if (prevOccupant && !isSamePlayerName(prevOccupant, batterName)) {
        const outgoingJersey = resolveJersey(jerseyMap, offenseSide, prevOccupant);
        items.push({
          type: 'batter',
          text: formatWithJersey(prevOccupant, outgoingJersey),
          key: `batter-${entry.inning}-${entry.half}-${order}-${idx}-out`,
          inning: entry.inning,
          half: entry.half,
          order,
          jersey: outgoingJersey,
          status: 'out',
        });
        isSubstitute = true;
        prevBatter = null;
      }
      slot.set(order, batterName);
    }

    // [수정] 교체 선수일 경우, 직전 로그를 확인하여 교체 유형(대타/대주자/대수비) 추론
    if (isSubstitute) {
      const prevItem = idx > 0 ? chronological[idx - 1] : null;
      if (prevItem) {
        if (prevItem.result.includes('대타')) subStatus = '대타';
        else if (prevItem.result.includes('대주자')) subStatus = '대주자';
        else if (prevItem.result.includes('대수비')) subStatus = '대수비';
      }
    }

    if (batterName) {
      const jersey = resolveJersey(jerseyMap, offenseSide, batterName);
      const batterText = formatWithJersey(batterName, jersey);
      if (!prevBatter || !isSamePlayerName(prevBatter, batterName) || isSubstitute) {
        items.push({
          type: 'batter',
          text: batterText,
          key: `batter-${entry.inning}-${entry.half}-${order ?? 'na'}-${batterName}-${idx}${isSubstitute ? '-sub' : ''}`,
          inning: entry.inning,
          half: entry.half,
          order,
          jersey,
          isSubstitute,
          // [수정] 추론된 교체 유형 상태 적용
          status: subStatus,
        });
        prevBatter = batterName;
      }
    }

    const key = eventLookupKey(entry);
    const queue = eventsByKey.get(key);
    let matchedEvent = entry.eventId ? eventsById.get(entry.eventId) : undefined;
    if (!matchedEvent && queue && queue.length) {
      if (typeof entry.createdAt === 'number') {
        let bestIdx = 0;
        let bestDiff = Number.POSITIVE_INFINITY;
        queue.forEach((candidate, candidateIdx) => {
          const eventTime = typeof candidate.createdAt === 'number' ? candidate.createdAt : entry.createdAt!;
          const diff = Math.abs(eventTime - entry.createdAt!);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = candidateIdx;
          }
        });
        matchedEvent = queue.splice(bestIdx, 1)[0];
      } else {
        matchedEvent = queue.shift();
      }
    }

    items.push({
      type: 'log',
      text: formatEntry(entry, batterName ? formatWithJersey(batterName, resolveJersey(jerseyMap, offenseSide, batterName)) : undefined),
      key: `log-${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}-${idx}`,
      chip: `${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}`,
      inning: entry.inning,
      half: entry.half,
      details: formatEventDetails(matchedEvent),
    });

    prevHalf = entry.half;
    prevInning = entry.inning;
  }); 

  return items;
}

function groupByInning(items: DisplayItem[]) {
  const map = new Map<number, { inning: number; items: DisplayItem[] }>();
  items.forEach((item) => {
    const section = map.get(item.inning) ?? { inning: item.inning, items: [] };
    section.items.push(item);
    map.set(item.inning, section);
  });
  return [...map.values()].sort((a, b) => a.inning - b.inning);
}

// [수정] colorizeText 함수: 선수 교체 관련 키워드 추가하여 하이라이팅 적용
// -------------------------------------------------------------------------

type PlayerStat = BatterStatLine;

type PitcherStatExt = PitcherStatLine;

function ensurePlayerStat(name: string, pos?: string): PlayerStat {
  return {
    name,
    pos,
    order: null,
    pa: 0,
    ab: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    bb: 0,
    ci: 0,
    fc: 0,
    hbp: 0,
    so: 0,
    sac: 0,
    r: 0,
    rbi: 0,
  };
}

function ensurePitcherStat(name: string, pos?: string): PitcherStatExt {
  return {
    name,
    pos,
    bf: 0,
    pitches: 0,
    strikes: 0,
    balls: 0,
    outs: 0,
    h: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    so: 0,
    r: 0,
    er: 0,
    earnedRunsStatus: 'estimated',
  };
}

// [수정] buildPlayerStats: ScorekeeperPage.tsx의 로직을 그대로 이식
// 투수/타자 구분 로직, 고유 이름(uniqueName)을 Key로 사용하는 로직 적용
function buildPlayerStats(record: ReturnType<typeof buildGameRecord>, options?: { practiceMode?: boolean }) {
  const practiceMode = options?.practiceMode === true;
  const normalizePos = (pos?: string) => (pos ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const isDhPos = (pos?: string) => {
    const norm = normalizePos(pos);
    return norm === 'DH' || (pos ?? '').includes('지명');
  };
  const hasDhBySide: Record<'home' | 'away', boolean> = {
    home: record.lineups.home.some((slot) => isDhPos(slot.pos)),
    away: record.lineups.away.some((slot) => isDhPos(slot.pos)),
  };
  const lineupByName: Record<'home' | 'away', Map<string, PlayerSlot>> = {
    home: new Map(),
    away: new Map(),
  };
  record.lineups.home.forEach((p) => lineupByName.home.set(getUniqueName(p.name, p.number), p));
  record.lineups.away.forEach((p) => lineupByName.away.set(getUniqueName(p.name, p.number), p));
  const pitcherCanBat = (side: 'home' | 'away', name: string) => {
    const slot = lineupByName[side].get(name);
    if (!slot) return true;
    const isPitcher = normalizePos(slot.pos) === 'P';
    if (!isPitcher) return true;
    if (slot.isOhtaniRule) return true;
    return !hasDhBySide[side];
  };
  // Roster Map의 Key를 uniqueName으로 변경
  const rosterHome = new Map<string, { pos?: string; order: number; substitutionType?: '대수비' | '대타' | '대주자'; isElite?: boolean }>();
  const rosterAway = new Map<string, { pos?: string; order: number; substitutionType?: '대수비' | '대타' | '대주자'; isElite?: boolean }>();

  record.lineups.home.forEach((p, idx) =>
    rosterHome.set(getUniqueName(p.name, p.number), { pos: p.pos, order: idx, substitutionType: p.substitutionType, isElite: p.isElite })
  );
  record.lineups.away.forEach((p, idx) =>
    rosterAway.set(getUniqueName(p.name, p.number), { pos: p.pos, order: idx, substitutionType: p.substitutionType, isElite: p.isElite })
  );

  const benchMetaHome = new Map<string, { pos?: string; order: number; isElite?: boolean }>();
  const benchMetaAway = new Map<string, { pos?: string; order: number; isElite?: boolean }>();
  record.benches.home.forEach((p, idx) => benchMetaHome.set(getUniqueName(p.name, p.number), { pos: p.pos, order: 100 + idx, isElite: p.isElite }));
  record.benches.away.forEach((p, idx) => benchMetaAway.set(getUniqueName(p.name, p.number), { pos: p.pos, order: 100 + idx, isElite: p.isElite }));
  const removedMetaHome = new Map<string, { pos?: string; order: number; isElite?: boolean }>();
  const removedMetaAway = new Map<string, { pos?: string; order: number; isElite?: boolean }>();
  record.removed.home.forEach((p, idx) => removedMetaHome.set(getUniqueName(p.name, p.number), { pos: p.pos, order: 200 + idx, isElite: p.isElite }));
  record.removed.away.forEach((p, idx) => removedMetaAway.set(getUniqueName(p.name, p.number), { pos: p.pos, order: 200 + idx, isElite: p.isElite }));

  const extraOrder: Record<'home' | 'away', number> = { home: 100, away: 100 };
  const battingOrders: Record<'home' | 'away', Map<number, string[]>> = { home: new Map(), away: new Map() };

  const seedBattingOrders = (side: 'home' | 'away') => {
    let batting: PlayerSlot[] = [];
    if (practiceMode) {
      const lineup = record.lineups[side];
      let pitcherIndex = -1;
      for (let idx = lineup.length - 1; idx >= 0; idx -= 1) {
        if (lineup[idx].pos.toUpperCase() === 'P') {
          pitcherIndex = idx;
          break;
        }
      }
      batting = lineup.filter((_, idx) => idx !== pitcherIndex);
    } else {
      const lineup = record.lineups[side];
      batting = lineup.filter((slot, idx) => {
        const isPitcher = normalizePos(slot.pos) === 'P';
        const allowedPitcher = isPitcher ? pitcherCanBat(side, getUniqueName(slot.name, slot.number)) : true;
        if (idx >= 9) return false;
        return allowedPitcher;
      });
    }
    // Batting order map에도 uniqueName 저장
    batting.forEach((slot, idx) => battingOrders[side].set(idx + 1, [getUniqueName(slot.name, slot.number)]));
  };
  seedBattingOrders('home');
  seedBattingOrders('away');

  const addRemovedOrders = (side: 'home' | 'away') => {
    // [수정] 교체된 순서대로 정렬하기 위해 removed 배열을 역순으로 순회
    [...(record.removed?.[side] ?? [])].reverse().forEach((p) => {
      const ord = typeof p.order === 'number' && p.order > 0 ? p.order : null;
      if (!ord) return;
      const list = battingOrders[side].get(ord) ?? [];
      const uniqueName = getUniqueName(p.name, p.number);
      if (!list.includes(uniqueName)) {
        list.unshift(uniqueName);
      }
      battingOrders[side].set(ord, list);
    });
  };
  addRemovedOrders('home');
  addRemovedOrders('away');

  const statsHome = new Map<string, PlayerStat>();
  const statsAway = new Map<string, PlayerStat>();
  const pitchHome = new Map<string, PitcherStatExt>();
  const pitchAway = new Map<string, PitcherStatExt>();
  const pitcherAppearance: Record<'home' | 'away', Map<string, number>> = { home: new Map(), away: new Map() };
  const nextAppearance: Record<'home' | 'away', number> = { home: 0, away: 0 };

  const ensureRosterEntry = (side: 'home' | 'away', name: string) => {
    // name은 이미 uniqueName이어야 함
    const roster = side === 'home' ? rosterHome : rosterAway;
    if (roster.has(name)) return roster.get(name)!;
    const benchMeta = side === 'home' ? benchMetaHome : benchMetaAway;
    const removedMeta = side === 'home' ? removedMetaHome : removedMetaAway;
    const meta = benchMeta.get(name) ?? removedMeta.get(name);
    const entry = { pos: meta?.pos, order: meta?.order ?? extraOrder[side], isElite: meta?.isElite };
    extraOrder[side] += 1;
    roster.set(name, entry);
    return entry;
  };

  const addStat = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? statsHome : statsAway;
    if (!store.has(name)) {
      store.set(name, ensurePlayerStat(name, pos));
    }
    return store.get(name)!;
  };

  const addPitch = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    if (!pitcherAppearance[side].has(name)) {
      pitcherAppearance[side].set(name, nextAppearance[side]);
      nextAppearance[side] += 1;
    }
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? pitchHome : pitchAway;
    if (!store.has(name)) {
      store.set(name, ensurePitcherStat(name, pos));
    }
    return store.get(name)!;
  };

  const markPitcher = (side: 'home' | 'away', name: string) => {
    const roster = side === 'home' ? rosterHome : rosterAway;
    const entry = ensureRosterEntry(side, name);
    if (entry.pos?.toUpperCase() !== 'P') {
      roster.set(name, { ...entry, pos: 'P' });
    }
  };

  // Feed is already in chronological order (oldest → newest) per pushFeed implementation
  const chronological = record.feed;
  const currentPitcher: Record<'home' | 'away', string | null> = { home: null, away: null };
  const bases: (string | null)[] = [null, null, null];
  const runnerResponsibility = new Map<string, string | null>();
  const structuredRunnerIndex = createStructuredRunnerIndex(record.events);
  const scoringEvents = createScoringEventLookup(record.events);
  const seededStructuredEvents = new Set<string>();
  const appliedCompositeEvents = new Set<string>();
  let lastHalfKey: string | null = null;
  let currentHalfOuts = 0;

  const resetHalfState = () => {
    bases[0] = null;
    bases[1] = null;
    bases[2] = null;
    runnerResponsibility.clear();
    currentHalfOuts = 0;
  };

  const syncHalfState = (inning: number, half: Half) => {
    const key = `${inning}-${half}`;
    if (key !== lastHalfKey) {
      resetHalfState();
      lastHalfKey = key;
    }
  };

  const extractRunnerName = (summary: string, options?: { includeNonScoring?: boolean }) => {
    const includeNonScoring = options?.includeNonScoring === true;
    if (!includeNonScoring && !summary.includes('득점')) return null;
    if (includeNonScoring && !summary.includes('주자') && !summary.includes('득점')) return null;
    const parts = summary.split('·').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts[parts.length - 1];
    }
    const match = summary.match(/(.+?)\s*득점/);
    return match ? match[1].trim() : null;
  };

  const parseRunnerMove = (text: string) => {
    if (!text.includes('주자') || !text.includes('·')) return null;
    const runnerName = extractRunnerName(text, { includeNonScoring: true });
    if (!runnerName) return null;
    const baseMatch = text.match(/([123])루 주자/);
    const fromBase = baseMatch ? Number(baseMatch[1]) - 1 : null;
    const arrowMatch = text.match(/([123])루→(홈|[123])루?/);
    const toBase = arrowMatch ? (arrowMatch[2] === '홈' ? 'home' : Number(arrowMatch[2]) - 1) : null;
    const scored = text.includes('득점');
    const out = text.includes('아웃');
    const hold = text.includes('정지');
    const isErrorPlay = text.includes('실책');
    return { runnerName, fromBase, toBase, scored, out, hold, isErrorPlay };
  };

  const parseRunnerOutGroup = (text: string) => {
    if (!text.includes('아웃') || !text.includes('·')) return null;
    if (text.includes('주자')) return null;
    const outCountMatch = text.match(/(\d+)명\s*아웃/);
    const outCount = text.includes('더블아웃') ? 2 : outCountMatch ? Number(outCountMatch[1]) : 1;
    const namePartMatch = text.match(/·\s*(.+)\s+아웃/);
    const names: string[] = [];
    if (namePartMatch) {
      const list = namePartMatch[1].split(',').map((part) => part.trim()).filter(Boolean);
      list.forEach((item) => {
        const name = item.replace(/\s*[123]루\s*$/, '').trim();
        if (name) names.push(name);
      });
    }
    return { names, outCount, isErrorPlay: text.includes('실책') };
  };

  const creditRunForPitcher = (pitcherName: string | null, defenseSide: 'home' | 'away', earned = true) => {
    if (!pitcherName) return;
    const stat = addPitch(defenseSide, pitcherName);
    stat.r += 1;
    if (earned) stat.er += 1;
  };

  const creditRunForRunner = (runnerName: string, defenseSide: 'home' | 'away', earned = true) => {
    const responsible = runnerResponsibility.has(runnerName) ? runnerResponsibility.get(runnerName) : currentPitcher[defenseSide];
    creditRunForPitcher(responsible ?? null, defenseSide, earned);
    runnerResponsibility.delete(runnerName);
  };

  const assignRunnerResponsibility = (runnerName: string, defenseSide: 'home' | 'away') => {
    const pitcherName = currentPitcher[defenseSide];
    if (!runnerName || !pitcherName) return;
    runnerResponsibility.set(runnerName, pitcherName);
  };

  const placeRunnerOnBase = (runnerName: string, targetBase: number) => {
    let dest = targetBase;
    while (dest < 3 && bases[dest]) {
      dest += 1;
    }
    if (dest >= 3) {
      return { scored: true };
    }
    bases[dest] = runnerName;
    return { scored: false };
  };

  const applyWalkAdvance = (batterName: string) => {
    let scoredRunner: string | null = null;
    if (bases[0]) {
      if (bases[1] && bases[2]) {
        scoredRunner = bases[2];
        bases[2] = null;
      }
      if (bases[1]) {
        bases[2] = bases[1];
        bases[1] = null;
      }
      bases[1] = bases[0];
      bases[0] = null;
    }
    bases[0] = batterName;
    return scoredRunner;
  };

  const getActivePitcher = (defenseSide: 'home' | 'away') => {
    const pitcherName = currentPitcher[defenseSide];
    const roster = defenseSide === 'home' ? rosterHome : rosterAway;
    const hasValid =
      pitcherName &&
      roster.has(pitcherName) &&
      roster.get(pitcherName)?.pos?.toUpperCase() === 'P';
    if (hasValid) return pitcherName;
    for (const [pName, info] of roster.entries()) {
      if (info.pos && info.pos.toUpperCase() === 'P') {
        currentPitcher[defenseSide] = pName;
        return pName;
      }
    }
    return pitcherName ?? null;
  };
  
  // [수정됨] 이름 파싱 로직 변경: 괄호() 안의 내용(등번호 포함)을 유지해야 함
  // 기존: raw.replace(/\([^)]*\)/g, '') -> 괄호 전체 삭제
  // 변경: 등번호가 있는 uniqueName 형태 '홍길동(18)'를 유지하기 위해 괄호 삭제 정규식 제거
  // 대신 '투수', '·' 같은 불필요한 텍스트만 제거
  const cleanName = (raw: string) => raw.replace(/투수/g, '').replace(/·/g, '').trim();

  // [추가] 투수 이름이 로스터의 uniqueName과 일치하지 않을 때(예: "홍길동" vs "홍길동(18)") 찾아주는 헬퍼
  const resolvePitcherName = (rawName: string, side: 'home' | 'away' | null) => {
    const checkSides = side ? [side] : ['home', 'away'];
    for (const s of checkSides as ('home' | 'away')[]) {
        const roster = s === 'home' ? rosterHome : rosterAway;
        if (roster.has(rawName)) return rawName;
        // 이름 뒤에 (등번호)가 붙은 키가 있는지 확인
        for (const key of roster.keys()) {
            if (key.startsWith(rawName + '(')) return key;
        }
    }
    return rawName;
  };

  const inferPlayerSide = (name: string): 'home' | 'away' | null => {
    if (rosterHome.has(name) || benchMetaHome.has(name) || removedMetaHome.has(name)) return 'home';
    if (rosterAway.has(name) || benchMetaAway.has(name) || removedMetaAway.has(name)) return 'away';
    // 로스터 키 매칭 시도
    for (const key of rosterHome.keys()) if (key.startsWith(name + '(')) return 'home';
    for (const key of rosterAway.keys()) if (key.startsWith(name + '(')) return 'away';
    return null;
  };

  const resolveBatterName = (rawName: string, side: 'home' | 'away', orderNum?: number | null) => {
    let name = rawName.trim();
    if (!name) return name;
    const roster = side === 'home' ? rosterHome : rosterAway;
    if (!roster.has(name)) {
      if (orderNum) {
        const candidates = battingOrders[side].get(orderNum);
        const match = candidates?.find((uName) => uName.startsWith(`${name}(`) || uName === name);
        if (match) name = match;
      }
      if (!roster.has(name)) {
        const base = name.replace(/\([^)]*\)/g, '').trim();
        if (base && roster.has(base)) {
          name = base;
        } else {
          for (const key of roster.keys()) {
            if (key.startsWith(`${name}(`) || (base && key.startsWith(`${base}(`))) {
              name = key;
              break;
            }
          }
        }
      }
    }
    return name;
  };

  const parseSubstitutionLog = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return null;
    if (!/교체|대타|대주자|대수비/.test(normalized)) return null;
    if (normalized.startsWith('포지션 교체')) return null;
    if (!normalized.includes('→') || !normalized.includes('·')) return null;
    const [left, right] = normalized.split('→');
    if (!right) return null;
    const outgoingPart = left.split('·').pop();
    if (!outgoingPart) return null;
    const outgoing = cleanName(outgoingPart);
    const incoming = cleanName(right);
    if (!outgoing || !incoming) return null;
    let kind: 'defense' | 'pinch_hit' | 'pinch_run' | 'pitcher' | 'batter' | 'unknown' = 'unknown';
    if (normalized.includes('대수비')) kind = 'defense';
    else if (normalized.includes('대타')) kind = 'pinch_hit';
    else if (normalized.includes('대주자')) kind = 'pinch_run';
    else if (normalized.includes('투수 교체')) kind = 'pitcher';
    else if (normalized.includes('타자 교체')) kind = 'batter';
    return { outgoing, incoming, kind };
  };

  const resolvePlayerName = (raw: string, side?: 'home' | 'away' | null, orderNum?: number | null) => {
    if (!raw) return raw;
    if (side) return resolveBatterName(raw, side, orderNum);
    const resolvedHome = resolveBatterName(raw, 'home', orderNum);
    if (rosterHome.has(resolvedHome) || benchMetaHome.has(resolvedHome) || removedMetaHome.has(resolvedHome)) return resolvedHome;
    const resolvedAway = resolveBatterName(raw, 'away', orderNum);
    return resolvedAway;
  };

  const firstOffenseIndex: Record<'home' | 'away', number> = {
    home: Number.POSITIVE_INFINITY,
    away: Number.POSITIVE_INFINITY,
  };
  const firstPlateIndex: Record<'home' | 'away', Map<string, number>> = {
    home: new Map(),
    away: new Map(),
  };
  const substitutionOutIndex: Record<'home' | 'away', Map<string, number>> = {
    home: new Map(),
    away: new Map(),
  };
  const substitutionInIndex: Record<'home' | 'away', Map<string, number>> = {
    home: new Map(),
    away: new Map(),
  };

  const findOrderForPlayer = (side: 'home' | 'away', name: string) => {
    for (const [order, list] of battingOrders[side]) {
      if (list.includes(name)) return order;
    }
    return null;
  };

  const addToOrderList = (side: 'home' | 'away', order: number, name: string) => {
    const list = battingOrders[side].get(order) ?? [];
    if (!list.includes(name)) {
      list.push(name);
      battingOrders[side].set(order, list);
    }
  };

  chronological.forEach((entry, idx) => {
    if (entry.batter && entry.order > 0) {
      const side: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
      if (idx < firstOffenseIndex[side]) firstOffenseIndex[side] = idx;
      const resolved = resolveBatterName(entry.batter, side, entry.order);
      if (!firstPlateIndex[side].has(resolved)) {
        firstPlateIndex[side].set(resolved, idx);
      }
    }

    const substitution = parseSubstitutionLog(entry.result ?? '');
    if (!substitution) return;
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const fallbackSide = substitution.kind === 'defense' || substitution.kind === 'pitcher' ? defenseSide : offenseSide;

    const outgoingResolved = resolvePlayerName(substitution.outgoing, null, entry.order ?? null);
    const incomingResolved = resolvePlayerName(substitution.incoming, null, entry.order ?? null);
    const outgoingSide = inferPlayerSide(outgoingResolved) ?? fallbackSide;
    const incomingSide = inferPlayerSide(incomingResolved) ?? outgoingSide;

    if (!substitutionOutIndex[outgoingSide].has(outgoingResolved)) {
      substitutionOutIndex[outgoingSide].set(outgoingResolved, idx);
    }
    if (!substitutionInIndex[incomingSide].has(incomingResolved)) {
      substitutionInIndex[incomingSide].set(incomingResolved, idx);
    }

    const resolvedOrder = findOrderForPlayer(outgoingSide, outgoingResolved)
      ?? (typeof entry.order === 'number' && entry.order > 0 ? entry.order : null);
    if (resolvedOrder) {
      addToOrderList(incomingSide, resolvedOrder, incomingResolved);
    }
  });

  const dnpPlayers: Record<'home' | 'away', Set<string>> = {
    home: new Set(),
    away: new Set(),
  };
  (['home', 'away'] as const).forEach((side) => {
    const defenseStartIndex = side === 'home' ? firstOffenseIndex.away : firstOffenseIndex.home;
    substitutionOutIndex[side].forEach((subIdx, name) => {
      if (substitutionInIndex[side].has(name)) return;
      const firstPa = firstPlateIndex[side].get(name);
      const battedBefore = firstPa !== undefined && firstPa < subIdx;
      const defendedBefore = defenseStartIndex < subIdx;
      if (!battedBefore && !defendedBefore) {
        dnpPlayers[side].add(name);
      }
    });

    const removedList = record.removed?.[side] ?? [];
    removedList.forEach((player) => {
      const name = getUniqueName(player.name, player.number);
      if (dnpPlayers[side].has(name)) return;
      if (substitutionInIndex[side].has(name)) return;
      if (firstPlateIndex[side].has(name)) return;
      if (substitutionOutIndex[side].has(name)) return;
      if (Number.isFinite(firstOffenseIndex[side])) {
        dnpPlayers[side].add(name);
      }
    });
  });

  // [수정] 투수 등판 순서 문제 해결을 위해 두 패스로 분리
  // 첫 번째 패스: 투수 관련 로그만 먼저 처리하여 등판 순서 확립
  chronological.forEach((entry) => {
    if (scoringEvents.get(entry)?.compositePlay) return;
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();

    // result 문자열에는 이제 "홍길동(18)" 형태가 들어올 것임
    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        let cleaned = cleanName(incoming);
        const inferred = inferPlayerSide(cleaned) ?? defenseSide;
        cleaned = resolvePitcherName(cleaned, inferred);

        currentPitcher[inferred] = cleaned;
        addPitch(inferred, cleaned);
        markPitcher(inferred, cleaned);
      }
    } else if (result.includes('투수 (선발)') || result.includes('투수 (') && result.includes('차 계투)')) {
      // 자동 생성된 투수 등판 항목: "홍길동(18) 투수 (선발)" 또는 "홍길동(18) 투수 (1차 계투)"
      let cleaned = cleanName(result.split('투수')[0]);
      const inferred = inferPlayerSide(cleaned) ?? defenseSide;
      cleaned = resolvePitcherName(cleaned, inferred);

      currentPitcher[inferred] = cleaned;
      addPitch(inferred, cleaned);
      markPitcher(inferred, cleaned);
    }
  });

  // 두 번째 패스: 타석 결과 처리 (투수 등판 순서가 이미 확립된 상태)
  // currentPitcher 초기화하여 피드 순서대로 다시 추적
  currentPitcher.home = null;
  currentPitcher.away = null;

  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();
    const orderNum = typeof entry.order === 'number' && entry.order > 0 ? entry.order : null;

    syncHalfState(entry.inning, entry.half);

    const compositeEvent = scoringEvents.get(entry);
    if (compositeEvent?.compositePlay || compositeEvent?.type === 'composite') {
      const composite = !compositeEvent.manualResolve?.required && normalizeCompositePlay(compositeEvent.compositePlay);
      if (composite && !appliedCompositeEvents.has(composite.input.id)) {
        appliedCompositeEvents.add(composite.input.id);
        applyCompositeProjection(composite, {
          batter: id => addStat(offenseSide, resolveBatterName(id, offenseSide)),
          pitcher: id => addPitch(defenseSide, resolvePitcherName(id, defenseSide)),
        });
        currentPitcher[defenseSide] = resolvePitcherName(composite.input.expected.pitcherId, defenseSide);
        currentHalfOuts = composite.input.expected.outs + composite.outsAdded;
        runnerResponsibility.clear();
        composite.after.bases.forEach((runner, i) => {
          bases[i] = runner ? resolveBatterName(runner, offenseSide) : null;
          if (runner) {
            const owner = composite.after.runnerResponsiblePitcher[i as 0 | 1 | 2];
            runnerResponsibility.set(bases[i]!, owner ? resolvePitcherName(owner, defenseSide) : null);
          }
        });
      }
      return;
    }

    // 투수 관련 로그에서 currentPitcher 업데이트 (등판 순서는 첫 번째 패스에서 이미 처리됨)
    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        let cleaned = cleanName(incoming);
        const inferred = inferPlayerSide(cleaned) ?? defenseSide;
        cleaned = resolvePitcherName(cleaned, inferred);
        currentPitcher[inferred] = cleaned;
        markPitcher(inferred, cleaned);
      }
    } else if (result.includes('투수 (선발)') || result.includes('투수 (') && result.includes('차 계투)')) {
      let cleaned = cleanName(result.split('투수')[0]);
      const inferred = inferPlayerSide(cleaned) ?? defenseSide;
      cleaned = resolvePitcherName(cleaned, inferred);
      currentPitcher[inferred] = cleaned;
      markPitcher(inferred, cleaned);
    }

    const structuredPlay = structuredRunnerIndex.get(entry);
    const structuredKey = JSON.stringify([entry.inning, entry.half, entry.eventId]);
    if (structuredPlay && !seededStructuredEvents.has(structuredKey)) {
      seededStructuredEvents.add(structuredKey);
      structuredPlay.input.expected.bases.forEach((runner, index) => {
        if (!runner) return;
        const owner = structuredPlay.input.expected.runnerResponsiblePitcher[index as 0 | 1 | 2];
        runnerResponsibility.set(resolveBatterName(runner, offenseSide), owner ? resolvePitcherName(owner, defenseSide) : null);
      });
    }
    let name = entry.batter?.trim();
    if (!name) {
      const runnerMove = parseRunnerMove(result);
      if (runnerMove) {
        const structured = structuredRunnerIndex.takeMovement(entry, runnerMove.runnerName);
        if (structured?.duplicate) return;
        const move = structured?.move;
        const { runnerName, fromBase, toBase, scored, out, hold, isErrorPlay } = move ? {
          ...runnerMove, runnerName: move.runnerId, fromBase: move.from,
          toBase: move.to === 'out' ? null : move.to, scored: move.runCounted,
          out: move.to === 'out', hold: move.to === move.from,
        } : runnerMove;
        const resolvedRunner = resolveBatterName(runnerName, offenseSide);
        let currentIndex = -1;
        if (fromBase != null && bases[fromBase] === resolvedRunner) {
          currentIndex = fromBase;
        } else {
          currentIndex = bases.findIndex((runner) => runner === resolvedRunner);
        }

        if (scored) {
          if (currentIndex >= 0) bases[currentIndex] = null;
          if (move) {
            const owner = move.responsiblePitcherId;
            creditRunForPitcher(owner ? resolvePitcherName(owner, defenseSide) : null, defenseSide, !isErrorPlay);
            runnerResponsibility.delete(resolvedRunner);
          } else creditRunForRunner(resolvedRunner, defenseSide, !isErrorPlay);
        } else if (out) {
          if (currentIndex >= 0) bases[currentIndex] = null;
          runnerResponsibility.delete(resolvedRunner);
          currentHalfOuts += 1;
          const pitcherName = getActivePitcher(defenseSide);
          if (pitcherName) {
            addPitch(defenseSide, pitcherName).outs += 1;
          }
        } else if (toBase === 'home') {
          if (currentIndex >= 0) bases[currentIndex] = null;
          runnerResponsibility.delete(resolvedRunner);
        } else if (typeof toBase === 'number') {
          if (currentIndex >= 0) bases[currentIndex] = null;
          bases[toBase] = resolvedRunner;
        } else if (hold && currentIndex === -1 && fromBase != null) {
          bases[fromBase] = resolvedRunner;
        }
      } else {
        const groupOut = parseRunnerOutGroup(result);
        if (groupOut) {
          const outsToAdd = Math.max(groupOut.outCount, groupOut.names.length || 0);
          const pitcherName = getActivePitcher(defenseSide);
          if (outsToAdd > 0) {
            currentHalfOuts += outsToAdd;
            if (pitcherName) {
              addPitch(defenseSide, pitcherName).outs += outsToAdd;
            }
          }
          groupOut.names.forEach((raw) => {
            const resolvedRunner = resolveBatterName(raw, offenseSide);
            const idx = bases.findIndex((runner) => runner === resolvedRunner);
            if (idx >= 0) bases[idx] = null;
            runnerResponsibility.delete(resolvedRunner);
          });
        }
      }

      if (result.includes('종료') && currentHalfOuts < 3) {
        const missing = 3 - currentHalfOuts;
        const pitcherName = getActivePitcher(defenseSide);
        if (pitcherName) {
          addPitch(defenseSide, pitcherName).outs += missing;
        }
        currentHalfOuts = 3;
      }
      return;
    }
    const side = offenseSide;
    
    const roster = side === 'home' ? rosterHome : rosterAway;

    // 만약 roster에 해당 이름(예: "홍길동")이 없다면, "홍길동(18)" 같은 키를 찾아서 매핑
    if (!roster.has(name)) {
      // 1. 타순(Order) 정보가 있다면 우선적으로 확인
      if (orderNum) {
        const candidates = battingOrders[side].get(orderNum);
        // 후보군 중 이름이 일치하는(시작하는) 선수 찾기
        const match = candidates?.find(uName => uName.startsWith(`${name}(`) || uName === name);
        if (match) name = match;
      }

      // 2. 타순으로 못 찾았다면, 로스터 전체에서 이름으로 검색 (동명이인이 없을 경우 유효)
      if (!roster.has(name)) {
         for (const key of roster.keys()) {
           if (key.startsWith(`${name}(`)) {
             name = key;
             break;
           }
         }
      }
    }
    
    ensureRosterEntry(side, name);
    if (orderNum) {
      const list = battingOrders[side].get(orderNum) ?? [];
      if (!list.includes(name)) {
        list.push(name);
      }
      battingOrders[side].set(orderNum, list);
    }

    const pitchSide = side === 'home' ? 'away' : 'home';
    
    // [수정됨] 투수 기록 집계 안전장치 추가
    // 1. 피드에서 투수 이름을 찾음
    let pitcherName = currentPitcher[pitchSide];
    const pitchRoster = pitchSide === 'home' ? rosterHome : rosterAway;
    const hasValidPitcher =
      pitcherName &&
      pitchRoster.has(pitcherName) &&
      pitchRoster.get(pitcherName)?.pos?.toUpperCase() === 'P';

    // 2. 피드에 투수 정보가 없거나(또는 라인업 변경으로 유효하지 않으면) 현재 로스터에서 'P' 포지션인 선수를 찾음
    if (!hasValidPitcher) {
      // 로스터 맵을 순회하며 포지션이 P인 선수 찾기
      for (const [pName, info] of pitchRoster.entries()) {
        if (!pName || !pName.trim()) continue;
        if (info.pos && info.pos.toUpperCase() === 'P') {
          pitcherName = pName;
          // 피드 처리의 일관성을 위해 currentPitcher 캐시에도 저장
          currentPitcher[pitchSide] = pName;
          break;
        }
      }
    }
    const pitcherStat = pitcherName ? addPitch(pitchSide, pitcherName) : null;
    const pitchInfo = recordedMiscPitch(scoringEvents.get(entry)) ?? classifyPitch(result);
    if (pitcherStat && pitchInfo.pitch) {
      pitcherStat.pitches += 1;
      if (pitchInfo.strike) pitcherStat.strikes += 1;
      if (pitchInfo.ball) pitcherStat.balls += 1;
    }
    const kind = classifyRecordedPlateAppearance(result, scoringEvents.get(entry));
    if (!kind) return;
    const stat = addStat(side, name);
    switch (kind) {
      case 'single':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.singles += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'double':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.doubles += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'triple':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.triples += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'hr':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.hr += 1;
        stat.r += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
          pitcherStat.hr += 1;
        }
        break;
      case 'bb':
        stat.pa += 1;
        stat.bb += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.bb += 1;
        }
        break;
      case 'ci':
        stat.pa += 1;
        stat.ci += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
        }
        break;
      case 'fc':
        stat.pa += 1;
        stat.ab += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
        }
        break;
      case 'error':
        stat.pa += 1;
        stat.ab += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
        }
        break;
      case 'hbp':
        stat.pa += 1;
        stat.hbp += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.hbp += 1;
        }
        break;
      case 'so':
        stat.pa += 1;
        stat.ab += 1;
        stat.so += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
          pitcherStat.so += 1;
        }
        currentHalfOuts += 1;
        break;
      case 'so_reach':
        stat.pa += 1;
        stat.ab += 1;
        stat.so += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.so += 1;
        }
        break;
      case 'out':
        stat.pa += 1;
        stat.ab += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        currentHalfOuts += 1;
        break;
      case 'sac':
        stat.pa += 1;
        stat.sac += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        currentHalfOuts += 1;
        break;
      default:
        break;
    }

    if (kind === 'hr') {
      const owner = structuredPlay?.input.batterHit?.responsiblePitcherId;
      creditRunForPitcher(structuredPlay?.input.batterHit ? (owner ? resolvePitcherName(owner, pitchSide) : null) : pitcherName ?? null, pitchSide, true);
      return;
    }

    if (kind === 'bb' || kind === 'hbp' || kind === 'ci') {
      const scoredRunner = applyWalkAdvance(name);
      assignRunnerResponsibility(name, pitchSide);
      if (scoredRunner) {
        creditRunForRunner(scoredRunner, pitchSide, true);
      }
      return;
    }

    if (kind === 'single' || kind === 'double' || kind === 'triple' || kind === 'fc' || kind === 'so_reach' || kind === 'error') {
      const targetBase = kind === 'double' ? 1 : kind === 'triple' ? 2 : 0;
      const placed = placeRunnerOnBase(name, targetBase);
      if (placed.scored) {
        creditRunForPitcher(pitcherName ?? null, pitchSide, true);
      } else {
        const hit = structuredPlay?.input.batterHit;
        if (hit) runnerResponsibility.set(name, hit.responsiblePitcherId ? resolvePitcherName(hit.responsiblePitcherId, pitchSide) : null);
        else assignRunnerResponsibility(name, pitchSide);
      }
    }
  });

  record.events.forEach((event) => {
    if (event.compositePlay || event.type === 'composite') return;
    const offenseSide: 'home' | 'away' = event.half === 'top' ? 'away' : 'home';
    if (event.batter && typeof event.rbi === 'number' && event.rbi > 0) {
      const batterName = resolveBatterName(event.batter, offenseSide, event.order ?? null);
      const stat = addStat(offenseSide, batterName);
      stat.rbi += event.rbi;
    }
    if (Array.isArray(event.runners)) {
      event.runners.forEach((runnerSummary) => {
        const rawRunner = extractRunnerName(runnerSummary);
        if (!rawRunner) return;
        const runnerName = resolveBatterName(rawRunner, offenseSide);
        const stat = addStat(offenseSide, runnerName);
        stat.r += 1;
      });
    }
  });

  const toArray = (
    side: 'home' | 'away',
    roster: Map<string, { pos?: string; order: number; substitutionType?: '대수비' | '대타' | '대주자'; isElite?: boolean }>,
    store: Map<string, PlayerStat>
  ) => {
    const rows: (PlayerStat & { isElite?: boolean })[] = [];
    const orderMap = battingOrders[side];
    const orderKeys = [...orderMap.keys()].sort((a, b) => a - b);
    orderKeys.forEach((order) => {
      const players = orderMap.get(order) ?? [];
      players.forEach((playerName, idx) => {
        if (dnpPlayers[side].has(playerName)) return;
        const meta = roster.get(playerName);
        const stat = store.get(playerName);
        const base = ensurePlayerStat(playerName, meta?.pos);
        const row = stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base;
        const slot = lineupByName[side].get(playerName);
        const isPitcher = normalizePos(slot?.pos ?? meta?.pos) === 'P';
        if (isPitcher && !pitcherCanBat(side, playerName) && (row.pa ?? 0) === 0) {
          return;
        }

        if (meta?.substitutionType) {
          // console.log(`[통계 생성] ${playerName}:`, {
          //   meta,
          //   hasSubstitutionType: !!meta.substitutionType,
          //   substitutionType: meta.substitutionType,
          // });
        }

        // 교체된 선수는 'out', 교체로 들어온 선수는 substitutionType을 status로 설정
        let status: 'out' | '대수비' | '대타' | '대주자' | undefined;
        if (idx < players.length - 1) {
          status = 'out';
        } else if (meta?.substitutionType) {
          status = meta.substitutionType;
          // console.log(`✓ ${playerName} - substitutionType: ${meta.substitutionType} -> status: ${status}`);
        }

        rows.push({ ...row, order, status, isElite: meta?.isElite });
      });
    });
    const remaining = [...store.values()].filter(
      (s) =>
        !rows.some((r) => r.name === s.name) &&
        ![...orderMap.values()].some((list) => list.includes(s.name))
    );
    remaining.forEach((stat) => {
      if (dnpPlayers[side].has(stat.name)) return;
      const meta = roster.get(stat.name);
      const slot = lineupByName[side].get(stat.name);
      const isPitcher = normalizePos(slot?.pos ?? meta?.pos) === 'P';
      if (isPitcher && !pitcherCanBat(side, stat.name) && (stat.pa ?? 0) === 0) {
        return;
      }
      rows.push({ ...stat, order: null, isElite: meta?.isElite });
    });
    return rows;
  };

  const toPitcherArray = (
    side: 'home' | 'away',
    roster: Map<string, { pos?: string; order: number; substitutionType?: '대수비' | '대타' | '대주자'; isElite?: boolean }>,
    store: Map<string, PitcherStatExt>,
    appearance: Map<string, number>
  ): PitcherStatLine[] => {
    const names = new Set<string>();
    roster.forEach((meta, name) => {
      if ((meta.pos ?? '').toUpperCase() === 'P') names.add(name);
    });
    store.forEach((_stat, name) => names.add(name));

    const combined: PitcherStatLine[] = [...names]
      .filter((name) => !dnpPlayers[side].has(name))
      .map((name) => {
      const meta = roster.get(name);
      const base = ensurePitcherStat(name, meta?.pos);
      const stat = store.get(name);
      const appearanceOrder = appearance.get(name);

      // 투수의 경우 대수비만 해당 (교체로 들어온 투수)
      const status: 'out' | '대수비' | undefined = meta?.substitutionType === '대수비' ? '대수비' : undefined;

      return {
        ...(stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base),
        appearanceOrder,
        appearanceLabel:
          appearanceOrder === 0
            ? '선발'
            : Number.isFinite(appearanceOrder)
              ? `계투(${appearanceOrder})`
              : undefined,
        status,
        isElite: meta?.isElite,
      };
    });

    const norm = (n: number | null | undefined) => (Number.isFinite(n) ? (n as number) : Number.MAX_SAFE_INTEGER);
    combined.sort((a, b) => norm(a.appearanceOrder) - norm(b.appearanceOrder) || a.name.localeCompare(b.name, 'ko-KR'));
    return combined;
  };

  return {
    hitters: {
      home: toArray('home', rosterHome, statsHome),
      away: toArray('away', rosterAway, statsAway),
    },
    pitchers: {
      home: toPitcherArray('home', rosterHome, pitchHome, pitcherAppearance.home),
      away: toPitcherArray('away', rosterAway, pitchAway, pitcherAppearance.away),
    },
  };
}


function buildPostGameSummary(
  hitters: { home: BatterStatLine[]; away: BatterStatLine[] },
  pitchers: { home: PitcherStatLine[]; away: PitcherStatLine[] },
  score: { home: number; away: number },
): PostGameSummary {
  const sum = (list: BatterStatLine[], key: keyof BatterStatLine) => list.reduce((acc, cur) => acc + ((cur[key] as number) || 0), 0);
  const totals = {
    home: { runs: score.home, hits: sum(hitters.home, 'h'), bb: sum(hitters.home, 'bb'), so: sum(hitters.home, 'so') },
    away: { runs: score.away, hits: sum(hitters.away, 'h'), bb: sum(hitters.away, 'bb'), so: sum(hitters.away, 'so') },
  };
  const rankHitters = (side: 'home' | 'away') =>
    [...hitters[side]]
      .filter((h) => h.pa > 0)
      .sort((a, b) => b.h - a.h || b.bb - a.bb || b.pa - a.pa || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((h) => ({ side, name: h.name, h: h.h, hr: h.hr, bb: h.bb }));
  const rankPitchers = (side: 'home' | 'away') =>
    [...pitchers[side]]
      .filter((p) => p.bf > 0 || p.outs > 0)
      .sort((a, b) => b.so - a.so || b.outs - a.outs || a.h - b.h || a.name.localeCompare(b.name))
      .slice(0, 2)
      .map((p) => ({ side, name: p.name, so: p.so, outs: p.outs, h: p.h, bb: p.bb }));

  return {
    totals,
    topHitters: [...rankHitters('home'), ...rankHitters('away')],
    topPitchers: [...rankPitchers('home'), ...rankPitchers('away')],
  };
}


// ---------- Post-game detail UI (add near file bottom) -------------------

type PostGameDetailData = NonNullable<MatchSchedule['postGame']>;

function PostGameDetailSection({
  detail,
  teams,
  actionSlot,
}: {
  detail: PostGameDetailData;
  teams: { home: string; away: string };
  actionSlot?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 12, overflow: 'auto', paddingRight: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontWeight: 900, fontSize: 18 }}>경기 종료 · 상세 기록</span>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>문자중계 대신 박스스코어를 표시합니다.</span>
        </div>
        {detail.note || actionSlot ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {detail.note && <span style={{ color: '#94a3b8', fontSize: 12 }}>{detail.note}</span>}
            {actionSlot}
          </div>
        ) : null}
      </div>

      <LineScoreTable teams={teams} lineScore={detail.lineScore} totals={detail.totals} />

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <TeamTotalsCard title={`${teams.home} 타격 요약`} totals={detail.teamBatterSummary?.home} color="#f97316" />
        <TeamTotalsCard title={`${teams.away} 타격 요약`} totals={detail.teamBatterSummary?.away} color="#60a5fa" />
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <PitchingTable title={`${teams.home} 투수`} color="#f97316" pitchers={detail.pitchers?.home ?? []} />
        <PitchingTable title={`${teams.away} 투수`} color="#60a5fa" pitchers={detail.pitchers?.away ?? []} />
      </div>
    </div>
  );
}

function LineScoreTable({
  teams,
  lineScore,
  totals,
}: {
  teams: { home: string; away: string };
  lineScore: { innings: number[]; home: number[]; away: number[] };
  totals: { home: { runs: number; hits: number; errors: number; lob?: number }; away: { runs: number; hits: number; errors: number; lob?: number } };
}) {
  type LineScoreCell = { text: string; bold?: boolean; color?: string };
  const makeCell = (text: string, opts: Partial<LineScoreCell> = {}): LineScoreCell => ({ text, ...opts });

  const header: LineScoreCell[] = ['팀', ...lineScore.innings, 'R', 'H', 'E', 'LOB'].map((h) => makeCell(String(h), { bold: true }));
  const row = (label: string, scores: number[], t: { runs: number; hits: number; errors: number; lob?: number }, color: string): LineScoreCell[] => [
    makeCell(label, { bold: true, color }),
    ...scores.map((n) => makeCell(String(n))),
    makeCell(String(t.runs), { bold: true }),
    makeCell(String(t.hits)),
    makeCell(String(t.errors)),
    makeCell(t.lob != null ? String(t.lob) : '-'),
  ];
  const rows: LineScoreCell[][] = [
    row(teams.home, lineScore.home, totals.home, '#f97316'),
    row(teams.away, lineScore.away, totals.away, '#60a5fa'),
  ];
  return (
    <div style={{ border: '1px solid rgba(148,163,184,0.25)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`, background: 'rgba(255,255,255,0.04)' }}>
        {header.map((h, idx) => (
          <div key={`${h.text}-${idx}`} style={{ padding: '8px', textAlign: 'center', fontWeight: 800, color: '#e2e8f0', fontSize: 12 }}>
            {h.text}
          </div>
        ))}
      </div>
      {rows.map((r, idx) => (
        <div
          key={idx}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))`,
            borderTop: '1px solid rgba(148,163,184,0.2)',
          }}
        >
          {r.map((cell, ci) => (
            <div
              key={ci}
              style={{
                padding: '8px',
                textAlign: 'center',
                color: cell.color ?? '#cbd5e1',
                fontWeight: cell.bold ? 800 : 700,
                fontSize: 12,
              }}
            >
              {cell.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TeamTotalsCard({
  title,
  totals,
  color,
}: {
  title: string;
  totals?: { ab?: number; h?: number; rbi?: number; r?: number; sb?: number };
  color: string;
}) {
  const items = [
    { label: '타수', value: totals?.ab },
    { label: '안타', value: totals?.h },
    { label: '득점', value: totals?.r },
    { label: '타점', value: totals?.rbi },
    { label: '도루', value: totals?.sb },
  ].filter((i) => i.value != null);
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: 12,
        background: 'rgba(255,255,255,0.02)',
        display: 'grid',
        gap: 6,
      }}
    >
      <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
      {items.length ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.map((item) => (
            <span
              key={item.label}
              style={{
                padding: '6px 10px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${color}55`,
                color,
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : (
        <span style={{ color: '#94a3b8', fontSize: 12 }}>요약 정보가 없습니다.</span>
      )}
    </div>
  );
}

function PitchingTable({
  title,
  pitchers,
  color,
}: {
  title: string;
  pitchers: {
    name: string;
    ip?: number;
    bf?: number;
    ab?: number;
    h?: number;
    hr?: number;
    bb?: number;
    hbp?: number;
    so?: number;
    r?: number;
    er?: number;
    earnedRunsStatus?: PostGamePitcherLine['earnedRunsStatus'];
    pitches?: number;
  }[];
  color: string;
}) {
  const header = ['투수', 'IP', 'BF', 'H', 'HR', 'BB', 'HBP', 'SO', 'R', 'ER', 'NP'];
  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.25)',
        borderRadius: 12,
        padding: 10,
        background: 'rgba(255,255,255,0.02)',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{title}</span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{pitchers.length}명</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${header.length}, minmax(60px, 1fr))`, gap: 4 }}>
        {header.map((h) => (
          <div key={h} style={{ padding: '6px', textAlign: 'center', fontWeight: 800, fontSize: 12, color: '#cbd5e1' }}>
            {h}
          </div>
        ))}
        {pitchers.map((p) =>
          [p.name, p.ip, p.bf, p.h, p.hr, p.bb, p.hbp, p.so, p.r, earnedRunsView(p.er, 0, p.earnedRunsStatus).er, p.pitches].map((v, idx) => (
            <div
              key={`${p.name}-${idx}`}
              style={{
                padding: '6px',
                textAlign: 'center',
                fontWeight: idx === 0 ? 800 : 700,
                color: idx === 0 ? color : '#e2e8f0',
                fontSize: 12,
              }}
            >
              {v != null ? v : '-'}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
// --------------------------------------------------------------------------------------
// [추가] CSV 다운로드 및 생성 관련 헬퍼 함수들 (ScorekeeperPage.tsx에서 이식)
// --------------------------------------------------------------------------------------

function downloadCsv(content: string, filenamePrefix: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDownloadName(prefix: string, endedAt?: string | null) {
  const stamp = (endedAt ? new Date(endedAt) : new Date()).toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}`;
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatDateTimeLabel(value: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

function defensePositionNumber(pos: string) {
  const normalized = pos.trim().toUpperCase();
  const map: Record<string, string> = {
    P: '1', C: '2', '1B': '3', '2B': '4', '3B': '5', SS: '6', 'S/S': '6',
    LF: '7', CF: '8', RF: '9', DH: 'D', D: 'D', PH: 'PH', PR: 'PR',
  };
  return map[normalized] || normalized || '-';
}

function formatBattedBallDetails(details?: BattedBallDetails | null) {
  if (!details) return '-';
  const parts = [details.type, details.zone].filter((part) => part && part !== '선택 안 함');
  return parts.length ? parts.join(' / ') : '-';
}

function formatRunnerNotes(runners: string[]) {
  if (!runners?.length) return '';
  const notes = runners
    .map((r) => {
      const withoutName = r.includes('·') ? r.split('·')[0] : r;
      return withoutName.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
  return notes.join(' | ');
}

function formatErrorSummary(error?: ErrorDetails | string | null) {
  if (!error) return '-';
  if (typeof error === 'string') return error;
  const details: string[] = [];
  const context = error.context?.trim();
  if (context) details.push(context);
  const batted = formatBattedBallDetails(error.battedBall);
  if (batted !== '-') details.push(`타구 ${batted}`);
  if (error.extraCalls?.length) {
    const calls = error.extraCalls
      .map((call) => {
        const callLabel = call.type === 'runner_obstruction' ? '주루 방해(수비)' : '주자 수비방해';
        const base = `${call.base + 1}루`;
        const outcome =
          call.outcome == null
            ? ''
            : `:${typeof call.outcome === 'number' ? (call.outcome >= 4 ? '홈(득점)' : `${call.outcome}루`) : formatRunnerOutcomeLabel(call.outcome)}`;
        return `${callLabel}(${base}${outcome})`;
      })
      .join(' / ');
    if (calls) details.push(calls);
  }
  return details.length
    ? `${error.errorType} · ${error.fielderPos} · ${details.join(' · ')}`
    : `${error.errorType} · ${error.fielderPos}`;
}

type ErrorSummaryField = 'fielderPos' | 'errorType' | 'context';

function formatErrorField(error: ErrorDetails | string | null | undefined, field: ErrorSummaryField) {
  if (!error || typeof error === 'string') return '-';
  return error[field] || '-';
}

function baseLabel(idx: number) {
  return idx === 0 ? '1루' : idx === 1 ? '2루' : idx === 2 ? '3루' : '홈';
}

function formatRunnerOutcomeLabel(outcome: RunnerAdvanceOutcome) {
  if (outcome === 'advance') return '진루';
  if (outcome === 'score') return '득점';
  if (outcome === 'out') return '아웃';
  if (typeof outcome === 'number') {
    return outcome >= 4 ? '홈(득점)' : `${outcome}루`;
  }
  return '유지';
}

function formatErrorAdvanceResults(error?: ErrorDetails | string | null) {
  if (!error || typeof error === 'string') return '-';
  const parts: string[] = [];
  if (error.advanceResults.batter === 'out') {
    parts.push('타자:아웃');
  } else if (error.advanceResults.batter === 'hold') {
    parts.push('타자:유지');
  } else {
    const batterBase = error.advanceResults.batter;
    if (typeof batterBase === 'number') {
      parts.push(`타자:${batterBase >= 4 ? '홈(득점)' : `${batterBase}루`}`);
    }
  }
  Object.entries(error.advanceResults.runners).forEach(([base, outcome]) => {
    if (!outcome) return;
    const label = `${baseLabel(Number(base))}:${formatRunnerOutcomeLabel(outcome)}`;
    parts.push(label);
  });
  return parts.length ? parts.join(' / ') : '-';
}

function stripBatterFromNote(note: string, batter?: string) {
  const cleaned = (note || '').replace(/\s+/g, ' ').trim();
  if (!batter) return cleaned;
  const escaped = batter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\s*·?\\s*${escaped}\\s*`, 'g');
  const removed = cleaned.replace(regex, '').trim();
  return removed || cleaned;
}

const classifyKboResult = (event: PlayEvent) => classifyKboResultCode(event);

function formatScorebookCell(event: PlayEvent) {
  const result = classifyKboResult(event);
  const batted = event.battedBall ? formatBattedBallDetails(event.battedBall) : '';
  const runnerNote = formatRunnerNotes(event.runners);
  const errorNote = formatErrorSummary(event.error);
  const baseNote = stripBatterFromNote(event.notes ?? '', event.batter);
  const parts = [result];
  if (batted && batted !== '-') parts.push(`타구:${batted}`);
  if (runnerNote) parts.push(`주루:${runnerNote}`);
  if (errorNote && errorNote !== '-') parts.push(`E:${errorNote}`);
  if (baseNote && !baseNote.replace(/\s+/g, '').includes(result.replace(/\s+/g, ''))) {
    parts.push(`비고:${baseNote}`);
  }
  return parts.filter(Boolean).join(' / ');
}

// [핵심] CSV 빌더 함수
function buildCsvRecord(
  record: ReturnType<typeof buildGameRecord>,
  options: { rebuildSelections?: Record<string, string> } = {},
) {
  const lines: string[] = [];
  const add = (...cells: (string | number | boolean | null | undefined)[]) => {
    lines.push(cells.map((cell) => escapeCsvCell(cell)).join(','));
  };
  const addBlank = () => lines.push('');
  const halfLabel = (half: 'top' | 'bottom') => (half === 'top' ? '초' : '말');
  const halfRank = (half: 'top' | 'bottom') => (half === 'top' ? 0 : 1);
  const sortChrono = (
    a: { inning: number; half: 'top' | 'bottom'; createdAt?: number; pitch: number; order: number },
    b: { inning: number; half: 'top' | 'bottom'; createdAt?: number; pitch: number; order: number },
  ) => {
    if (a.inning !== b.inning) return a.inning - b.inning;
    if (a.half !== b.half) return halfRank(a.half) - halfRank(b.half);
    if (a.createdAt !== undefined && b.createdAt !== undefined && a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    if (a.pitch !== b.pitch) return a.pitch - b.pitch;
    if (a.order !== b.order) return a.order - b.order;
    return 0;
  };
  const innings = Array.from({ length: 9 }, (_, idx) => idx + 1);
  const playerDirectory: Record<
    'home' | 'away',
    Map<string, { number: string; pos: string; posNumber: string; throws: string; bats: string }>
  > = {
    home: new Map(),
    away: new Map(),
  };

  const seedDirectory = (side: 'home' | 'away', slots: typeof record.lineups.home) => {
    slots.forEach((slot) => {
      if (!slot.name) return;
      const uniqueName = getUniqueName(slot.name, slot.number);
      playerDirectory[side].set(uniqueName, {
        number: slot.number || '-',
        pos: slot.pos || '-',
        posNumber: defensePositionNumber(slot.pos || '-'),
        throws: slot.throws || '-',
        bats: slot.bats || '-',
      });
    });
  };
  seedDirectory('home', record.lineups.home);
  seedDirectory('away', record.lineups.away);
  seedDirectory('home', record.benches.home);
  seedDirectory('away', record.benches.away);
  seedDirectory('home', record.removed.home);
  seedDirectory('away', record.removed.away);

  const getPlayerMeta = (side: 'home' | 'away', uniqueName: string) =>
    playerDirectory[side].get(uniqueName) ?? { number: '-', pos: '-', posNumber: '-', throws: '-', bats: '-' };

  add('게임 정보');
  add('항목', '값');
  add('홈 팀', record.meta.homeTeamName || record.meta.homeTeamId);
  add('원정 팀', record.meta.awayTeamName || record.meta.awayTeamId);
  add('최종 점수', `${record.meta.homeTeamName} ${record.score.home} - ${record.meta.awayTeamName} ${record.score.away}`);
  add('이닝', `${record.meta.inning}회 ${halfLabel(record.meta.half)}`);
  add('종료 여부', record.meta.gameOver ? '예' : '아니오');
  add('종료 시각', record.meta.endedAt ? formatDateTimeLabel(record.meta.endedAt) : '-');
  add('최종 볼카운트', `B${record.counts.balls} / S${record.counts.strikes} / O${record.counts.outs}`);
  add('기록원', record.meta.scorerName || record.meta.scorerEmail || record.meta.scorerUid || '-');
  add('기록원 이메일', record.meta.scorerEmail || '-');
  add('기록원 권한', record.meta.scorerRole || '-');
  add('기록 기준', '기록지 기입법 기준');
  add('주자 상황', record.bases.map((runner, idx) => `${idx + 1}루:${runner ?? '-'}`).join(' | '));

  const writeLineup = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`라인업 - ${label} (표준: 등번호·수비번호)`);
    add('타순', '등번호', '선수', '수비번호', '포지션', '투', '타');
    const batting = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    batting.forEach((slot, idx) => {
      const uniqueName = getUniqueName(slot.name, slot.number);
      const meta = getPlayerMeta(side, uniqueName);
      add(idx + 1, meta.number, slot.name, meta.posNumber, slot.pos, meta.throws, meta.bats);
    });
    const pitcher = record.lineups[side].find((slot) => slot.pos.toUpperCase() === 'P');
    if (pitcher) {
      const uniqueName = getUniqueName(pitcher.name, pitcher.number);
      const meta = getPlayerMeta(side, uniqueName);
      add('P', meta.number, pitcher.name, meta.posNumber, pitcher.pos, meta.throws, meta.bats);
    }
  };

  const writeBench = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`벤치 - ${label}`);
    add('등번호', '이름', '포지션', '수비번호', '투', '타');
    if (!record.benches[side].length) {
      add('-', '-', '-', '-', '-', '-');
      return;
    }
    record.benches[side].forEach((slot) => {
      const uniqueName = getUniqueName(slot.name, slot.number);
      const meta = getPlayerMeta(side, uniqueName);
      add(meta.number, slot.name, slot.pos, meta.posNumber, meta.throws, meta.bats);
    });
  };

  writeLineup('home', record.meta.homeTeamName);
  writeLineup('away', record.meta.awayTeamName);
  writeBench('home', record.meta.homeTeamName);
  writeBench('away', record.meta.awayTeamName);

  const stats = buildPlayerStats(record);
  const fmt3 = (val: number) => (Number.isFinite(val) ? val.toFixed(3).replace(/^0/, '') : '-');
  const orderByName: Record<'home' | 'away', Map<string, number>> = {
    home: new Map(),
    away: new Map(),
  };
  (['home', 'away'] as const).forEach((side) => {
    stats.hitters[side].forEach((h) => {
      if (h.order && h.order > 0) {
        orderByName[side].set(h.name, h.order);
      }
    });
  });
  const resolveEventOrder = (event: PlayEvent, side: 'home' | 'away') => {
    if (event.order && event.order > 0) return event.order;
    const name = (event.batter || '').trim();
    if (!name) return null;
    const map = orderByName[side];
    if (map.has(name)) return map.get(name)!;
    const base = name.replace(/\([^)]*\)/g, '').trim();
    if (base && map.has(base)) return map.get(base)!;
    for (const [key, val] of map.entries()) {
      if (key.startsWith(`${name}(`) || (base && key.startsWith(`${base}(`))) {
        return val;
      }
    }
    return null;
  };

  const resolveEventBatter = (event: PlayEvent, side: 'home' | 'away') => {
    const name = (event.batter || '').trim();
    if (!name) return null;
    const map = orderByName[side];
    if (map.has(name)) return name;
    const base = name.replace(/\([^)]*\)/g, '').trim();
    if (base && map.has(base)) return base;
    for (const key of map.keys()) {
      if (key.startsWith(`${name}(`) || (base && key.startsWith(`${base}(`))) {
        return key;
      }
    }
    return name || null;
  };

  const parseSubstitutionLog = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return null;
    if (!/교체|대타|대주자|대수비/.test(normalized)) return null;
    if (normalized.startsWith('포지션 교체')) return null;
    if (!normalized.includes('→') || !normalized.includes('·')) return null;
    const [left, right] = normalized.split('→');
    if (!right) return null;
    const outgoingPart = left.split('·').pop();
    if (!outgoingPart) return null;
    const outgoing = outgoingPart.trim();
    const incoming = right.trim();
    if (!outgoing || !incoming) return null;
    let kind: 'defense' | 'pinch_hit' | 'pinch_run' | 'pitcher' | 'batter' | 'unknown' = 'unknown';
    if (normalized.includes('대수비')) kind = 'defense';
    else if (normalized.includes('대타')) kind = 'pinch_hit';
    else if (normalized.includes('대주자')) kind = 'pinch_run';
    else if (normalized.includes('투수 교체')) kind = 'pitcher';
    else if (normalized.includes('타자 교체')) kind = 'batter';
    return { outgoing, incoming, kind };
  };

  const resolveNameKey = (raw: string, side: 'home' | 'away') => {
    const map = orderByName[side];
    if (map.has(raw)) return raw;
    const base = raw.replace(/\([^)]*\)/g, '').trim();
    if (base && map.has(base)) return base;
    for (const key of map.keys()) {
      if (key.startsWith(`${raw}(`) || (base && key.startsWith(`${base}(`))) {
        return key;
      }
    }
    return raw;
  };

  const substitutionNotesBySide: Record<'home' | 'away', Map<number, Map<string, Map<number, string[]>>>> = {
    home: new Map(),
    away: new Map(),
  };

  const addSubNote = (side: 'home' | 'away', order: number, nameKey: string, inning: number, note: string) => {
    const orderMap = substitutionNotesBySide[side].get(order) ?? new Map<string, Map<number, string[]>>();
    const nameMap = orderMap.get(nameKey) ?? new Map<number, string[]>();
    const notes = nameMap.get(inning) ?? [];
    notes.push(note);
    nameMap.set(inning, notes);
    orderMap.set(nameKey, nameMap);
    substitutionNotesBySide[side].set(order, orderMap);
  };

  record.feed.forEach((entry) => {
    const substitution = parseSubstitutionLog(entry.result ?? '');
    if (!substitution) return;
    if (!['defense', 'pinch_hit', 'pinch_run'].includes(substitution.kind)) return;
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const fallbackSide = substitution.kind === 'defense' ? defenseSide : offenseSide;
    const incomingRaw = substitution.incoming.replace(/투수/g, '').replace(/·/g, '').trim();
    if (!incomingRaw) return;
    const side = fallbackSide;
    const nameKey = resolveNameKey(incomingRaw, side);
    const order = orderByName[side].get(nameKey) ?? (entry.order > 0 ? entry.order : null);
    if (!order) return;
    const label = substitution.kind === 'defense' ? '대수비' : substitution.kind === 'pinch_hit' ? '대타' : '대주자';
    addSubNote(side, order, nameKey, entry.inning, label);
  });
  
  const writePitcherOrder = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`투수 등판 순서 - ${label}`);
    add('등판순서', '등번호', '선수', '포지션', '투', '타');
    if (!stats.pitchers[side].length) {
      add('-', '-', '-', '-', '-', '-');
      return;
    }
    stats.pitchers[side].forEach((p, idx) => {
      const meta = getPlayerMeta(side, p.name);
      const orderLabel = p.appearanceLabel || (idx === 0 ? '선발' : `계투(${idx})`);
      add(orderLabel, meta.number, p.name, p.pos ?? meta.pos, meta.throws, meta.bats);
    });
  };

  const writeHitterStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 타자 기록 - ${label}`);
    add('선수', '포지션', '타석', '타수', '안타', '1루타', '2루타', '3루타', '홈런', '볼넷', '타격방해', '야수선택', '사구', '삼진', '희생', '타율', '출루율', '희생번트', '희생플라이', '도루', '도루실패', '병살타', '출루율 상태');
    stats.hitters[side].forEach((s) => {
      const rates = batterRateView(s);
      const avg = s.ab > 0 ? s.h / s.ab : 0;
      add(
        s.name, s.pos, s.pa, s.ab, s.h, s.singles, s.doubles, s.triples, s.hr, s.bb, s.ci, s.fc, s.hbp, s.so, s.sac,
        s.ab > 0 ? fmt3(avg) : '-', rates.obp !== null ? fmt3(rates.obp) : '-',
        rates.sh ?? '-', rates.sf ?? '-', s.sb ?? '-', s.cs ?? '-', s.gdp ?? '-', rates.status,
      );
    });
  };

  const writePitcherStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 투수 기록 - ${label}`);
    add('선수', '포지션', '타자상대', '투구수', '투구수(S/B)', '이닝', '피안타', '피홈런', '볼넷', '사구', '탈삼진', '실점', '자책', 'ERA', '자책 확인 상태');
    stats.pitchers[side].forEach((s) => {
      const earned = earnedRunsView(s.er, s.outs, s.earnedRunsStatus);
      const ip = `${Math.floor(s.outs / 3)}.${s.outs % 3}`;
      add(
        s.name, s.pos, s.bf, s.pitches, `${s.pitches} (${s.strikes}/${s.balls})`, ip, s.h, s.hr, s.bb, s.hbp, s.so,
        s.r, earned.er, earned.era, earned.label,
      );
    });
  };

  writeHitterStats('home', record.meta.homeTeamName);
  writeHitterStats('away', record.meta.awayTeamName);
  writePitcherStats('home', record.meta.homeTeamName);
  writePitcherStats('away', record.meta.awayTeamName);
  writePitcherOrder('home', record.meta.homeTeamName);
  writePitcherOrder('away', record.meta.awayTeamName);

  const eventKey = (event: PlayEvent) => [
    event.eventId ?? '',
    event.inning,
    event.half,
    event.order,
    event.pitch,
    event.type,
    event.batter ?? '',
    event.notes ?? '',
    event.strikeType ?? '',
    event.rbi ?? '',
    (event.runners ?? []).join('|'),
    event.battedBall?.type ?? '',
    event.battedBall?.zone ?? '',
    typeof event.error === 'string' ? event.error : event.error ? `${event.error.errorType}|${event.error.fielderPos}|${event.error.context ?? ''}` : '',
    Array.isArray(event.dpRoute) ? event.dpRoute.join('-') : '',
  ].join('|');

  const dedupeEvents = (items: PlayEvent[]) => {
    const seen = new Set<string>();
    return items.filter((event) => {
      const key = eventKey(event);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const rebuiltResult = rebuildEventsFromFeedWithAlternatives(record.feed, {
    source: { kind: 'text_feed_rebuild', provider: 'shared-text-feed-parser' },
    fallback: { inning: 1, half: 'top' },
  });
  const selectedEvents = selectRebuildEvents(rebuiltResult.groups, options.rebuildSelections);
  const mergedEvents = mergeRebuiltEventsForReplay({
    existingEvents: record.events,
    rebuiltEvents: selectedEvents,
  });
  const eventsChrono = dedupeEvents([...mergedEvents].sort(sortChrono));
  addBlank();
  add('문자중계 재해석 감사');
  add('사건 ID', '중계 문구', '후보 유형', '확정 상태', '신뢰도', '보류 사유');
  rebuildReviewRows(rebuiltResult.groups, options.rebuildSelections).forEach((row) => add(...row));
  addBlank();
  add('상태 재생 감사');
  add('사건 ID', '검증 상태', '검증 사유');
  scoringReplayAuditRows(mergedEvents).forEach((row) => add(...row));
  addBlank();
  add('구조화 주루 기록');
  add('사건 ID', '입력 ID', '주자', '출발 루', '결과', '발생 순서', '사유', '아웃 종류', '책임 투수', '홈 도달 판정', '타자 결과', '타점', '판정 메모');
  runnerPlayAuditRows(mergedEvents).forEach((row) => add(...row));
  compositePlayAuditRows(mergedEvents).forEach((row) => add(...row));
  addBlank();
  add('상세 플레이 이벤트');
  if (eventsChrono.length) {
    add(
      '이닝', '공/말', '타순', '타자', '구수', '유형', '주자 이동', '타구 유형/방향',
      '실책 요약', '실책 위치', '실책 유형', '실책 상황', '실책 결과', '비고', '신뢰도', '판정상태',
    );
    eventsChrono.forEach((event) => {
      add(
        event.inning, halfLabel(event.half), event.order || '-', event.batter || '-', event.pitch, event.type,
        event.runners.length ? event.runners.join(' | ') : '-',
        formatBattedBallDetails(event.battedBall),
        formatErrorSummary(event.error),
        formatErrorField(event.error, 'fielderPos'),
        formatErrorField(event.error, 'errorType'),
        formatErrorField(event.error, 'context'),
        formatErrorAdvanceResults(event.error),
        event.notes ?? '-',
        typeof event.confidence === 'number' ? event.confidence.toFixed(2) : '-',
        event.manualResolve?.required ? '수동확인 필요' : event.source?.kind === 'manual' ? '수동확정' : '원본/자동',
      );
    });
  } else {
    add('-', '기록 없음');
  }

  const feed = [...record.feed].sort(sortChrono);
  addBlank();
  add('플레이 로그');
  if (feed.length) {
    add('이닝', '공/말', '타순', '타자', '구수', '결과');
    feed.forEach((entry) => {
      add(entry.inning, halfLabel(entry.half), entry.order, entry.batter || '-', entry.pitch, entry.result);
    });
  } else {
    add('-', '기록 없음');
  }

  const scorebookEventsBySide = (side: 'home' | 'away') => {
    const targetHalf = side === 'away' ? 'top' : 'bottom';
    const notesByOrder = new Map<number, Map<string, Map<number, string[]>>>();
    eventsChrono
      .filter((event) => event.half === targetHalf)
      .forEach((event) => {
        const resolvedOrder = resolveEventOrder(event, side);
        if (!resolvedOrder || resolvedOrder <= 0) return;
        const batterKey = resolveEventBatter(event, side) ?? '__order__';
        const orderMap = notesByOrder.get(resolvedOrder) ?? new Map<string, Map<number, string[]>>();
        const inningMap = orderMap.get(batterKey) ?? new Map<number, string[]>();
        const notes = inningMap.get(event.inning) ?? [];
        const note = formatScorebookCell(event);
        notes.push(note || '-');
        inningMap.set(event.inning, notes);
        orderMap.set(batterKey, inningMap);
        notesByOrder.set(resolvedOrder, orderMap);
      });
    return notesByOrder;
  };

  const writeScorebook = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`${label} 팀 기록지 (타석별 기록)`);
    add('타순', '등번호', '선수', '포지션', ...innings.map((inning) => `${inning}회 타석(기록)`), '타석', '타수', '안타', '1루타', '2루타', '3루타', '홈런', '볼넷', '사구', '삼진', '희생');
    const notesByOrder = scorebookEventsBySide(side);

    const hittersByOrder = new Map<number, BatterStatLine[]>();
    stats.hitters[side].forEach((stat) => {
      if (!stat.order || stat.order <= 0 || stat.order > 9) return;
      const list = hittersByOrder.get(stat.order) ?? [];
      list.push(stat);
      hittersByOrder.set(stat.order, list);
    });

    const scorebookRows: { order: number; stat?: BatterStatLine }[] = [];
    innings.forEach((order) => {
      const list = hittersByOrder.get(order);
      if (list && list.length) {
        list.forEach((stat) => scorebookRows.push({ order, stat }));
      } else {
        scorebookRows.push({ order });
      }
    });

    scorebookRows.forEach((row) => {
      const order = row.order;
      const stat = row.stat;
      const uniqueName = stat?.name ?? '';
      const meta = uniqueName ? getPlayerMeta(side, uniqueName) : { number: '-', pos: '-', posNumber: '-', throws: '-', bats: '-' };
      const displayName = uniqueName ? (parsePlayerName(uniqueName).base || uniqueName) : '-';
      const posLabel = stat?.pos ?? meta.pos ?? '-';
      const orderNotes = notesByOrder.get(order);
      const batterNotes = uniqueName && orderNotes ? orderNotes.get(uniqueName) ?? orderNotes.get('__order__') : orderNotes?.get('__order__');
      const subOrderNotes = substitutionNotesBySide[side].get(order);
      const subBatterNotes =
        uniqueName && subOrderNotes ? subOrderNotes.get(uniqueName) ?? subOrderNotes.get('__order__') : subOrderNotes?.get('__order__');
      const inningNotes = innings.map((inning) => {
        const notes: string[] = [];
        const subNotes = subBatterNotes?.get(inning);
        if (subNotes?.length) notes.push(...subNotes);
        const playNotes = batterNotes?.get(inning);
        if (playNotes?.length) notes.push(...playNotes);
        return notes.length ? notes.join(' | ') : '-';
      });

      add(
        order, meta.number, displayName || '-', posLabel,
        ...inningNotes,
        stat?.pa ?? '-', stat?.ab ?? '-', stat?.h ?? '-', stat?.singles ?? '-', stat?.doubles ?? '-', stat?.triples ?? '-', stat?.hr ?? '-', stat?.bb ?? '-', stat?.hbp ?? '-', stat?.so ?? '-', stat?.sac ?? '-',
      );
    });
  };

  writeScorebook('away', '초공');
  writeScorebook('home', '말공');

  return lines.join('\n');
}
