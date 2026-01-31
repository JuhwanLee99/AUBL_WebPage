/**
 * Firestore 데이터를 백엔드 API 형식으로 변환하는 함수들
 */

import type { MatchSchedule, PostGameBatterLine, PostGamePitcherLine } from '../state/demoStore';
import type { GameDetailRequest, BatterLog, PitcherLog } from './types';

/**
 * 팀 이름을 백엔드 팀 ID로 매핑
 * TODO: 실제 팀 데이터베이스와 연동하여 동적으로 가져오기
 */
const TEAM_NAME_TO_ID: Record<string, number> = {
  '가디언스': 1,
  '라이트닝': 2,
  '와일드카드': 3,
  '임페리얼': 4,
  '크라운': 5,
  '타이탄즈': 6,
  '피닉스': 7,
  // TODO: 실제 팀 이름과 ID 매핑 추가
};

/**
 * 경기 타입 매핑
 */
function mapGameType(division?: string): string {
  if (!division) return '정규시즌';

  switch (division) {
    case '으뜸':
      return '으뜸리그';
    case '버금':
      return '버금리그';
    default:
      return '정규시즌';
  }
}

/**
 * IP (이닝 투구) 계산: 아웃카운트를 소수점 형식으로 변환
 * 예: 17아웃 = 5.2 (5와 2/3이닝)
 */
function calculateInningsPitched(outs: number): number {
  const fullInnings = Math.floor(outs / 3);
  const remainingOuts = outs % 3;
  return fullInnings + remainingOuts / 10; // 5.2 형식
}

/**
 * PostGameBatterLine을 BatterLog로 변환
 */
function transformBatter(
  batter: PostGameBatterLine,
  teamId: number
): BatterLog {
  return {
    playerName: batter.name,
    playerNumber: batter.slot || '0', // slot이 없으면 0번으로
    teamId,
    position: batter.pos || 'DH',
    battingOrder: batter.order ?? undefined,
    plateAppearance: batter.pa || 0,
    atBats: batter.ab || 0,
    hits: batter.h || 0,
    singles: batter.singles || 0,
    doubles: batter.doubles || 0,
    triples: batter.triples || 0,
    homeRuns: batter.hr || 0,
    rbis: batter.rbi || 0,
    runs: batter.r || 0,
    walks: batter.bb || 0,
    hitByPitch: batter.hbp || 0,
    strikeouts: batter.so || 0,
    stolenBases: batter.sb || 0,
    sacrifices: batter.sac || 0,
    fieldersChoice: batter.fc || 0,
  };
}

/**
 * PostGamePitcherLine을 PitcherLog로 변환
 */
function transformPitcher(
  pitcher: PostGamePitcherLine,
  teamId: number
): PitcherLog {
  // 아웃 카운트로 IP 계산 (bf - h - bb - hbp 근사치, 정확하지 않을 수 있음)
  // 더 정확한 계산이 필요하면 별도 필드를 추가해야 함
  const estimatedOuts = (pitcher.bf || 0) - (pitcher.h || 0) - (pitcher.bb || 0) - (pitcher.hbp || 0);
  const inningsPitched = pitcher.ip !== undefined
    ? pitcher.ip
    : calculateInningsPitched(Math.max(0, estimatedOuts));

  return {
    playerName: pitcher.name,
    playerNumber: '0', // PostGamePitcherLine에 번호가 없으므로 기본값
    teamId,
    result: pitcher.result,
    inningsPitched,
    battersFaced: pitcher.bf || 0,
    atBats: pitcher.ab || 0,
    hits: pitcher.h || 0,
    homeRuns: pitcher.hr || 0,
    walks: pitcher.bb || 0,
    hitByPitch: pitcher.hbp || 0,
    strikeouts: pitcher.so || 0,
    runs: pitcher.r || 0,
    earnedRuns: pitcher.er || 0,
    pitches: pitcher.pitches || 0,
    wildPitches: pitcher.wp || 0,
    balks: pitcher.bk || 0,
    sacrificeHits: pitcher.sh || 0,
    sacrificeFlies: pitcher.sf || 0,
  };
}

/**
 * MatchSchedule을 GameDetailRequest로 변환
 */
export function transformMatchToGameDetail(
  match: MatchSchedule,
  seasonId: number
): GameDetailRequest | null {
  // 필수 데이터 검증
  if (!match.postGame) {
    console.error('PostGame data is missing');
    return null;
  }

  if (!match.homeTeamName || !match.awayTeamName) {
    console.error('Team names are missing');
    return null;
  }

  const homeTeamId = TEAM_NAME_TO_ID[match.homeTeamName];
  const awayTeamId = TEAM_NAME_TO_ID[match.awayTeamName];

  if (!homeTeamId || !awayTeamId) {
    console.error(`Team ID mapping failed: home=${match.homeTeamName}, away=${match.awayTeamName}`);
    return null;
  }

  const homeScore = match.homeScore ?? match.postGame.totals.home.runs ?? 0;
  const awayScore = match.awayScore ?? match.postGame.totals.away.runs ?? 0;

  // 경기 날짜 파싱 (ISO string to YYYY-MM-DD)
  const gameDate = match.startTime
    ? new Date(match.startTime).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  // 타자 변환
  const homeBatters = (match.postGame.batters?.home || []).map(b =>
    transformBatter(b, homeTeamId)
  );
  const awayBatters = (match.postGame.batters?.away || []).map(b =>
    transformBatter(b, awayTeamId)
  );

  // 투수 변환
  const homePitchers = (match.postGame.pitchers?.home || []).map(p =>
    transformPitcher(p, homeTeamId)
  );
  const awayPitchers = (match.postGame.pitchers?.away || []).map(p =>
    transformPitcher(p, awayTeamId)
  );

  return {
    seasonId,
    gameDate,
    gameNumber: 1, // TODO: 같은 날 여러 경기가 있으면 순서 지정
    homeTeamId,
    awayTeamId,
    homeTeamName: match.homeTeamName,
    awayTeamName: match.awayTeamName,
    homeScore,
    awayScore,
    gameType: mapGameType(match.division),
    venue: match.venue || '미정',
    lineScore: match.postGame.lineScore,
    batters: {
      home: homeBatters,
      away: awayBatters,
    },
    pitchers: {
      home: homePitchers,
      away: awayPitchers,
    },
    totals: match.postGame.totals,
    notes: match.postGame.note || match.notes,
  };
}

/**
 * 팀 이름 매핑 테이블 업데이트 (동적으로 팀 정보를 받아올 때 사용)
 */
export function updateTeamMapping(teamName: string, teamId: number): void {
  TEAM_NAME_TO_ID[teamName] = teamId;
}

/**
 * 현재 팀 매핑 테이블 조회
 */
export function getTeamMapping(): Record<string, number> {
  return { ...TEAM_NAME_TO_ID };
}
