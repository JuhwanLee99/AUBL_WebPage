import { EloEngine } from '../../rankings/utils/rankingEngine';

interface PredictionInput {
  homeElo: number;
  awayElo: number;
  homeBt: number;
  awayBt: number;
  isHomeField: boolean; // 홈팀이 익숙한 구장인가?
}

export const predictMatch = (data: PredictionInput) => {
  const eloEngine = new EloEngine();
  
  // 1. Elo 기반 승률 (기본 전력) - 가중치 50%
  const eloProb = eloEngine.getExpectedScore(data.homeElo, data.awayElo);

  // 2. Bradley-Terry 기반 승률 (상대성) - 가중치 30%
  // BT 점수는 비율 척도이므로 단순 비율로 계산
  const btProb = data.homeBt / (data.homeBt + data.awayBt);

  // 3. 환경 변수 (홈 어드밴티지 등) - 가중치 20%
  const envFactor = data.isHomeField? 0.05 : 0; // 홈이면 5% 가산

  // 가중 평균 (Hybrid Model)
  const finalProb = (eloProb * 0.5) + (btProb * 0.3) + (0.2 * (0.5 + envFactor));

  return {
    homeWinProb: (finalProb * 100).toFixed(1), // 퍼센트 변환
    awayWinProb: ((1 - finalProb) * 100).toFixed(1)
  };
};