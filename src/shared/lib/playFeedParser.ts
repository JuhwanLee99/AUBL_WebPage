import type { PlayEvent } from '../state/demoStore';
import { replayScoringEvents } from './scoringReplay.ts';

type FeedParserOptions = {
  source?: PlayEvent['source'];
  manualResolveThreshold?: number;
  fallback?: { inning: number; half: 'top' | 'bottom' };
};

export type ParsedFeedEvent = PlayEvent;

type FeedChrono = {
  inning: number;
  half: 'top' | 'bottom';
  order: number;
  batter: string;
  pitch: number;
  result: string;
  createdAt?: number;
  eventId?: string;
};

export type KboPlayRuleGroup = {
  id: string;
  label: string;
  events: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

export const KBO_RULE_CATALOG: KboPlayRuleGroup[] = [
  {
    id: 'batting',
    label: '타격/아웃군',
    events: [
      { id: 'single', label: '단타', description: '타격 및 루상 진루/득점 계산' },
      { id: 'double', label: '2루타', description: '1차/2차 타격 판정군' },
      { id: 'triple', label: '3루타', description: '장타 및 주루 동시 반영군' },
      { id: 'hr', label: '홈런', description: '득점·주자 정산 그룹' },
      { id: 'walk', label: '볼넷/고의4구', description: '볼넷과 고의4구, 주자 강제 진루 포함' },
      { id: 'hbp', label: '사구', description: '볼넷과 동등한 타격진입군' },
      { id: 'out', label: '삼진/아웃군', description: '삼진·아웃 합산군' },
      { id: 'sac', label: '희생플라이/희생번트', description: '득점·주자진루 전용군' },
      { id: 'fc', label: '야수선택', description: '야수선택/주자 아웃 포함' },
    ],
  },
  {
    id: 'baserunning',
    label: '주루군',
    events: [
      { id: 'steal', label: '도루성공', description: '도루 진입 및 주자 이동' },
      { id: 'steal_fail', label: '도루 실패', description: '도루 저지/실패 판독' },
      { id: 'runner_out', label: '주자 아웃', description: '견제·주루사·병살·실책 아웃군' },
      { id: 'runner', label: '주자 진루', description: '진루/정지/득점 기본군' },
    ],
  },
  {
    id: 'defense',
    label: '수비/특수 아웃군',
    events: [
      { id: 'error', label: '실책', description: '실책 및 범실군' },
      { id: 'ci', label: '타격방해', description: 'CI·인터페어런스 계열' },
      { id: 'substitution', label: '교체', description: '주루/수비/타자/투수 교체군' },
      { id: 'wp', label: '폭투', description: '폭투 판정 및 주루 반영군' },
      { id: 'pb', label: '포일', description: '포일/패스볼 판정군' },
      { id: 'runner', label: '병살/트리플플레이', description: '병살·중첩 아웃군' },
    ],
  },
];

export type FeedEventCandidate = {
  type: string;
  confidence: number;
  evidence: string[];
  reasons: string[];
  outcome?: string;
  penalty?: PlayEvent['penalty'];
  substitution?: PlayEvent['substitution'];
  officialAdjust?: boolean;
};

export type FeedRebuildOption = {
  eventId: string;
  event: ParsedFeedEvent;
  confidence: number;
  evidence: string[];
  reasons: string[];
};

export type FeedRebuildGroup = {
  groupId: string;
  sourceText: string;
  source: PlayEvent['source'];
  options: FeedRebuildOption[];
  selectedEventId: string;
  isAmbiguous: boolean;
  isLowConfidence: boolean;
  requiresManualResolve: boolean;
  rebuildIssues?: string[];
  createdAt?: number;
};

export type RebuildResult = {
  events: ParsedFeedEvent[];
  groups: FeedRebuildGroup[];
  needsReview: boolean;
};

const DEFAULT_SORT_WEIGHT = 0.5;
const DEFAULT_MANUAL_RESOLVE_THRESHOLD = 0.82;
const FRAGMENT_SEPARATOR = /\s*(?:,|;|\/|\+|\|{1,2}|\s+(?:및|그리고|또는|그대로)\s+)\s*/g;
const chronoIssueLimit = 3;

function toUniqueList(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

const validateChronoTransition = (previous?: FeedChrono, current?: FeedChrono) => {
  if (!current) return [] as string[];
  const issues: string[] = [];
  if (!Number.isFinite(current.inning) || current.inning < 1) {
    issues.push('이닝 정보 누락/비정상');
  }
  if (!Number.isFinite(current.order) || current.order < 0) {
    issues.push('타순 정보 누락/비정상');
  }
  if (!Number.isFinite(current.pitch) || current.pitch < 0) {
    issues.push('구수 정보 누락/비정상');
  }
  if (!current.result?.trim()) {
    issues.push('로그 문구 비어있음');
  }

  if (!previous) return issues;

  if (current.inning < previous.inning) {
    issues.push('이닝 역전 기록 감지');
    return issues;
  }

  if (current.inning === previous.inning) {
    if (previous.half === 'bottom' && current.half === 'top') {
      issues.push('동일 이닝에서 말→초로 역전됨');
      return issues;
    }
    if (previous.half === 'top' && current.half === 'bottom') {
      // 초회 이후 말회전은 허용
      return issues;
    }
    if (previous.half === current.half) {
      // Batting order wraps (including variable-length practice lineups).
      if (
        current.order === previous.order && current.batter === previous.batter &&
        current.eventId === previous.eventId &&
        current.pitch > 0 &&
        previous.pitch > 0 &&
        current.pitch < previous.pitch
      ) {
        issues.push('구수 역행 기록');
      }
    }
    return issues;
  }

  if (current.inning > previous.inning && previous.half !== 'bottom') {
    issues.push('이닝 증가 시 말회전 누락');
  }

  return issues;
};

const detectChronologyIssues = (sortedFeed: FeedChrono[]) => {
  const eventIssues = new Map<string, string[]>();
  const timelineIndex = new Map<string, string[]>();

  let prev: FeedChrono | undefined;

  sortedFeed.forEach((entry) => {
    const eventId = entry.eventId;
    const issues = validateChronoTransition(prev, entry);
    const timelineKey = JSON.stringify([entry.inning, entry.half, entry.order, entry.pitch, entry.createdAt, entry.batter, entry.result]);
    const duplicated = timelineIndex.get(timelineKey) ?? [];
    if (duplicated.length > 0 && !duplicated.includes(eventId ?? '')) {
      issues.push('동일 시각과 내용의 중계가 중복되었습니다.');
    }
    duplicated.push(eventId ?? timelineKey);
    timelineIndex.set(timelineKey, duplicated);

    const trimmed = toUniqueList(issues).slice(0, chronoIssueLimit);
    if (trimmed.length && eventId) {
      eventIssues.set(eventId, toUniqueList([...(eventIssues.get(eventId) ?? []), ...trimmed]));
    }

    prev = entry;
  });

  return eventIssues;
};

const feedTextSynonyms: Array<[RegExp, string]> = [
  [/고의\s*4\s*구/g, '고의4구'],
  [/의도\s*4\s*구/g, '고의4구'],
  [/의도적\s*4\s*구/g, '고의4구'],
  [/몸\s*맞는\s*공/g, '사구'],
  [/번트\s*안\s*타/g, '번트안타'],
  [/희\s*생\s*플\s*라이/g, '희생플라이'],
  [/희\s*생\s*번\s*트/g, '희생번트'],
  [/타\s*격\s*방\s*해/g, '타격방해'],
  [/안타\s*맞은\s*공/g, '안타'],
  [/번트\s*안타/g, '번트안타'],
  [/더블\s*플레이/g, '병살'],
  [/트리플\s*플레이/g, '트리플플레이'],
  [/투수\s*교체/g, '투수교체'],
  [/타자\s*교체/g, '타자교체'],
  [/대\s*주자\s*교체/g, '대주자교체'],
  [/대\s*타\s*교체/g, '대타교체'],
  [/대\s*수비\s*교체/g, '대수비교체'],
  [/\bBB\b/g, '볼넷'],
  [/\bPB\b/g, '패스볼'],
  [/\bDP\b/g, '병살'],
  [/\bGDP\b/g, '병살'],
  [/도루\s*차단/g, '도루 저지'],
  [/타\s*루\s*방해/g, '주루방해'],
  [/주\s*루\s*방\s*해/g, '주루방해'],
  [/폭투/g, '폭투'],
  [/패스\s*볼/g, '패스볼'],
  [/교체\s*투수/g, '투수교체'],
  [/교체\s*타자/g, '타자교체'],
  [/교체\s*주자/g, '대주자교체'],
];

const normalizeWhitespace = (value: string) => (value || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeFeedText = (value: string) => {
  let normalized = normalizeWhitespace(value);
  feedTextSynonyms.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized;
};

const normalizeEventKeyText = (value: string) =>
  normalizeWhitespace(value).toLowerCase();

const buildEventSummaryKey = (event: Pick<PlayEvent, 'notes' | 'runners' | 'type' | 'batter' | 'inning' | 'half' | 'order' | 'pitch'>) => {
  const normalizedRunners = (event.runners ?? [])
    .map((runner) => normalizeEventKeyText(runner))
    .filter(Boolean)
    .sort()
    .join(',');
  const noteKey = normalizeEventKeyText(event.notes ?? '');
  return JSON.stringify([
    event.inning,
    event.half,
    event.order || 0,
    event.pitch || 0,
    normalizeEventKeyText(event.batter || ''),
    event.type || 'play',
    normalizedRunners,
    noteKey,
  ]);
};

const normalizeNoSpace = (value: string) => normalizeFeedText(value).replace(/\s+/g, '');

export const classifyKboResultCode = (event: PlayEvent) => {
  const normalized = (event.notes || event.type || '').replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'HR';
  if (event.type === 'wp' || normalized.includes('폭투') || /W\.P/.test(normalized)) return 'WP';
  if (event.type === 'pb' || normalized.includes('패스트볼') || normalized.includes('패스볼') || normalized.includes('PB')) return 'PB';
  if (normalized.includes('3루타')) return '3B';
  if (normalized.includes('2루타')) return '2B';
  if (normalized.includes('1루타') || event.type === 'single' || normalized.includes('번트안타')) return '1B';
  if (event.type === 'double') return '2B';
  if (event.type === 'triple') return '3B';
  if (event.type === 'hr') return 'HR';
  if (event.type === 'substitution' || normalized.includes('교체')) return 'SUB';
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
  return (event.type || '').toUpperCase();
};

const eventTypePriority: Record<string, number> = {
  steal_fail: 1,
  steal: 2,
  runner_out: 3,
  fc: 4,
  hbp: 5,
  walk: 6,
  out: 7,
  runner: 8,
  error: 9,
  play: 10,
  ci: 11,
  sac: 12,
  substitution: 13,
  wp: 14,
  pb: 15,
};

const makeDefaultSource = (source?: FeedParserOptions['source']): PlayEvent['source'] =>
  source
    ? source
    : {
        kind: 'text_feed_rebuild',
        provider: 'shared-text-feed-parser',
      };

const eventRules: Array<{
  type: string;
  confidence: number;
  reasons: string[];
  matchers: RegExp[];
  ignoreWhenContains?: string[];
}> = [
  { type: 'hr', confidence: 0.99, reasons: ['홈런'], matchers: [/홈런/] },
  { type: 'triple', confidence: 0.98, reasons: ['3루타'], matchers: [/3루타/] },
  { type: 'double', confidence: 0.98, reasons: ['2루타/인정 2루타'], matchers: [/2루타/] },
  { type: 'single', confidence: 0.96, reasons: ['단타/번트안타'], matchers: [/1루타|단타|번트안타|안타/], ignoreWhenContains: ['홈런', '2루타', '3루타', '안타성', '안타취소'] },
  { type: 'pitch', confidence: 0.99, reasons: ['투구 중간 기록'], matchers: [/^(?:볼|파울|번트파울|스트라이크|루킹스트라이크|헛스윙스트라이크)$/] },
  {
    type: 'steal_fail',
    confidence: 0.98,
    reasons: ['도루 저지/실패 규칙'],
    matchers: [
      /도루저지/,
      /도루.*(저지|실패|차단|가로막)/,
      /(저지|막|가로막|차단).*도루/,
      /도루.*아웃/,
    ],
    ignoreWhenContains: ['도루성공', '도루성공으로'],
  },
  {
    type: 'steal',
    confidence: 0.92,
    reasons: ['도루 성립 규칙'],
    matchers: [
      /도루성공/,
      /도루완료/,
      /도루.*성공/,
      /도루.*진입/,
    ],
    ignoreWhenContains: ['실패', '저지', '차단'],
  },
  {
    type: 'runner_out',
    confidence: 0.87,
    reasons: ['주자 아웃 규칙'],
    matchers: [
      /(주자.*아웃|아웃.*주자|주자.*잡)/,
      /견제사|주루사/,
      /주자.*실책.*아웃/,
      /도루.*실패/,
      /루킹.*주자/,
      /아웃.*주자/,
      /도루.*아웃/,
    ],
  },
  {
    type: 'runner',
    confidence: 0.78,
    reasons: ['주자 진루/득점 규칙'],
    matchers: [
      /(주자.*진루|진루.*주자|주자.*도착|주자.*득점|득점|정지|리턴)/,
      /(\d루\s*주자.*(진루|정지|득점))/,
      /주루\s*방해/,
    ],
  },
  {
    type: 'ci',
    confidence: 0.96,
    reasons: ['타격방해 규칙'],
    matchers: [/(타격방해|타격\s*방해|CI|C\.I\.|타격\s*간섭|C I)/],
  },
  {
    type: 'sac',
    confidence: 0.94,
    reasons: ['희생 규칙'],
    matchers: [/(희생(번트|플라이)?|희번|SF|SH)/],
  },
  {
    type: 'out',
    confidence: 0.8,
    reasons: ['병살/트리플플레이 규칙'],
    matchers: [/(병살|더블플레이|트리플플레이|2루\s*아웃|3루\s*아웃|병살플레이)/],
  },
  {
    type: 'hbp',
    confidence: 0.97,
    reasons: ['사구 규칙'],
    matchers: [/(사구|몸에맞는공|몸에\s*맞는\s*공|HBP|H.B.P)/],
  },
  {
    type: 'walk',
    confidence: 0.95,
    reasons: ['볼넷/고의4구 규칙'],
    matchers: [/(고의?4구|고의\s*4구|의도\s*4구|의도적\s*4구|볼넷|BB|4구)/],
    ignoreWhenContains: ['고의4구실책', '사구'],
  },
  {
    type: 'fc',
    confidence: 0.93,
    reasons: ['야수선택 규칙'],
    matchers: [/(야수선택|F\.C|FC|f\.c|야수\s*선택|사구안타\s*야수선택)/],
  },
  {
    type: 'error',
    confidence: 0.88,
    reasons: ['실책 규칙'],
    matchers: [/실책/, /에러/, /E\d+/],
  },
  {
    type: 'wp',
    confidence: 0.9,
    reasons: ['폭투 규칙'],
    matchers: [/폭투/, /W\.P/, /WP/],
  },
  {
    type: 'pb',
    confidence: 0.9,
    reasons: ['패스트볼 규칙'],
    matchers: [/포일|패스트볼|패스볼|PB/],
  },
  {
    type: 'substitution',
    confidence: 0.85,
    reasons: ['교체 규칙'],
    matchers: [
      /교체/,
      /투수교체/,
      /대타/,
      /대주자/,
      /대수비/,
      /투수교체|타자교체|주루교체|교체투수/,
    ],
  },
  {
    type: 'out',
    confidence: 0.92,
    reasons: ['공통 아웃 규칙'],
    matchers: [/삼진|아웃|병살|더블플레이|트리플플레이/],
  },
];

const inferPenaltyFromText = (eventType: string, text: string) => {
  if (eventType === 'wp' || /폭투|W\.P|\bWP\b/.test(text)) {
    return { kind: '폭투', official: false } as PlayEvent['penalty'];
  }
  if (eventType === 'pb' || /포일|패스볼|패스트볼|\bPB\b/.test(text)) {
    return { kind: '패스볼', official: false } as PlayEvent['penalty'];
  }
  if (eventType === 'ci' || /타격방해|타격\s*방해|주루방해|CI|C\.I|타격\s*간섭|C\s*I/.test(text)) {
    return { kind: /주루방해/.test(text) ? '주루방해' : '타격방해', official: false } as PlayEvent['penalty'];
  }
  if (eventType === 'error' || /실책|범실|에러/.test(text)) {
    return { kind: '실책', official: false } as PlayEvent['penalty'];
  }
  return undefined;
};

const inferSubstitutionFromText = (stateHalf: 'top' | 'bottom', text: string) => {
  if (!/교체|대수비|대타|대주자|투수교체|타자교체/.test(text)) {
    return undefined;
  }

  const isDefense = /대수비|투수교체|교체투수|방어/.test(text);
  const isPinchHit = /대타|타자교체/.test(text);
  const isPinchRunner = /대주자/.test(text);
  const isPositionChange = /포지션|정규|자리변경/.test(text);
  const action = isPinchRunner
    ? 'pinch_runner'
    : isPinchHit
      ? 'pinch_hit'
      : isPositionChange
        ? 'position_change'
        : isDefense
          ? 'replace_defense'
          : 'substitution';
  const side = isDefense
    ? stateHalf === 'top' ? 'home' : 'away'
    : isPinchHit || isPinchRunner
      ? stateHalf === 'top' ? 'away' : 'home'
      : stateHalf === 'top' ? 'home' : 'away';

  const actorMatch = text.match(/([^·\s]+(?:\([^)]*\))?)\s*(?:→|->|\s교체\s*\(|\s교체\s*).*?([^·\s]+(?:\([^)]*\))?)/);
  const actor = actorMatch ? (actorMatch[2] ?? actorMatch[1] ?? '').trim() : undefined;

  return {
    side,
    action,
    actor,
    atInning: undefined,
    atHalf: stateHalf,
    atPitch: undefined,
  } as PlayEvent['substitution'];
};

const inferOutcomeFromText = (eventType: string, text: string) => {
  if (/주루방해|타격방해|CI|C\.I/.test(text)) return 'penalty';
  if (eventType === 'steal') return 'advance';
  if (eventType === 'steal_fail' || eventType === 'runner_out' || eventType === 'out') return 'out';
  if (eventType === 'walk' || eventType === 'hbp' || eventType === 'fc' || eventType === 'sac') return 'advance';
  if (eventType === 'runner') return /득점|홈인|점수/.test(text) ? 'score' : 'advance';
  if (eventType === 'substitution') return 'substitution';
  if (eventType === 'wp' || eventType === 'pb' || eventType === 'error') return 'penalty';
  return undefined;
};

function pickCandidatesFromNormalized(raw: string): FeedEventCandidate[] {
  const text = normalizeNoSpace(raw);
  const unique = new Set<string>();
  if (!text) {
    return [{ type: 'play', confidence: 0.5, evidence: ['빈 문자열'], reasons: ['재해석 대상 없음'] }];
  }

  const candidates = eventRules
    .map((rule) => {
      const matched = rule.matchers.some((matcher) => matcher.test(text));
      if (!matched) {
        return null;
      }
      if (rule.ignoreWhenContains?.some((skip) => text.includes(skip))) {
        return null;
      }
      const evidence = rule.matchers
        .filter((matcher) => matcher.test(text))
        .map((matcher) => `규칙:${matcher.source}`)
        .filter((item) => !unique.has(item));
      evidence.forEach((item) => unique.add(item));
      return {
        type: rule.type,
        confidence: rule.confidence,
        evidence,
        reasons: rule.reasons,
      } as FeedEventCandidate;
    })
    .filter(Boolean) as FeedEventCandidate[];

  if (!candidates.length) {
    return [{ type: 'play', confidence: DEFAULT_SORT_WEIGHT, evidence: ['기본 규칙'], reasons: ['분류 기준 미확인'] }];
  }

  const ranked = candidates
    .filter((candidate) => candidate.type !== 'out' ||
      !candidates.some((other) => other.type === 'steal_fail' || other.type === 'runner_out'))
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return (eventTypePriority[a.type] ?? 100) - (eventTypePriority[b.type] ?? 100);
    });

  const seen = new Set<string>();
  const uniqueCandidates: FeedEventCandidate[] = [];
  ranked.forEach((candidate) => {
    if (!seen.has(candidate.type)) {
      seen.add(candidate.type);
      uniqueCandidates.push(candidate);
    }
  });

  return uniqueCandidates;
}

function enrichCandidateWithParsedMeta(
  candidate: FeedEventCandidate,
  stateHalf: 'top' | 'bottom',
  text: string,
): FeedEventCandidate {
  const normalized = normalizeFeedText(text);
  return {
    ...candidate,
    outcome: candidate.outcome ?? inferOutcomeFromText(candidate.type, normalized),
    penalty: candidate.penalty ?? inferPenaltyFromText(candidate.type, normalized),
    substitution: candidate.substitution ?? inferSubstitutionFromText(stateHalf, normalized),
    officialAdjust: false,
  };
}

function splitEventFragments(value: string): string[] {
  const normalized = normalizeFeedText(value);
  if (!normalized) return [];
  const direct = normalized.split(FRAGMENT_SEPARATOR).filter(Boolean);
  if (direct.length > 1) {
    return direct;
  }
  return [normalized];
}

function parseCandidates(value: string, stateHalf: 'top' | 'bottom' = 'top'): FeedEventCandidate[] {
  const fragments = splitEventFragments(value);
  if (fragments.length > 1) {
    const flat = fragments
      .flatMap((fragment) => {
        const candidates = pickCandidatesFromNormalized(fragment).map((candidate) =>
          enrichCandidateWithParsedMeta(candidate, stateHalf, fragment),
        );
        return candidates.map((candidate) => ({
          ...candidate,
          evidence: [...candidate.evidence, '문장 분해 후보'],
          reasons: [...candidate.reasons],
        }));
      })
      .filter(Boolean);
    if (flat.length) {
      return flat;
    }
  }

  const all = fragments.flatMap((fragment) => {
    const candidates = pickCandidatesFromNormalized(fragment);
    return candidates.map((candidate) => enrichCandidateWithParsedMeta(candidate, stateHalf, fragment));
  });
  if (!all.length) {
    return [{ type: 'play', confidence: 0.5, evidence: ['빈 문자열'], reasons: ['재해석 대상 없음'] }];
  }

  const dedupe = new Map<string, FeedEventCandidate>();
  all.forEach((candidate) => {
    const existing = dedupe.get(candidate.type);
    if (!existing || existing.confidence < candidate.confidence) {
      dedupe.set(candidate.type, candidate);
    }
  });
  return Array.from(dedupe.values()).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (eventTypePriority[a.type] ?? 100) - (eventTypePriority[b.type] ?? 100);
  });
}

export const inferEventTypeFromResult = (result: string) => {
  const candidates = parseCandidates(result);
  const top = candidates[0];
  return top?.type ?? 'play';
};

export const extractRunnerSummaryFromFeed = (text: string) => {
  const normalized = normalizeFeedText(text);
  const match = normalized.match(/([123]루\s*주자.*)$/);
  return match ? match[1].trim() : normalized;
};

function detectPrimaryFeedEntry(feed: FeedChrono[]) {
  return (
    feed.find((entry) => (entry.order && entry.order > 0) || (entry.batter && entry.batter.trim())) ??
    feed[0]
  );
}

function makeBooleanFlag(text: string): { required: boolean; reasons?: string[] } | undefined {
  const normalized = normalizeFeedText(text);
  const hasAmbiguous = /(그리고|및|또는)/.test(normalized);
  if (hasAmbiguous) {
    return { required: true, reasons: ['동시 추론 구문 존재'] };
  }
  return undefined;
}

function isLowConflictReason(confidence: number, threshold: number, hasAmbiguous: boolean): string[] | undefined {
  const out: string[] = [];
  if (confidence < threshold) out.push('신뢰도 부족');
  if (hasAmbiguous) out.push('문장 내 다중 사건 추론 필요');
  return out.length ? out : undefined;
}

function createPlayEventForTextParser(params: {
  stateInning: number;
  stateHalf: 'top' | 'bottom';
  fallback: { inning: number; half: 'top' | 'bottom' }; // for safety
  eventType: string;
  runners: string[];
  pitch: number;
  batter: string;
  order: number;
  notes: string;
  source: PlayEvent['source'];
  confidence: number;
  ambiguity: string[];
  evidence: string[];
  manualResolve?: PlayEvent['manualResolve'];
  corrections?: string[];
  eventId: string;
  createdAt?: number;
  isLowConfidence: boolean;
  isManualReviewRequired: boolean;
  outcome?: string;
  penalty?: PlayEvent['penalty'];
  substitution?: PlayEvent['substitution'];
  officialAdjust?: boolean;
}): PlayEvent {
  return {
    inning: Number.isFinite(params.stateInning) ? params.stateInning : params.fallback.inning,
    half: params.stateHalf,
    order: params.order,
    batter: params.batter,
    pitch: params.pitch,
    type: params.eventType,
    runners: params.runners,
    battedBall: null,
    error: null,
    notes: params.notes,
    createdAt: params.createdAt,
    eventId: params.eventId,
    source: params.source,
    confidence: params.confidence,
    ambiguity: params.ambiguity,
    evidence: params.evidence,
    outcome: params.isManualReviewRequired ? 'manual_review' : params.outcome,
    penalty: params.penalty,
    substitution: params.substitution,
    officialAdjust: params.officialAdjust,
    manualResolve: params.manualResolve,
    corrections: params.corrections,
  };
}

const reconcileEventCandidates = (candidates: FeedEventCandidate[]) => {
  const hasAmbiguousText = candidates.length > 1;
  if (!hasAmbiguousText) return candidates;
  return [...candidates].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (eventTypePriority[a.type] ?? 999) - (eventTypePriority[b.type] ?? 999);
  });
};

function getGroupId(eventId?: string) {
  if (!eventId) {
    return `rebuild-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  }
  const parts = eventId.split('#');
  return parts.length > 1 ? parts.slice(0, -1).join('#') : eventId;
}

const sortChrono = (a: FeedChrono, b: FeedChrono) => {
  if (a.inning !== b.inning) return a.inning - b.inning;
  if (a.half !== b.half) return a.half === 'top' ? -1 : 1;
  if (a.createdAt !== undefined && b.createdAt !== undefined) return a.createdAt - b.createdAt;
  // Stable source order when timestamps are absent; order/pitch can wrap/reset.
  return 0;
};

export const rebuildEventsFromFeedWithAlternatives = (
  feed: FeedChrono[] = [],
  options: FeedParserOptions = {},
): RebuildResult => {
  const fallback = options.fallback ?? { inning: 1, half: 'top' };
  const source = makeDefaultSource(options.source);
  const threshold = options.manualResolveThreshold ?? DEFAULT_MANUAL_RESOLVE_THRESHOLD;

  const identified = feed.map((entry, index) => ({ ...entry,
    eventId: entry.eventId ?? `legacy-${entry.inning}-${entry.half}-${entry.createdAt ?? 'unknown'}-${index}`,
  }));
  const sourceOrder = [...identified].sort((a, b) =>
    Number.isFinite(a.createdAt) && Number.isFinite(b.createdAt) ? a.createdAt! - b.createdAt! : 0);
  const chronologyIssuesByEvent = detectChronologyIssues(sourceOrder);
  const sortedIncoming = [...identified].sort(sortChrono);

  const buckets = new Map<string, FeedChrono[]>();
  sortedIncoming.forEach((entry, idx) => {
    const eventId =
      entry.eventId ??
      `legacy-${entry.inning}-${entry.half}-${entry.order}-${entry.pitch}-${entry.createdAt ?? entry.result.length}-${idx}`;
    const normalizedEntry = {
      ...entry,
      eventId,
      result: normalizeFeedText(entry.result ?? ''),
    };

    const list = buckets.get(eventId) ?? [];
    list.push(normalizedEntry);
    buckets.set(eventId, list);
  });

  const rebuilt: ParsedFeedEvent[] = [];
  const groups: FeedRebuildGroup[] = [];
  let hasReviewNeed = false;

  buckets.forEach((entries, eventId) => {
    const sorted = [...entries].sort(sortChrono);
    if (!sorted.length) return;

    const primary = detectPrimaryFeedEntry(sorted);
    if (!primary) return;

    const eventText = normalizeFeedText(primary.result ?? '');
    const fragments = splitEventFragments(eventText);
    const fragmentTexts = fragments.length > 1 ? fragments : [eventText];

    const sourceIssues = toUniqueList((chronologyIssuesByEvent.get(eventId) ?? []).slice(0, chronoIssueLimit));
    if (/기록 반려/.test(eventText)) sourceIssues.push('입력 검증에서 반려된 로그입니다. 재적용하지 마세요.');

    const runners = sorted
      .filter((entry) => (!entry.order || entry.order === 0) && (!entry.batter || !entry.batter.trim()))
      .map((entry) => extractRunnerSummaryFromFeed(entry.result ?? ''))
      .filter(Boolean);

    const processFragment = (segmentText: string, segmentIndex: number) => {
      const segmentCandidates = reconcileEventCandidates(parseCandidates(segmentText, primary.half));
      if (!segmentCandidates.length) return;
      const groupBaseId = fragmentTexts.length > 1 ? `${eventId}#f${segmentIndex + 1}` : eventId;
      const alternatives: FeedRebuildOption[] = segmentCandidates.map((candidate, index) => {
        const isLowConfidence = candidate.confidence < threshold;
        const isAmbiguous = segmentCandidates.length > 1;
        const reasons = isLowConflictReason(candidate.confidence, threshold, isAmbiguous);
        const eventIssues = toUniqueList([...sourceIssues, ...(reasons ?? []),
          ...(fragmentTexts.length > 1 ? ['복합 사건의 순서와 주자 이동을 함께 확인해야 합니다.'] : []),
        ]);
        const manualResolve =
          makeBooleanFlag(segmentText) ?? {
            required: isLowConfidence || isAmbiguous || eventIssues.length > 0,
            reasons: eventIssues,
          };
        if (manualResolve.required) {
          manualResolve.reasons = toUniqueList([...(manualResolve.reasons ?? []), ...eventIssues]);
        }
        const isManualReviewRequired = Boolean(manualResolve?.required);
        const eventIdWithIndex = `${groupBaseId}#${index + 1}`;
        const event = createPlayEventForTextParser({
          stateInning: primary.inning,
          stateHalf: primary.half,
          fallback,
          eventType: candidate.type,
          runners: segmentIndex === 0 ? runners : [],
          pitch: primary.pitch ?? 0,
          batter: primary.batter ?? '',
          order: primary.order ?? 0,
          notes: segmentText,
          source,
          confidence: candidate.confidence,
          ambiguity: segmentCandidates.map((item) => item.type).filter((itemType) => itemType !== candidate.type),
          evidence: [
            ...candidate.evidence,
            ...(fragmentTexts.length > 1 ? ['문장 분해 후보'] : []),
            ...(sourceIssues.length ? ['타임라인 정합성 경고'] : []),
          ],
          manualResolve,
          outcome: isManualReviewRequired ? 'manual_review' : candidate.outcome,
          penalty: candidate.penalty,
          substitution: candidate.substitution,
          officialAdjust: candidate.officialAdjust,
          corrections: undefined,
          eventId: eventIdWithIndex,
          createdAt: primary.createdAt,
          isLowConfidence,
          isManualReviewRequired,
        });
        event.rebuildOrigin = { eventId, fragmentIndex: segmentIndex, fragmentCount: fragmentTexts.length };

        return {
          eventId: eventIdWithIndex,
          event,
          confidence: candidate.confidence,
          evidence: candidate.evidence,
          reasons: candidate.reasons,
        };
      });

      const selected = alternatives[0];
      if (!selected) return;

      const groupId = getGroupId(selected.eventId);
      const requiresManualResolve = selected.event.manualResolve?.required === true;
      const isLowConfidence = (selected.event.confidence ?? 0) < threshold;
      const isAmbiguous = alternatives.length > 1;
      hasReviewNeed = hasReviewNeed || isLowConfidence || isAmbiguous || requiresManualResolve || sourceIssues.length > 0;

      rebuilt.push(...alternatives.map((item) => item.event));
      groups.push({
        groupId,
        sourceText: segmentText,
        source,
        options: alternatives,
        selectedEventId: selected.eventId,
        isAmbiguous,
        isLowConfidence,
        requiresManualResolve,
        rebuildIssues: sourceIssues.length ? sourceIssues : undefined,
        createdAt: primary.createdAt,
      });
    };

    fragmentTexts.forEach((fragmentText, index) => processFragment(fragmentText, index));
  });

  return {
    events: rebuilt,
    groups,
    needsReview: hasReviewNeed,
  };
};

export const rebuildEventsFromFeed = (
  feed: FeedChrono[] = [],
  options: FeedParserOptions = {},
): ParsedFeedEvent[] => {
  return selectRebuildEvents(rebuildEventsFromFeedWithAlternatives(feed, options).groups);
};

export const selectRebuildEvents = (
  groups: FeedRebuildGroup[],
  selections: Record<string, string> = {},
): ParsedFeedEvent[] => {
  return groups.flatMap((group) => {
    const explicit = selections[group.groupId];
    if (explicit === REJECT_REBUILD_SELECTION) return [];
    const targetId = explicit ?? group.selectedEventId;
    const selected = group.options.find((option) => option.eventId === targetId);
    if (!selected || (!explicit && selected.event.manualResolve?.required)) return [];
    if (selected.event.type === 'pitch') return [];
    if (!explicit) return [selected.event];
    return [{ ...selected.event,
      source: { kind: 'manual' as const, provider: 'text-feed-review' },
      manualResolve: { required: false, reasons: selected.event.manualResolve?.reasons },
      outcome: inferOutcomeFromText(selected.event.type, selected.event.notes ?? ''),
      corrections: [...(selected.event.corrections ?? []), `재해석 확정: ${group.sourceText} -> ${selected.event.type}`],
    }];
  });
};

const eventPriorityWeight = (event: PlayEvent) => {
  const source = event.source?.kind;
  const sourceWeight = source === 'manual' ? 30 : source === 'text_feed_rebuild' ? 10 : 20;
  const confidence = Number.isFinite(event.confidence) ? Math.max(0, Math.min(1, event.confidence!)) : 0;
  return sourceWeight + confidence + (source === 'manual' && event.officialAdjust ? 5 : 0);
};

export const compareChronoPlayEvents = (
  a: Pick<PlayEvent, 'inning' | 'half' | 'createdAt' | 'pitch' | 'order' | 'stateTransition'>,
  b: Pick<PlayEvent, 'inning' | 'half' | 'createdAt' | 'pitch' | 'order' | 'stateTransition'>,
) => {
  const halfRank = (half: 'top' | 'bottom') => (half === 'top' ? 0 : 1);
  if (a.inning !== b.inning) return a.inning - b.inning;
  if (a.half !== b.half) return halfRank(a.half) - halfRank(b.half);
  if (a.createdAt !== undefined && b.createdAt !== undefined && a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  if (a.stateTransition && b.stateTransition) {
    const forward = JSON.stringify(a.stateTransition.after) === JSON.stringify(b.stateTransition.before);
    const backward = JSON.stringify(b.stateTransition.after) === JSON.stringify(a.stateTransition.before);
    if (forward !== backward) return forward ? -1 : 1;
  }
  return 0;
};

const eventMergeKey = (event: PlayEvent) => {
  if (event.rebuildOrigin) return JSON.stringify([event.inning, event.half, event.rebuildOrigin.eventId, event.rebuildOrigin.fragmentIndex]);
  if (event.eventId) return JSON.stringify([event.inning, event.half, event.eventId, 0]);
  const key = buildEventSummaryKey(event);
  return `timeline:${key}`;
};

export const mergeRebuiltEventsForReplay = (args: {
  existingEvents: PlayEvent[];
  rebuiltEvents: ParsedFeedEvent[];
}) => {
  const { existingEvents, rebuiltEvents } = args;
  const merged = new Map<string, PlayEvent>();

  existingEvents.forEach((event) => {
    const key = eventMergeKey(event);
    merged.set(key, event);
  });

  rebuiltEvents.forEach((candidate) => {
    if (candidate.manualResolve?.required || candidate.outcome === 'manual_review') return;
    const origin = candidate.rebuildOrigin;
    if (origin && origin.fragmentCount > 1) {
      const siblings = rebuiltEvents.filter((event) => event.rebuildOrigin?.eventId === origin.eventId &&
        event.inning === candidate.inning && event.half === candidate.half && !event.manualResolve?.required);
      const indices = new Set(siblings.map((event) => event.rebuildOrigin!.fragmentIndex));
      if (indices.size !== origin.fragmentCount) return;
      const originalKey = JSON.stringify([candidate.inning, candidate.half, origin.eventId, 0]);
      const original = merged.get(originalKey);
      if (original?.compositePlay) return;
      if (original && !original.rebuildOrigin && siblings.some((event) => eventPriorityWeight(event) <= eventPriorityWeight(original))) return;
    }
    const legacyMatch = existingEvents.find((event) => !event.eventId &&
      event.inning === candidate.inning && event.half === candidate.half &&
      event.order === candidate.order && event.pitch === candidate.pitch && event.batter === candidate.batter &&
      normalizeEventKeyText(event.notes ?? '') === normalizeEventKeyText(candidate.notes ?? '') &&
      (event.createdAt === undefined || candidate.createdAt === undefined || event.createdAt === candidate.createdAt));
    const key = legacyMatch ? eventMergeKey(legacyMatch) : eventMergeKey(candidate);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      return;
    }

    const existingScore = eventPriorityWeight(existing);
    // Text classification cannot replace a reviewed multi-action transaction.
    if (existing.compositePlay && !candidate.compositePlay) return;
    const candidateScore = eventPriorityWeight(candidate);
    if (candidateScore <= existingScore) return;

    merged.set(key, {
      ...existing,
      ...candidate,
      eventId: candidate.eventId ?? existing.eventId,
      notes: candidate.notes ?? existing.notes,
      runners: candidate.runners,
      // Classification changes cannot inherit an earlier transition as proof.
      stateTransition: candidate.stateTransition,
      runnerPlay: candidate.runnerPlay,
      compositePlay: candidate.compositePlay,
      createdAt: candidate.createdAt ?? existing.createdAt,
    });
  });

  return Array.from(merged.values()).sort(compareChronoPlayEvents);
};

export const REJECT_REBUILD_SELECTION = '__rejected__';

export function rebuildReviewRows(groups: FeedRebuildGroup[], selections: Record<string, string> = {}) {
  return groups.map((group) => {
    const selection = selections[group.groupId];
    const option = group.options.find((item) => item.eventId === (selection ?? group.selectedEventId));
    const status = selection === REJECT_REBUILD_SELECTION ? '제외' : !option ? '보류' :
      selection ? '수동 확정' : group.requiresManualResolve ? '보류' : '자동 후보';
    return [group.groupId, group.sourceText, option?.event.type ?? '-', status,
      option?.confidence.toFixed(2) ?? '-',
      [...(group.rebuildIssues ?? []), ...(option?.event.manualResolve?.reasons ?? [])].join(' | ')];
  });
}

export function scoringReplayAuditRows(events: PlayEvent[]) {
  const labels = { applied: '상태 적용', pending: '상태 검증 보류', rejected: '상태 반려', duplicate: '중복 제외' };
  return replayScoringEvents(events).entries.map((entry) => [entry.eventId, labels[entry.status], entry.reasons.join(' | ')]);
}
