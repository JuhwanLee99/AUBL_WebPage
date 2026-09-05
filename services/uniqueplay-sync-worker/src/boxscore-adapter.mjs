import { detailError, parseLineScore, parseTeamTables, providerGameIdFromUrl } from './game-details.mjs';

export function resultListIsReady({ leagueId }) {
  const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  if (location.pathname.replace(/\/$/u, '') !== `/league/${leagueId}`) return false;
  const labels = [...document.querySelectorAll('*')].filter((node) => node.children.length === 0 && node.getClientRects().length > 0).map((node) => normalize(node.textContent));
  return labels.includes('일정결과') && labels.includes('조별일정확인')
    && labels.some((label) => /^\d{2}\/\d{2}\s+\S+\s+\d{2}:\d{2}$/u.test(label));
}

// This function runs in the provider page. Return only the visible public tables;
// never HTML, global application state, storage, request headers or account UI.
export function inspectBoxscoreDom({ action = 'read', teamName = null } = {}) {
  const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const visible = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const leafText = (node) => !node ? '' : node.children.length === 0 ? normalize(node.textContent)
    : [...node.querySelectorAll('*')].filter((child) => child.children.length === 0).map((child) => normalize(child.textContent)).filter(Boolean).join(' ');
  const all = [...document.querySelectorAll('*')];
  const header = (label) => all.filter((node) => node.children.length === 0 && visible(node) && normalize(node.textContent) === label);
  if (/\/(?:login|sign-in)(?:\/|$)/u.test(location.pathname)) return { error: 'REAUTH_REQUIRED' };
  const batterHeaders = header('타자');
  const pitcherHeaders = header('투수');
  if (batterHeaders.length !== 1 || pitcherHeaders.length !== 1) return { error: 'GAME_DETAIL_SCHEMA' };
  const batterRoot = batterHeaders[0].parentElement?.parentElement;
  const pitcherRoot = pitcherHeaders[0].parentElement?.parentElement;
  const content = batterRoot?.parentElement;
  const lineRoot = content?.children?.[1]?.children?.[0];
  const tabs = content?.children?.[6];
  if (!lineRoot || !tabs || lineRoot.children.length !== 6) return { error: 'GAME_DETAIL_SCHEMA' };
  const teamNames = [...lineRoot.children[0].children].slice(1).map(leafText);
  if (teamNames.length !== 2 || teamNames.some((name) => !name)) return { error: 'GAME_DETAIL_SCHEMA' };
  const tabNodes = [...tabs.children];
  if (tabNodes.length !== 2 || !teamNames.every((name, index) => normalize(leafText(tabNodes[index])) === name)) return { error: 'GAME_DETAIL_SCHEMA' };
  const activeTabs = tabNodes.filter((node) => {
    const color = getComputedStyle(node).backgroundColor.replace(/\s+/gu, '');
    return color !== 'transparent' && !/^rgba\([^,]+,[^,]+,[^,]+,0(?:\.0+)?\)$/u.test(color);
  });
  if (action === 'select-team') {
    const selected = tabNodes.filter((node) => normalize(leafText(node)) === normalize(teamName));
    if (selected.length !== 1) return { error: 'GAME_DETAIL_TEAM_MAPPING' };
    const interactive = selected[0].closest('[role="button"], [tabindex="0"]');
    (interactive && tabs.contains(interactive) ? interactive : selected[0]).click();
    return { selected: normalize(teamName) };
  }
  const table = (root, expected) => {
    if (!root || normalize(leafText(root.children?.[0]?.children?.[0])) !== expected) return null;
    const fixedRows = [...root.children[0].children].slice(1);
    const columns = root.children?.[1]?.children?.[0];
    if (!columns) return null;
    return {
      labels: fixedRows.map(leafText),
      columns: [...columns.children].map((column) => ({
        header: normalize(leafText(column.children[0])).replace(/\s+/gu, ''),
        values: [...column.children].slice(1).map(leafText),
      })),
    };
  };
  const inningRoot = lineRoot.children[1]?.children?.[0];
  if (!inningRoot) return { error: 'GAME_DETAIL_SCHEMA' };
  const column = (node) => ({ header: leafText(node.children[0]), values: [...node.children].slice(1).map(leafText) });
  return {
    selectedTeam: activeTabs.length === 1 ? normalize(leafText(activeTabs[0])) : null,
    batter: table(batterRoot, '타자'), pitcher: table(pitcherRoot, '투수'),
    lineScore: { teamNames, innings: [...inningRoot.children].map(column), totals: [...lineRoot.children].slice(2).map(column) },
  };
}

async function stablePublicSnapshot(page, expectedTeam = null) {
  let previous = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await page.evaluate(inspectBoxscoreDom);
    if (snapshot.error === 'REAUTH_REQUIRED') throw detailError('REAUTH_REQUIRED');
    if (!snapshot.error && snapshot.batter && snapshot.pitcher && snapshot.selectedTeam
        && (!expectedTeam || snapshot.selectedTeam === expectedTeam)) {
      const serialized = JSON.stringify(snapshot);
      if (serialized === previous) return snapshot;
      previous = serialized;
    } else {
      previous = null;
    }
    await page.waitForTimeout(200);
  }
  throw detailError();
}

export async function readOpenGameBoxscore(page, sourceGameId, { sourceStatus = '', expectedGame = null } = {}) {
  const providerGameId = providerGameIdFromUrl(page.url());
  const explicitForfeit = /몰수|기권|부전승/u.test(String(sourceStatus).normalize('NFKC'));
  const first = await stablePublicSnapshot(page);
  const lineTeams = parseLineScore(first.lineScore);
  if (expectedGame) {
    const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
    const names = [normalize(expectedGame.homeTeamName), normalize(expectedGame.awayTeamName)];
    if (new Set(names).size !== 2 || lineTeams.some((team) => !names.includes(team.teamName))) throw detailError('GAME_DETAIL_TEAM_MAPPING');
    for (const team of lineTeams) {
      const raw = names.indexOf(team.teamName) === 0 ? expectedGame.homeScore : expectedGame.awayScore;
      if (raw !== null && raw !== undefined && raw !== '' && raw !== '-' && team.totals.runs !== Number(raw)) throw detailError('GAME_DETAIL_SCORE');
    }
  }
  const teams = [];
  for (const team of lineTeams) {
    const selected = await page.evaluate(inspectBoxscoreDom, { action: 'select-team', teamName: team.teamName });
    if (selected.error) throw detailError(selected.error);
    await page.waitForTimeout(250);
    const snapshot = await stablePublicSnapshot(page, team.teamName);
    if (JSON.stringify(parseLineScore(snapshot.lineScore)) !== JSON.stringify(lineTeams)) throw detailError('GAME_DETAIL_SCORE');
    teams.push({ ...team, ...parseTeamTables(snapshot, team.teamName, { allowForfeitEmpty: explicitForfeit }) });
  }
  // Verified provider shape: explicit forfeited result + exact headers + a
  // single aggregate row for both roles of both selected teams. A generic empty
  // page, missing row or normally completed game's empty table is not evidence.
  if (explicitForfeit && teams.every((team) => !team.batters.length && !team.pitchers.length)) {
    // Once teams are omitted from this state, the backend cannot re-check them.
    // Verify source-card identity and score before discarding the public tables.
    if (!expectedGame) throw detailError('GAME_DETAIL_PARENT');
    return { schemaVersion: 1, sourceGameId, providerGameId, status: 'NOT_PUBLISHED', teams: [] };
  }
  if (teams.some((team) => !team.batters.length || !team.pitchers.length)) throw detailError();
  return { schemaVersion: 1, sourceGameId, providerGameId, status: 'AVAILABLE', teams };
}
