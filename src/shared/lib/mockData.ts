// `src/shared/lib/mockData.ts`** (연구 내용을 바탕으로 한 더미 데이터)
import { Team, MatchResult } from '../types';

export const TEAMS: Team[] = [
  {
    id: 'team-1',
    name: 'Alpha College',
    university: 'Alpha College',
    division: 'EUTTEUM',
    logoColor: '#4f46e5',
    founded: 1995,
  },
  {
    id: 'team-2',
    name: 'Beta University',
    university: 'Beta University',
    division: 'EUTTEUM',
    logoColor: '#10b981',
    founded: 2001,
  },
  {
    id: 'team-3',
    name: 'Gamma Tech',
    university: 'Gamma Tech',
    division: 'BEOGEUM',
    logoColor: '#f59e0b',
    founded: 1987,
  },
];

// 시뮬레이션을 위한 가상 경기 결과
export const MATCHES: MatchResult[] = [
  {
    id: 'match-1',
    homeTeamId: 'team-1',
    awayTeamId: 'team-2',
    homeScore: 3,
    awayScore: 2,
    isFinished: true,
  },
  {
    id: 'match-2',
    homeTeamId: 'team-2',
    awayTeamId: 'team-3',
    homeScore: 1,
    awayScore: 1,
    isFinished: true,
  },
  {
    id: 'match-3',
    homeTeamId: 'team-3',
    awayTeamId: 'team-1',
    homeScore: 0,
    awayScore: 2,
    isFinished: true,
  },
];