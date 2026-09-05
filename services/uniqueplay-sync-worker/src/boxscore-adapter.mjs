import { contextualizeDetailError, detailError, parseLineScore, parseTeamTables, providerGameIdFromUrl } from './game-details.mjs';

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
  // Read only the identified public cell. React-Native-Web mixes direct Text
  // nodes (order/name) with child spans (position/jersey); descendant leaves
  // alone silently drop the direct text. textContent preserves both in order.
  const cellText = (node) => normalize(node?.textContent);
  const all = [...document.querySelectorAll('*')];
  const header = (label, expectedStats, withInnings) => all.filter((node) => {
    if (node.children.length !== 0 || !visible(node) || normalize(node.textContent) !== label) return false;
    const fixed = node.parentElement;
    const root = fixed?.parentElement;
    // A batter's position (or a player's name) can itself be “투수”/“타자”.
    // Only the first fixed-column row of a two-column stats table is a header.
    if (fixed?.children?.[0] !== node || root?.children?.length !== 2 || root.children[0] !== fixed) return false;
    const columns = root.children[1]?.children?.[0];
    if (!columns) return false;
    const labels = [...columns.children].map((column) => cellText(column.children[0]).replace(/\s+/gu, ''));
    const offset = withInnings ? labels.indexOf(expectedStats[0]) : 0;
    return offset >= 0 && labels.length - offset === expectedStats.length
      && expectedStats.every((expected, index) => labels[offset + index] === expected)
      && (!withInnings || labels.slice(0, offset).every((inning, index) => inning === String(index + 1)));
  });
  if (/\/(?:login|sign-in)(?:\/|$)/u.test(location.pathname)) return { error: 'REAUTH_REQUIRED' };
  const batterHeaders = header('타자', ['타수', '안타', '타점', '도루', '득점', '타율', '시즌타율'], true);
  const pitcherHeaders = header('투수', ['이닝', '피안타', '실점', '자책', '4사구', '삼진', '방어율'], false);
  if (batterHeaders.length !== 1 || pitcherHeaders.length !== 1) return { error: 'GAME_DETAIL_SCHEMA' };
  const batterRoot = batterHeaders[0].parentElement?.parentElement;
  const pitcherRoot = pitcherHeaders[0].parentElement?.parentElement;
  const content = batterRoot?.parentElement;
  const lineRoot = content?.children?.[1]?.children?.[0];
  if (!lineRoot || lineRoot.children.length !== 6 || pitcherRoot.parentElement !== content) return { error: 'GAME_DETAIL_SCHEMA' };
  const teamNames = [...lineRoot.children[0].children].slice(1).map(cellText);
  if (teamNames.length !== 2 || teamNames.some((name) => !name)) return { error: 'GAME_DETAIL_SCHEMA' };
  // Optional public scorer information can shift the tab's child index. Match
  // the unique direct-child control by its two exact line-score team labels.
  const tabCandidates = [...content.children].filter((node) => node.children.length === 2
    && teamNames.every((name, index) => cellText(node.children[index]) === name));
  if (tabCandidates.length !== 1) return { error: 'GAME_DETAIL_SCHEMA' };
  const tabs = tabCandidates[0];
  const tabNodes = [...tabs.children];
  const activeTabs = tabNodes.filter((node) => {
    const color = getComputedStyle(node).backgroundColor.replace(/\s+/gu, '');
    return color !== 'transparent' && !/^rgba\([^,]+,[^,]+,[^,]+,0(?:\.0+)?\)$/u.test(color);
  });
  if (activeTabs.length !== 1) return { error: 'GAME_DETAIL_SCHEMA' };
  if (action === 'select-team') {
    const selected = tabNodes.filter((node) => cellText(node) === normalize(teamName));
    if (selected.length !== 1) return { error: 'GAME_DETAIL_TEAM_MAPPING' };
    const interactive = selected[0].closest('[role="button"], [tabindex="0"]');
    (interactive && tabs.contains(interactive) ? interactive : selected[0]).click();
    return { selected: normalize(teamName) };
  }
  const table = (root, expected) => {
    if (!root || cellText(root.children?.[0]?.children?.[0]) !== expected) return null;
    const fixedRows = [...root.children[0].children].slice(1);
    const columns = root.children?.[1]?.children?.[0];
    if (!columns) return null;
    return {
      labels: fixedRows.map(cellText),
      columns: [...columns.children].map((column) => ({
        header: cellText(column.children[0]).replace(/\s+/gu, ''),
        values: [...column.children].slice(1).map(cellText),
      })),
    };
  };
  const inningRoot = lineRoot.children[1]?.children?.[0];
  if (!inningRoot) return { error: 'GAME_DETAIL_SCHEMA' };
  const column = (node) => ({ header: cellText(node.children[0]), values: [...node.children].slice(1).map(cellText) });
  return {
    selectedTeam: cellText(activeTabs[0]),
    batter: table(batterRoot, '타자'), pitcher: table(pitcherRoot, '투수'),
    lineScore: { teamNames, innings: [...inningRoot.children].map(column), totals: [...lineRoot.children].slice(2).map(column) },
  };
}

export async function stablePublicSnapshot(page, { expectedTeam = null, allowForfeitEmpty = false, timeoutMs = 15_000, pollIntervalMs = 250 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15_000
      || !Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0 || pollIntervalMs > timeoutMs) throw detailError();
  let previous = null;
  let waitedMs = 0;
  while (true) {
    const snapshot = await page.evaluate(inspectBoxscoreDom);
    if (snapshot?.error === 'REAUTH_REQUIRED') throw detailError('REAUTH_REQUIRED');
    let complete = false;
    if (snapshot && !snapshot.error && snapshot.batter && snapshot.pitcher && snapshot.selectedTeam
        && (!expectedTeam || snapshot.selectedTeam === expectedTeam)) {
      try {
        const lineTeams = parseLineScore(snapshot.lineScore);
        const rows = parseTeamTables(snapshot, snapshot.selectedTeam, { allowForfeitEmpty });
        complete = lineTeams.some((team) => team.teamName === snapshot.selectedTeam)
          && ((rows.batters.length > 0 && rows.pitchers.length > 0) || allowForfeitEmpty);
      } catch (error) {
        if (error?.code === 'GAME_DETAIL_PRIVATE_VALUE') throw error;
        // Loading tables can expose headers before rows. Keep waiting for a
        // complete parse, but persistent malformed DOM still fails at the limit.
      }
    }
    if (complete) {
      const serialized = JSON.stringify(snapshot);
      if (serialized === previous) return snapshot;
      previous = serialized;
    } else {
      previous = null;
    }
    if (waitedMs >= timeoutMs) break;
    const delay = Math.min(pollIntervalMs, timeoutMs - waitedMs);
    await page.waitForTimeout(delay);
    waitedMs += delay;
  }
  throw detailError();
}

export async function readOpenGameBoxscore(page, sourceGameId, { sourceStatus = '', expectedGame = null } = {}) {
  let providerGameId;
  let stage = 'OPEN_BOXSCORE';
  try {
    providerGameId = providerGameIdFromUrl(page.url());
    const explicitForfeit = /몰수|기권|부전승/u.test(String(sourceStatus).normalize('NFKC'));
    stage = 'READ_INITIAL';
    const first = await stablePublicSnapshot(page, { allowForfeitEmpty: explicitForfeit });
    stage = 'CHECK_GAME';
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
      stage = 'SELECT_TEAM';
      const selected = await page.evaluate(inspectBoxscoreDom, { action: 'select-team', teamName: team.teamName });
      if (selected.error) throw detailError(selected.error);
      await page.waitForTimeout(250);
      stage = 'READ_TEAM';
      const snapshot = await stablePublicSnapshot(page, { expectedTeam: team.teamName, allowForfeitEmpty: explicitForfeit });
      if (JSON.stringify(parseLineScore(snapshot.lineScore)) !== JSON.stringify(lineTeams)) throw detailError('GAME_DETAIL_SCORE');
      teams.push({ ...team, ...parseTeamTables(snapshot, team.teamName, { allowForfeitEmpty: explicitForfeit }) });
    }
    stage = 'CHECK_TEAMS';
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
  } catch (error) {
    throw contextualizeDetailError(error, { stage, sourceGameId, providerGameId });
  }
}
