/**
 * 경기 관련 API 함수
 */

import { api } from './client';
import type {
  CreateGameRequest,
  CreateGameResponse,
  GameDetailRequest,
  ImportFirestoreMatchesRequest,
  ImportFirestoreMatchesResponse,
  PlayerStatsResponse,
  PlayerGameLogsResponse,
} from './types';

/**
 * 경기 생성 (기본 정보만)
 */
export async function createGame(
  request: CreateGameRequest
): Promise<CreateGameResponse> {
  return api.post<CreateGameResponse>('/api/games', request);
}

/**
 * 경기 상세 정보 전송 (타자/투수 기록 포함)
 */
export async function sendGameDetail(
  request: GameDetailRequest
): Promise<CreateGameResponse> {
  // TODO: 백엔드에서 상세 정보를 받는 엔드포인트가 있다면 해당 엔드포인트 사용
  // 현재는 기본 게임 생성 API 사용
  return api.post<CreateGameResponse>('/api/games/detail', request);
}

/**
 * Firestore에서 완료된 경기 일괄 임포트
 */
export async function importFirestoreMatches(
  request?: ImportFirestoreMatchesRequest
): Promise<ImportFirestoreMatchesResponse> {
  return api.post<ImportFirestoreMatchesResponse>(
    '/api/import/firestore/matches',
    request
  );
}

/**
 * Firestore에서 완료된 특정 경기 단건 임포트
 */
export async function importFirestoreMatch(
  matchId: string
): Promise<ImportFirestoreMatchesResponse> {
  return api.post<ImportFirestoreMatchesResponse>(
    `/api/import/firestore/matches/${encodeURIComponent(matchId)}`
  );
}

/**
 * 선수 시즌 통계 조회
 */
export async function getPlayerStats(
  playerId: number,
  seasonId?: number
): Promise<PlayerStatsResponse> {
  const query = seasonId ? `?seasonId=${seasonId}` : '';
  return api.get<PlayerStatsResponse>(`/api/players/${playerId}/stats${query}`);
}

/**
 * 선수 경기별 기록 조회
 */
export async function getPlayerGameLogs(
  playerId: number,
  gameId?: number
): Promise<PlayerGameLogsResponse> {
  const query = gameId ? `?gameId=${gameId}` : '';
  return api.get<PlayerGameLogsResponse>(`/api/players/${playerId}/game-logs${query}`);
}
