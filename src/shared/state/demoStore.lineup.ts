import { TEAMS } from '../lib/mockData';
import type { LeagueDivision } from '../types';
import type { MatchSchedule, PlayerSlot } from './demoStore';

export const demoLineups: { home: PlayerSlot[]; away: PlayerSlot[] } = {
  home: [
    { name: '김지찬', pos: '2B', number: '1', throws: 'R', bats: 'L' },
    { name: '구자욱', pos: 'LF', number: '5', throws: 'R', bats: 'L' },
    { name: '피렐라', pos: 'DH', number: '39', throws: 'R', bats: 'L' },
    { name: '오재일', pos: '1B', number: '16', throws: 'R', bats: 'L' },
    { name: '강민호', pos: 'C', number: '47', throws: 'R', bats: 'R' },
    { name: '김헌곤', pos: 'RF', number: '7', throws: 'R', bats: 'L' },
    { name: '류지혁', pos: '3B', number: '13', throws: 'R', bats: 'L' },
    { name: '김영웅', pos: 'SS', number: '24', throws: 'R', bats: 'R' },
    { name: '김성윤', pos: 'CF', number: '65', throws: 'R', bats: 'L' },
    { name: '원태인', pos: 'P', number: '18', throws: 'R', bats: 'R' },
  ],
  away: [
    { name: '정수빈', pos: 'CF', number: '31', throws: 'R', bats: 'L' },
    { name: '허경민', pos: '3B', number: '13', throws: 'R', bats: 'R' },
    { name: '양석환', pos: '1B', number: '53', throws: 'R', bats: 'R' },
    { name: '양의지', pos: 'C', number: '25', throws: 'R', bats: 'R' },
    { name: '김재환', pos: 'DH', number: '32', throws: 'R', bats: 'L' },
    { name: '강승호', pos: '2B', number: '52', throws: 'R', bats: 'R' },
    { name: '조수행', pos: 'LF', number: '25', throws: 'R', bats: 'L' },
    { name: '박준영', pos: 'SS', number: '4', throws: 'R', bats: 'R' },
    { name: '김인태', pos: 'RF', number: '17', throws: 'R', bats: 'L' },
    { name: '곽빈', pos: 'P', number: '47', throws: 'R', bats: 'R' },
  ],
};

export const cloneLineups = (lineups: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: lineups.home.map((player) => ({ ...player })),
  away: lineups.away.map((player) => ({ ...player })),
});

export const cloneBenches = (benches: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: benches.home.map((player) => ({ ...player })),
  away: benches.away.map((player) => ({ ...player })),
});

const emptyPlayerSlot: PlayerSlot = { name: '', pos: '', number: '', throws: 'R', bats: 'R', order: null };

const slotSignature = (slot: PlayerSlot) =>
  `${slot.name}|${slot.pos}|${slot.number}|${slot.throws}|${slot.bats}`;

const lineupMatches = (left: PlayerSlot[], right: PlayerSlot[]) =>
  left.length === right.length && left.every((slot, idx) => slotSignature(slot) === slotSignature(right[idx]));

export const isDemoLineups = (lineups?: { home: PlayerSlot[]; away: PlayerSlot[] } | null) => {
  if (!lineups) return false;
  return lineupMatches(lineups.home, demoLineups.home) && lineupMatches(lineups.away, demoLineups.away);
};

const normalizePlayerSlotForGame = (player: PlayerSlot): PlayerSlot => ({
  name: typeof player.name === 'string' ? player.name : '',
  pos: typeof player.pos === 'string' ? player.pos : '',
  number: typeof player.number === 'string' ? player.number : '',
  throws: player.throws === 'L' ? 'L' : 'R',
  bats: player.bats === 'L' ? 'L' : 'R',
  order: typeof player.order === 'number' ? player.order : null,
  isOhtaniRule: !!player.isOhtaniRule,
  substitutionType: player.substitutionType,
  isElite: !!player.isElite,
});

const ensureLineupFilled = (lineup: PlayerSlot[]) => {
  const normalized = lineup.map(normalizePlayerSlotForGame);
  const hasPitcher = normalized.some((slot) => slot.pos.toUpperCase() === 'P');

  let battingCount = normalized.reduce(
    (count, slot) => (slot.pos.toUpperCase() === 'P' ? count : count + 1),
    0,
  );

  while (battingCount < 9) {
    normalized.push({ ...emptyPlayerSlot });
    battingCount += 1;
  }

  if (!hasPitcher) {
    normalized.push({ ...emptyPlayerSlot, pos: 'P' });
  }

  return normalized;
};

export const ensureCompleteLineups = (lineups: { home: PlayerSlot[]; away: PlayerSlot[] }) => ({
  home: ensureLineupFilled(lineups.home),
  away: ensureLineupFilled(lineups.away),
});

export const hasActualPlayers = (lineup: PlayerSlot[]) =>
  lineup.some((slot) => slot.name && slot.name.trim() !== '');

export const canPitcherBat = (player: PlayerSlot, lineup: PlayerSlot[]): boolean => {
  if (player.pos.toUpperCase() !== 'P') return false;
  if (player.isOhtaniRule) return true;
  const normalizePosToken = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hasDH = lineup.some((slot) => {
    const norm = normalizePosToken(slot.pos ?? '');
    return norm === 'DH' || (slot.pos ?? '').includes('지명');
  });
  return !hasDH;
};

const teamDivisionById = (teamId?: string): LeagueDivision | undefined =>
  TEAMS.find((team) => team.id === teamId)?.division;

export const deriveMatchDivision = (
  division: unknown,
  homeTeamId?: string,
  awayTeamId?: string,
): LeagueDivision | undefined => {
  const normalized = typeof division === 'string' ? division.trim().toUpperCase() : undefined;
  if (normalized === 'EUTTEUM' || normalized === 'BEOGEUM') return normalized;
  const homeDiv = teamDivisionById(homeTeamId);
  const awayDiv = teamDivisionById(awayTeamId);
  if (homeDiv && awayDiv && homeDiv === awayDiv) return homeDiv;
  if (homeDiv && !awayDiv) return homeDiv;
  if (awayDiv && !homeDiv) return awayDiv;
  return undefined;
};

export function isPracticeMatch(match?: MatchSchedule | null) {
  return match?.recordMode === 'practice';
}

export function getPracticePitcherIndex(lineup: PlayerSlot[]) {
  if (!lineup.length) return -1;
  const lastIndex = lineup.length - 1;
  return lineup[lastIndex].pos.toUpperCase() === 'P' ? lastIndex : -1;
}

export function getBattingEntriesForLineup(
  lineup: PlayerSlot[],
  allowExtendedBattingOrder: boolean,
) {
  if (allowExtendedBattingOrder) {
    const pitcherIndex = getPracticePitcherIndex(lineup);
    return lineup.filter((_, idx) => idx !== pitcherIndex);
  }
  return lineup.filter((slot, idx) => {
    if (idx >= 9) return false;
    const isPitcher = slot.pos.toUpperCase() === 'P';
    const pitcherAllowed = isPitcher ? canPitcherBat(slot, lineup) : true;
    return pitcherAllowed;
  });
}

export function getBattingOrder(
  lineup: PlayerSlot[],
  lineupIndex: number,
  allowExtendedBattingOrder = false,
) {
  const slot = lineup[lineupIndex];
  if (!slot) return null;
  const practicePitcherIndex = allowExtendedBattingOrder ? getPracticePitcherIndex(lineup) : -1;
  if (allowExtendedBattingOrder && lineupIndex === practicePitcherIndex) return null;
  const isBatter =
    (allowExtendedBattingOrder ? true : lineupIndex < 9) ||
    slot.pos.toUpperCase() !== 'P' ||
    canPitcherBat(slot, lineup);

  if (!isBatter) {
    return null;
  }

  let order = 0;
  for (let i = 0; i < lineup.length; i += 1) {
    const player = lineup[i];
    if (allowExtendedBattingOrder && i === practicePitcherIndex) {
      if (i === lineupIndex) return null;
      continue;
    }
    const isCountable =
      (allowExtendedBattingOrder ? true : i < 9) ||
      player.pos.toUpperCase() !== 'P' ||
      canPitcherBat(player, lineup);

    if (isCountable) {
      order += 1;
    }
    if (i === lineupIndex) return order;
  }
  return order || null;
}
