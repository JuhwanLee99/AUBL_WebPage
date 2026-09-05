import { findPrivatePaths, normalizeText } from './normalization.mjs';
import { validateGameDetailIntegrity } from './game-details.mjs';

export const EXPECTED_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function issue(code, message, path, details) {
  return { code, message, path, ...(details ? { details } : {}) };
}

function detectBoundaryTie(rows, boundary) {
  if (rows.length <= boundary) return false;
  return rows[boundary - 1]?.rank === rows[boundary]?.rank;
}

function validatePlayerStats(player, kind, path, blockingErrors) {
  const values = Object.values(player.stats || {});
  const numericValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numericValues.length === 0) {
    blockingErrors.push(issue(
      'PLAYER_STATS_EMPTY',
      `${kind === 'batters' ? '타자' : '투수'} 기록 수치가 비어 있습니다. 표 열 파싱을 확인하세요.`,
      `${path}.stats`,
    ));
    return;
  }
  if (numericValues.some((value) => value < 0)) {
    blockingErrors.push(issue(
      'PLAYER_STATS_RANGE',
      `${kind === 'batters' ? '타자' : '투수'} 기록에는 음수가 포함될 수 없습니다.`,
      `${path}.stats`,
    ));
  }
}

export function validateCandidate(candidate) {
  const blockingErrors = [];
  const warnings = [];

  const privatePaths = findPrivatePaths(candidate);
  if (privatePaths.length) {
    blockingErrors.push(issue('PRIVATE_FIELD', '허용되지 않은 개인정보 필드가 포함되어 있습니다.', '$', privatePaths));
  }

  const groupKeys = Object.keys(candidate.groups || {}).sort();
  if (groupKeys.join(',') !== EXPECTED_GROUPS.join(',')) {
    blockingErrors.push(issue('GROUP_SET', 'A~H조가 모두 존재해야 합니다.', '$.groups', groupKeys));
  }

  const allTeams = new Map();
  for (const groupCode of EXPECTED_GROUPS) {
    const rows = candidate.groups?.[groupCode]?.standings || [];
    if (rows.length !== 5) {
      blockingErrors.push(issue('TEAM_COUNT', `${groupCode}조 팀 수는 5개여야 합니다.`, `$.groups.${groupCode}.standings`, { actual: rows.length }));
    }
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const path = `$.groups.${groupCode}.standings[${index}]`;
      if (!normalizeText(row.teamName)) blockingErrors.push(issue('TEAM_NAME', '팀명이 비어 있습니다.', path));
      if (row.games !== row.wins + row.losses + row.draws) {
        blockingErrors.push(issue('STANDING_SUM', '게임 수와 승·패·무 합계가 일치하지 않습니다.', path));
      }
      const normalizedTeam = normalizeText(row.teamName).toLocaleLowerCase('ko-KR');
      if (normalizedTeam) {
        const prior = allTeams.get(normalizedTeam);
        if (prior && prior !== groupCode) {
          blockingErrors.push(issue('TEAM_DUPLICATE_GROUP', '같은 팀이 여러 조에 포함되어 있습니다.', path, { priorGroup: prior }));
        }
        allTeams.set(normalizedTeam, groupCode);
      }
    }
    const groupTeams = new Set(rows.map((row) => normalizeText(row.teamName).toLocaleLowerCase('ko-KR')));
    for (const kind of ['batters', 'pitchers']) {
      for (const regulation of ['IN', 'OUT']) {
        const players = candidate.groups?.[groupCode]?.[kind]?.[regulation] || [];
        for (let index = 0; index < players.length; index += 1) {
          const player = players[index];
          const path = `$.groups.${groupCode}.${kind}.${regulation}[${index}]`;
          if (!normalizeText(player.playerName)) blockingErrors.push(issue('PLAYER_NAME', '선수명이 비어 있습니다.', path));
          if (!groupTeams.has(normalizeText(player.teamName).toLocaleLowerCase('ko-KR'))) {
            blockingErrors.push(issue('PLAYER_TEAM', '선수의 팀이 해당 조 순위표에 없습니다.', path));
          }
          validatePlayerStats(player, kind, path, blockingErrors);
        }
      }
    }
    if (detectBoundaryTie(rows, 2) || detectBoundaryTie(rows, 4)) {
      warnings.push(issue('BOUNDARY_TIE', `${groupCode}조 진출 경계에 동률이 있어 관리자 판정이 필요합니다.`, `$.groups.${groupCode}.standings`));
    }
  }

  const gameIds = new Set();
  const completedAppearances = new Map();
  for (let index = 0; index < (candidate.games || []).length; index += 1) {
    const game = candidate.games[index];
    const path = `$.games[${index}]`;
    if (!game.sourceGameId || gameIds.has(game.sourceGameId)) {
      blockingErrors.push(issue('GAME_ID', '경기 고유 ID가 없거나 중복되었습니다.', path));
    }
    gameIds.add(game.sourceGameId);
    if (!EXPECTED_GROUPS.includes(game.groupCode)) blockingErrors.push(issue('GAME_GROUP', '경기 조가 A~H 범위를 벗어났습니다.', path));
    if (!game.homeTeamName || !game.awayTeamName || game.homeTeamName === game.awayTeamName) {
      blockingErrors.push(issue('GAME_TEAMS', '홈·원정 팀 매핑이 올바르지 않습니다.', path));
    }
    if ((game.homeScore === null) !== (game.awayScore === null)) {
      blockingErrors.push(issue('PARTIAL_SCORE', '양 팀 점수는 함께 존재하거나 함께 비어 있어야 합니다.', path));
    }
    if (game.homeScore !== null && (game.homeScore < 0 || game.awayScore < 0)) {
      blockingErrors.push(issue('SCORE_RANGE', '점수는 음수일 수 없습니다.', path));
    }
    if (game.status === 'COMPLETED') {
      for (const teamName of [game.homeTeamName, game.awayTeamName]) {
        const appearanceKey = `${game.groupCode}|${normalizeText(teamName).toLocaleLowerCase('ko-KR')}`;
        completedAppearances.set(appearanceKey, (completedAppearances.get(appearanceKey) || 0) + 1);
      }
    }
  }

  if ((candidate.games || []).length > 0) {
    for (const groupCode of EXPECTED_GROUPS) {
      const rows = candidate.groups?.[groupCode]?.standings || [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const appearanceKey = `${groupCode}|${normalizeText(row.teamName).toLocaleLowerCase('ko-KR')}`;
        const actual = completedAppearances.get(appearanceKey) || 0;
        if (actual !== row.games) {
          blockingErrors.push(issue(
            'GAME_COUNT_MISMATCH',
            `${groupCode}조 ${row.teamName}: 순위표 ${row.games}경기, 수집된 종료 경기 ${actual}경기입니다.`,
            `$.groups.${groupCode}.standings[${index}]`,
            { groupCode, teamName: row.teamName, expected: row.games, actual },
          ));
        }
      }
    }
  }

  const gameDetailValidation = validateGameDetailIntegrity(candidate);
  blockingErrors.push(...gameDetailValidation.blockingErrors);
  warnings.push(...gameDetailValidation.warnings);

  return {
    valid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    counts: {
      groups: groupKeys.length,
      teams: allTeams.size,
      games: candidate.games?.length || 0,
      batters: EXPECTED_GROUPS.reduce((sum, code) => sum + (candidate.groups?.[code]?.batters?.IN?.length || 0) + (candidate.groups?.[code]?.batters?.OUT?.length || 0), 0),
      pitchers: EXPECTED_GROUPS.reduce((sum, code) => sum + (candidate.groups?.[code]?.pitchers?.IN?.length || 0) + (candidate.groups?.[code]?.pitchers?.OUT?.length || 0), 0),
      ...(candidate.gameDetails === undefined ? {} : {
        gameDetails: candidate.gameDetails?.length || 0,
        availableGameDetails: Array.isArray(candidate.gameDetails) ? candidate.gameDetails.filter((detail) => detail.status === 'AVAILABLE').length : 0,
      }),
    },
  };
}
