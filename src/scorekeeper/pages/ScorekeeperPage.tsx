import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { TEAMS } from '../../shared/lib/mockData';
import { buildGameRecord, canPitcherBat, useDemoStore } from '../../shared/state/demoStore';
import type {
  BattedBallDetails,
  ErrorDetails,
  PlayEvent,
  RunnerAdvanceOutcome,
  RunnerAdvanceSelections,
} from '../../shared/state/demoStore';
import StatsTable from '../../shared/components/StatsTable';
import RemovedPlayersPanel from '../../shared/components/RemovedPlayersPanel';
import type { BatterStatLine, PitcherStatLine } from '../../shared/types/scoreStats';
import { useAuth } from '../../shared/auth/AuthProvider';
import { BoxScoreTable } from '../../scoreboard/components/ScoreboardPanel';
import { GameTimerDisplay } from '../../shared/components/GameTimerDisplay';

// 동명이인 구분을 위한 고유 이름 생성 헬퍼 함수 추가
// 이미 (등번호)가 붙어있으면 덧붙이지 않도록 안전장치 추가
const getUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  if (!number) return name;
  
  const suffix = `(${number})`;
  // 이미 이름 끝에 (등번호)가 포함되어 있다면 그대로 반환 (중복 방지)
  if (name.endsWith(suffix)) return name;
  
  return `${name}${suffix}`;
};

type Side = 'home' | 'away';

const mainButtons = [
  { label: '볼', color: '#22c55e', action: 'ball' },
  { label: '스트라이크', color: '#facc15', action: 'strike' },
  { label: '타격 입력', color: '#3b82f6', action: 'hitMenu' },
  { label: '실행 취소', color: '#94a3b8', action: 'undo' },
];

const secondaryButtons = [
  { label: '고의4구', color: '#22c55e', action: 'intentional_walk' },
  { label: '사구', color: '#22c55e', action: 'hbp' },
  { label: '타격 방해', color: '#f97316', action: 'catcher_interference' },
  { label: '파울', color: '#facc15', action: 'foul' },
  { label: '카운트 리셋', color: '#94a3b8', action: 'resetCount' },
  { label: '주자 클리어', color: '#94a3b8', action: 'clearBases' },
  { label: '이닝 전환', color: '#94a3b8', action: 'nextHalf' },
];

const battedBallResultOptions = [
  { label: '파울', color: '#facc15', value: 'foul' as const, helper: '스트라이크 누적', group: 'count' as const },
  { label: '쓰리번트 파울', color: '#ef4444', value: 'out_three_bunt' as const, helper: '3번 번트 파울', group: 'out' as const },
  { label: '고의4구', color: '#22c55e', value: 'intentional_walk' as const, helper: '주자 상황 유지', group: 'reach' as const },
  { label: '타격방해', color: '#22c55e', value: 'catcher_interference' as const, helper: '포수·수비 방해 출루', group: 'reach' as const },
  { label: '실책 출루', color: '#f97316', value: 'reach_error' as const, helper: '수비 실책으로 출루', group: 'reach' as const },
  { label: '야수선택', color: '#a5b4fc', value: 'fc' as const, helper: '안타 아님 · 타자 1루', group: 'reach' as const },
  { label: '1루타', color: '#3b82f6', value: 'single' as const, helper: '타자·주자 1루', group: 'hit' as const },
  { label: '내야 안타', color: '#3b82f6', value: 'single_infield' as const, helper: '1루타 · 내야', group: 'hit' as const },
  { label: '번트 안타', color: '#3b82f6', value: 'single_bunt' as const, helper: '1루타 · 번트', group: 'hit' as const },
  { label: '2루타', color: '#3b82f6', value: 'double' as const, helper: '타자·주자 2루', group: 'hit' as const },
  { label: '인정 2루타', color: '#3b82f6', value: 'double_ground' as const, helper: '2루타 · 규정', group: 'hit' as const },
  { label: '3루타', color: '#3b82f6', value: 'triple' as const, helper: '타자·주자 3루', group: 'hit' as const },
  { label: '홈런', color: '#f97316', value: 'hr' as const, helper: '전원 득점', group: 'hit' as const },
  { label: '땅볼 아웃', color: '#ef4444', value: 'out_ground' as const, helper: '타자만 아웃', group: 'out' as const },
  { label: '뜬공 아웃', color: '#ef4444', value: 'out_fly' as const, helper: '타자만 아웃', group: 'out' as const },
  { label: '라인드라이브', color: '#ef4444', value: 'out_line' as const, helper: '직선타 아웃', group: 'out' as const },
  { label: '병살타(2아웃)', color: '#ef4444', value: 'out_dp2' as const, helper: '타자+주자 아웃', group: 'out' as const },
  { label: '삼중살(3아웃)', color: '#ef4444', value: 'out_tp3' as const, helper: '모두 아웃', group: 'out' as const },
  { label: '더블아웃(기타)', color: '#ef4444', value: 'out_multiple' as const, helper: '주자 선택 아웃', group: 'out' as const },
  { label: '내야 플라이', color: '#ef4444', value: 'out_infield_fly' as const, helper: '타자만 아웃(인필드 플라이 아님)', group: 'out' as const },
  { label: '인필드 플라이 선언', color: '#ef4444', value: 'out_infield_fly_rule' as const, helper: '주자 묶임 · 선언 상황', group: 'out' as const },
  { label: '외야 플라이', color: '#ef4444', value: 'out_outfield_fly' as const, helper: '외야 플라이 아웃', group: 'out' as const },
  { label: '기타 아웃', color: '#ef4444', value: 'out_other' as const, helper: '상황 메모', group: 'out' as const },
  { label: '희생플라이', color: '#facc15', value: 'sac_fly' as const, helper: '타점·진루 기록', group: 'sac' as const },
  { label: '희생번트', color: '#facc15', value: 'sac_bunt' as const, helper: '주자 진루 번트', group: 'sac' as const },
];

const battedBallResultGroups: { key: 'count' | 'hit' | 'out' | 'sac' | 'reach'; label: string }[] = [
  { key: 'count', label: '파울/카운트' },
  { key: 'hit', label: '안타' },
  { key: 'out', label: '인플레이 아웃' },
  { key: 'sac', label: '희생' },
  { key: 'reach', label: '출루/선택' },
];

const baseBattedBallType = '선택 안 함';
const singleTypeOptions = [baseBattedBallType, '외야 앞에 떨어짐', '외야 강한 직선타', '갭 사이 안타', '라인 따라 안타'];
const infieldHitTypeOptions = [baseBattedBallType, '느린 내야 땅볼', '강한 내야 땅볼', '내야 라인드라이브'];
const buntHitTypeOptions = [baseBattedBallType, '드래그 번트 안타', '푸시 번트 안타', '기습 번트 안타'];
const extraBaseHitTypeOptions = [baseBattedBallType, '갭 장타', '라인 장타', '펜스 직격/원바운드'];
const groundRuleDoubleTypeOptions = [baseBattedBallType, '원바운드 담장', '관중석/펜스 이탈'];
const hrTypeOptions = [baseBattedBallType, '오버 더 펜스', '인사이드 더 파크(그라운드 홈런)'];
const sacFlyTypeOptions = [baseBattedBallType, '좌익수 희생플라이', '중견수 희생플라이', '우익수 희생플라이', '파울 플라이 희생'];
const sacBuntTypeOptions = [baseBattedBallType, '스퀴즈 번트', '1루쪽 희생번트', '3루쪽 희생번트', '투수 앞 희생번트'];
const groundOutTypeOptions = [baseBattedBallType, '느린 땅볼', '강한 땅볼', '바운드 조정 땅볼'];
const outfieldFlyTypeOptions = [baseBattedBallType, '얕은 플라이', '깊은 플라이', '파울 플라이(외야)'];
const lineOutTypeOptions = [baseBattedBallType, '직선타(내야)', '직선타(외야)', '강습 라이너'];
const infieldFlyTypeOptions = [baseBattedBallType, '인필드 플라이 선언'];
const infieldFielderOptions = ['선택 안 함', '투수', '포수', '1루수', '2루수', '3루수', '유격수'];
const outfieldFielderOptions = ['선택 안 함', '좌익수', '중견수', '우익수', '좌익수 파울', '우익수 파울'];
const defaultTypeOptions = [baseBattedBallType];
const defensePosOptions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', '기타'];
const defaultZoneOptions = [
  '선택 안 함',
  '좌선(좌익수 라인)',
  '좌익수 파울/라인',
  '좌전(좌익수 앞)',
  '좌중간 갭',
  '좌중 펜스/깊숙',
  '중전(중견수 정면)',
  '중견수 깊숙/펜스',
  '우중 펜스/깊숙',
  '우중간 갭',
  '우전(우익수 앞)',
  '우익수 파울/라인',
  '우선(우익수 라인)',
];
const infieldGroundZoneOptions = [
  '선택 안 함',
  '포수 앞',
  '투수 앞',
  '3루수 정면',
  '유격수 정면',
  '2루수 정면',
  '1루수 정면',
  '3루 라인 땅볼',
  '1루 라인 땅볼',
  '내야 뜬공(포수)',
  '내야 뜬공(1루수)',
  '내야 뜬공(2루수)',
  '내야 뜬공(3루수)',
  '내야 뜬공(투수)',
];
const fcZoneOptions = Array.from(
  new Set([
    ...infieldGroundZoneOptions,
    ...defaultZoneOptions,
  ]),
);
const lineDriveZoneOptions = [
  '선택 안 함',
  '3루 강습 라이너',
  '유격수 라이너',
  '2루수 라이너',
  '1루 강습 라이너',
  '좌익수 라이너',
  '좌중간 라이너',
  '중견수 라이너',
  '우중간 라이너',
  '우익수 라이너',
];
const infieldFlyZoneOptions = [
  '선택 안 함',
  '포수 파울 팝업',
  '1루 파울 팝업',
  '3루 파울 팝업',
  '투수 앞',
  '마운드 뒤',
  '1루 앞',
  '2루 베이스 부근',
  '3루 앞',
];
const buntZoneOptions = [
  '선택 안 함',
  '1루쪽 번트',
  '3루쪽 번트',
  '포수 앞 짧은 번트',
  '투수 앞 짧은 번트',
  '1루선상 번트',
  '3루선상 번트',
];
const errorTypeOptions = [
  { value: '포구', label: '포구: 잡지 못함' },
  { value: '송구', label: '송구: 송구 미스/빗나감' },
  { value: '포구 후 송구', label: '포구 후 송구: 포구는 성공, 송구 실책' },
  { value: 'WP(폭투)', label: 'WP: 폭투' },
  { value: 'PB(포일)', label: 'PB: 포일' },
  { value: 'BK(보크)', label: 'BK: 보크' },
  { value: '기타', label: '기타' },
];
type HitResultAction = Extract<(typeof battedBallResultOptions)[number]['value'], 'single' | 'single_infield' | 'single_bunt' | 'double' | 'double_ground' | 'triple' | 'hr'>;
type BattedBallResultAction = (typeof battedBallResultOptions)[number]['value'];
type HitWizardStep = 'result' | 'type' | 'zone';
type HitWizardState = {
  step: HitWizardStep;
  result: BattedBallResultAction | null;
  type: string;
  zone: string;
  fielder: string;
};

function requiresAdvanceModal(result: BattedBallResultAction | null) {
  return ['single', 'single_infield', 'single_bunt', 'double', 'double_ground', 'triple', 'fc'].includes(
    result as BattedBallResultAction,
  );
}
type ActionModalData =
  | { role: 'runner'; name: string; base: 0 | 1 | 2; side: Side; lineupIndex: number }
  | { role: 'batter'; name: string; side: Side; lineupIndex: number }
  | { role: 'fielder'; name: string; pos: string; side: Side; lineupIndex: number };

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

function formatDateTimeLabel(value: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatBattedBallDetails(details?: BattedBallDetails | null) {
  if (!details) return '-';
  const parts = [details.type, details.zone].filter((part) => part && part !== '선택 안 함');
  return parts.length ? parts.join(' / ') : '-';
}

function buildBattedBallDetailsFromValues(type: string, zone: string): BattedBallDetails | null {
  if (type === '선택 안 함' && zone === '선택 안 함') return null;
  return { type, zone };
}

function isInfieldFlyResult(result: BattedBallResultAction | null) {
  return result === 'out_infield_fly' || result === 'out_infield_fly_rule';
}

function isOutfieldFlyResult(result: BattedBallResultAction | null) {
  return result === 'out_outfield_fly' || result === 'out_fly';
}

function baseLabel(idx: number) {
  return idx === 0 ? '1루' : idx === 1 ? '2루' : idx === 2 ? '3루' : '홈';
}

function getTypeOptionsForResult(result: BattedBallResultAction | null) {
  if (!result) return defaultTypeOptions;
  switch (result) {
    case 'single':
      return singleTypeOptions;
    case 'single_infield':
      return infieldHitTypeOptions;
    case 'single_bunt':
      return buntHitTypeOptions;
    case 'double':
    case 'triple':
      return extraBaseHitTypeOptions;
    case 'double_ground':
      return groundRuleDoubleTypeOptions;
    case 'hr':
      return hrTypeOptions;
    case 'sac_fly':
      return sacFlyTypeOptions;
    case 'sac_bunt':
      return sacBuntTypeOptions;
    case 'out_ground':
    case 'out_dp2':
    case 'out_tp3':
      return groundOutTypeOptions;
    case 'out_fly':
    case 'out_outfield_fly':
      return outfieldFlyTypeOptions;
    case 'out_line':
      return lineOutTypeOptions;
    case 'out_infield_fly':
    case 'out_infield_fly_rule':
      return infieldFlyTypeOptions;
    default:
      return defaultTypeOptions;
  }
}

function getZoneOptionsForResult(result: BattedBallResultAction | null) {
  if (!result) return defaultZoneOptions;
  if (isInfieldFlyResult(result)) return infieldFlyZoneOptions;
  if (result === 'sac_bunt' || result === 'single_bunt') return buntZoneOptions;
  if (
    result === 'single_infield' ||
    result === 'out_ground' ||
    result === 'out_dp2' ||
    result === 'out_tp3' ||
    result === 'out_multiple'
  )
    return infieldGroundZoneOptions;
  if (result === 'fc') return fcZoneOptions;
  if (result === 'out_line') return lineDriveZoneOptions;
  return defaultZoneOptions;
}

function getFielderOptionsForResult(result: BattedBallResultAction | null) {
  if (isInfieldFlyResult(result)) return infieldFielderOptions;
  if (isOutfieldFlyResult(result)) return outfieldFielderOptions;
  // [수정] 더블아웃(기타) 선택 시에도 내야수(투수/포수 포함)를 선택할 수 있도록 옵션 반환
  if (result === 'out_multiple') return infieldFielderOptions;
  return null;
}

function defensePositionNumber(pos: string) {
  const normalized = pos.trim().toUpperCase();
  const map: Record<string, string> = {
    P: '1',
    C: '2',
    '1B': '3',
    '2B': '4',
    '3B': '5',
    SS: '6',
    'S/S': '6',
    LF: '7',
    CF: '8',
    RF: '9',
    DH: 'D',
    D: 'D',
    PH: 'PH',
    PR: 'PR',
  };
  if (map[normalized]) return map[normalized];
  return normalized || '-';
}

function decorateErrorType(errorType: string, fielderPos: string) {
  const specialPrefixes = ['WP', 'PB', 'BK'];
  if (specialPrefixes.some((p) => errorType.startsWith(p))) return errorType;
  if (errorType.startsWith('E')) return errorType;
  const posCode = defensePositionNumber(fielderPos);
  if (/^[1-9]$/.test(posCode)) return `E${posCode} ${errorType}`;
  return `실책 ${errorType}`;
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

function formatErrorSummary(error?: ErrorDetails | string | null) {
  if (!error) return '-';
  if (typeof error === 'string') return error;
  const context = error.context ? ` · ${error.context}` : '';
  return `${error.errorType} · ${error.fielderPos}${context}`;
}

type ErrorSummaryField = Exclude<keyof ErrorDetails, 'advanceResults'>;

function formatErrorField(error: ErrorDetails | string | null | undefined, field: ErrorSummaryField) {
  if (!error || typeof error === 'string') return '-';
  return error[field] || '-';
}

function normalizeLiveUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.replace('/', '').split(/[?/&#]/)[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host.includes('youtube.com')) {
      const liveId = url.pathname.startsWith('/live/') ? url.pathname.split('/live/')[1]?.split(/[?/&#]/)[0] : null;
      const watchId = url.searchParams.get('v');
      const candidate = liveId || watchId;
      if (candidate) {
        return `https://www.youtube.com/embed/${candidate}`;
      }
    }
  } catch {
    // Fallback to trimmed string below.
  }
  const shortMatch = trimmed.match(/youtu\.be\/([^?&#/]+)/);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }
  return trimmed;
}

function buildCsvRecord(record: ReturnType<typeof buildGameRecord>) {
  const lines: string[] = [];
  const add = (...cells: (string | number | boolean | null | undefined)[]) => {
    lines.push(cells.map((cell) => escapeCsvCell(cell)).join(','));
  };
  const addBlank = () => lines.push('');
  const halfLabel = (half: 'top' | 'bottom') => (half === 'top' ? '초' : '말');
  const innings = Array.from({ length: 9 }, (_, idx) => idx + 1);
  const playerDirectory: Record<
    'home' | 'away',
    Map<string, { number: string; pos: string; posNumber: string; throws: string; bats: string }>
  > = {
    home: new Map(),
    away: new Map(),
  };
  // [수정됨] CSV용 디렉토리 생성 시 고유 이름(이름+등번호)을 키로 사용
  const seedDirectory = (side: 'home' | 'away', slots: typeof record.lineups.home) => {
    slots.forEach((slot) => {
      if (!slot.name) return;
      // 키 생성 시 getUniqueName 사용
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

  // [수정됨] 메타데이터 조회 시에도 고유 이름을 키로 사용하도록 수정해야 함
  // 호출하는 쪽에서 이미 uniqueName을 넘긴다고 가정하거나, 이 함수 내부에서는 map의 key를 그대로 사용
  const getPlayerMeta = (side: 'home' | 'away', uniqueName: string) =>
    playerDirectory[side].get(uniqueName) ?? { number: '-', pos: '-', posNumber: '-', throws: '-', bats: '-' };

  const stripBatterFromNote = (note: string, batter?: string) => {
    const cleaned = (note || '').replace(/\s+/g, ' ').trim();
    if (!batter) return cleaned;
    const escaped = batter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\s*·?\\s*${escaped}\\s*`, 'g');
    const removed = cleaned.replace(regex, '').trim();
    return removed || cleaned;
  };
  const formatRunnerNotes = (runners: string[]) => {
    if (!runners?.length) return '';
    const notes = runners
      .map((r) => {
        const withoutName = r.includes('·') ? r.split('·')[0] : r;
        return withoutName.replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);
    return notes.join(' | ');
  };
  const classifyKboResult = (event: PlayEvent) => {
    const normalized = (event.notes || event.type || '').replace(/\s+/g, '');
    if (normalized.includes('홈런')) return 'HR';
    if (normalized.includes('3루타')) return '3B';
    if (normalized.includes('2루타')) return '2B';
    if (normalized.includes('1루타')) return '1B';
    if (event.type === 'fc' || normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'FC';
    if (normalized.includes('타격방해')) return 'CI';
    if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'IB';
    if (event.type === 'walk' || normalized.includes('볼넷') || normalized.includes('4구')) return 'B';
    if (event.type === 'hbp' || normalized.includes('몸에맞는공')) return 'HP';
    if (event.type === 'sac' || normalized.includes('희생')) return 'SAC';
    if (event.type === 'error' || normalized.includes('실책')) return 'E';
    if (normalized.includes('병살')) {
      if (event.dpRoute && event.dpRoute.length > 0) {
        return `GDP(${event.dpRoute.join('-')})`;
      }
      return 'GDP';
    }
    if (normalized.includes('삼진')) {
      if (event.strikeType === 'looking' || normalized.includes('루킹')) {
        return 'Kc';
      }
      return 'K';
    }
    if (event.type === 'steal') return 'SB';
    if (event.type === 'steal_fail') return 'CS';
    if (event.type === 'runner_out') return 'RUN OUT';
    if (event.type === 'runner') return 'RUN';
    if (normalized.includes('아웃') || event.type === 'out') return 'OUT';
    return event.type.toUpperCase();
  };
  const formatScorebookCell = (event: PlayEvent) => {
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
  };

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
  add('기록 기준', 'KBO 기록지 기입법 기준');
  add('주자 상황', record.bases.map((runner, idx) => `${idx + 1}루:${runner ?? '-'}`).join(' | '));

  const writeLineup = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`라인업 - ${label} (KBO 표준: 등번호·수비번호)`);
    add('타순', '등번호', '선수', '수비번호', '포지션', '투', '타');
    const batting = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    batting.forEach((slot, idx) => {
      // [수정됨] 메타데이터 조회 키 변경
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
  const writePitcherOrder = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`투수 등판 순서 - ${label}`);
    add('등판순서', '등번호', '선수', '포지션', '투', '타');
    if (!stats.pitchers[side].length) {
      add('-', '-', '-', '-', '-', '-');
      return;
    }
    stats.pitchers[side].forEach((p, idx) => {
      // p.name은 이미 uniqueName임 (buildPlayerStats 수정됨)
      const meta = getPlayerMeta(side, p.name);
      const orderLabel = p.appearanceLabel || (idx === 0 ? '선발' : `계투(${idx})`);
      // CSV에는 이름만 깔끔하게 출력하고 싶다면 meta.name 등을 쓰거나 p.name을 파싱해야 하지만,
      // 식별을 위해 uniqueName을 그대로 출력하거나, 여기서 괄호를 뗄 수도 있음.
      // 일단 uniqueName 그대로 출력 (동명이인 구분 위해)
      add(orderLabel, meta.number, p.name, p.pos ?? meta.pos, meta.throws, meta.bats);
    });
  };

  // ... (writeHitterStats, writePitcherStats 등은 p.name을 그대로 사용하므로 로직 변경 없음. 
  // 단, p.name이 이제 '홍길동(18)' 형태임) ...

  const writeHitterStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 타자 기록 - ${label}`);
    add('선수', '포지션', '타석', '타수', '안타', '1루타', '2루타', '3루타', '홈런', '볼넷', '타격방해', '야수선택', '사구', '삼진', '희생', '타율', '출루율');
    stats.hitters[side].forEach((s) => {
      const obpDen = s.ab + s.bb + s.hbp + s.sac + s.ci;
      const avg = s.ab > 0 ? s.h / s.ab : 0;
      const obp = obpDen > 0 ? (s.h + s.bb + s.hbp + s.ci) / obpDen : 0;
      add(
        s.name,
        s.pos,
        s.pa,
        s.ab,
        s.h,
        s.singles,
        s.doubles,
        s.triples,
        s.hr,
        s.bb,
        s.ci,
        s.fc,
        s.hbp,
        s.so,
        s.sac,
        s.ab > 0 ? fmt3(avg) : '-',
        obpDen > 0 ? fmt3(obp) : '-',
      );
    });
  };

  const writePitcherStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 투수 기록 - ${label}`);
    add('선수', '포지션', '타자상대', '투구수', '투구수(S/B)', '이닝', '피안타', '피홈런', '볼넷', '사구', '탈삼진');
    stats.pitchers[side].forEach((s) => {
      const ip = `${Math.floor(s.outs / 3)}.${s.outs % 3}`;
      add(
        s.name,
        s.pos,
        s.bf,
        s.pitches,
        `${s.pitches} (${s.strikes}/${s.balls})`,
        ip,
        s.h,
        s.hr,
        s.bb,
        s.hbp,
        s.so,
      );
    });
  };

  writeHitterStats('home', record.meta.homeTeamName);
  writeHitterStats('away', record.meta.awayTeamName);
  writePitcherStats('home', record.meta.homeTeamName);
  writePitcherStats('away', record.meta.awayTeamName);
  writePitcherOrder('home', record.meta.homeTeamName);
  writePitcherOrder('away', record.meta.awayTeamName);

  const eventsChrono = [...record.events].reverse();
  addBlank();
  add('상세 플레이 이벤트');
  if (eventsChrono.length) {
    add(
      '이닝',
      '공/말',
      '타순',
      '타자',
      '구수',
      '유형',
      '주자 이동',
      '타구 유형/방향',
      '실책 요약',
      '실책 위치',
      '실책 유형',
      '실책 상황',
      '실책 결과',
      '비고',
    );
    eventsChrono.forEach((event) => {
      add(
        event.inning,
        halfLabel(event.half),
        event.order || '-',
        event.batter || '-',
        event.pitch,
        event.type,
        event.runners.length ? event.runners.join(' | ') : '-',
        formatBattedBallDetails(event.battedBall),
        formatErrorSummary(event.error),
        formatErrorField(event.error, 'fielderPos'),
        formatErrorField(event.error, 'errorType'),
        formatErrorField(event.error, 'context'),
        formatErrorAdvanceResults(event.error),
        event.notes ?? '-',
      );
    });
  } else {
    add('-', '기록 없음');
  }

  const feed = [...record.feed].reverse();
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
    const notesByOrder = new Map<number, Map<number, string[]>>();
    eventsChrono
      .filter((event) => event.half === targetHalf && event.order > 0)
      .forEach((event) => {
        const inningMap = notesByOrder.get(event.order) ?? new Map<number, string[]>();
        const notes = inningMap.get(event.inning) ?? [];
        const note = formatScorebookCell(event);
        notes.push(note || '-');
        inningMap.set(event.inning, notes);
        notesByOrder.set(event.order, inningMap);
      });
    return notesByOrder;
  };

  const writeScorebook = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`${label} 팀 KBO 기록지 (타석별 기록)`);
    add(
      '타순',
      '등번호',
      '선수',
      '수비번호',
      '포지션',
      ...innings.map((inning) => `${inning}회 타석(기록)`),
      '타석',
      '타수',
      '안타',
      '1루타',
      '2루타',
      '3루타',
      '홈런',
      '볼넷',
      '사구',
      '삼진',
      '희생',
    );
    const hitters = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    while (hitters.length < 9) {
      hitters.push({ name: '-', pos: '-', number: '-', throws: 'R', bats: 'R' });
    }
    const notesByOrder = scorebookEventsBySide(side);
    // statsByName 키도 uniqueName이어야 함
    const statsByName = new Map(stats.hitters[side].map((stat) => [stat.name, stat]));
    
    hitters.slice(0, 9).forEach((slot, idx) => {
      const order = idx + 1;
      const inningNotes = innings.map((inning) => {
        const notes = notesByOrder.get(order)?.get(inning);
        return notes?.length ? notes.join(' | ') : '-';
      });
      
      const uniqueName = getUniqueName(slot.name, slot.number);
      const stat = statsByName.get(uniqueName);
      const meta = getPlayerMeta(side, uniqueName);

      add(
        order,
        meta.number,
        slot.name || '-',
        meta.posNumber,
        slot.pos || '-',
        ...inningNotes,
        stat?.pa ?? '-',
        stat?.ab ?? '-',
        stat?.h ?? '-',
        stat?.singles ?? '-',
        stat?.doubles ?? '-',
        stat?.triples ?? '-',
        stat?.hr ?? '-',
        stat?.bb ?? '-',
        stat?.hbp ?? '-',
        stat?.so ?? '-',
        stat?.sac ?? '-',
      );
    });
  };

  writeScorebook('away', '초공');
  writeScorebook('home', '말공');

  addBlank();
  add('KBO 기록 기호 안내 (요약)');
  add('항목', '설명');
  add('수비번호', '1투 2포 3일 4이 5삼 6유 7좌 8중 9우 D지명타자');
  add('타석 기호', '상단 선=볼, 원=스트라이크(선=헛스윙, 채움=번트), 하단 삼각형=파울');
  add('타구 기호', '플라이(◠), 땅볼(◡), 직선타(-), 번트(~), 실책은 E와 수비번호 병기');
  add('사구·4구', 'HP(사구), B(볼넷), IB(고의4구), F.C(야수선택)');
  add('주루 표기', '후속 타자 타순 번호를 괄호로 기록하며 진루·득점·아웃을 구분');

  return lines.join('\n');
}

type PlayerStat = BatterStatLine;

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
  };
}

function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'bb' as const;
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('타격방해')) return 'ci' as const;
  if (normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'fc' as const;
  if (normalized.includes('희생플라이')) return 'sac' as const;
  if (normalized.includes('낫아웃')) return 'so_reach' as const;
  if (normalized.includes('삼진')) return 'so' as const;
  if (normalized.includes('아웃') && !normalized.includes('도루')) return 'out' as const;
  return null;
}

type PitcherStat = PitcherStatLine;

function ensurePitcherStat(name: string, pos?: string): PitcherStat {
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
  };
}

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

function buildPlayerStats(record: ReturnType<typeof buildGameRecord>, options?: { practiceMode?: boolean }) {
  const practiceMode = options?.practiceMode === true;
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

  const extraOrder: Record<'home' | 'away', number> = { home: 100, away: 100 };
  const battingOrders: Record<'home' | 'away', Map<number, string[]>> = { home: new Map(), away: new Map() };

  const seedBattingOrders = (side: 'home' | 'away') => {
    let batting = record.lineups[side].slice(0, 9);
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
  const pitchHome = new Map<string, PitcherStat>();
  const pitchAway = new Map<string, PitcherStat>();
  const pitcherAppearance: Record<'home' | 'away', Map<string, number>> = { home: new Map(), away: new Map() };
  const nextAppearance: Record<'home' | 'away', number> = { home: 0, away: 0 };

  const ensureRosterEntry = (side: 'home' | 'away', name: string) => {
    // name은 이미 uniqueName이어야 함
    const roster = side === 'home' ? rosterHome : rosterAway;
    if (roster.has(name)) return roster.get(name)!;
    const benchMeta = side === 'home' ? benchMetaHome : benchMetaAway;
    const meta = benchMeta.get(name);
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

  // Feed is already in chronological order (oldest → newest) per pushFeed implementation
  const chronological = record.feed;
  const currentPitcher: Record<'home' | 'away', string | null> = { home: null, away: null };
  
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

  const inferPitcherSide = (name: string): 'home' | 'away' | null => {
    if (rosterHome.has(name) || benchMetaHome.has(name)) return 'home';
    if (rosterAway.has(name) || benchMetaAway.has(name)) return 'away';
    // 로스터 키 매칭 시도
    for (const key of rosterHome.keys()) if (key.startsWith(name + '(')) return 'home';
    for (const key of rosterAway.keys()) if (key.startsWith(name + '(')) return 'away';
    return null;
  };

  // [수정] 투수 등판 순서 문제 해결을 위해 두 패스로 분리
  // 첫 번째 패스: 투수 관련 로그만 먼저 처리하여 등판 순서 확립
  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();

    // result 문자열에는 이제 "홍길동(18)" 형태가 들어올 것임
    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        let cleaned = cleanName(incoming);
        const inferred = inferPitcherSide(cleaned) ?? defenseSide;
        cleaned = resolvePitcherName(cleaned, inferred);

        currentPitcher[inferred] = cleaned;
        addPitch(inferred, cleaned);
      }
    } else if (result.includes('투수 (선발)') || result.includes('투수 (') && result.includes('차 계투)')) {
      // 자동 생성된 투수 등판 항목: "홍길동(18) 투수 (선발)" 또는 "홍길동(18) 투수 (1차 계투)"
      let cleaned = cleanName(result.split('투수')[0]);
      const inferred = inferPitcherSide(cleaned) ?? defenseSide;
      cleaned = resolvePitcherName(cleaned, inferred);

      currentPitcher[inferred] = cleaned;
      addPitch(inferred, cleaned);
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

    // 투수 관련 로그에서 currentPitcher 업데이트 (등판 순서는 첫 번째 패스에서 이미 처리됨)
    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        let cleaned = cleanName(incoming);
        const inferred = inferPitcherSide(cleaned) ?? defenseSide;
        cleaned = resolvePitcherName(cleaned, inferred);
        currentPitcher[inferred] = cleaned;
      }
    } else if (result.includes('투수 (선발)') || result.includes('투수 (') && result.includes('차 계투)')) {
      let cleaned = cleanName(result.split('투수')[0]);
      const inferred = inferPitcherSide(cleaned) ?? defenseSide;
      cleaned = resolvePitcherName(cleaned, inferred);
      currentPitcher[inferred] = cleaned;
    }

    let name = entry.batter?.trim();
    if (!name) return;
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
    
    // 2. 피드에 투수 정보가 없다면(null), 현재 로스터에서 'P' 포지션인 선수를 찾음 (Fallback)
    if (!pitcherName) {
      const roster = pitchSide === 'home' ? rosterHome : rosterAway;
      // 로스터 맵을 순회하며 포지션이 P인 선수 찾기
      for (const [pName, info] of roster.entries()) {
        if (info.pos && info.pos.toUpperCase() === 'P') {
          pitcherName = pName;
          // 피드 처리의 일관성을 위해 currentPitcher 캐시에도 저장
          currentPitcher[pitchSide] = pName; 
          break;
        }
      }
    }
    const pitcherStat = pitcherName ? addPitch(pitchSide, pitcherName) : null;
    const pitchInfo = classifyPitch(result);
    if (pitcherStat && pitchInfo.pitch) {
      pitcherStat.pitches += 1;
      if (pitchInfo.strike) pitcherStat.strikes += 1;
      if (pitchInfo.ball) pitcherStat.balls += 1;
    }
    const kind = classifyResult(result);
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
        stat.bb += 1;
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
        break;
      case 'sac':
        stat.pa += 1;
        stat.sac += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        break;
      default:
        break;
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
        const meta = roster.get(playerName);
        const stat = store.get(playerName);
        const base = ensurePlayerStat(playerName, meta?.pos);
        const row = stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base;

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
      const meta = roster.get(stat.name);
      rows.push({ ...stat, order: null, isElite: meta?.isElite });
    });
    return rows;
  };

  const toPitcherArray = (
    roster: Map<string, { pos?: string; order: number; substitutionType?: '대수비' | '대타' | '대주자'; isElite?: boolean }>,
    store: Map<string, PitcherStat>,
    appearance: Map<string, number>
  ): PitcherStatLine[] => {
    const names = new Set<string>();
    roster.forEach((meta, name) => {
      if ((meta.pos ?? '').toUpperCase() === 'P') names.add(name);
    });
    store.forEach((_stat, name) => names.add(name));

    const combined: PitcherStatLine[] = [...names].map((name) => {
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
      home: toPitcherArray(rosterHome, pitchHome, pitcherAppearance.home),
      away: toPitcherArray(rosterAway, pitchAway, pitcherAppearance.away),
    },
  };
}

export default function ScorekeeperPage() {
  const { state, actions } = useDemoStore();
  const [showMobileWarning, setShowMobileWarning] = useState(false); // 모바일 경고 팝업 상태 관리
  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const isPracticeMode = (activeMatch?.recordMode ?? 'official') === 'practice';
  const [selectedMatchId, setSelectedMatchId] = useState(state.activeMatchId ?? '');
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);
  const hittingSide: Side = state.half === 'top' ? 'away' : 'home';
  const defenseSide: Side = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineupEntries = state.lineups[hittingSide].map((slot, idx) => ({ slot, idx }));
  const practicePitcherIndex = isPracticeMode
    ? (() => {
        const lineup = state.lineups[hittingSide];
        if (!lineup.length) return -1;
        const lastIndex = lineup.length - 1;
        return lineup[lastIndex].pos.toUpperCase() === 'P' ? lastIndex : -1;
      })()
    : -1;
  // 타석에 들어갈 수 있는 선수만 필터링 (오타니룰 고려)
  const offenseBattingEntries = offenseLineupEntries.filter((entry) => {
    if (isPracticeMode) {
      return entry.idx !== practicePitcherIndex;
    }
    // 1. 타순 1~9번(인덱스 0~8)은 무조건 포함
    if (entry.idx < 9) return true;
    
    // 2. 그 외(10번 등)는 기존 로직 (투수가 아니거나 canPitcherBat 만족 시)
    if (entry.slot.pos.toUpperCase() !== 'P') return true;
    return canPitcherBat(entry.slot, state.lineups[hittingSide]);
  });
  const activeOffenseEntries = offenseBattingEntries.length ? offenseBattingEntries : offenseLineupEntries;
  const defenseLineup = state.lineups[defenseSide];
  const activeLineupLength = activeOffenseEntries.length || 1;
  const currentBatterEntry = activeOffenseEntries[state.batterIndex[hittingSide] % activeLineupLength] ?? null;

  // [수정됨] 현재 타자/투수 이름을 고유 식별자(이름+등번호)로 설정
  const currentBatter = currentBatterEntry 
    ? getUniqueName(currentBatterEntry.slot.name, currentBatterEntry.slot.number) 
    : '타자';
    
  const currentBatterLineupIndex = currentBatterEntry?.idx ?? 0;
  
  const currentPitcherSlot = defenseLineup.find((slot) => slot.pos.toUpperCase() === 'P');

  const [actionModal, setActionModal] = useState<ActionModalData | null>(null);
  const [positionSwapModal, setPositionSwapModal] = useState<{ side: Side } | null>(null);
  const [benchInput, setBenchInput] = useState<{ [K in Side]: { name: string; pos: string; number: string; throws: string; bats: string; isElite: boolean } }>({
    home: { name: '', pos: '', number: '', throws: 'R', bats: 'R', isElite: false },
    away: { name: '', pos: '', number: '', throws: 'R', bats: 'R', isElite: false },
  });
  const [hitWizard, setHitWizard] = useState<HitWizardState | null>(null);
  const [manualBroadcast, setManualBroadcast] = useState('');
  const [liveVideoUrlInput, setLiveVideoUrlInput] = useState('');
  const [liveDelayInput, setLiveDelayInput] = useState('');
  const [lockRemainingMs, setLockRemainingMs] = useState(0);
  const [hitAdvanceModal, setHitAdvanceModal] = useState<null | {
    bases: 1 | 2 | 3;
    selections: RunnerAdvanceSelections;
    mode: 'hit' | 'fc';
    contextNote: string;
    fcFielder: string;
    fcRelay: string;
    fcTargetBase: '1' | '2' | '3' | '홈';
    fcOutType: 'force' | 'tag';
    pathNote: string;
  }>(null);
  const [doublePlayModal, setDoublePlayModal] = useState<null | {
    outsCount: 2 | 3;
    battedBall?: BattedBallDetails | null;
  }>(null);
  const [multipleRunnersOutModal, setMultipleRunnersOutModal] = useState(false);
  const [lastHitWizard, setLastHitWizard] = useState<HitWizardState | null>(null);
  const [errorOnPlayModal, setErrorOnPlayModal] = useState<null | { selections: RunnerAdvanceSelections; batterResult: 'out' | 'hold' | 1 | 2 | 3 | 4; errorType: string; context: string; fielder: string }>(null);
  const [showDroppedThirdStrike, setShowDroppedThirdStrike] = useState(false);
  const [showStrikeOutTypeModal, setShowStrikeOutTypeModal] = useState(false);
  const [pendingStrikeType, setPendingStrikeType] = useState<'swinging' | 'looking' | null>(null);
  const [showFoulTypeModal, setShowFoulTypeModal] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(false);
  const [battedBallType, setBattedBallType] = useState(baseBattedBallType);
  const [battedBallZone, setBattedBallZone] = useState(defaultZoneOptions[0]);
  const [gameLimitInput, setGameLimitInput] = useState('');
  const recordPayload = useMemo(() => buildGameRecord(state), [state]);
  const { user } = useAuth();
  const [pendingExportId, setPendingExportId] = useState<string | null>(null);
  const isGameStarted = state.gameStarted;
  const isGameOver = state.gameOver;
  const hasActiveMatch = Boolean(state.activeMatchId);
  const LOCK_TTL_MS = 300_000; // UI-side TTL (demoStore와 동일)
  const formatMs = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);
  const lockedByOther = useMemo(() => {
    if (!hasActiveMatch || !state.scorerUid) return false;
    if (lockRemainingMs <= 0) return false;
    return state.scorerUid !== (user?.uid ?? null);
  }, [hasActiveMatch, state.scorerUid, lockRemainingMs, user?.uid]);
  const controlsDisabled = isGameOver || !isGameStarted || !hasActiveMatch || lockedByOther || state.scorerPaused;
  const isExporting = Boolean(pendingExportId);
  const canUndo = state.history.length > 0;
  const playerStats = useMemo(() => buildPlayerStats(recordPayload, { practiceMode: isPracticeMode }), [recordPayload, isPracticeMode]);
  const boxScore = useMemo(() => {
    const { lineScore: liveLine, hits: liveHits, errors: liveErrors } = recordPayload.liveStats;
    const maxInning = Math.max(state.inning, liveLine.home.length, liveLine.away.length);
    const inningsHeader = Array.from({ length: Math.max(9, maxInning) }, (_, i) => i + 1);

    const padInnings = (arr: number[]) =>
      inningsHeader.map((_, idx) => (arr[idx] != null ? arr[idx] : '—'));

    const totals = activeMatch?.postGame?.totals ?? {
      home: { runs: state.score.home, hits: liveHits.home, errors: liveErrors.home },
      away: { runs: state.score.away, hits: liveHits.away, errors: liveErrors.away },
    };

    const lineScore =
      activeMatch?.postGame?.lineScore && activeMatch.postGame.lineScore.innings.length
        ? activeMatch.postGame.lineScore
        : {
            innings: inningsHeader,
            home: liveLine.home,
            away: liveLine.away,
          };
    const baseInnings = Array.from({ length: 9 }, (_v, idx) => idx + 1);
    const hasExtras = (lineScore?.innings?.length ?? 0) > 9;
    const innings = hasExtras ? [...baseInnings, '10+'] : baseInnings;
    const mk = (side: 'home' | 'away') => ({
      name: state.teamNames[side] || (side === 'home' ? homeTeam?.name : awayTeam?.name) || side.toUpperCase(),
      runs: state.score[side],
      hits: totals?.[side]?.hits ?? '—',
      errors: totals?.[side]?.errors ?? '—',
      innings: padInnings(lineScore?.[side]),
      color: side === 'home' ? '#f97316' : '#60a5fa',
    });
    return { innings, rows: [mk('away'), mk('home')] };
  }, [recordPayload, state.inning, state.score, state.teamNames, activeMatch, homeTeam, awayTeam]);
  const hasLiveUrlChange = liveVideoUrlInput.trim() !== state.liveVideoUrl.trim();
  const hasLiveDelayChange = parseInt(liveDelayInput || '0', 10) !== state.liveDelaySeconds;
  const battedBallDetails = useMemo<BattedBallDetails | null>(() => {
    return buildBattedBallDetailsFromValues(battedBallType, battedBallZone);
  }, [battedBallType, battedBallZone]);
  const lockCountdownLabel = useMemo(() => {
    if (!hasActiveMatch || !state.scorerUid || lockRemainingMs <= 0) return '잠금 없음';
    const ownerLabel =
      state.scorerUid === (user?.uid ?? null) ? '만료까지' : '해제 예상까지';
    return `${ownerLabel} ${formatMs(lockRemainingMs)}`;
  }, [hasActiveMatch, state.scorerUid, lockRemainingMs, user?.uid, formatMs]);
  const lockCountdownColor = lockRemainingMs > 30_000 ? '#67e8f9' : '#f87171';

  // 모바일 환경 감지 Effect
  useEffect(() => {
    const checkMobileEnvironment = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
      // 모바일 기기 정규식 체크 또는 화면 너비가 좁을 경우 (기록원 페이지는 넓은 화면 필요)
      const isMobileDevice = /android|ipad|iphone|ipod/i.test(userAgent);
      const isSmallScreen = window.innerWidth < 1024; // 태블릿/모바일 사이즈 기준

      if (isMobileDevice || isSmallScreen) {
        setShowMobileWarning(true);
      }
    };

    checkMobileEnvironment();
  }, []);

  // 락 만료까지 남은 시간 표시 (1초 단위)
  useEffect(() => {
    const update = () => {
      if (!state.scorerLockedAt || !hasActiveMatch) {
        setLockRemainingMs(0);
        return;
      }
      const remaining = Math.max(LOCK_TTL_MS - (Date.now() - state.scorerLockedAt), 0);
      setLockRemainingMs(remaining);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [state.scorerLockedAt, hasActiveMatch]);

  // 경기 시간제한 입력값 동기화
  useEffect(() => {
    queueMicrotask(() => {
      if (state.gameLimitMinutes !== null) {
        setGameLimitInput(state.gameLimitMinutes.toString());
      } else {
        setGameLimitInput('');
      }
    });
  }, [state.gameLimitMinutes]);

  useEffect(() => {
    if (state.gameOver) {
      queueMicrotask(() => setHitWizard(null));
    }
  }, [state.gameOver]);

  useEffect(() => {
    queueMicrotask(() => setSelectedMatchId(state.activeMatchId ?? ''));
  }, [state.activeMatchId]);

  useEffect(() => {
    const incoming = state.liveVideoUrl.trim();
    const sanitized = incoming.includes('YOUR_CHANNEL_ID') ? '' : incoming;
    queueMicrotask(() => setLiveVideoUrlInput(sanitized));
  }, [state.liveVideoUrl]);

  useEffect(() => {
    queueMicrotask(() => setLiveDelayInput(String(state.liveDelaySeconds)));
  }, [state.liveDelaySeconds]);

  useEffect(() => {
    if (!pendingExportId) return;
    if (state.gameOver && state.endedAt === pendingExportId) {
      const filename = buildDownloadName('scorecard', state.endedAt);
      const csv = buildCsvRecord(recordPayload);
      downloadCsv(csv, filename);
      queueMicrotask(() => setPendingExportId(null));
    }
  }, [pendingExportId, recordPayload, state.endedAt, state.gameOver]);

  const openHitAdvanceModal = (bases: 1 | 2 | 3, mode: 'hit' | 'fc' = 'hit') => {
    if (controlsDisabled) return;
    const selections = state.bases.reduce<RunnerAdvanceSelections>((acc, runner, idx) => {
      if (runner) {
        const targetBase = Math.min(idx + 1 + bases, 4);
        acc[idx as 0 | 1 | 2] = targetBase >= 4 ? 4 : (targetBase as 1 | 2 | 3);
      }
      return acc;
    }, {});
    setHitAdvanceModal({
      bases,
      selections,
      mode,
      contextNote: '',
      fcFielder: 'P',
      fcRelay: '없음',
      fcTargetBase: '1',
      fcOutType: 'force',
      pathNote: '',
    });
    setActionModal(null);
    setHitWizard(null);
  };

  const openHitWizardFlow = useCallback(() => {
    if (controlsDisabled) return;
    setHitWizard((prev) =>
      prev
        ? null
        : {
            step: 'result',
            result: null,
            type: baseBattedBallType,
            zone: defaultZoneOptions[0],
            fielder: infieldFielderOptions[0],
          },
    );
  }, [controlsDisabled]);

  const goToNextHitWizardStep = () =>
    setHitWizard((prev) => {
      if (!prev) return prev;
      if (prev.step === 'result') return { ...prev, step: 'type' };
      if (prev.step === 'type') return { ...prev, step: 'zone' };
      return prev;
    });

  const goToPrevHitWizardStep = () =>
    setHitWizard((prev) => {
      if (!prev) return prev;
      if (prev.step === 'zone') return { ...prev, step: 'type' };
      if (prev.step === 'type') return { ...prev, step: 'result' };
      return prev;
    });

  const handleSelectHitResult = (result: BattedBallResultAction) => {
    if (controlsDisabled) return;
    if (result === 'foul') {
      setShowFoulTypeModal(true);
      setHitWizard(null);
      return;
    }
    const typeOptions = getTypeOptionsForResult(result);
    const zoneOptions = getZoneOptionsForResult(result);
    const fielderOptions = getFielderOptionsForResult(result);
    const nextType = isInfieldFlyResult(result)
      ? baseBattedBallType
      : typeOptions.includes(battedBallType)
        ? battedBallType
        : typeOptions[0] ?? baseBattedBallType;
    const nextZone = zoneOptions.includes(battedBallZone) ? battedBallZone : zoneOptions[0] ?? defaultZoneOptions[0];
    const nextFielder =
      fielderOptions?.[0] ??
      (isInfieldFlyResult(result) ? infieldFielderOptions[0] : isOutfieldFlyResult(result) ? outfieldFielderOptions[0] : '');
    setHitWizard((prev) =>
      prev
        ? {
            ...prev,
            result,
            step: 'type',
            type: nextType,
            zone: nextZone,
            fielder: nextFielder,
          }
        : prev,
    );
  };

const handleSelectBattedBallType = (type: string) =>
  setHitWizard((prev) => (prev ? { ...prev, type } : prev));

  const handleSelectBattedBallZone = (zone: string) =>
    setHitWizard((prev) => (prev ? { ...prev, zone } : prev));
  const handleSelectFielder = (fielder: string) =>
    setHitWizard((prev) => (prev ? { ...prev, fielder } : prev));

  const isHitResult = (result: BattedBallResultAction): result is HitResultAction =>
    ['single', 'single_infield', 'single_bunt', 'double', 'double_ground', 'triple', 'hr'].includes(
      result as HitResultAction,
    );

const handleConfirmHitWizard = () => {
  if (!hitWizard?.result || controlsDisabled) {
    setHitWizard(null);
    return;
  }
  const details = buildBattedBallDetailsFromValues(hitWizard.type, hitWizard.zone);
    const fielderOptions = getFielderOptionsForResult(hitWizard.result);
    const fielderNote =
      fielderOptions && hitWizard.fielder && hitWizard.fielder !== fielderOptions[0] ? ` · 포구:${hitWizard.fielder}` : '';
    // 타구 방향(존) 정보
    const zoneNote = hitWizard.zone && hitWizard.zone !== '선택 안 함' ? ` · ${hitWizard.zone}` : '';
  setBattedBallType(hitWizard.type);
  setBattedBallZone(hitWizard.zone);
  setLastHitWizard(hitWizard);
  setHitWizard(null);
  if (isHitResult(hitWizard.result)) {
    if (hitWizard.result === 'hr') {
      actions.homeRun(details);
    } else if (hitWizard.result === 'double' || hitWizard.result === 'double_ground') {
      openHitAdvanceModal(2);
      } else if (hitWizard.result === 'triple') {
        openHitAdvanceModal(3);
      } else {
        openHitAdvanceModal(1);
      }
      return;
    }

    switch (hitWizard.result) {
      case 'fc':
        openHitAdvanceModal(1, 'fc');
        break;
      case 'intentional_walk':
        actions.intentionalWalk();
        break;
      case 'reach_error': {
        const initialSelections = state.bases.reduce<RunnerAdvanceSelections>((acc, runner, idx) => {
          if (runner) acc[idx as 0 | 1 | 2] = 'hold';
          return acc;
        }, {});
        setErrorOnPlayModal({
          selections: initialSelections,
          batterResult: 'hold',
          errorType: errorTypeOptions[0].value,
          context: '',
          fielder: infieldFielderOptions[0],
        });
        break;
      }
      case 'out_three_bunt':
        actions.addOutWithMessage(`쓰리번트 파울 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'catcher_interference':
        actions.catcherInterference();
        break;
      case 'sac_fly':
        actions.sacFly(details);
        break;
      case 'sac_bunt':
        actions.sacBunt(details);
        break;
      case 'out_ground':
        actions.addOutWithMessage(`땅볼 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'out_fly':
        actions.addOutWithMessage(`뜬공 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'out_line':
        actions.addOutWithMessage(`라인드라이브 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'out_dp2': {
        const runnersOnBase = state.bases.filter((r) => r !== null).length;
        if (runnersOnBase >= 1) {
          setDoublePlayModal({ outsCount: 2, battedBall: details });
        } else {
          actions.doublePlay(details);
        }
        break;
      }
      case 'out_tp3': {
        const runnersOnBase = state.bases.filter((r) => r !== null).length;
        if (runnersOnBase >= 2) {
          setDoublePlayModal({ outsCount: 3, battedBall: details });
        } else {
          actions.triplePlay(details);
        }
        break;
      }
      case 'out_multiple': {
        const runnersOnBase = state.bases.filter((r) => r !== null).length;
        if (runnersOnBase >= 1) {
          setMultipleRunnersOutModal(true);
        } else {
          actions.addOutWithMessage(`기타 더블아웃${zoneNote}${fielderNote}`, details);
        }
        break;
      }
      case 'out_infield_fly':
        actions.addOutWithMessage(`내야 플라이 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'out_infield_fly_rule':
        actions.addOutWithMessage(`인필드 플라이 선언${zoneNote}${fielderNote}`, details);
        break;
      case 'out_outfield_fly':
        actions.addOutWithMessage(`외야 플라이 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'out_other':
        actions.addOutWithMessage(`기타 아웃${zoneNote}${fielderNote}`, details);
        break;
      case 'foul':
        setShowFoulTypeModal(true);
        break;
      default:
        break;
    }
  };

  const handleAction = (action: string) => {
    if (controlsDisabled) return;
    if (action === 'hitMenu') {
      openHitWizardFlow();
      return;
    }

    if (action === 'strike' && state.strikes >= 2) {
      setShowStrikeOutTypeModal(true);
      setHitWizard(null);
      return;
    }

    switch (action) {
      case 'ball':
        actions.addBall();
        break;
      case 'strike':
        actions.addStrike();
        break;
      case 'foul':
        setShowFoulTypeModal(true);
        break;
      case 'single':
        openHitAdvanceModal(1);
        break;
      case 'double':
        openHitAdvanceModal(2);
        break;
      case 'triple':
        openHitAdvanceModal(3);
        break;
      case 'hr':
        actions.homeRun(battedBallDetails);
        break;
      case 'walk':
        actions.walk();
        break;
      case 'intentional_walk':
        actions.intentionalWalk();
        break;
      case 'hbp':
        actions.hbp();
        break;
      case 'catcher_interference':
        actions.catcherInterference();
        break;
      case 'out_ground':
        actions.addOutWithMessage('땅볼 아웃', battedBallDetails);
        break;
      case 'out_fly':
        actions.addOutWithMessage('뜬공 아웃', battedBallDetails);
        break;
      case 'out_line':
        actions.addOutWithMessage('라인드라이브 아웃', battedBallDetails);
        break;
      case 'out_dp2': {
        const runnersOnBase = state.bases.filter((r) => r !== null).length;
        if (runnersOnBase >= 1) {
          setDoublePlayModal({ outsCount: 2, battedBall: battedBallDetails });
        } else {
          actions.doublePlay(battedBallDetails);
        }
        break;
      }
      case 'out_tp3': {
        const runnersOnBase = state.bases.filter((r) => r !== null).length;
        if (runnersOnBase >= 2) {
          setDoublePlayModal({ outsCount: 3, battedBall: battedBallDetails });
        } else {
          actions.triplePlay(battedBallDetails);
        }
        break;
      }
      case 'out_infield_fly':
        actions.addOutWithMessage('내야 플라이 아웃', battedBallDetails);
        break;
      case 'out_outfield_fly':
        actions.addOutWithMessage('외야 플라이 아웃', battedBallDetails);
        break;
      case 'out_other':
        actions.addOutWithMessage('기타 아웃', battedBallDetails);
        break;
      case 'sac':
        actions.sacFly(battedBallDetails);
        break;
      case 'resetCount':
        actions.resetCount();
        break;
      case 'clearBases':
        actions.clearBases();
        break;
      case 'nextHalf':
        actions.nextHalf();
        break;
      case 'multipleOut': {
        const runnersOnBase = state.bases.filter((r) => r !== null).length;
        if (runnersOnBase >= 1) {
          setMultipleRunnersOutModal(true);
        }
        break;
      }
      case 'undo':
        actions.undo();
        break;
      default:
        break;
    }

    setHitWizard(null);
  };

  // 키보드 단축키 이벤트 리스너
  useEffect(() => {
    if (!shortcutsEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달이 열려있거나 입력 필드에 포커스가 있으면 단축키 무시
      if (
        hitWizard ||
        hitAdvanceModal ||
        actionModal ||
        showStrikeOutTypeModal ||
        showFoulTypeModal ||
        showDroppedThirdStrike ||
        errorOnPlayModal ||
        doublePlayModal ||
        positionSwapModal
      ) {
        return;
      }

      // 입력 필드에 포커스가 있으면 무시
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return;
      }

      // 컨트롤이 비활성화되어 있으면 무시
      if (controlsDisabled) return;

      const key = e.key;

      switch (key) {
        case '1':
          e.preventDefault();
          actions.addBall();
          break;
        case '2':
          e.preventDefault();
          if (state.strikes >= 2) {
            setShowStrikeOutTypeModal(true);
            setHitWizard(null);
          } else {
            actions.addStrike();
          }
          break;
        case '3':
          e.preventDefault();
          openHitWizardFlow();
          break;
        case '4':
          e.preventDefault();
          actions.undo();
          break;
        case '5':
          e.preventDefault();
          setShowFoulTypeModal(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    shortcutsEnabled,
    controlsDisabled,
    hitWizard,
    hitAdvanceModal,
    actionModal,
    showStrikeOutTypeModal,
    showFoulTypeModal,
    showDroppedThirdStrike,
    errorOnPlayModal,
    doublePlayModal,
    positionSwapModal,
    actions,
    state.strikes,
    openHitWizardFlow,
  ]);

  const handleConfirmHitAdvance = () => {
    if (!hitAdvanceModal) return;
    const { bases, selections, mode, contextNote, fcFielder, fcRelay, fcTargetBase, fcOutType, pathNote } = hitAdvanceModal;
    if (mode === 'fc') {
      const parts: string[] = [];
      if (fcFielder) parts.push(`${fcFielder} 처리`);
      if (fcRelay && fcRelay !== '없음') parts.push(`중계 ${fcRelay}`);
      if (fcTargetBase) parts.push(`${fcTargetBase}루 ${fcOutType === 'tag' ? '태그' : '포스'} 시도`);
      if (contextNote?.trim()) parts.push(contextNote.trim());
      const context = parts.join(' · ');
      actions.fielderChoice(selections, battedBallDetails, context);
    } else {
      if (bases === 1) actions.hitSingle(selections, battedBallDetails);
      if (bases === 2) actions.hitDouble(selections, battedBallDetails);
      if (bases === 3) actions.hitTriple(selections, battedBallDetails);
    }
    if (pathNote?.trim()) {
      actions.setPlay(`주루 메모 · ${pathNote.trim()}`);
    }
    setHitAdvanceModal(null);
  };

  const handleManualSubmit = () => {
    const text = manualBroadcast.trim();
    if (!text) return;
    actions.addManualLog(text);
    setManualBroadcast('');
  };

  const handleLiveUrlSave = () => {
    if (lockedByOther) return;
    const normalized = normalizeLiveUrl(liveVideoUrlInput);
    setLiveVideoUrlInput(normalized);
    if (normalized !== state.liveVideoUrl) {
      actions.setLiveVideoUrl(normalized);
    }
  };

  const handleLiveDelaySave = () => {
    if (lockedByOther) return;
    const parsed = parseInt(liveDelayInput || '0', 10);
    const seconds = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setLiveDelayInput(String(seconds));
    if (seconds !== state.liveDelaySeconds) {
      actions.setLiveDelaySeconds(seconds);
      // 확인 메시지 표시
      alert(`라이브 오버레이 지연시간이 ${seconds}초로 설정되었습니다.`);
    }
  };

  const handleStartGame = () => {
    if (!hasActiveMatch || isGameStarted || isGameOver || lockedByOther) return;
    setHitWizard(null);
    setActionModal(null);
    actions.startGame();
  };

  const handleStrikeOutType = (type: 'swinging' | 'looking') => {
    setShowStrikeOutTypeModal(false);
    setPendingStrikeType(type);
    setShowDroppedThirdStrike(true);
  };

  const handleDroppedThirdStrike = (variant: 'strikeout' | 'reach' | 'tag_out') => {
    setShowDroppedThirdStrike(false);
    const strikeType = pendingStrikeType ?? undefined;
    setPendingStrikeType(null);
    actions.droppedThirdStrike(variant, strikeType);
  };

  const handleEndGame = () => {
    if (lockedByOther) return;
    if (!isGameStarted && !state.gameOver) return;
    if (state.gameOver) {
      const filename = buildDownloadName('scorecard', state.endedAt);
      const csv = buildCsvRecord(recordPayload);
      downloadCsv(csv, filename);
      return;
    }
    const endedAt = new Date().toISOString();
    setPendingExportId(endedAt);
    actions.endGame(endedAt);
  };

  const handleNewGame = () => {
    setPendingExportId(null);
    setHitWizard(null);
    setActionModal(null);
    actions.resetGame();
  };

  return (
    <div
      style={{
        borderRadius: '20px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: '#0b0f1a',
        color: '#e2e8f0',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}
    >
      <section
        style={{
          padding: '12px 18px 10px',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          display: 'grid',
          gap: '8px',
          background: 'rgba(15, 23, 42, 0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>기록할 경기 선택</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0' }}>경기 일정에서 선택한 경기를 불러와 기록을 시작합니다.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {isPracticeMode ? (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: '1px solid rgba(251,191,36,0.55)',
                  background: 'rgba(251,191,36,0.16)',
                  color: '#fcd34d',
                  fontWeight: 900,
                  fontSize: '12px',
                  letterSpacing: '-0.01em',
                }}
              >
                연습경기
              </span>
            ) : null}
            <select
              value={selectedMatchId}
              onChange={(event) => setSelectedMatchId(event.target.value)}
              style={{
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.4)',
                padding: '8px 12px',
                background: 'rgba(15,23,42,0.8)',
                color: '#e2e8f0',
                minWidth: '240px',
              }}
            >
              <option value="">경기를 선택하세요</option>
              {state.matches.map((match) => (
                <option key={match.id} value={match.id}>
                  {match.awayTeamName} vs {match.homeTeamName} ({match.status === 'completed' ? '종료' : '예정'})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => actions.selectMatch(selectedMatchId || null)}
              style={{
                padding: '8px 14px',
                borderRadius: '999px',
                border: '1px solid rgba(148,163,184,0.4)',
                background: 'rgba(148,163,184,0.18)',
                color: '#e2e8f0',
                fontWeight: 800,
                cursor: selectedMatchId ? 'pointer' : 'not-allowed',
                opacity: selectedMatchId ? 1 : 0.5,
              }}
              disabled={!selectedMatchId}
            >
              기록 선택
            </button>
          </div>
        </div>
        {activeMatch ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', color: '#cbd5e1', fontSize: '13px' }}>
            <span>선택된 경기: {activeMatch.awayTeamName} vs {activeMatch.homeTeamName}</span>
            <span>일시: {formatDateTimeLabel(activeMatch.startTime)}</span>
            <span>라인업: {activeMatch.lineups ? '사전 저장됨' : '미저장'}</span>
          </div>
        ) : (
          <span style={{ color: '#fbbf24', fontSize: '13px' }}>현재 선택된 경기가 없습니다.</span>
        )}
      </section>
      <header
        style={{
          padding: '12px 18px',
          background: '#111827',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 800,
          letterSpacing: '-0.01em',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 10px', borderRadius: '10px', background: '#f3f4f6', color: '#111827', fontWeight: 900 }}>
            Dashboard
          </span>
          <span style={{ color: '#cbd5e1' }}>
            {state.teamNames.away} {state.score.away} - {state.teamNames.home} {state.score.home} |{' '}
            {state.half === 'top' ? 'Top' : 'Bot'} {state.inning} | B:{state.balls} S:{state.strikes} O:{state.outs}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* 기록원 정보 표시 영역 */}
          <span style={{ fontSize: '14px', color: state.scorerUid ? '#38bdf8' : '#b33131' }}>
            {state.scorerUid
              ? `현재 기록원: ${state.scorerName || state.scorerEmail || '알 수 없음'}`
              : '기록원 부재'}
          </span>
          {/* 동접자 수 표시 */}
          <span
            style={{
              fontSize: '13px',
              color: '#22c55e',
              padding: '4px 10px',
              borderRadius: '8px',
              background: 'rgba(34, 197, 94, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '14px' }}>👥</span>
            {state.onlineViewerCount}명 접속
          </span>
        </div>
      </header>

      <section
        style={{
          padding: '10px 18px 4px',
        }}
      >
        <div
          style={{
            width: '100%',
            borderRadius: '16px',
            border: '1px solid rgba(148,163,184,0.3)',
            background: 'rgba(15,23,42,0.7)',
            padding: '8px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
          }}
        >
          <BoxScoreTable data={boxScore} />
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '550px 960px',
          gap: '10px',
          padding: '16px',
          alignItems: 'start',
          justifyContent: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: '12px', minHeight: '680px', minWidth: 0, justifyItems: 'start' }}>
          <FieldView
            bases={state.bases}
            inning={state.inning}
            half={state.half}
            outs={state.outs}
            balls={state.balls}
            strikes={state.strikes}
            batterName={currentBatter}
            defenseAssignments={getDefenseAssignments(defenseLineup)}
            onSelectRunner={(payload) => {
              if (controlsDisabled) return;
              // 주자의 lineupIndex 찾기 (공격팀 라인업에서)
              const offenseLineup = state.lineups[hittingSide];
              const lineupIndex = offenseLineup.findIndex((slot) => getUniqueName(slot.name, slot.number) === payload.name);
              setActionModal({ role: 'runner', ...payload, side: hittingSide, lineupIndex });
            }}
            onSelectBatter={() => {
              if (controlsDisabled) return;
              setActionModal({ role: 'batter', name: currentBatter, side: hittingSide, lineupIndex: currentBatterLineupIndex });
            }}
            onSelectFielder={(payload) => {
              if (controlsDisabled) return;
              // 수비수의 lineupIndex 찾기
              const lineupIndex = defenseLineup.findIndex((slot) => slot.name === payload.name);
              setActionModal({ role: 'fielder', ...payload, side: defenseSide, lineupIndex });
            }}
          />
          <div
            style={{
              padding: '14px',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255,255,255,0.03)',
              display: 'grid',
              gap: '10px',
              minHeight: '220px',
              width: '100%',
              maxWidth: '550px',
              minWidth: '480px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#cbd5e1',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 900 }}>Command Center</span>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '8px',
                  width: '100%',
                  marginTop: '-35px',
                }}
              >
                {/* 경기 시간제한 입력 (경기 시작 전에만 표시) - 별도 줄 */}
                {!isGameOver && hasActiveMatch && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
                      경기 시간 제한:
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={gameLimitInput}
                      onChange={(e) => setGameLimitInput(e.target.value)}
                      placeholder="분 입력 (예: 90)"
                      disabled={lockedByOther || (state.gameStarted && state.gamePausedAt === null)}
                      style={{
                        width: '100px',
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #374151',
                        background: '#1f2937',
                        color: '#f8fafc',
                        fontSize: '13px',
                        opacity: (lockedByOther || (state.gameStarted && state.gamePausedAt === null)) ? 0.5 : 1,
                      }}
                    />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>분</span>
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = gameLimitInput.trim();
                        if (!trimmed) {
                          console.log('제한시간 설정: 빈 값으로 null 설정');
                          actions.setGameLimit(null);
                          return;
                        }
                        const parsed = parseInt(trimmed, 10);
                        if (isNaN(parsed) || parsed < 0) {
                          console.log('제한시간 설정: 유효하지 않은 값', trimmed);
                          alert('유효한 숫자를 입력해주세요 (0 이상)');
                          return;
                        }
                        console.log('제한시간 설정:', parsed, '분');
                        actions.setGameLimit(parsed);
                      }}
                      disabled={lockedByOther || (state.gameStarted && state.gamePausedAt === null)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #3b82f6',
                        background: '#1e40af',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: (lockedByOther || (state.gameStarted && state.gamePausedAt === null)) ? 'not-allowed' : 'pointer',
                        opacity: (lockedByOther || (state.gameStarted && state.gamePausedAt === null)) ? 0.5 : 1,
                      }}
                    >
                      설정
                    </button>
                    {state.gameLimitMinutes !== null && (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e' }}>
                        ✓ {state.gameLimitMinutes}분 설정됨
                      </span>
                    )}
                  </div>
                )}

                {/* 상태 뱃지 + 타이머 + 일시정지 + 경기 시작 버튼 줄 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {state.gameStarted && !state.gameOver && state.gameLimitMinutes !== null && (
                      <>
                        <GameTimerDisplay
                          gameLimitMinutes={state.gameLimitMinutes}
                          gameStartTimestamp={state.gameStartTimestamp}
                          gamePausedAt={state.gamePausedAt}
                          gamePausedDuration={state.gamePausedDuration}
                          gameStarted={state.gameStarted}
                          style={{
                            padding: '6px 10px',
                            fontSize: '12px',
                          }}
                        />
                        {!lockedByOther && (
                          <button
                            type="button"
                            onClick={() => state.gamePausedAt !== null ? actions.resumeGameTimer() : actions.pauseGameTimer()}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: `1px solid ${state.gamePausedAt !== null ? '#10b981' : '#f97316'}`,
                              background: state.gamePausedAt !== null ? '#059669' : '#ea580c',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {state.gamePausedAt !== null ? '⏵ 타이머 재개' : '⏸ 타이머 일시정지'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleStartGame}
                    disabled={isGameOver || isGameStarted || lockedByOther}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid rgba(16,185,129,0.5)',
                      background: isGameStarted
                        ? 'rgba(148,163,184,0.16)'
                        : 'linear-gradient(90deg, #10b981, #0ea5e9)',
                      color: isGameStarted ? '#cbd5e1' : '#0b0f1a',
                      fontWeight: 900,
                      fontSize: '13px',
                      cursor: isGameOver || isGameStarted ? 'not-allowed' : 'pointer',
                      opacity: isGameOver ? 0.6 : 1,
                      boxShadow: isGameStarted ? 'none' : '0 10px 20px rgba(16,185,129,0.22)',
                    }}
                  >
                    {isGameStarted ? '경기 진행 중' : '경기 시작'}
                  </button>
                </div>

                {/* 하단: 락 설명 + 카운트다운 + 잠금 해제 한 줄 배치 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>
                    락은 입력 중 5분 동안 유지되고 60초마다 갱신됩니다. 락 소유자만 기록 가능.{' '}
                    <span style={{ color: lockCountdownColor }}>{lockCountdownLabel}</span>
                  </span>
                  {!lockedByOther && state.scorerUid === (user?.uid ?? null) && !state.scorerPaused ? (
                    <button
                      type="button"
                      onClick={() => actions.releaseLock()}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(248,113,113,0.5)',
                        background: 'rgba(248,113,113,0.12)',
                        color: '#fecdd3',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      잠금 해제
                    </button>
                  ) : null}
                  {state.scorerPaused ? (
                    <button
                      type="button"
                      onClick={() => actions.resumeLock()}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: '1px solid rgba(52,211,153,0.5)',
                        background: 'rgba(34,197,94,0.12)',
                        color: '#bbf7d0',
                        fontWeight: 900,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      기록 재개
                    </button>
                  ) : null}
                  {lockedByOther ? (
                    <span style={{ color: '#f87171', fontWeight: 800, fontSize: '12px' }}>
                      다른 기록원이 기록 중입니다 ({state.scorerName || state.scorerEmail || state.scorerUid || '알 수 없음'})
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
              {mainButtons.map((btn) => {
                const isUndo = btn.action === 'undo';
                const isHitMenu = btn.action === 'hitMenu';
                const isActive = isHitMenu && Boolean(hitWizard);
                const isDisabled = controlsDisabled || (isUndo && !canUndo);
                return (
                  <button
                    key={btn.label}
                    type="button"
                    disabled={isDisabled}
                    style={{
                      padding: '14px 12px',
                      borderRadius: '12px',
                      border: isUndo ? '1px solid rgba(148,163,184,0.35)' : 'none',
                      background: isUndo
                        ? isDisabled
                          ? 'rgba(148,163,184,0.12)'
                          : 'rgba(148,163,184,0.18)'
                        : btn.color,
                      color: isUndo ? '#e2e8f0' : '#0b0f1a',
                      fontWeight: 900,
                      fontSize: '14px',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      boxShadow: isUndo ? 'none' : '0 10px 22px rgba(0,0,0,0.25)',
                      outline: isActive ? '2px solid rgba(59,130,246,0.6)' : 'none',
                      opacity: isDisabled ? 0.6 : 1,
                    }}
                    onClick={() => !isDisabled && handleAction(btn.action)}
                  >
                    {btn.label}
                    {shortcutsEnabled && (
                      <span style={{
                        marginLeft: '4px',
                        fontSize: '11px',
                        opacity: 0.7,
                        fontWeight: 700,
                      }}>
                        {btn.action === 'ball' && '(1)'}
                        {btn.action === 'strike' && '(2)'}
                        {btn.action === 'hitMenu' && '(3)'}
                        {btn.action === 'undo' && '(4)'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
              타격 후 결과(안타·희생·아웃·파울)를 먼저 고르면, 상황에 맞는 세부 유형/방향 선택으로 이어집니다.
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
              {secondaryButtons.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  disabled={controlsDisabled}
                  style={{
                    padding: '10px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(15,23,42,0.4)',
                    background: 'rgba(255,255,255,0.06)',
                    color: btn.color,
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                    opacity: controlsDisabled ? 0.6 : 1,
                  }}
                  onClick={() => handleAction(btn.action)}
                >
                  {btn.label}
                  {shortcutsEnabled && btn.action === 'foul' && (
                    <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>(5)</span>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShortcutsEnabled(!shortcutsEnabled)}
                style={{
                  padding: '10px 10px',
                  borderRadius: '10px',
                  border: shortcutsEnabled ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(15,23,42,0.4)',
                  background: shortcutsEnabled ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                  color: shortcutsEnabled ? '#93c5fd' : '#94a3b8',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                단축키 {shortcutsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.5)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>기록원 수기 문자 중계</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>경기 전·후에도 전송 가능</span>
              </div>
              <textarea
                value={manualBroadcast}
                onChange={(e) => setManualBroadcast(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
                rows={3}
                placeholder="예) 오늘은 비로 인해 경기 시작이 10분 지연됩니다."
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: '72px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(59,130,246,0.4)',
                    background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                    color: '#f8fafc',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(37,99,235,0.25)',
                    opacity: manualBroadcast.trim() ? 1 : 0.7,
                  }}
                  disabled={!manualBroadcast.trim()}
                >
                  문자 중계 전송
                </button>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                문자중계 페이지에 "*기록원* - 내용"으로 바로 반영됩니다. Enter 키로 전송, 줄바꿈은 Ctrl/Cmd+Enter.
              </span>
            </div>
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.48)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>라이브 영상 링크</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Live Overlay 페이지에 반영</span>
              </div>
              <input
                value={liveVideoUrlInput}
                onChange={(e) => setLiveVideoUrlInput(e.target.value)}
                onBlur={() => setLiveVideoUrlInput((val) => normalizeLiveUrl(val))}
                placeholder="YouTube 임베드/공유 링크 또는 플레이어 URL을 입력하세요"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                  YouTube 공유 링크를 붙여넣으면 임베드 주소로 자동 변환됩니다.
                </span>
                <button
                  type="button"
                  onClick={handleLiveUrlSave}
                  disabled={!hasLiveUrlChange || lockedByOther}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(16,185,129,0.45)',
                    background: hasLiveUrlChange ? 'linear-gradient(90deg, #10b981, #059669)' : 'rgba(148,163,184,0.18)',
                    color: hasLiveUrlChange ? '#0b0f1a' : '#cbd5e1',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: hasLiveUrlChange ? 'pointer' : 'not-allowed',
                    boxShadow: hasLiveUrlChange ? '0 10px 20px rgba(16,185,129,0.24)' : 'none',
                    opacity: hasLiveUrlChange ? 1 : 0.8,
                  }}
                >
                  영상 링크 적용
                </button>
              </div>
            </div>
            <div
              style={{
                marginTop: '8px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.48)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>라이브 지연시간</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>유튜브 라이브 싱크 조정</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={liveDelayInput}
                  onChange={(e) => setLiveDelayInput(e.target.value)}
                  placeholder="0"
                  disabled={lockedByOther}
                  style={{
                    width: '120px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0f172a',
                    color: '#e2e8f0',
                    fontWeight: 800,
                    fontSize: '13px',
                  }}
                />
                <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}>초</span>
                <button
                  type="button"
                  onClick={handleLiveDelaySave}
                  disabled={!hasLiveDelayChange || lockedByOther}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(16,185,129,0.45)',
                    background: hasLiveDelayChange ? 'linear-gradient(90deg, #10b981, #059669)' : 'rgba(148,163,184,0.18)',
                    color: hasLiveDelayChange ? '#0b0f1a' : '#cbd5e1',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: hasLiveDelayChange ? 'pointer' : 'not-allowed',
                    boxShadow: hasLiveDelayChange ? '0 10px 20px rgba(16,185,129,0.24)' : 'none',
                    opacity: hasLiveDelayChange ? 1 : 0.8,
                  }}
                >
                  지연시간 적용
                </button>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                유튜브 라이브 지연시간을 고려하여 오버레이 업데이트 시점을 조정합니다. (일반적으로 10-30초)
              </span>
            </div>
            <div
              style={{
                marginTop: '4px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.45)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>경기 종료 및 기록 저장</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>CSV 기록지 다운로드</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
                  버튼을 누르면 기록 입력이 잠기고 실제 야구 기록지 형태의 CSV 파일을 내려받습니다. 종료 후에도 다시 다운로드할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={handleEndGame}
                  disabled={isExporting || lockedByOther}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    background: isGameOver ? 'linear-gradient(90deg, #0f172a, #111827)' : 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                    color: '#e2e8f0',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    boxShadow: isGameOver ? 'none' : '0 10px 22px rgba(37, 99, 235, 0.35)',
                    opacity: isExporting ? 0.6 : 1,
                  }}
                >
                  {isExporting ? '기록 저장 중...' : isGameOver ? 'CSV 기록지 다시 받기' : '경기 종료 & CSV 다운로드'}
                </button>
              </div>
              {state.endedAt ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '12px' }}>
                  <span
                    style={{
                      padding: '6px 8px',
                      borderRadius: '10px',
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(16,185,129,0.35)',
                      color: '#34d399',
                      fontWeight: 900,
                    }}
                  >
                    종료 시각
                  </span>
                  <span>{formatDateTimeLabel(state.endedAt)}</span>
                </div>
              ) : null}
              {isGameOver ? (
                <button
                  type="button"
                  onClick={handleNewGame}
                  style={{
                    marginTop: '4px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 222, 128, 0.4)',
                    background: 'linear-gradient(90deg, #16a34a, #15803d)',
                    color: '#f8fafc',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 12px 24px rgba(22, 163, 74, 0.35)',
                  }}
                >
                  새 경기 시작 (기록 초기화)
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#111827',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            padding: '14px',
            display: 'grid',
            gap: '14px',
            minHeight: '360px',
            gridTemplateColumns: '1fr',
            minWidth: 'min(520px, 100%)',
            width: '100%',
            maxWidth: '960px',
            justifySelf: 'start',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1px 1fr',
              gap: '14px',
              alignItems: 'start',
            }}
          >
            <TeamEditor
              label="AWAY"
              defaultName={awayTeam?.name ?? state.teamNames.away}
              side="away"
              teamName={state.teamNames.away}
              lineup={state.lineups.away}
              bench={state.benches.away}
              benchInput={benchInput.away}
              onChangeBenchInput={(val) => setBenchInput((p) => ({ ...p, away: val }))}
              onSetTeamName={actions.setTeamName}
              onSetLineup={actions.setLineup}
              onRemoveLineupSlot={actions.removeLineupSlot}
              onAddBench={actions.addBench}
              onRemoveBench={actions.removeBench}
              onSubstitute={actions.substitute}
              highlightBatterIndex={hittingSide === 'away' ? currentBatterEntry?.idx : undefined}
              highlightPitcherName={defenseSide === 'away' ? currentPitcherSlot?.name : undefined}
              practiceMode={isPracticeMode}
              gameStarted={isGameStarted}
              onOpenPositionSwap={() => setPositionSwapModal({ side: 'away' })}
            />
            <div
              aria-hidden
              style={{
                width: '1px',
                background: 'rgba(148, 163, 184, 0.3)',
                borderRadius: '999px',
                alignSelf: 'stretch',
              }}
            />
            <TeamEditor
              label="HOME"
              defaultName={homeTeam?.name ?? state.teamNames.home}
              side="home"
              teamName={state.teamNames.home}
              lineup={state.lineups.home}
              bench={state.benches.home}
              benchInput={benchInput.home}
              onChangeBenchInput={(val) => setBenchInput((p) => ({ ...p, home: val }))}
              onSetTeamName={actions.setTeamName}
              onSetLineup={actions.setLineup}
              onRemoveLineupSlot={actions.removeLineupSlot}
              onAddBench={actions.addBench}
              onRemoveBench={actions.removeBench}
              onSubstitute={actions.substitute}
              highlightBatterIndex={hittingSide === 'home' ? currentBatterEntry?.idx : undefined}
              highlightPitcherName={defenseSide === 'home' ? currentPitcherSlot?.name : undefined}
              practiceMode={isPracticeMode}
              gameStarted={isGameStarted}
              onOpenPositionSwap={() => setPositionSwapModal({ side: 'home' })}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '0 18px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '14px',
        }}
      >
        <div style={{ display: 'grid', gap: '10px' }}>
          <StatsTable title={`${state.teamNames.away} 타자 기록`} stats={playerStats.hitters.away} variant="batter" density="regular" />
          <StatsTable title={`${state.teamNames.away} 투수 기록`} stats={playerStats.pitchers.away} variant="pitcher" density="regular" />
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <StatsTable title={`${state.teamNames.home} 타자 기록`} stats={playerStats.hitters.home} variant="batter" density="regular" />
          <StatsTable title={`${state.teamNames.home} 투수 기록`} stats={playerStats.pitchers.home} variant="pitcher" density="regular" />
        </div>
      </div>

      <div
        style={{
          padding: '0 18px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}
      >
        <RemovedPlayersPanel title="교체 out (AWAY)" players={state.removed.away} density="regular" />
        <RemovedPlayersPanel title="교체 out (HOME)" players={state.removed.home} density="regular" />
      </div>

      {hitWizard && (
        <HitWizardModal
          state={hitWizard}
          onClose={() => setHitWizard(null)}
          onNext={goToNextHitWizardStep}
          onBack={goToPrevHitWizardStep}
          onSelectResult={handleSelectHitResult}
          onSelectType={handleSelectBattedBallType}
          onSelectZone={handleSelectBattedBallZone}
          onSelectFielder={handleSelectFielder}
          onConfirm={handleConfirmHitWizard}
        />
      )}
      {actionModal && (
        <ActionModal
          data={actionModal}
          onClose={() => setActionModal(null)}
          actions={actions}
          bases={state.bases}
          bench={actionModal.role === 'fielder' ? state.benches[defenseSide] : state.benches[hittingSide]}
          lineup={actionModal.role === 'fielder' ? state.lineups[defenseSide] : state.lineups[hittingSide]}
        />
      )}
      {positionSwapModal && (
        <PositionSwapModal
          side={positionSwapModal.side}
          lineup={state.lineups[positionSwapModal.side]}
          bench={state.benches[positionSwapModal.side]}
          practiceMode={isPracticeMode}
          onClose={() => setPositionSwapModal(null)}
          onSwap={(swaps, benchSwaps) => actions.swapPositions(positionSwapModal.side, swaps, benchSwaps)}
        />
      )}
      {hitAdvanceModal && (
        <HitAdvanceModal
          bases={hitAdvanceModal.bases}
          basesState={state.bases}
          mode={hitAdvanceModal.mode}
          contextNote={hitAdvanceModal.contextNote}
          fcFielder={hitAdvanceModal.fcFielder}
          fcRelay={hitAdvanceModal.fcRelay}
          fcTargetBase={hitAdvanceModal.fcTargetBase}
          fcOutType={hitAdvanceModal.fcOutType}
          selections={hitAdvanceModal.selections}
          onChangeSelections={(next) => setHitAdvanceModal((prev) => (prev ? { ...prev, selections: next } : prev))}
          onChangeContextNote={(text) => setHitAdvanceModal((prev) => (prev ? { ...prev, contextNote: text } : prev))}
          onChangeFcFielder={(val) => setHitAdvanceModal((prev) => (prev ? { ...prev, fcFielder: val } : prev))}
          onChangeFcRelay={(val) => setHitAdvanceModal((prev) => (prev ? { ...prev, fcRelay: val } : prev))}
          onChangeFcTargetBase={(val) => setHitAdvanceModal((prev) => (prev ? { ...prev, fcTargetBase: val } : prev))}
          onChangeFcOutType={(val) => setHitAdvanceModal((prev) => (prev ? { ...prev, fcOutType: val } : prev))}
          onClose={() => setHitAdvanceModal(null)}
          onBack={() => {
            setHitAdvanceModal(null);
            if (lastHitWizard) {
              setHitWizard({ ...lastHitWizard, step: 'zone' });
            }
          }}
          onConfirm={handleConfirmHitAdvance}
        />
      )}
      {errorOnPlayModal && (
        <ErrorOnPlayModal
          basesState={state.bases}
          defaultFielder={errorOnPlayModal.fielder}
          defaultErrorType={errorOnPlayModal.errorType}
          defaultContext={errorOnPlayModal.context}
          defaultSelections={errorOnPlayModal.selections}
          defaultBatterResult={errorOnPlayModal.batterResult}
          onClose={() => setErrorOnPlayModal(null)}
          onBack={() => {
            setErrorOnPlayModal(null);
            if (lastHitWizard) {
              setHitWizard({ ...lastHitWizard, step: 'zone' });
            }
          }}
          onConfirm={({ fielder, errorType, context, batterResult, selections, pitchResult }) => {
            // 폭투/포일 시 볼/스트라이크 카운트 추가
            if (pitchResult === 'ball') {
              actions.addBall();
            } else if (pitchResult === 'strike') {
              actions.addStrike();
            }
            actions.recordError({
              fielderPos: fielder || '수비',
              errorType: decorateErrorType(errorType, fielder || '수비'),
              context,
              advanceResults: { batter: batterResult, runners: selections },
            });
            setErrorOnPlayModal(null);
          }}
        />
      )}
      {doublePlayModal && (
        <DoublePlayModal
          outsCount={doublePlayModal.outsCount}
          basesState={state.bases}
          onClose={() => setDoublePlayModal(null)}
          onConfirm={(selectedRunners, route, runnerAdvancements) => {
            if (doublePlayModal.outsCount === 2) {
              actions.doublePlay(doublePlayModal.battedBall, selectedRunners, route, runnerAdvancements);
            } else {
              actions.triplePlay(doublePlayModal.battedBall, selectedRunners, route, runnerAdvancements);
            }
            setDoublePlayModal(null);
          }}
        />
      )}
      {multipleRunnersOutModal && (
        <MultipleRunnersOutModal
          basesState={state.bases}
          minOuts={1}
          onClose={() => setMultipleRunnersOutModal(false)}
          // [중요] onConfirm 핸들러 수정: isBatterSafe 매개변수 추가 및 분기 처리
          onConfirm={(selectedRunners, label, isBatterSafe) => {
            if (isBatterSafe) {
              // 1. 타자 출루 시 (타격 상황): 야수선택(Fielder's Choice) 액션 사용
              // 선택된 주자들의 결과를 'out'으로 설정하여 넘겨줍니다.
              const selections: RunnerAdvanceSelections = {};
              selectedRunners.forEach((baseIdx) => {
                selections[baseIdx as 0 | 1 | 2] = 'out';
              });
        
              // fielderChoice 액션은 내부적으로 '타자를 1루에 배치'하고 '타순을 변경'합니다.
              actions.fielderChoice(selections, null, label);
            } else {
              // 2. 타자 출루 없음 (주루사 상황): 기존 multipleRunnersOut 액션 사용
              // 이 액션은 타자를 그대로 둡니다.
              actions.multipleRunnersOut(selectedRunners, label);
            }
            setMultipleRunnersOutModal(false);
          }}
        />
      )}
      {showStrikeOutTypeModal && (
        <StrikeOutTypeModal
          batterName={currentBatter}
          onClose={() => setShowStrikeOutTypeModal(false)}
          onSelect={handleStrikeOutType}
        />
      )}
      {showFoulTypeModal && (
        <FoulTypeModal
          batterName={currentBatter}
          strikes={state.strikes}
          onClose={() => setShowFoulTypeModal(false)}
          onSelect={(isBunt) => {
            actions.addFoul(isBunt);
            setShowFoulTypeModal(false);
          }}
        />
      )}
      {showDroppedThirdStrike && (
        <DroppedThirdStrikeModal
          batterName={currentBatter}
          onClose={() => {
            setShowDroppedThirdStrike(false);
            setPendingStrikeType(null);
          }}
          onSelect={(variant) => handleDroppedThirdStrike(variant)}
        />
      )}

      {/* 모바일 경고 팝업 (Portal 사용) */}
      {showMobileWarning && createPortal(
        <div
          style={{
            position: 'fixed', // 뷰포트 기준 고정
            top: 0,
            left: 0,
            width: '100vw',  // 너비 강제 (스크롤바 영역 제외한 뷰포트 전체)
            height: '100vh', // 높이 강제
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex', // Flexbox 사용
            alignItems: 'center', // 수직 중앙 정렬
            justifyContent: 'center', // 수평 중앙 정렬
            padding: '20px',
            boxSizing: 'border-box', // 패딩이 너비에 포함되도록 설정
            backdropFilter: 'blur(4px)',
            overflow: 'hidden', // 내부 스크롤 방지
          }}
          // 배경 터치 시 이벤트 전파 방지 (선택 사항)
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              background: '#1e293b',
              padding: '32px',
              borderRadius: '24px',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              maxWidth: '400px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              color: '#e2e8f0',
              position: 'relative', // 내부 요소 기준점
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🖥️</div>
            <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#f8fafc', marginBottom: '12px', marginTop: 0 }}>
              PC 환경 권장
            </h3>
            <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '15px', marginBottom: '24px', wordBreak: 'keep-all' }}>
              현재 <strong>기록원 페이지</strong>는 모바일 환경에 최적화되어 있지 않습니다.<br />
              원활한 경기 기록을 위해<br />
              <span style={{ color: '#60a5fa', fontWeight: 700 }}>PC 또는 넓은 화면의 태블릿</span>을 사용해 주세요.
            </p>
            <button
              onClick={() => setShowMobileWarning(false)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: '#334155',
                color: '#f1f5f9',
                fontWeight: 800,
                fontSize: '15px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#475569')}
              onMouseOut={(e) => (e.currentTarget.style.background = '#334155')}
            >
              알겠습니다 (그대로 진행)
            </button>
          </div>
        </div>,
        document.body
      )}
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
}: {
  bases: (string | null)[];
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  batterName: string;
  defenseAssignments: { name: string; pos: string; x: number; y: number }[];
  onSelectRunner: (payload: { base: 0 | 1 | 2; name: string }) => void;
  onSelectBatter: () => void;
  onSelectFielder: (payload: { name: string; pos: string }) => void;
}) {
  const label = `${half === 'top' ? '▲' : '▼'} ${inning}`;
  const baseSize = 'clamp(20px, 3.4vw, 30px)';
  const groundShift = '-4%';
  const positions = {
    second: { x: 50, y: 35 },
    first: { x: 72, y: 63 },
    third: { x: 28, y: 63 },
    home: { x: 50, y: 92 },
    batter: { x: 65, y: 90 },
  };
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '18px',
        background: '#0b0f1a',
        width: '100%',
        minWidth: '480px',
        maxWidth: 'min(550px, 100%)',
        aspectRatio: '4 / 3',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
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
        marker={Boolean(bases[1])}
        label={bases[1] ?? '2'}
        top={`${positions.second.y}%`}
        left={`${positions.second.x}%`}
        size={baseSize}
        onSelect={() => bases[1] && onSelectRunner({ base: 1, name: bases[1] })}
      />
      <Base
        marker={Boolean(bases[0])}
        label={bases[0] ?? '1'}
        top={`${positions.first.y}%`}
        left={`${positions.first.x}%`}
        size={baseSize}
        onSelect={() => bases[0] && onSelectRunner({ base: 0, name: bases[0] })}
      />
      <Base
        marker={Boolean(bases[2])}
        label={bases[2] ?? '3'}
        top={`${positions.third.y}%`}
        left={`${positions.third.x}%`}
        size={baseSize}
        onSelect={() => bases[2] && onSelectRunner({ base: 2, name: bases[2] })}
      />
      <HomePlate occupied={false} size={baseSize} top={`${positions.home.y}%`} left={`${positions.home.x}%`} />
      <BatterBadge name={batterName} top={`${positions.batter.y}%`} left={`${positions.batter.x}%`} onClick={onSelectBatter} />
      <PitcherBadge
        name={defenseAssignments.find((player) => player.pos.toUpperCase() === 'P')?.name ?? '투수'}
        top="54%"
        left="50%"
        onClick={onSelectFielder}
      />
      <DefenseLayer assignments={defenseAssignments.filter((player) => player.pos.toUpperCase() !== 'P')} onSelectFielder={onSelectFielder} />
    </div>
  );
}

function Base({
  marker,
  label,
  top,
  left,
  size,
  onSelect,
}: {
  marker?: boolean;
  label?: string;
  top?: string;
  left?: string;
  size?: string;
  onSelect?: () => void;
}) {
  const clickable = marker && onSelect;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%) rotate(45deg)',
        width: size ?? '28px',
        height: size ?? '28px',
        background: '#f4f4f5',
        borderRadius: '4px',
        border: '2px solid #e5e7eb',
        display: 'grid',
        placeItems: 'center',
        boxShadow: marker ? '0 0 0 8px rgba(248, 113, 113, 0.2)' : undefined,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        ...(clickable
          ? {
              transformOrigin: 'center',
            }
          : {}),
      }}
      role={clickable ? 'button' : undefined}
      onClick={() => clickable && onSelect?.()}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translate(-50%, -50%) rotate(45deg) scale(1.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translate(-50%, -50%) rotate(45deg)';
        }
      }}
    >
      {marker && (
        <span
          style={{
            transform: 'rotate(-45deg)',
            fontWeight: 900,
            color: '#ef4444',
            fontSize: '10px',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function HomePlate({ occupied, size, top, left }: { occupied: boolean; size?: string; top?: string; left?: string }) {
  const plateWidth = size ? `calc(${size} * 1.5)` : '44px';
  const plateHeight = size ? `calc(${size} * 1.2)` : '36px';
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
}: {
  assignments: { name: string; pos: string; x: number; y: number }[];
  onSelectFielder: (payload: { name: string; pos: string }) => void;
}) {
  return (
    <>
      {assignments.map((player) => (
        <div
          key={player.name + player.pos}
          role="button"
          onClick={() => onSelectFielder({ name: player.name, pos: player.pos })}
          style={{
            position: 'absolute',
            top: `${player.y}%`,
            left: `${player.x}%`,
            transform: 'translate(-50%, -50%)',
            padding: '6px 8px',
            borderRadius: '12px',
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '11px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {player.pos} · {player.name}
        </div>
      ))}
    </>
  );
}

function BatterBadge({ name, top, left, onClick }: { name: string; top: string; left: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(148,163,184,0.35)',
        background: 'rgba(99,102,241,0.18)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: '12px',
        cursor: 'pointer',
        boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
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
}: {
  name: string;
  top: string;
  left: string;
  onClick: (payload: { name: string; pos: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick({ name, pos: 'P' })}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '8px 10px',
        borderRadius: '12px',
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(15,23,42,0.75)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: '12px',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
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

function buildRunnerOutcomeOptions(baseIndex: 0 | 1 | 2) {
  const options: { value: RunnerAdvanceOutcome; label: string; color: string }[] = [
    { value: 'hold', label: '정지/세이프', color: '#e2e8f0' },
  ];
  for (let base = baseIndex + 2; base <= 3; base += 1) {
    options.push({ value: base as 2 | 3, label: `${base}루`, color: '#22c55e' });
  }
  options.push({ value: 4, label: '홈 득점', color: '#f97316' });
  options.push({ value: 'out', label: '아웃', color: '#ef4444' });
  return options;
}

function baseLabelForIndex(baseIndex: number) {
  return `${baseIndex + 1}루`;
}

const POSITION_LABEL_MAP: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF'
};
const COMMON_DP_ROUTES = [
  { numbers: [4, 6, 3], label: '2B → SS → 1B' },
  { numbers: [6, 4, 3], label: 'SS → 2B → 1B' },
  { numbers: [5, 4, 3], label: '3B → 2B → 1B' },
  { numbers: [1, 6, 3], label: 'P → SS → 1B' },
  { numbers: [1, 4, 3], label: 'P → 2B → 1B' },
  { numbers: [3, 6, 3], label: '1B → SS → 1B' },
  { numbers: [5, 6, 3], label: '3B → SS → 1B' },
  { numbers: [6, 3], label: 'SS → 1B' },
  { numbers: [4, 3], label: '2B → 1B' },
];

function DoublePlayModal({
  outsCount,
  basesState,
  onClose,
  onConfirm,
}: {
  outsCount: 2 | 3;
  basesState: (string | null)[];
  onClose: () => void;
  onConfirm: (selectedRunners: number[], route?: number[], runnerAdvancements?: Record<number, number>) => void;
}) {
  const modalTitle = outsCount === 2 ? '병살타 주자 선택' : '삼중살 주자 선택';
  const runners = basesState
    .map((runner, idx) => (runner ? { runner, baseIndex: idx as 0 | 1 | 2 } : null))
    .filter(Boolean) as { runner: string; baseIndex: 0 | 1 | 2 }[];

  const [selectedRunners, setSelectedRunners] = useState<number[]>([]);
  const [routeMode, setRouteMode] = useState<'preset' | 'custom'>('preset');
  const [selectedRoute, setSelectedRoute] = useState<number[] | null>(null);
  const [customRoute, setCustomRoute] = useState<number[]>([]);
  // 아웃되지 않은 주자들의 진루 상태: { baseIndex: targetBase } (3 = 홈)
  const [runnerAdvancements, setRunnerAdvancements] = useState<Record<number, number>>({});

  // 아웃되지 않은 주자들 계산
  const nonOutRunners = runners.filter((r) => !selectedRunners.includes(r.baseIndex));

  const toggleRunner = (baseIndex: number) => {
    if (selectedRunners.includes(baseIndex)) {
      setSelectedRunners(selectedRunners.filter((idx) => idx !== baseIndex));
    } else {
      if (selectedRunners.length < outsCount - 1) {
        setSelectedRunners([...selectedRunners, baseIndex]);
      }
    }
    // 아웃 선택이 변경되면 진루 상태 초기화
    setRunnerAdvancements({});
  };

  const handleAdvancementChange = (baseIndex: number, targetBase: number) => {
    setRunnerAdvancements((prev) => {
      if (targetBase === baseIndex) {
        // 현재 베이스에 그대로 있음 = 진루 없음
        const next = { ...prev };
        delete next[baseIndex];
        return next;
      }
      return { ...prev, [baseIndex]: targetBase };
    });
  };

  const handleConfirm = () => {
    if (selectedRunners.length === outsCount - 1) {
      const route = routeMode === 'preset' ? selectedRoute : (customRoute.length > 0 ? customRoute : undefined);
      const advancements = Object.keys(runnerAdvancements).length > 0 ? runnerAdvancements : undefined;
      onConfirm(selectedRunners, route ?? undefined, advancements);
    }
  };

  const canConfirm = selectedRunners.length === outsCount - 1;
  const currentRouteLabel = routeMode === 'preset'
    ? (selectedRoute ? selectedRoute.map(n => POSITION_LABEL_MAP[n]).join(' → ') : '선택 안 함')
    : (customRoute.length > 0 ? customRoute.map(n => POSITION_LABEL_MAP[n]).join(' → ') : '선택 안 함');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e293b',
          borderRadius: '20px',
          border: '1px solid rgba(148,163,184,0.25)',
          maxWidth: '540px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(148,163,184,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', margin: 0 }}>
            {modalTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(148,163,184,0.2)',
              border: 'none',
              color: '#e2e8f0',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            취소
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '16px', marginTop: 0 }}>
            타자는 자동으로 아웃됩니다. 추가로 아웃될 주자 {outsCount - 1}명을 선택하세요.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {runners.map((entry) => {
              const isSelected = selectedRunners.includes(entry.baseIndex);
              return (
                <button
                  key={entry.baseIndex}
                  type="button"
                  onClick={() => toggleRunner(entry.baseIndex)}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid #ef4444' : '1px solid rgba(148,163,184,0.3)',
                    background: isSelected ? 'rgba(239,68,68,0.15)' : 'rgba(15,23,42,0.6)',
                    color: isSelected ? '#fca5a5' : '#e2e8f0',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: isSelected ? '2px solid #ef4444' : '2px solid rgba(148,163,184,0.4)',
                      background: isSelected ? '#ef4444' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    {isSelected && '✓'}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>
                      {baseLabelForIndex(entry.baseIndex)} 주자
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900 }}>{entry.runner}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 병살 경로 선택 섹션 */}
          <div style={{ marginTop: '20px', borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: '#f8fafc', fontWeight: 800, fontSize: '14px' }}>병살 경로 (선택)</span>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>{currentRouteLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                type="button"
                onClick={() => setRouteMode('preset')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: routeMode === 'preset' ? '1px solid #3b82f6' : '1px solid rgba(148,163,184,0.3)',
                  background: routeMode === 'preset' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: routeMode === 'preset' ? '#93c5fd' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                일반 경로
              </button>
              <button
                type="button"
                onClick={() => setRouteMode('custom')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: routeMode === 'custom' ? '1px solid #3b82f6' : '1px solid rgba(148,163,184,0.3)',
                  background: routeMode === 'custom' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: routeMode === 'custom' ? '#93c5fd' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                직접 입력
              </button>
            </div>

            {routeMode === 'preset' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {COMMON_DP_ROUTES.map((route) => {
                  const isSelected = selectedRoute?.join('-') === route.numbers.join('-');
                  return (
                    <button
                      key={route.numbers.join('-')}
                      type="button"
                      onClick={() => setSelectedRoute(isSelected ? null : route.numbers)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(148,163,184,0.25)',
                        background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(15,23,42,0.4)',
                        color: isSelected ? '#93c5fd' : '#cbd5e1',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {route.label}
                    </button>
                  );
                })}
              </div>
            )}

            {routeMode === 'custom' && (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCustomRoute([...customRoute, num])}
                      style={{
                        width: '44px',
                        height: '36px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.3)',
                        background: 'rgba(15,23,42,0.6)',
                        color: '#e2e8f0',
                        fontSize: '13px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {POSITION_LABEL_MAP[num]}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                    경로: {customRoute.length > 0 ? customRoute.join('-') : '없음'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomRoute([])}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(148,163,184,0.3)',
                      background: 'transparent',
                      color: '#94a3b8',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    초기화
                  </button>
                  {customRoute.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomRoute(customRoute.slice(0, -1))}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(148,163,184,0.3)',
                        background: 'transparent',
                        color: '#94a3b8',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      되돌리기
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 아웃되지 않은 주자 진루 선택 섹션 */}
          {canConfirm && nonOutRunners.length > 0 && (
            <div style={{ marginTop: '20px', borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '16px' }}>
              <span style={{ color: '#f8fafc', fontWeight: 800, fontSize: '14px', display: 'block', marginBottom: '12px' }}>
                나머지 주자 진루 (선택)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {nonOutRunners.map((entry) => {
                  const currentAdvancement = runnerAdvancements[entry.baseIndex] ?? entry.baseIndex;
                  // 진루 가능한 베이스 옵션 생성 (현재 베이스 ~ 홈)
                  const advanceOptions: { value: number; label: string }[] = [];
                  for (let i: number = entry.baseIndex; i <= 3; i++) {
                    if (i === entry.baseIndex) {
                      advanceOptions.push({ value: i, label: `${baseLabelForIndex(entry.baseIndex)} (유지)` });
                    } else if (i === 3) {
                      advanceOptions.push({ value: 3, label: '홈 (득점)' });
                    } else {
                      advanceOptions.push({ value: i, label: `${baseLabelForIndex(i as 0 | 1 | 2)}` });
                    }
                  }

                  return (
                    <div
                      key={entry.baseIndex}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        background: 'rgba(15,23,42,0.6)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                          {baseLabelForIndex(entry.baseIndex)} 주자: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{entry.runner}</span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {advanceOptions.map((opt) => {
                          const isSelected = currentAdvancement === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleAdvancementChange(entry.baseIndex, opt.value)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: isSelected ? '1px solid #22c55e' : '1px solid rgba(148,163,184,0.3)',
                                background: isSelected ? 'rgba(34,197,94,0.15)' : 'transparent',
                                color: isSelected ? '#86efac' : '#94a3b8',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              marginTop: '20px',
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: canConfirm ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'rgba(148,163,184,0.2)',
              color: canConfirm ? '#fff' : '#64748b',
              fontWeight: 900,
              fontSize: '15px',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.6,
            }}
          >
            {canConfirm ? '확인' : `주자 ${outsCount - 1}명을 선택하세요`}
          </button>
        </div>
      </div>
    </div>
  );
}

// [수정 1] MultipleRunnersOutModal 컴포넌트 (약 1925라인 근처)
function MultipleRunnersOutModal({
  basesState,
  minOuts = 1,
  maxOuts,
  onClose,
  onConfirm,
}: {
  basesState: (string | null)[];
  minOuts?: number;
  maxOuts?: number;
  onClose: () => void;
  // [중요] onConfirm 함수 타입 정의에 isBatterSafe(boolean) 추가
  onConfirm: (selectedRunners: number[], label: string, isBatterSafe: boolean) => void;
}) {
  const runners = basesState
    .map((runner, idx) => (runner ? { runner, baseIndex: idx as 0 | 1 | 2 } : null))
    .filter(Boolean) as { runner: string; baseIndex: 0 | 1 | 2 }[];

  const [selectedRunners, setSelectedRunners] = useState<number[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const [isBatterSafe, setIsBatterSafe] = useState(false); // [추가] 타자 출루 여부 상태

  const effectiveMaxOuts = maxOuts ?? runners.length;

  const toggleRunner = (baseIndex: number) => {
    if (selectedRunners.includes(baseIndex)) {
      setSelectedRunners(selectedRunners.filter((idx) => idx !== baseIndex));
    } else {
      if (selectedRunners.length < effectiveMaxOuts) {
        setSelectedRunners([...selectedRunners, baseIndex]);
      }
    }
  };

  const handleConfirm = () => {
    if (selectedRunners.length >= minOuts && selectedRunners.length <= effectiveMaxOuts) {
      const defaultLabel = selectedRunners.length === 2 ? '더블아웃' : `${selectedRunners.length}명 아웃`;
      // [수정] 부모에게 isBatterSafe 값 전달
      onConfirm(selectedRunners, customLabel.trim() || defaultLabel, isBatterSafe);
    }
  };

  const canConfirm = selectedRunners.length >= minOuts && selectedRunners.length <= effectiveMaxOuts;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e293b',
          borderRadius: '20px',
          border: '1px solid rgba(148,163,184,0.25)',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(148,163,184,0.2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', margin: 0 }}>
            주루 아웃 선택
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(148,163,184,0.2)',
              border: 'none',
              color: '#e2e8f0',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            취소
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '16px', marginTop: 0 }}>
            아웃될 주자를 선택하세요. ({minOuts}명 이상 선택 가능)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {runners.map((entry) => {
              const isSelected = selectedRunners.includes(entry.baseIndex);
              return (
                <button
                  key={entry.baseIndex}
                  type="button"
                  onClick={() => toggleRunner(entry.baseIndex)}
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid #ef4444' : '1px solid rgba(148,163,184,0.3)',
                    background: isSelected ? 'rgba(239,68,68,0.15)' : 'rgba(15,23,42,0.6)',
                    color: isSelected ? '#fca5a5' : '#e2e8f0',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: isSelected ? '2px solid #ef4444' : '2px solid rgba(148,163,184,0.4)',
                      background: isSelected ? '#ef4444' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    {isSelected && '✓'}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>
                      {baseLabelForIndex(entry.baseIndex)} 주자
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900 }}>{entry.runner}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* [추가] 타자 출루 선택 체크박스 UI */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.05)',
                padding: '12px',
                borderRadius: '8px',
              }}
            >
              <input
                type="checkbox"
                checked={isBatterSafe}
                onChange={(e) => setIsBatterSafe(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
              />
              <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 700 }}>
                타자 출루 (타격 상황/야수선택)
              </span>
            </label>
            {isBatterSafe && (
              <p style={{ margin: '6px 0 0 28px', fontSize: '12px', color: '#94a3b8' }}>
                체크 시 타자가 1루로 진루하며 '야수선택'으로 기록됩니다. (타수 포함)
              </p>
            )}
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: '#cbd5e1', display: 'block', marginBottom: '8px' }}>
              기록 라벨 (선택사항)
            </label>
            <input
              type="text"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder={selectedRunners.length === 2 ? '더블아웃' : `${selectedRunners.length}명 아웃`}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(148,163,184,0.3)',
                background: 'rgba(15,23,42,0.6)',
                color: '#e2e8f0',
                fontSize: '14px',
              }}
            />
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: canConfirm ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'rgba(148,163,184,0.2)',
              color: canConfirm ? '#fff' : '#64748b',
              fontWeight: 900,
              fontSize: '15px',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              opacity: canConfirm ? 1 : 0.6,
            }}
          >
            {canConfirm ? '확인' : `주자 ${minOuts}명 이상 선택하세요`}
          </button>
        </div>
      </div>
    </div>
  );
}

function HitAdvanceModal({
  bases,
  basesState,
  mode,
  contextNote,
  fcFielder,
  fcRelay,
  fcTargetBase,
  fcOutType,
  pathNote,
  selections,
  onChangeSelections,
  onChangeContextNote,
  onChangeFcFielder,
  onChangeFcRelay,
  onChangeFcTargetBase,
  onChangeFcOutType,
  onChangePathNote,
  onClose,
  onBack,
  onConfirm,
}: {
  bases: 1 | 2 | 3;
  basesState: (string | null)[];
  mode: 'hit' | 'fc';
  contextNote?: string;
  fcFielder?: string;
  fcRelay?: string;
  fcTargetBase?: '1' | '2' | '3' | '홈';
  fcOutType?: 'force' | 'tag';
  pathNote?: string;
  selections: RunnerAdvanceSelections;
  onChangeSelections: (next: RunnerAdvanceSelections) => void;
  onChangeContextNote?: (text: string) => void;
  onChangeFcFielder?: (val: string) => void;
  onChangeFcRelay?: (val: string) => void;
  onChangeFcTargetBase?: (val: '1' | '2' | '3' | '홈') => void;
  onChangeFcOutType?: (val: 'force' | 'tag') => void;
  onChangePathNote?: (val: string) => void;
  onClose: () => void;
  onBack?: () => void;
  onConfirm: () => void;
}) {
  const hitLabel = mode === 'fc' ? '야수선택 주자 처리' : `${bases}루타 주자 선택`;
  const runners = basesState
    .map((runner, idx) => (runner ? { runner, baseIndex: idx as 0 | 1 | 2 } : null))
    .filter(Boolean) as { runner: string; baseIndex: 0 | 1 | 2 }[];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>{hitLabel}</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>주자별 결과를 선택하세요.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {runners.length ? (
            runners.map((entry) => (
              <div
                key={`${entry.baseIndex}-${entry.runner}`}
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.25)',
                  padding: '12px',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900 }}>
                    {baseLabelForIndex(entry.baseIndex)} 주자 · {entry.runner}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>기본값: 타구 기준 진루</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                  {buildRunnerOutcomeOptions(entry.baseIndex).map((option) => {
                    const isSelected = selections[entry.baseIndex] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          onChangeSelections({
                            ...selections,
                            [entry.baseIndex]: option.value,
                          })
                        }
                        style={{
                          padding: '10px',
                          borderRadius: '10px',
                          border: isSelected ? `1px solid ${option.color}` : '1px solid rgba(148,163,184,0.2)',
                          background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          color: option.color,
                          fontWeight: 900,
                          cursor: 'pointer',
                          boxShadow: isSelected ? `0 0 0 1px ${option.color}60` : 'none',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                borderRadius: '12px',
                border: '1px dashed rgba(148,163,184,0.3)',
                padding: '14px',
                textAlign: 'center',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              베이스에 주자가 없습니다. 기본 진루로 기록됩니다.
            </div>
          )}
        </div>
        {mode === 'fc' ? (
          <div
            style={{
              display: 'grid',
              gap: '6px',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px dashed rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.03)',
            }}
          >
            <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>
              어떤 선택이었는지 메모하세요. (수비수 · 목적 베이스 · 포스/태그)
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
              <select
                value={fcFielder}
                onChange={(e) => onChangeFcFielder?.(e.target.value)}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  padding: '10px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                {defensePosOptions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos === '기타' ? '기타' : pos}
                  </option>
                ))}
              </select>
              <select
                value={fcRelay}
                onChange={(e) => onChangeFcRelay?.(e.target.value)}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  padding: '10px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                {['없음', ...defensePosOptions].map((num) => (
                  <option key={num} value={num}>
                    {num === '없음' ? '중계 없음' : `중계 ${num}`}
                  </option>
                ))}
              </select>
              <select
                value={fcTargetBase}
                onChange={(e) => onChangeFcTargetBase?.(e.target.value as '1' | '2' | '3' | '홈')}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  padding: '10px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                {['1','2','3','홈'].map((b) => (
                  <option key={b} value={b}>
                    {b}루
                  </option>
                ))}
              </select>
              <select
                value={fcOutType}
                onChange={(e) => onChangeFcOutType?.(e.target.value as 'force' | 'tag')}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  padding: '10px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="force">포스 아웃</option>
                <option value="tag">태그 아웃</option>
              </select>
            </div>
            <textarea
              value={contextNote ?? ''}
              onChange={(e) => onChangeContextNote?.(e.target.value)}
              rows={2}
              placeholder="예) 6-4 포스아웃, 1루 아웃 포기"
              style={{
                width: '100%',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: '#0f172a',
                color: '#e2e8f0',
                fontWeight: 800,
                padding: '10px',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>주루 경로 메모</span>
              <textarea
                value={pathNote ?? ''}
                onChange={(e) => onChangePathNote?.(e.target.value)}
                rows={2}
                placeholder="예) 6-2-5 런다운, 2루 주자 세이프"
                style={{
                  width: '100%',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  padding: '10px',
                  fontSize: '13px',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onBack || onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(148,163,184,0.12)',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            이전
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(59,130,246,0.4)',
              background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
              color: '#f8fafc',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            적용하기
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorOnPlayModal({
  basesState,
  defaultFielder,
  defaultSelections,
  defaultBatterResult,
  defaultErrorType,
  defaultContext,
  onClose,
  onBack,
  onConfirm,
}: {
  basesState: (string | null)[];
  defaultFielder: string;
  defaultSelections: RunnerAdvanceSelections;
  defaultBatterResult: 'out' | 'hold' | 1 | 2 | 3 | 4;
  defaultErrorType: string;
  defaultContext: string;
  onClose: () => void;
  onBack?: () => void;
  onConfirm: (details: { fielder: string; errorType: string; context: string; batterResult: 'out' | 'hold' | 1 | 2 | 3 | 4; selections: RunnerAdvanceSelections; pitchResult?: 'ball' | 'strike' }) => void;
}) {
  const [fielder, setFielder] = useState(defaultFielder);
  const [errorType, setErrorType] = useState(defaultErrorType);
  const [context, setContext] = useState(defaultContext);
  const [batterResult, setBatterResult] = useState<'out' | 'hold' | 1 | 2 | 3 | 4>(defaultBatterResult);
  const [selections, setSelections] = useState<RunnerAdvanceSelections>(defaultSelections);
  const [pitchResult, setPitchResult] = useState<'ball' | 'strike' | null>(null);

  const isWildPitchOrPassedBall = errorType === 'WP(폭투)' || errorType === 'PB(포일)';

  const runners = basesState
    .map((runner, idx) => (runner ? { runner, baseIndex: idx as 0 | 1 | 2 } : null))
    .filter(Boolean) as { runner: string; baseIndex: 0 | 1 | 2 }[];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '12px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>실책 기록</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>수비 실책으로 출루/진루를 기록합니다.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gap: '10px' }}>
          <div style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>수비수/실책 유형</span>
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: '1fr 1fr' }}>
              <select
                value={fielder}
                onChange={(e) => setFielder(e.target.value)}
                style={{
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  padding: '10px',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                {defensePosOptions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos === '기타' ? '기타' : pos}
                  </option>
                ))}
              </select>
          <select
            value={errorType}
            onChange={(e) => setErrorType(e.target.value)}
            style={{
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              padding: '10px',
              background: '#0f172a',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          >
            {errorTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
            </div>
          </div>

        {isWildPitchOrPassedBall && (
          <div style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>투구 결과 (볼/스트라이크)</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { value: 'ball' as const, label: '볼', color: '#22c55e' },
                { value: 'strike' as const, label: '스트라이크', color: '#facc15' },
              ].map((opt) => {
                const isSelected = pitchResult === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPitchResult(opt.value)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      border: isSelected ? `1px solid ${opt.color}` : '1px solid rgba(148,163,184,0.3)',
                      background: isSelected ? `${opt.color}22` : 'rgba(255,255,255,0.03)',
                      color: isSelected ? opt.color : '#e2e8f0',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px' }}>
              폭투/포일 발생 시 해당 투구의 볼/스트라이크 카운트도 함께 기록됩니다.
            </span>
          </div>
        )}

        <div style={{ display: 'grid', gap: '6px' }}>
          <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>타자 결과</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: '8px' }}>
            {[
              { value: 'hold', label: '타자 유지' },
              { value: 1, label: '타자 1루' },
              { value: 2, label: '타자 2루' },
              { value: 3, label: '타자 3루' },
              { value: 4, label: '타자 득점' },
              { value: 'out', label: '타자 아웃' },
              ].map((opt) => {
                const isSelected = batterResult === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setBatterResult(opt.value as 'out' | 1 | 2 | 3 | 4)}
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      border: isSelected ? '1px solid rgba(249,115,22,0.7)' : '1px solid rgba(148,163,184,0.3)',
                      background: isSelected ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)',
                      color: '#e2e8f0',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {runners.length ? (
            <div style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>주자 결과</span>
              {runners.map((entry) => (
                <div
                  key={`${entry.baseIndex}-${entry.runner}`}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.25)',
                    background: 'rgba(255,255,255,0.03)',
                    display: 'grid',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 900 }}>{baseLabelForIndex(entry.baseIndex)} 주자 · {entry.runner}</span>
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>기본: 정지</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: '6px' }}>
                    {buildRunnerOutcomeOptions(entry.baseIndex).map((opt) => {
                      const isSelected = selections[entry.baseIndex] === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setSelections({ ...selections, [entry.baseIndex]: opt.value })}
                          style={{
                            padding: '9px',
                            borderRadius: '10px',
                            border: isSelected ? `1px solid ${opt.color}` : '1px solid rgba(148,163,184,0.25)',
                            background: isSelected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                            color: opt.color,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                borderRadius: '10px',
                border: '1px dashed rgba(148,163,184,0.35)',
                padding: '12px',
                color: '#94a3b8',
                fontWeight: 700,
                textAlign: 'center',
              }}
            >
              주자가 없습니다. 타자만 결과가 기록됩니다.
            </div>
          )}

          <div style={{ display: 'grid', gap: '6px' }}>
            <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>상황 메모</span>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              placeholder="예) 6 실책 송구, 타자 1루"
              style={{
                width: '100%',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: '#0f172a',
                color: '#e2e8f0',
                fontWeight: 800,
                padding: '10px',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onBack || onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(148,163,184,0.12)',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            이전
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ fielder, errorType, context, batterResult, selections, pitchResult: isWildPitchOrPassedBall ? pitchResult ?? undefined : undefined })}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(59,130,246,0.4)',
              background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
              color: '#f8fafc',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            기록하기
          </button>
        </div>
      </div>
    </div>
  );
}

function StrikeOutTypeModal({
  batterName,
  onClose,
  onSelect,
}: {
  batterName: string;
  onClose: () => void;
  onSelect: (type: 'swinging' | 'looking') => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <span style={{ fontWeight: 900 }}>삼진 유형 선택</span>
          <span style={{ color: '#94a3b8', fontWeight: 700 }}>
            {batterName} · 삼진 유형을 선택하세요.
          </span>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <button
            type="button"
            onClick={() => onSelect('swinging')}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(239,68,68,0.5)',
              background: 'rgba(239,68,68,0.15)',
              color: '#fecaca',
              fontWeight: 800,
              padding: '14px 12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>헛스윙 삼진 (K)</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>배트를 휘둘러 스트라이크</div>
          </button>
          <button
            type="button"
            onClick={() => onSelect('looking')}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(251,191,36,0.5)',
              background: 'rgba(251,191,36,0.15)',
              color: '#fef08a',
              fontWeight: 800,
              padding: '14px 12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>루킹 삼진 (Kc)</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>배트를 휘두르지 않고 스트라이크</div>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              color: '#e2e8f0',
              fontWeight: 700,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function FoulTypeModal({
  batterName,
  strikes,
  onClose,
  onSelect,
}: {
  batterName: string;
  strikes: number;
  onClose: () => void;
  onSelect: (isBunt: boolean) => void;
}) {
  const isTwoStrikes = strikes >= 2;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <span style={{ fontWeight: 900 }}>파울 유형 선택</span>
          <span style={{ color: '#94a3b8', fontWeight: 700 }}>
            {batterName} · 파울 유형을 선택하세요.
          </span>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <button
            type="button"
            onClick={() => onSelect(false)}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(250,204,21,0.5)',
              background: 'rgba(250,204,21,0.15)',
              color: '#fef08a',
              fontWeight: 800,
              padding: '14px 12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>타격 파울</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {isTwoStrikes ? '2스트라이크 이후 파울 (카운트 유지)' : '스트라이크 카운트 +1'}
            </div>
          </button>
          <button
            type="button"
            onClick={() => onSelect(true)}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: isTwoStrikes ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(250,204,21,0.5)',
              background: isTwoStrikes ? 'rgba(239,68,68,0.15)' : 'rgba(250,204,21,0.15)',
              color: isTwoStrikes ? '#fecaca' : '#fef08a',
              fontWeight: 800,
              padding: '14px 12px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>번트 파울{isTwoStrikes && ' (쓰리번트 아웃)'}</div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {isTwoStrikes ? '2스트라이크 이후 번트 파울 → 삼진 아웃' : '스트라이크 카운트 +1'}
            </div>
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              color: '#e2e8f0',
              fontWeight: 700,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function DroppedThirdStrikeModal({
  batterName,
  onClose,
  onSelect,
}: {
  batterName: string;
  onClose: () => void;
  onSelect: (variant: 'strikeout' | 'reach' | 'tag_out') => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <span style={{ fontWeight: 900 }}>삼진 처리</span>
          <span style={{ color: '#94a3b8', fontWeight: 700 }}>
            {batterName} · 낫아웃 여부를 선택하세요.
          </span>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <button
            type="button"
            onClick={() => onSelect('strikeout')}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(239,68,68,0.5)',
              background: 'rgba(239,68,68,0.15)',
              color: '#fecaca',
              fontWeight: 800,
              padding: '10px 12px',
              cursor: 'pointer',
            }}
          >
            삼진 아웃
          </button>
          <button
            type="button"
            onClick={() => onSelect('reach')}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(59,130,246,0.5)',
              background: 'rgba(59,130,246,0.15)',
              color: '#bfdbfe',
              fontWeight: 800,
              padding: '10px 12px',
              cursor: 'pointer',
            }}
          >
            낫아웃 출루
          </button>
          <button
            type="button"
            onClick={() => onSelect('tag_out')}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(249,115,22,0.5)',
              background: 'rgba(249,115,22,0.15)',
              color: '#fed7aa',
              fontWeight: 800,
              padding: '10px 12px',
              cursor: 'pointer',
            }}
          >
            낫아웃 실패(포수 태그)
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              color: '#e2e8f0',
              fontWeight: 700,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function HitWizardModal({
  state,
  onClose,
  onNext,
  onBack,
  onSelectResult,
  onSelectType,
  onSelectZone,
  onSelectFielder,
  onConfirm,
}: {
  state: HitWizardState;
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
  onSelectResult: (result: BattedBallResultAction) => void;
  onSelectType: (type: string) => void;
  onSelectZone: (zone: string) => void;
  onSelectFielder: (fielder: string) => void;
  onConfirm: () => void;
}) {
  const steps: { key: HitWizardStep; label: string }[] = [
    { key: 'result', label: '타구 결과' },
    { key: 'type', label: '인플레이 유형' },
    { key: 'zone', label: '타구 방향' },
  ];
  const currentStepIndex = steps.findIndex((step) => step.key === state.step);
  const selectedResult = battedBallResultOptions.find((option) => option.value === state.result);
  const zoneOptions = getZoneOptionsForResult(state.result);
  const selectionSummary = formatBattedBallDetails(buildBattedBallDetailsFromValues(state.type, state.zone));
  const fielderOptions = getFielderOptionsForResult(state.result);
  const fielderSummary =
    fielderOptions && state.fielder && state.fielder !== fielderOptions[0] ? state.fielder : null;
  const willOpenAdvance = requiresAdvanceModal(state.result);
  const willOpenErrorModal = state.result === 'reach_error';
  const isZoneStep = state.step === 'zone';
  const isFinalStep = isZoneStep && !willOpenAdvance && !willOpenErrorModal;
  const primaryDisabled =
    (state.step === 'result' && !state.result) ||
    (state.step === 'type' &&
      !isInfieldFlyResult(state.result) &&
      getTypeOptionsForResult(state.result).length > 0 &&
      !state.type) ||
    (state.step === 'zone' && !state.zone);

  const primaryLabel = isZoneStep ? (isFinalStep ? '기록하기' : '다음') : isFinalStep ? '기록하기' : '다음';
  const primaryAction = isZoneStep ? onConfirm : isFinalStep ? onConfirm : onNext;

  const renderStep = () => {
    if (state.step === 'result') {
      return (
        <div style={{ display: 'grid', gap: '12px' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '14px' }}>타격 후 결과를 먼저 선택하세요.</span>
          <div style={{ display: 'grid', gap: '10px' }}>
            {battedBallResultGroups.map((group) => {
              const options = battedBallResultOptions.filter((option) => option.group === group.key);
              return (
                <div key={group.key} style={{ display: 'grid', gap: '6px' }}>
                  <div style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px' }}>{group.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                    {options.map((option) => {
                      const isSelected = state.result === option.value;
                      const outlineColor = option.group === 'out' ? '#ef4444' : option.color;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => onSelectResult(option.value)}
                          style={{
                            padding: '12px 10px',
                            borderRadius: '12px',
                            border: isSelected ? `2px solid ${outlineColor}` : '1px solid rgba(148,163,184,0.25)',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                            color: option.color,
                            fontWeight: 900,
                            textAlign: 'left',
                            boxShadow: isSelected ? `0 0 0 1px ${outlineColor}40` : 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <div>{option.label}</div>
                          <div style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 700 }}>{option.helper}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
            파울·희생·인플레이 아웃까지 한 번에 선택하고, 다음 단계에서 타구 정보를 보완하세요.
          </span>
        </div>
      );
    }

    if (state.step === 'type') {
      const options = getTypeOptionsForResult(state.result);
      return (
        <div style={{ display: 'grid', gap: '10px' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '14px' }}>
            {isInfieldFlyResult(state.result)
              ? '포구한 내야수/투수를 선택하세요. (타구 유형 선택 없음)'
              : state.result === 'sac_bunt'
                ? '희생번트 성격을 선택하세요.'
                : state.result === 'sac_fly'
                  ? '희생플라이 성격을 선택하세요.'
                  : '타구 유형을 선택하세요.'}
          </span>
          {state.result ? (
            <>
              {isInfieldFlyResult(state.result) ? null : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                  {options.map((option) => {
                    const isSelected = state.type === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => onSelectType(option)}
                        style={{
                          padding: '10px',
                          borderRadius: '10px',
                          border: isSelected ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(148,163,184,0.25)',
                          background: isSelected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                          color: '#e2e8f0',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: isSelected ? '0 0 0 1px rgba(59,130,246,0.35)' : 'none',
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              )}
              {fielderOptions ? (
                <div style={{ display: 'grid', gap: '6px' }}>
                  <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>
                    {isInfieldFlyResult(state.result) ? '포구한 내야수/투수 선택' : '포구한 외야수 선택'}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                    {fielderOptions.map((option) => {
                      const isSelected = state.fielder === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => onSelectFielder(option)}
                          style={{
                            padding: '10px',
                            borderRadius: '10px',
                            border: isSelected ? '1px solid rgba(239,68,68,0.6)' : '1px solid rgba(148,163,184,0.25)',
                            background: isSelected ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                            color: '#e2e8f0',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: isSelected ? '0 0 0 1px rgba(239,68,68,0.35)' : 'none',
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                {isInfieldFlyResult(state.result)
                  ? '인필드 플라이는 포구자만 기록합니다.'
                  : '결과에 맞는 유형만 노출됩니다. 필요 없으면 "선택 안 함"을 그대로 두세요.'}
              </span>
            </>
          ) : (
            <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>먼저 결과를 선택해 주세요.</div>
          )}
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: '10px' }}>
        <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '14px' }}>타구가 향한 방향을 선택하세요.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
          {zoneOptions.map((option) => {
            const isSelected = state.zone === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onSelectZone(option)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: isSelected ? '1px solid rgba(52,211,153,0.6)' : '1px solid rgba(148,163,184,0.25)',
                  background: isSelected ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 0 0 1px rgba(52,211,153,0.35)' : 'none',
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>선택이 없으면 "선택 안 함"으로 기록됩니다.</span>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>타격 기록</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>결과 → 유형 → 방향 순서로 안내합니다.</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  flex: 1,
                  height: '6px',
                  borderRadius: '999px',
                  background: 'rgba(148,163,184,0.25)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${((currentStepIndex + 1) / steps.length) * 100}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #2563eb, #22d3ee)',
                    transition: 'width 150ms ease',
                  }}
                />
              </div>
              <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '12px' }}>
                {currentStepIndex + 1}/{steps.length}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', alignItems: 'center' }}>
          {steps.map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isDone = idx < currentStepIndex;
            return (
              <div
                key={step.key}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: isActive ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(148,163,184,0.25)',
                  background: isDone ? 'rgba(59,130,246,0.08)' : isActive ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  textAlign: 'center',
                  fontSize: '13px',
                }}
              >
                {idx + 1}. {step.label}
              </div>
            );
          })}
        </div>

        {renderStep()}

        <div
          style={{
            padding: '10px 12px',
            borderRadius: '12px',
            border: '1px dashed rgba(148,163,184,0.4)',
            background: 'rgba(255,255,255,0.02)',
            display: 'grid',
            gap: '6px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>선택 요약</span>
          <span style={{ color: '#e2e8f0', fontWeight: 900 }}>
            {selectedResult ? selectedResult.label : '결과 미선택'} · {selectionSummary}
            {fielderSummary ? ` · 포구:${fielderSummary}` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onBack}
              disabled={state.step === 'result'}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: state.step === 'result' ? 'rgba(148,163,184,0.15)' : 'transparent',
                color: '#cbd5e1',
                fontWeight: 900,
                cursor: state.step === 'result' ? 'not-allowed' : 'pointer',
                opacity: state.step === 'result' ? 0.6 : 1,
              }}
            >
              이전
            </button>
            <button
              type="button"
              onClick={primaryDisabled ? undefined : primaryAction}
              disabled={primaryDisabled}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                color: '#f8fafc',
                fontWeight: 900,
                cursor: primaryDisabled ? 'not-allowed' : 'pointer',
                opacity: primaryDisabled ? 0.6 : 1,
                boxShadow: primaryDisabled ? 'none' : '0 10px 20px rgba(37,99,235,0.25)',
              }}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  data,
  onClose,
  actions,
  bases,
  bench,
  lineup,
}: {
  data: ActionModalData;
  onClose: () => void;
  actions: ReturnType<typeof useDemoStore>['actions'];
  bases: (string | null)[];
  bench: { name: string; pos: string; number: string; throws: string; bats: string }[];
  lineup: { name: string; pos: string; number: string; throws: string; bats: string }[];
}) {
  const [errorType, setErrorType] = useState(errorTypeOptions[0].value);
  const [errorContext, setErrorContext] = useState('');
  const [errorBatterResult, setErrorBatterResult] = useState<'out' | 'hold' | 1 | 2 | 3 | 4>('hold');
  const [runnerSelections, setRunnerSelections] = useState<RunnerAdvanceSelections>({});

  useEffect(() => {
    if (data.role !== 'fielder') return;
    queueMicrotask(() => {
      setErrorType(errorTypeOptions[0].value);
      setErrorContext('');
      setErrorBatterResult('hold');
      const initialSelections = bases.reduce<RunnerAdvanceSelections>((acc, runner, idx) => {
        if (runner) acc[idx as 0 | 1 | 2] = 'hold';
        return acc;
      }, {});
      setRunnerSelections(initialSelections);
    });
  }, [bases, data.role]);

  const battingOrder =
    data.role === 'batter'
      ? (() => {
          const slot = lineup[data.lineupIndex];
          if (!slot || slot.pos.toUpperCase() === 'P') return null;
          let order = 0;
          for (let i = 0; i < lineup.length; i += 1) {
            const player = lineup[i];
            if (player.pos.toUpperCase() === 'P') continue;
            order += 1;
            if (i === data.lineupIndex) return order;
          }
          return order || null;
        })()
      : null;

  const currentSlot = data.role === 'batter' ? lineup[data.lineupIndex] : null;

  const handleSubstitute = (benchIndex: number, substitutionType?: '대수비' | '대타' | '대주자') => {
    if (data.role !== 'batter' && data.role !== 'fielder' && data.role !== 'runner') return;
    actions.substitute(data.side, benchIndex, data.lineupIndex, substitutionType);
    onClose();
  };

  const renderButtons = () => {
    if (data.role === 'runner') {
      const handleRunnerAction = (action: () => void) => () => {
        action();
        onClose();
      };
      return (
        <>
          <RunnerActionButton label="도루 성공" color="#22c55e" onClick={handleRunnerAction(() => actions.runnerStealSuccess(data.base))} />
          <RunnerActionButton label="도루자 아웃" color="#ef4444" onClick={handleRunnerAction(() => actions.runnerCaught(data.base))} />
          <RunnerActionButton label="견제사" color="#ef4444" onClick={handleRunnerAction(() => actions.runnerPickoff(data.base))} />
          <RunnerActionButton label="주루사" color="#ef4444" onClick={handleRunnerAction(() => actions.runnerOut(data.base))} />
          <RunnerActionButton label="런다운 아웃" color="#ef4444" onClick={handleRunnerAction(() => actions.runnerRundownOut(data.base))} />
          <RunnerActionButton label="주루 방해" color="#f97316" onClick={handleRunnerAction(() => actions.runnerInterference(data.base))} />
        </>
      );
    }
    if (data.role === 'fielder') {
      return (
        <>
          <RunnerActionButton
            label="실책 기록"
            color="#f97316"
            onClick={() => {
            actions.recordError({
              fielderPos: data.pos,
              errorType: decorateErrorType(errorType, data.pos),
              context: errorContext.trim(),
              advanceResults: { batter: errorBatterResult, runners: runnerSelections },
            });
            onClose();
          }}
          />
          <RunnerActionButton label="포구 완료" color="#22c55e" onClick={() => actions.setPlay(`포구 · ${data.pos} ${data.name}`)} />
          <RunnerActionButton label="중계 플레이" color="#38bdf8" onClick={() => actions.setPlay(`중계 · ${data.pos} ${data.name}`)} />
        </>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '12px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>{labelForModal(data)}</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{subLabelForModal(data)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
        {data.role === 'batter' ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15,23,42,0.55)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>타자 교체/대타</span>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                  {battingOrder ? `${battingOrder}번 타순` : '타순 미지정'} · 포지션 {currentSlot?.pos ?? '-'}
                </span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>교체 즉시 라인업/피드 반영</span>
            </div>
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: '1px dashed rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: '4px',
              }}
            >
              <span style={{ color: '#cbd5e1', fontWeight: 800 }}>현재 타자</span>
              <span style={{ color: '#e2e8f0', fontWeight: 900 }}>{currentSlot?.name ?? data.name}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                등번호 {currentSlot?.number || '-'} · 투 {currentSlot?.throws || '-'} · 타 {currentSlot?.bats || '-'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>벤치에서 교체할 선수를 선택하세요</span>
              {bench.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {bench.map((player, idx) => (
                    <div
                      key={`${player.name}-${idx}`}
                      style={{
                        borderRadius: '12px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        display: 'grid',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'grid', gap: '2px' }}>
                          <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                            {player.name} · {player.pos}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                            등번호 {player.number || '-'} · 투 {player.throws || '-'} · 타 {player.bats || '-'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSubstitute(idx, '대타')}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid rgba(34,197,94,0.4)',
                            background: 'rgba(34,197,94,0.12)',
                            color: '#22c55e',
                            fontWeight: 900,
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          대타 투입
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: '12px',
                    border: '1px dashed rgba(148,163,184,0.35)',
                    padding: '12px',
                    color: '#94a3b8',
                    fontWeight: 700,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  벤치 명단이 없습니다. Team Editor에서 선수를 추가하세요.
                </div>
              )}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
              교체 시 이전 선수는 교체 out 패널에 기록되고 볼카운트는 유지됩니다.
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
        {data.role === 'runner' ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15,23,42,0.55)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>주자 교체/대주자</span>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                  {data.base + 1}루 주자
                </span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>교체 즉시 라인업/피드 반영</span>
            </div>
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: '1px dashed rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: '4px',
              }}
            >
              <span style={{ color: '#cbd5e1', fontWeight: 800 }}>현재 주자</span>
              <span style={{ color: '#e2e8f0', fontWeight: 900 }}>{data.name}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>{data.base + 1}루 베이스</span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>벤치에서 교체할 선수를 선택하세요</span>
              {bench.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {bench.map((player, idx) => (
                    <div
                      key={`${player.name}-${idx}`}
                      style={{
                        borderRadius: '12px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        display: 'grid',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'grid', gap: '2px' }}>
                          <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                            {player.name} · {player.pos}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                            등번호 {player.number || '-'} · 투 {player.throws || '-'} · 타 {player.bats || '-'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSubstitute(idx, '대주자')}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid rgba(251,146,60,0.4)',
                            background: 'rgba(251,146,60,0.12)',
                            color: '#fb923c',
                            fontWeight: 900,
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          대주자 투입
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: '12px',
                    border: '1px dashed rgba(148,163,184,0.35)',
                    padding: '12px',
                    color: '#94a3b8',
                    fontWeight: 700,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  벤치 명단이 없습니다. Team Editor에서 선수를 추가하세요.
                </div>
              )}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
              교체 시 이전 선수는 교체 out 패널에 기록되고 베이스 주자가 변경됩니다.
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
        {data.role === 'fielder' ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15,23,42,0.55)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 900, color: '#e2e8f0' }}>실책 상세 입력</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>기록/CSV에 반영</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
                에러 유형
                <select
                  value={errorType}
                  onChange={(e) => {
                    const value = e.target.value;
                    setErrorType(value);
                    if (value.startsWith('WP') || value.startsWith('PB') || value.startsWith('BK')) {
                      setErrorBatterResult('hold');
                    }
                  }}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0b0f1a',
                    color: '#e2e8f0',
                    padding: '8px 10px',
                    fontWeight: 800,
                  }}
                >
                {errorTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
                상황
                <input
                  value={errorContext}
                  onChange={(e) => setErrorContext(e.target.value)}
                  placeholder="예) 내야 타구 처리, 포구 후 송구"
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0b0f1a',
                    color: '#e2e8f0',
                    padding: '8px 10px',
                    fontWeight: 800,
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
                타자 결과
                <select
                  value={String(errorBatterResult)}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'hold') setErrorBatterResult('hold');
                    else if (value === 'out') setErrorBatterResult('out');
                    else setErrorBatterResult(Number(value) as 1 | 2 | 3 | 4);
                  }}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0b0f1a',
                    color: '#e2e8f0',
                    padding: '8px 10px',
                    fontWeight: 800,
                    maxWidth: '220px',
                  }}
                >
                  <option value="hold">타자 유지</option>
                  <option value="out">아웃</option>
                  <option value="1">1루 진루</option>
                  <option value="2">2루 진루</option>
                  <option value="3">3루 진루</option>
                  <option value="4">홈 득점</option>
                </select>
              </label>
              <div style={{ display: 'grid', gap: '6px' }}>
                <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>주자 결과</span>
                {bases.map((runner, idx) =>
                  runner ? (
                    <label
                      key={`${runner}-${idx}`}
                      style={{ display: 'grid', gap: '4px', color: '#e2e8f0', fontSize: '12px', fontWeight: 700 }}
                    >
                      {baseLabel(idx)} 주자 · {runner}
                      <select
                        value={String(runnerSelections[idx as 0 | 1 | 2] ?? 'hold')}
                        onChange={(e) => {
                          const v = e.target.value;
                          const parsed: RunnerAdvanceOutcome =
                            v === 'hold' || v === 'out' || v === 'score' ? (v as RunnerAdvanceOutcome) : (Number(v) as RunnerAdvanceOutcome);
                          setRunnerSelections((prev) => ({
                            ...prev,
                            [idx]: parsed,
                          }));
                        }}
                        style={{
                          borderRadius: '10px',
                          border: '1px solid rgba(148,163,184,0.35)',
                          background: '#0b0f1a',
                          color: '#e2e8f0',
                          padding: '6px 8px',
                          fontWeight: 800,
                          maxWidth: '200px',
                        }}
                      >
                        <option value="hold">유지(정지)</option>
                        <option value="2">다음 베이스(1칸)</option>
                        <option value="3">두 베이스(2칸)</option>
                        <option value="4">홈 득점</option>
                        <option value="out">아웃</option>
                      </select>
                    </label>
                  ) : null,
                )}
                {!bases.some(Boolean) ? (
                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>현재 주자 없음</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {data.role === 'fielder' ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15,23,42,0.55)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>수비수 교체/대수비</span>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>포지션 {data.pos}</span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>교체 즉시 라인업/피드 반영</span>
            </div>
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: '1px dashed rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: '4px',
              }}
            >
              <span style={{ color: '#cbd5e1', fontWeight: 800 }}>현재 수비수</span>
              <span style={{ color: '#e2e8f0', fontWeight: 900 }}>{data.name}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>포지션 {data.pos}</span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>벤치에서 교체할 선수를 선택하세요</span>
              {bench.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {bench.map((player, idx) => (
                    <div
                      key={`${player.name}-${idx}`}
                      style={{
                        borderRadius: '12px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        display: 'grid',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'grid', gap: '2px' }}>
                          <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                            {player.name} · {player.pos}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                            등번호 {player.number || '-'} · 투 {player.throws || '-'} · 타 {player.bats || '-'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleSubstitute(idx, '대수비')}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(59,130,246,0.4)',
                              background: 'rgba(59,130,246,0.12)',
                              color: '#3b82f6',
                              fontWeight: 900,
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            대수비
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSubstitute(idx)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: '1px solid rgba(148,163,184,0.4)',
                              background: 'rgba(148,163,184,0.12)',
                              color: '#cbd5e1',
                              fontWeight: 900,
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            일반 교체
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: '12px',
                    border: '1px dashed rgba(148,163,184,0.35)',
                    padding: '12px',
                    color: '#94a3b8',
                    fontWeight: 700,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  벤치 명단이 없습니다. Team Editor에서 선수를 추가하세요.
                </div>
              )}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
              교체 시 이전 선수는 교체 out 패널에 기록되고 수비 위치가 변경됩니다.
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
        {data.role !== 'batter' ? (
          <>
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>{renderButtons()}</div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
              이벤트 확정 시 DB 저장 훅으로 연결해 텍스트 기록과 동일하게 남길 수 있습니다.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function labelForModal(data: ActionModalData) {
  if (data.role === 'runner') return `주자 액션 · ${data.name}`;
  if (data.role === 'batter') return `타자 교체 · ${data.name}`;
  return `수비 액션 · ${data.pos} ${data.name}`;
}

function subLabelForModal(data: ActionModalData) {
  if (data.role === 'runner') return `${data.base + 1}루 주자`;
  if (data.role === 'batter') return '벤치에서 대타/교체 선택';
  return '수비 위치 선택';
}

function RunnerActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: 'rgba(255,255,255,0.04)',
        color,
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function PositionSwapModal({
  side,
  lineup,
  bench,
  practiceMode,
  onClose,
  onSwap,
}: {
  side: Side;
  lineup: { name: string; pos: string; number: string; throws: string; bats: string }[];
  bench: { name: string; pos: string; number: string; throws: string; bats: string }[];
  practiceMode: boolean;
  onClose: () => void;
  onSwap: (swaps: { index: number; newPos: string }[], benchSwaps?: { index: number; newPos: string }[]) => void;
}) {
  const [pendingSwaps, setPendingSwaps] = useState<Record<number, string>>({});
  const [pendingBenchSwaps, setPendingBenchSwaps] = useState<Record<number, string>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<{ type: 'lineup' | 'bench'; index: number } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const positionOptions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'P'];
  // 중복 허용하지 않는 필드 포지션
  const fieldPositions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];

  // 투수가 1-9번 타순에 있는지 확인 (DH 없는 경우)
  const pitcherInBattingOrder = lineup.slice(0, 9).some((p) => p.pos.toUpperCase() === 'P');
  // DH 없으면 9명, DH 있으면 최대 10명까지 표시
  const lineupDisplayCount = practiceMode ? lineup.length : pitcherInBattingOrder ? 9 : Math.min(lineup.length, 10);

  const handlePositionSelect = (type: 'lineup' | 'bench', index: number, newPos: string) => {
    const sourceList = type === 'lineup' ? lineup : bench;
    const setSwaps = type === 'lineup' ? setPendingSwaps : setPendingBenchSwaps;

    setSwaps((prev) => {
      const updated = { ...prev };
      if (newPos.toUpperCase() === sourceList[index].pos.toUpperCase()) {
        delete updated[index];
      } else {
        updated[index] = newPos;
      }
      return updated;
    });
    setSelectedPlayer(null);
    setDuplicateWarning(null); // 선택 시 경고 초기화
  };

  // 라인업 내 중복 포지션 체크
  const checkDuplicatePositions = (): string[] => {
    // 변경 적용 후 라인업의 포지션 목록 생성
    const resultPositions: { pos: string; name: string }[] = lineup.slice(0, lineupDisplayCount).map((player, idx) => ({
      pos: (pendingSwaps[idx] || player.pos).toUpperCase(),
      name: player.name || `선수 ${idx + 1}`,
    }));

    // 필드 포지션 중복 체크
    const duplicates: string[] = [];
    for (const fieldPos of fieldPositions) {
      const players = resultPositions.filter((p) => p.pos === fieldPos);
      if (players.length > 1) {
        duplicates.push(`${fieldPos}: ${players.map((p) => p.name).join(', ')}`);
      }
    }
    return duplicates;
  };

  const handleSave = () => {
    // 중복 포지션 체크
    const duplicates = checkDuplicatePositions();
    if (duplicates.length > 0) {
      setDuplicateWarning(`중복 포지션이 있습니다: ${duplicates.join(' / ')}`);
      return;
    }

    const swaps = Object.entries(pendingSwaps).map(([index, newPos]) => ({
      index: Number(index),
      newPos,
    }));
    const benchSwaps = Object.entries(pendingBenchSwaps).map(([index, newPos]) => ({
      index: Number(index),
      newPos,
    }));
    if (swaps.length > 0 || benchSwaps.length > 0) {
      onSwap(swaps, benchSwaps.length > 0 ? benchSwaps : undefined);
    }
    onClose();
  };

  const hasChanges = Object.keys(pendingSwaps).length > 0 || Object.keys(pendingBenchSwaps).length > 0;
  const totalChanges = Object.keys(pendingSwaps).length + Object.keys(pendingBenchSwaps).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '12px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>포지션 교체</span>
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
              {side === 'home' ? 'HOME' : 'AWAY'} 라인업 내 포지션 변경
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>

        {/* 현재 라인업 */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '12px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15,23,42,0.55)',
            display: 'grid',
            gap: '8px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>현재 라인업</span>
          {lineup.slice(0, lineupDisplayCount).map((player, idx) => {
            const isPitcher = player.pos.toUpperCase() === 'P';
            const pendingPos = pendingSwaps[idx];
            const displayPos = pendingPos || player.pos;
            const isChanged = Boolean(pendingPos);
            const isSelected = selectedPlayer?.type === 'lineup' && selectedPlayer?.index === idx;
            // 투수가 1-9번 타순(idx 0-8)에 있으면 타순 번호 표시, 10번 슬롯(idx 9) 이상이면 "P" 표시
            const showAsPitcherSlot = isPitcher && idx >= 9;

            return (
              <div
                key={`lineup-${player.name}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '10px',
                  border: isSelected
                    ? '1px solid rgba(59,130,246,0.6)'
                    : isChanged
                      ? '1px solid rgba(34,197,94,0.5)'
                      : '1px solid rgba(148,163,184,0.2)',
                  background: isSelected
                    ? 'rgba(59,130,246,0.12)'
                    : isChanged
                      ? 'rgba(34,197,94,0.08)'
                      : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedPlayer(isSelected ? null : { type: 'lineup', index: idx })}
              >
                <span style={{ color: '#94a3b8', fontWeight: 800, width: '24px' }}>
                  {showAsPitcherSlot ? 'P' : `${idx + 1}.`}
                </span>
                <div style={{ flex: 1, display: 'grid', gap: '2px' }}>
                  <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{player.name || '(미정)'}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                    #{player.number || '--'}
                  </span>
                </div>
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: isChanged ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.15)',
                    color: isChanged ? '#22c55e' : '#cbd5e1',
                    fontWeight: 800,
                    fontSize: '12px',
                  }}
                >
                  {isChanged ? `${player.pos} → ${displayPos}` : displayPos || '-'}
                </div>
              </div>
            );
          })}
        </div>

        {/* 후보 선수 (벤치) */}
        {bench.length > 0 && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(251,146,60,0.3)',
              background: 'rgba(251,146,60,0.05)',
              display: 'grid',
              gap: '8px',
            }}
          >
            <span style={{ fontWeight: 800, color: '#fb923c', fontSize: '13px' }}>후보 선수</span>
            {bench.map((player, idx) => {
              const pendingPos = pendingBenchSwaps[idx];
              const displayPos = pendingPos || player.pos;
              const isChanged = Boolean(pendingPos);
              const isSelected = selectedPlayer?.type === 'bench' && selectedPlayer?.index === idx;

              return (
                <div
                  key={`bench-${player.name}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: isSelected
                      ? '1px solid rgba(59,130,246,0.6)'
                      : isChanged
                        ? '1px solid rgba(34,197,94,0.5)'
                        : '1px solid rgba(251,146,60,0.2)',
                    background: isSelected
                      ? 'rgba(59,130,246,0.12)'
                      : isChanged
                        ? 'rgba(34,197,94,0.08)'
                        : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedPlayer(isSelected ? null : { type: 'bench', index: idx })}
                >
                  <span style={{ color: '#fb923c', fontWeight: 800, width: '24px', fontSize: '11px' }}>후보</span>
                  <div style={{ flex: 1, display: 'grid', gap: '2px' }}>
                    <span style={{ fontWeight: 800, color: '#e2e8f0' }}>{player.name || '(미정)'}</span>
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                      #{player.number || '--'}
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: isChanged ? 'rgba(34,197,94,0.2)' : 'rgba(251,146,60,0.15)',
                      color: isChanged ? '#22c55e' : '#fdba74',
                      fontWeight: 800,
                      fontSize: '12px',
                    }}
                  >
                    {isChanged ? `${player.pos} → ${displayPos}` : displayPos || '-'}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 포지션 선택 패널 */}
        {selectedPlayer !== null && (
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(59,130,246,0.4)',
              background: 'rgba(59,130,246,0.08)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <span style={{ fontWeight: 800, color: '#60a5fa', fontSize: '13px' }}>
              {selectedPlayer.type === 'lineup'
                ? lineup[selectedPlayer.index]?.name || '선수'
                : bench[selectedPlayer.index]?.name || '선수'}{' '}
              - 새 포지션 선택
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
              }}
            >
              {positionOptions.map((pos) => {
                const sourceList = selectedPlayer.type === 'lineup' ? lineup : bench;
                const swapsMap = selectedPlayer.type === 'lineup' ? pendingSwaps : pendingBenchSwaps;
                const currentPos = swapsMap[selectedPlayer.index] || sourceList[selectedPlayer.index]?.pos;
                const isCurrentPos = pos.toUpperCase() === currentPos?.toUpperCase();
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => handlePositionSelect(selectedPlayer.type, selectedPlayer.index, pos)}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: isCurrentPos
                        ? '1px solid rgba(34,197,94,0.6)'
                        : '1px solid rgba(148,163,184,0.3)',
                      background: isCurrentPos ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)',
                      color: isCurrentPos ? '#22c55e' : '#cbd5e1',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {pos}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 변경 사항 요약 */}
        {hasChanges && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(34,197,94,0.4)',
              background: 'rgba(34,197,94,0.08)',
              display: 'grid',
              gap: '4px',
            }}
          >
            <span style={{ color: '#22c55e', fontWeight: 800, fontSize: '12px' }}>
              변경 예정 ({totalChanges}명)
            </span>
            <span style={{ color: '#86efac', fontSize: '12px', fontWeight: 700 }}>
              {[
                ...Object.entries(pendingSwaps).map(([idx, newPos]) => {
                  const player = lineup[Number(idx)];
                  return `${player?.name || '선수'}: ${player?.pos} → ${newPos}`;
                }),
                ...Object.entries(pendingBenchSwaps).map(([idx, newPos]) => {
                  const player = bench[Number(idx)];
                  return `${player?.name || '선수'}: ${player?.pos} → ${newPos}`;
                }),
              ].join(', ')}
            </span>
          </div>
        )}

        {/* 중복 포지션 경고 */}
        {duplicateWarning && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.5)',
              background: 'rgba(239,68,68,0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '12px' }}>⚠️ {duplicateWarning}</span>
          </div>
        )}

        {/* 버튼 영역 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(34,197,94,0.4)',
              background: hasChanges ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'rgba(148,163,184,0.16)',
              color: hasChanges ? '#0b0f1a' : '#94a3b8',
              fontWeight: 900,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
              boxShadow: hasChanges ? '0 10px 20px rgba(34,197,94,0.2)' : 'none',
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamEditor({
  label,
  defaultName,
  side,
  teamName,
  lineup,
  bench,
  benchInput,
  onChangeBenchInput,
  onSetTeamName,
  onSetLineup,
  onRemoveLineupSlot,
  onAddBench,
  onRemoveBench,
  onSubstitute,
  highlightBatterIndex,
  highlightPitcherName,
  practiceMode,
  gameStarted,
  onOpenPositionSwap,
}: {
  label: string;
  defaultName: string;
  side: Side;
  teamName: string;
  // [수정] isOhtaniRule, isElite 타입 추가
  lineup: { name: string; pos: string; number: string; throws: string; bats: string; isOhtaniRule?: boolean; isElite?: boolean }[];
  bench: { name: string; pos: string; number: string; throws: string; bats: string; isOhtaniRule?: boolean; isElite?: boolean }[];
  benchInput: { name: string; pos: string; number: string; throws: string; bats: string; isElite: boolean };
  onChangeBenchInput: (val: { name: string; pos: string; number: string; throws: string; bats: string; isElite: boolean }) => void;
  onSetTeamName: (side: Side, name: string) => void;
  // [수정] updates 타입에 isOhtaniRule, isElite 추가
  onSetLineup: (
    side: Side,
    index: number,
    updates: { name?: string; pos?: string; number?: string; throws?: string; bats?: string; isOhtaniRule?: boolean; isElite?: boolean },
  ) => void;
  onRemoveLineupSlot: (side: Side, index: number) => void;
  onAddBench: (
    side: Side,
    player: { name: string; pos: string; number: string; throws: string; bats: string; isOhtaniRule?: boolean; isElite?: boolean },
  ) => void;
  onRemoveBench: (side: Side, benchIndex: number) => void;
  onSubstitute: (side: Side, benchIndex: number, lineupIndex: number) => void;
  highlightBatterIndex?: number;
  highlightPitcherName?: string;
  practiceMode: boolean;
  gameStarted?: boolean;
  onOpenPositionSwap?: () => void;
}) {
  type TeamEditorSlot = {
    name: string;
    pos: string;
    number: string;
    throws: string;
    bats: string;
    isOhtaniRule?: boolean;
    isElite?: boolean;
  };
  const makeEmptySlot = (): TeamEditorSlot => ({
    name: '',
    pos: '',
    number: '',
    throws: 'R',
    bats: 'R',
    isOhtaniRule: false,
    isElite: false,
  });

  // [수정] 빈 라인업을 받아도 UI 입력칸을 유지하기 위해 동적으로 빈 슬롯 생성
  const filledLineup = useMemo<TeamEditorSlot[]>(() => {
    if (practiceMode) {
      const base: TeamEditorSlot[] = lineup.length ? [...lineup] : [];
      if (!base.length) {
        return [
          ...Array.from({ length: 9 }, () => makeEmptySlot()),
          { ...makeEmptySlot(), pos: 'P' },
        ];
      }
      const hasDedicatedPitcher = base[base.length - 1]?.pos?.toUpperCase() === 'P';
      if (!hasDedicatedPitcher) {
        base.push({ ...makeEmptySlot(), pos: 'P' });
      }
      return base;
    }
    const result: TeamEditorSlot[] = [...lineup];
    const emptySlot = makeEmptySlot();

    // 투수가 1-9번 타순에 있는지 확인 (DH 없는 경우)
    const pitcherInBattingOrder = result.slice(0, 9).some(s => s.pos.toUpperCase() === 'P');

    if (pitcherInBattingOrder) {
      // DH 없음: 총 9명이 될 때까지 빈 슬롯 추가 (투수 포함해서 9명)
      while (result.length < 9) {
        result.push({ ...emptySlot });
      }
    } else {
      // DH 있음 또는 투수 미지정: 비투수 9명 채우기
      while (result.filter(s => s.pos.toUpperCase() !== 'P').length < 9) {
        result.push({ ...emptySlot });
      }
      // 투수가 없으면 10번째 슬롯에 투수 추가
      if (!result.some(s => s.pos.toUpperCase() === 'P')) {
        result.push({ ...emptySlot, pos: 'P' });
      }
    }

    return result;
  }, [lineup, practiceMode]);

  // 선출(선수 출신) 유효성 검사
  const eliteWarnings = useMemo(() => {
    const warnings: string[] = [];
    const allPlayers = [...lineup, ...bench].filter(p => p.name && p.name.trim());

    // 선출 인원 카운트
    const elitePlayers = allPlayers.filter(p => p.isElite);
    const eliteCount = elitePlayers.length;

    if (eliteCount > 2) {
      warnings.push(`선출 선수 ${eliteCount}명 (최대 2명 초과)`);
    }

    // 선출 P/C 포지션 검사
    const eliteInvalidPos = allPlayers.filter(
      p => p.isElite && ['P', 'C'].includes(p.pos.toUpperCase())
    );
    if (eliteInvalidPos.length > 0) {
      warnings.push(`선출 선수 투수/포수 불가: ${eliteInvalidPos.map(p => p.name).join(', ')}`);
    }

    return warnings;
  }, [lineup, bench]);

  const lineupEntries = filledLineup.map((slot, idx) => ({ slot, idx }));
  const practicePitcherEntry = practiceMode
    ? lineupEntries[lineupEntries.length - 1] ?? null
    : null;

  // [핵심 수정] 투수(P) 여부와 상관없이 항상 라인업의 앞 9명을 타자로 표시합니다.
  // 이렇게 하면 투수가 타석에 들어서도 입력칸이 유지됩니다.
  const battingEntries = practiceMode
    ? lineupEntries.slice(0, Math.max(0, lineupEntries.length - 1))
    : lineupEntries.slice(0, 9);

  // 투수가 1-9번 타순에 있으면 별도 투수 섹션 불필요, 10번째 이후에 있으면 별도 표시
  const pitcherInBattingOrder = !practiceMode && battingEntries.some((entry) => entry.slot.pos.toUpperCase() === 'P');
  const pitcherInBattingOrderEntry = pitcherInBattingOrder
    ? battingEntries.find((entry) => entry.slot.pos.toUpperCase() === 'P')
    : null;
  const pitcherEntry = pitcherInBattingOrder
    ? null
    : practiceMode
      ? practicePitcherEntry
      : lineupEntries.find((entry) => entry.slot.pos.toUpperCase() === 'P');
  
  const positionOptions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'OF', 'IF', 'PH', 'PR'];
  const filterPositionOptions = (value: string) => {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return positionOptions;
    return positionOptions.filter((option) => option.includes(normalized));
  };

  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, color: '#cbd5e1' }}>{label}</span>
        <input
          value={teamName}
          onChange={(e) => onSetTeamName(side, e.target.value)}
          placeholder={defaultName}
          style={{
            background: '#0b0f1a',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '10px',
            padding: '8px 10px',
            color: '#e2e8f0',
            fontWeight: 800,
            width: '70%',
          }}
        />
      </div>
      <div
        style={{
          background: '#0b0f1a',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        {/* 경기 시작 후 포지션 교체 버튼 */}
        {gameStarted && onOpenPositionSwap && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <button
              type="button"
              onClick={onOpenPositionSwap}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(251,146,60,0.4)',
                background: 'rgba(251,146,60,0.12)',
                color: '#fb923c',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              포지션 교체
            </button>
          </div>
        )}
        {/* 타자 목록 (1~9번) */}
        {battingEntries.map((entry, orderIdx) => (
          <div
            key={entry.idx}
            style={{
              display: 'grid',
              gridTemplateColumns: practiceMode ? '24px 1fr 58px 56px 68px 68px 32px' : '24px 1fr 58px 56px 68px 68px 32px',
              gap: '6px',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '10px',
              border: `1px solid ${
                typeof highlightBatterIndex === 'number' && entry.idx === highlightBatterIndex
                  ? 'rgba(56,189,248,0.6)'
                  : 'transparent'
              }`,
              background:
                typeof highlightBatterIndex === 'number' && entry.idx === highlightBatterIndex
                  ? 'rgba(56,189,248,0.12)'
                  : 'transparent',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 800 }}>{orderIdx + 1}.</span>
            <input
              value={entry.slot.name}
              onChange={(e) => onSetLineup(side, entry.idx, { name: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
                width: '100%',
              }}
            />
            <input
              value={entry.slot.pos}
              onChange={(e) => onSetLineup(side, entry.idx, { pos: e.target.value })}
              list={`lineup-pos-${side}-${entry.idx}`}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <datalist id={`lineup-pos-${side}-${entry.idx}`}>
              {filterPositionOptions(entry.slot.pos).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <input
              value={entry.slot.number}
              onChange={(e) => onSetLineup(side, entry.idx, { number: e.target.value })}
              placeholder="#"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <select
              value={entry.slot.throws}
              onChange={(e) => onSetLineup(side, entry.idx, { throws: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <option value="R">투 R</option>
              <option value="L">투 L</option>
            </select>
            <select
              value={entry.slot.bats}
              onChange={(e) => onSetLineup(side, entry.idx, { bats: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <option value="R">타 R</option>
              <option value="L">타 L</option>
            </select>
            {!practiceMode && (
              <button
                type="button"
                onClick={() => onSetLineup(side, entry.idx, { isElite: !entry.slot.isElite })}
                style={{
                  padding: '6px 2px',
                  borderRadius: '8px',
                  border: entry.slot.isElite
                    ? '1px solid rgba(249, 115, 22, 0.6)'
                    : '1px solid rgba(148, 163, 184, 0.25)',
                  background: entry.slot.isElite
                    ? 'rgba(249, 115, 22, 0.15)'
                    : 'rgba(255,255,255,0.04)',
                  color: entry.slot.isElite ? '#fb923c' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                  width: '100%',
                }}
                title="선출(선수 출신) 여부"
              >
                {entry.slot.isElite ? '선' : '일'}
              </button>
            )}
            {practiceMode && (
              <button
                type="button"
                onClick={() => {
                  onRemoveLineupSlot(side, entry.idx);
                }}
                disabled={orderIdx < 9 || battingEntries.length <= 9}
                style={{
                  padding: '6px 0',
                  borderRadius: '8px',
                  border: '1px solid rgba(239,68,68,0.45)',
                  background: 'rgba(248,113,113,0.08)',
                  color: '#fca5a5',
                  fontWeight: 900,
                  fontSize: '16px',
                  cursor: orderIdx < 9 || battingEntries.length <= 9 ? 'not-allowed' : 'pointer',
                  opacity: orderIdx < 9 || battingEntries.length <= 9 ? 0.45 : 1,
                  width: '100%',
                }}
                title={
                  orderIdx < 9
                    ? '기본 1~9번 타자는 삭제할 수 없습니다'
                    : battingEntries.length <= 9
                      ? '타자는 최소 9명이어야 합니다'
                      : '추가 타자 라인업 삭제'
                }
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {practiceMode && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                if (pitcherEntry) {
                  const isVirtualPitcherSlot = pitcherEntry.idx >= lineup.length;
                  if (isVirtualPitcherSlot) {
                    onSetLineup(side, lineup.length, {
                      name: '',
                      pos: '',
                      number: '',
                      throws: 'R',
                      bats: 'R',
                    });
                    return;
                  }
                  onSetLineup(side, lineup.length, {
                    name: pitcherEntry.slot.name,
                    pos: 'P',
                    number: pitcherEntry.slot.number,
                    throws: pitcherEntry.slot.throws,
                    bats: pitcherEntry.slot.bats,
                    isOhtaniRule: pitcherEntry.slot.isOhtaniRule,
                    isElite: pitcherEntry.slot.isElite,
                  });
                  onSetLineup(side, pitcherEntry.idx, {
                    name: '',
                    pos: '',
                    number: '',
                    throws: 'R',
                    bats: 'R',
                    isOhtaniRule: false,
                  });
                  return;
                }
                onSetLineup(side, lineup.length, {
                  name: '',
                  pos: '',
                  number: '',
                  throws: 'R',
                  bats: 'R',
                });
              }}
              style={{
                padding: '7px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'rgba(59,130,246,0.1)',
                color: '#93c5fd',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              타자 추가
            </button>
          </div>
        )}

        {/* 투수 정보 및 오타니룰 토글 */}
        <div
          style={{
            marginTop: '6px',
            padding: '10px',
            borderRadius: '10px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(255,255,255,0.03)',
            display: 'grid',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: '#cbd5e1' }}>투수</span>

            {/* [추가] 오타니룰 토글 버튼 - 별도 투수 슬롯 또는 타순 내 투수 모두 지원 */}
            {(pitcherEntry || pitcherInBattingOrderEntry) && (
              <button
                type="button"
                onClick={() => {
                  const entry = pitcherEntry || pitcherInBattingOrderEntry;
                  if (entry) {
                    onSetLineup(side, entry.idx, {
                      isOhtaniRule: !entry.slot.isOhtaniRule,
                    });
                  }
                }}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: (pitcherEntry?.slot.isOhtaniRule || pitcherInBattingOrderEntry?.slot.isOhtaniRule)
                    ? '1px solid rgba(16, 185, 129, 0.5)'
                    : '1px solid rgba(148, 163, 184, 0.3)',
                  background: (pitcherEntry?.slot.isOhtaniRule || pitcherInBattingOrderEntry?.slot.isOhtaniRule)
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'transparent',
                  color: (pitcherEntry?.slot.isOhtaniRule || pitcherInBattingOrderEntry?.slot.isOhtaniRule) ? '#34d399' : '#94a3b8',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {(pitcherEntry?.slot.isOhtaniRule || pitcherInBattingOrderEntry?.slot.isOhtaniRule) ? '오타니룰 ON' : '오타니룰 OFF'}
              </button>
            )}
          </div>

          {pitcherEntry ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '85px 50px 70px 70px 50px',
                gap: '8px',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '10px',
                border: `1px solid ${
                  highlightPitcherName && pitcherEntry.slot.name === highlightPitcherName
                    ? 'rgba(244,114,182,0.6)'
                    : 'transparent'
                }`,
                background:
                  highlightPitcherName && pitcherEntry.slot.name === highlightPitcherName
                    ? 'rgba(244,114,182,0.12)'
                    : 'transparent',
                boxSizing: 'border-box',
              }}
            >
              <input
                value={pitcherEntry.slot.name}
                onChange={(e) =>
                  onSetLineup(side, pitcherEntry.idx, { name: e.target.value, pos: 'P' })
                }
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              />
              <input
                value={pitcherEntry.slot.number}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { number: e.target.value })}
                placeholder="#"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              />
              <select
                value={pitcherEntry.slot.throws}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { throws: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="R">투 R</option>
                <option value="L">투 L</option>
              </select>
              <select
                value={pitcherEntry.slot.bats}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { bats: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="R">타 R</option>
                <option value="L">타 L</option>
              </select>
              <input
                value="P"
                readOnly
                style={{
                  background: 'rgba(15,23,42,0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#94a3b8',
                  fontWeight: 800,
                  textAlign: 'center',
                }}
              />
            </div>
          ) : pitcherInBattingOrderEntry ? (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(244,114,182,0.3)',
                background: 'rgba(244,114,182,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ color: '#f472b6', fontWeight: 800, fontSize: '12px' }}>
                {pitcherInBattingOrderEntry.idx + 1}번 타순에 포함
              </span>
              <span style={{ color: '#e2e8f0', fontWeight: 900 }}>
                {pitcherInBattingOrderEntry.slot.name || '(이름 미입력)'}
              </span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                #{pitcherInBattingOrderEntry.slot.number || '--'}
              </span>
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
              투수 미지정
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px dashed rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={benchInput.name}
            placeholder="후보 이름"
            onChange={(e) => onChangeBenchInput({ ...benchInput, name: e.target.value })}
            style={{
              flex: 1,
              minWidth: '120px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.number}
            placeholder="등번호"
            onChange={(e) => onChangeBenchInput({ ...benchInput, number: e.target.value })}
            style={{
              width: '70px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.pos}
            placeholder="포지션"
            onChange={(e) => onChangeBenchInput({ ...benchInput, pos: e.target.value })}
            list={`bench-pos-${side}`}
            style={{
              width: '90px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <datalist id={`bench-pos-${side}`}>
            {filterPositionOptions(benchInput.pos).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <select
            value={benchInput.throws}
            onChange={(e) => onChangeBenchInput({ ...benchInput, throws: e.target.value })}
            style={{
              width: '100px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          >
            <option value="R">투 R</option>
            <option value="L">투 L</option>
          </select>
          <select
            value={benchInput.bats}
            onChange={(e) => onChangeBenchInput({ ...benchInput, bats: e.target.value })}
            style={{
              width: '100px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
                }}
              >
                <option value="R">타 R</option>
                <option value="L">타 L</option>
              </select>
          {!practiceMode && (
            <button
              type="button"
              onClick={() => onChangeBenchInput({ ...benchInput, isElite: !benchInput.isElite })}
              style={{
                padding: '8px 6px',
                borderRadius: '10px',
                border: benchInput.isElite
                  ? '1px solid rgba(249, 115, 22, 0.6)'
                  : '1px solid rgba(148, 163, 184, 0.3)',
                background: benchInput.isElite
                  ? 'rgba(249, 115, 22, 0.15)'
                  : '#0b0f1a',
                color: benchInput.isElite ? '#fb923c' : '#94a3b8',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="선출(선수 출신) 여부"
            >
              {benchInput.isElite ? '선' : '일'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!benchInput.name.trim()) return;
              onAddBench(side, {
                name: benchInput.name,
                pos: benchInput.pos || 'PH',
                number: benchInput.number,
                throws: benchInput.throws,
                bats: benchInput.bats,
                isElite: benchInput.isElite,
              });
              onChangeBenchInput({ name: '', pos: '', number: '', throws: 'R', bats: 'R', isElite: false });
            }}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            후보 추가
          </button>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {bench.map((player, benchIdx) => (
            <div
              key={player.name + benchIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 1fr',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px',
                padding: '8px 10px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div style={{ display: 'grid', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 800 }}>{player.name}</span>
                  {!practiceMode && player.isElite && (
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(249, 115, 22, 0.15)',
                        color: '#fb923c',
                        fontSize: '10px',
                        fontWeight: 700,
                      }}
                    >
                      선출
                    </span>
                  )}
                </div>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>
                  #{player.number || '--'} · {player.pos} · 투 {player.throws} / 타 {player.bats}
                </span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>→ 라인업 투입</span>
              <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '6px',
                  }}
                >
                  {battingEntries.map((entry, orderIdx) => (
                    <button
                      key={entry.idx}
                      type="button"
                      onClick={() => onSubstitute(side, benchIdx, entry.idx)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.3)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {orderIdx + 1}번
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {pitcherEntry ? (
                    <button
                      type="button"
                      onClick={() => onSubstitute(side, benchIdx, pitcherEntry.idx)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.3)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      투수
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveBench(side, benchIdx)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239,68,68,0.45)',
                      background: 'rgba(248,113,113,0.08)',
                      color: '#fca5a5',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 선출 경고 표시 */}
        {!practiceMode && eliteWarnings.length > 0 && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            {eliteWarnings.map((warning, idx) => (
              <div
                key={idx}
                style={{
                  color: '#fca5a5',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>⚠️</span>
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getDefenseAssignments(lineup: { name: string; pos: string }[]) {
  const posMap: Record<string, { x: number; y: number }> = {
    P: { x: 50, y: 54 },
    C: { x: 50, y: 84 },
    '1B': { x: 76, y: 52 },
    '2B': { x: 62, y: 40 },
    SS: { x: 38, y: 40 },
    '3B': { x: 24, y: 52 },
    LF: { x: 18, y: 20 },
    CF: { x: 50, y: 12 },
    RF: { x: 82, y: 20 },
  };
  const fallback: { x: number; y: number }[] = [
    { x: 50, y: 54 },
    { x: 50, y: 84 },
    { x: 76, y: 52 },
    { x: 62, y: 40 },
    { x: 38, y: 40 },
    { x: 24, y: 52 },
    { x: 18, y: 20 },
    { x: 50, y: 12 },
    { x: 82, y: 20 },
  ];
  return lineup.filter((slot) => Boolean(posMap[slot.pos.toUpperCase()])).map((slot, idx) => {
    const key = slot.pos.toUpperCase();
    const coords = posMap[key] ?? fallback[idx] ?? { x: 50, y: 56 };
    return { name: slot.name, pos: slot.pos, x: coords.x, y: coords.y };
  });
}
