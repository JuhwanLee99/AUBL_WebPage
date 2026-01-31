/**
 * 팀 관련 API 함수
 */

import { api } from './client';

export interface Team {
  id: number;
  name: string;
  code?: string;
  season?: number;
  // 추가 필드가 있다면 여기에
}

export interface TeamsResponse {
  teams: Team[];
}

/**
 * 팀 목록 조회
 */
export async function getTeams(): Promise<Team[]> {
  try {
    // 백엔드 API가 배열을 직접 반환하는지, 객체로 감싸서 반환하는지에 따라 조정
    const response = await api.get<Team[] | TeamsResponse>('/api/teams');

    // 배열인 경우
    if (Array.isArray(response)) {
      return response;
    }

    // 객체로 감싼 경우
    if (response && 'teams' in response) {
      return response.teams;
    }

    return [];
  } catch (error) {
    console.error('팀 목록 조회 실패:', error);
    return [];
  }
}

/**
 * 팀 이름으로 ID 찾기
 */
export function findTeamIdByName(teams: Team[], name: string): number | null {
  const team = teams.find(t =>
    t.name === name ||
    t.name.includes(name) ||
    name.includes(t.name) ||
    t.code === name
  );

  return team ? team.id : null;
}

/**
 * 팀 목록을 이름 -> ID 매핑 객체로 변환
 */
export function createTeamMapping(teams: Team[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  teams.forEach(team => {
    mapping[team.name] = team.id;
    if (team.code) {
      mapping[team.code] = team.id;
    }
  });

  return mapping;
}
