import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inspectBoxscoreDom, readOpenGameBoxscore, resultListIsReady } from '../src/boxscore-adapter.mjs';
import { boxscoreSnapshots, forfeitSnapshots } from './fixtures/game-detail-fixture.mjs';

// A tiny synthetic DOM models the public column-oriented structure observed in
// Chrome. It contains no captured HTML and never launches/connects a browser.
function element(value = '', children = []) {
  const node = {
    children, parentElement: null, value, onClick: null,
    get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); },
    querySelectorAll() { return this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]); },
    getClientRects() { return [{}]; },
    closest() { return null; },
    contains(target) { return target === this || this.querySelectorAll('*').includes(target); },
    click() { this.onClick?.(); },
  };
  children.forEach((child) => { child.parentElement = node; });
  return node;
}

function textCell(value) { return element('', [element(value)]); }

function tableDom(label, table) {
  const fixed = element('', [element(label), ...table.labels.map(textCell)]);
  const columns = table.columns.map((column) => element('', [textCell(column.header), ...column.values.map(textCell)]));
  return element('', [fixed, element('', [element('', columns)])]);
}

function fixtureDocument(snapshot, selected = 0, select = () => {}) {
  const score = snapshot.lineScore;
  const column = (entry) => element('', [textCell(entry.header), ...entry.values.map(textCell)]);
  const line = element('', [
    element('', [textCell(''), ...score.teamNames.map(textCell)]),
    element('', [element('', score.innings.map(column))]),
    ...score.totals.map(column),
  ]);
  const tabs = score.teamNames.map((name, index) => {
    const tab = element('', [textCell(name)]);
    tab.backgroundColor = selected === index ? 'rgb(61, 80, 183)' : 'rgba(0, 0, 0, 0)';
    tab.onClick = () => select(index);
    return tab;
  });
  const content = element('', [element(), element('', [line]), element(), element(),
    tableDom('타자', snapshot.batter), tableDom('투수', snapshot.pitcher), element('', tabs)]);
  const body = element('', [element('private@example.invalid'), content]);
  return { querySelectorAll: () => body.querySelectorAll('*'), body };
}

function inspect(document, args, pathname = '/game/12345/boxscore') {
  return vm.runInNewContext(`(${inspectBoxscoreDom.toString()})(args)`, {
    document, args, location: { pathname },
    getComputedStyle: (node) => ({ visibility: 'visible', backgroundColor: node.backgroundColor || 'rgba(0, 0, 0, 0)' }),
  });
}

test('DOM fixture extracts only fixed labels, column cells, line score and selected public team', () => {
  const fixture = boxscoreSnapshots()[0];
  const actual = JSON.parse(JSON.stringify(inspect(fixtureDocument(fixture), {})));
  assert.deepEqual(actual, fixture);
  assert.equal(JSON.stringify(actual).includes('private@example'), false);
  let selected = null;
  const result = inspect(fixtureDocument(fixture, 0, (index) => { selected = index; }), { action: 'select-team', teamName: fixture.lineScore.teamNames[1] });
  assert.equal(result.selected, fixture.lineScore.teamNames[1]);
  assert.equal(selected, 1);
});

test('structural DOM changes and login routes are not mistaken for unpublished records', () => {
  const fixture = boxscoreSnapshots()[0];
  const document = fixtureDocument(fixture);
  const firstHeader = document.querySelectorAll('*').find((node) => node.value === '타자');
  firstHeader.value = '새 헤더';
  assert.equal(inspect(document, {}).error, 'GAME_DETAIL_SCHEMA');
  assert.equal(inspect(document, {}, '/login').error, 'REAUTH_REQUIRED');
});

test('back navigation recognizes dated result cards even without a game-results label', () => {
  const body = element('', ['일정결과', '2026년', '조별일정확인', '팀별일정확인', '08/24 월 15:00'].map(textCell));
  const context = { document: { querySelectorAll: () => body.querySelectorAll('*') }, location: { pathname: '/league/57' }, args: { leagueId: '57' } };
  assert.equal(vm.runInNewContext(`(${resultListIsReady.toString()})(args)`, context), true);
  context.location.pathname = '/game/12345/boxscore';
  assert.equal(vm.runInNewContext(`(${resultListIsReady.toString()})(args)`, context), false);
});

test('collector confirms selected-team styling and stable rows before reading the second team', async () => {
  const snapshots = boxscoreSnapshots();
  let selected = 0;
  const selections = [];
  let pending = 0;
  const page = {
    url: () => 'https://unique-play.com/game/12345/boxscore?data=[object%20Object]',
    waitForTimeout: async () => {},
    evaluate: async (fn, args) => {
      assert.equal(fn, inspectBoxscoreDom);
      if (args?.action === 'select-team') {
        selected = snapshots.findIndex((snapshot) => snapshot.selectedTeam === args.teamName);
        selections.push(selected);
        pending = selected === 1 ? 2 : 0;
        return { selected: args.teamName };
      }
      // Simulate stale first-team content after the second-team click.
      if (pending-- > 0) return snapshots[0];
      return snapshots[selected];
    },
  };
  const detail = await readOpenGameBoxscore(page, 'up-original-id');
  assert.deepEqual(selections, [0, 1]);
  assert.equal(detail.sourceGameId, 'up-original-id');
  assert.equal(detail.providerGameId, '12345');
  assert.equal(detail.teams[0].batters[0].playerName, '타자갑');
  assert.equal(detail.teams[1].batters[0].playerName, '타자을');
});

test('missing tables and expired sessions fail closed without a fabricated NOT_PUBLISHED detail', async () => {
  for (const code of ['GAME_DETAIL_SCHEMA', 'REAUTH_REQUIRED']) {
    const page = {
      url: () => 'https://unique-play.com/game/12345/boxscore',
      waitForTimeout: async () => {},
      evaluate: async () => ({ error: code }),
    };
    await assert.rejects(readOpenGameBoxscore(page, 'up-fixture'), { code });
  }
});

test('only explicit forfeits with both selected teams aggregate-only produce NOT_PUBLISHED', async () => {
  const expectedGame = { homeTeamName: '테스트 대학 A', awayTeamName: '테스트 대학 B', homeScore: '7', awayScore: '0' };
  const makePage = (snapshots) => {
    let selected = 0;
    return {
      url: () => 'https://unique-play.com/game/12346/boxscore',
      waitForTimeout: async () => {},
      evaluate: async (_fn, args) => {
        if (args?.action === 'select-team') {
          selected = snapshots.findIndex((snapshot) => snapshot.selectedTeam === args.teamName);
          return { selected: args.teamName };
        }
        return snapshots[selected];
      },
    };
  };
  for (const sourceStatus of ['몰수게임', '기권', '부전승']) {
    const detail = await readOpenGameBoxscore(makePage(forfeitSnapshots()), 'up-forfeit', { sourceStatus, expectedGame });
    assert.deepEqual(detail, { schemaVersion: 1, sourceGameId: 'up-forfeit', providerGameId: '12346', status: 'NOT_PUBLISHED', teams: [] });
  }
  await assert.rejects(readOpenGameBoxscore(makePage(forfeitSnapshots()), 'up-forfeit', { sourceStatus: '게임종료' }), { code: 'GAME_DETAIL_SCHEMA' });
  const malformed = forfeitSnapshots();
  malformed[1].pitcher.columns[0].header = '새 헤더';
  await assert.rejects(readOpenGameBoxscore(makePage(malformed), 'up-forfeit', { sourceStatus: '몰수게임' }), { code: 'GAME_DETAIL_SCHEMA' });
  const mixed = forfeitSnapshots();
  mixed[1].batter = boxscoreSnapshots()[1].batter;
  await assert.rejects(readOpenGameBoxscore(makePage(mixed), 'up-forfeit', { sourceStatus: '몰수게임' }), { code: 'GAME_DETAIL_SCHEMA' });
  await assert.rejects(readOpenGameBoxscore(makePage(forfeitSnapshots()), 'up-forfeit', { sourceStatus: '몰수게임' }), { code: 'GAME_DETAIL_PARENT' });
  await assert.rejects(readOpenGameBoxscore(makePage(forfeitSnapshots()), 'up-forfeit', { sourceStatus: '몰수게임', expectedGame: { ...expectedGame, homeTeamName: '다른 팀' } }), { code: 'GAME_DETAIL_TEAM_MAPPING' });
  await assert.rejects(readOpenGameBoxscore(makePage(forfeitSnapshots()), 'up-forfeit', { sourceStatus: '몰수게임', expectedGame: { ...expectedGame, homeScore: 8 } }), { code: 'GAME_DETAIL_SCORE' });
});
