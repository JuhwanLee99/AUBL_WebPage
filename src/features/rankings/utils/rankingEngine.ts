// `src/features/rankings/utils/engine.ts`** (Elo & BT 알고리즘 구현)
import type { MatchResult, TeamRanking, Team } from '../../../shared/types';

// Elo Rating 상수
const K_FACTOR = 32; 
const BASE_ELO = 1500;

export const calculateRankings = (teams: Team[], matches: MatchResult[]): TeamRanking[] => {
  // 1. 초기화
  const rankingMap = new Map<string, TeamRanking>();
  
  teams.forEach(team => {
    rankingMap.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      wins: 0, losses: 0, draws: 0,
      eloRating: BASE_ELO,
      btIndex: 1000 // BT 초기값
    });
  });

  // 2. 경기 결과 반영 (Elo Calculation)
  matches.forEach(match => {
    if (!match.isFinished) return;

    const home = rankingMap.get(match.homeTeamId)!;
    const away = rankingMap.get(match.awayTeamId)!;

    // 승패 기록
    if (match.homeScore > match.awayScore) { home.wins++; away.losses++; }
    else if (match.homeScore < match.awayScore) { home.losses++; away.wins++; }
    else { home.draws++; away.draws++; }

    // Elo 계산 (단순화된 버전)
    const ratingDiff = away.eloRating - home.eloRating;
    const expectedHome = 1 / (1 + Math.pow(10, ratingDiff / 400));
    
    let actualHome = 0.5;
    if (match.homeScore > match.awayScore) actualHome = 1.0;
    else if (match.homeScore < match.awayScore) actualHome = 0.0;

    // 승리 마진 가중치: ln(|점수차| + 1)
    const movMultiplier = Math.log(Math.abs(match.homeScore - match.awayScore) + 1);
    const delta = Math.round(K_FACTOR * movMultiplier * (actualHome - expectedHome));

    home.eloRating += delta;
    away.eloRating -= delta;
  });

  return Array.from(rankingMap.values()).sort((a, b) => b.eloRating - a.eloRating);
};
