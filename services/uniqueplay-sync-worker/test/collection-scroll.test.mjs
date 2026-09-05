import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { scrollCollectionDom } from '../src/collection-scroll.mjs';
import { assertCompleteGameCollection, collectLazyList, collectUntilStable } from '../src/adapter.mjs';

// Public geometry only, matching the observed 192/214px visible-overflow card
// inside the 1120/1683px auto-scrolling results list. No provider HTML/session.
function node({ text = '', height = 0, total = height, overflow = 'visible', children = [], stuck = false } = {}) {
  const element = {
    children, parentElement: null, clientHeight: height, scrollHeight: total, scrollTop: 0, overflow,
    get textContent() { return text + children.map((child) => child.textContent).join(''); },
    querySelectorAll() { return children.flatMap((child) => [child, ...child.querySelectorAll('*')]); },
    scrollTo({ top }) {
      if (!stuck && (/^(auto|scroll|overlay)$/u.test(overflow) || this.isDocument)) {
        this.scrollTop = Math.max(0, Math.min(this.scrollHeight - this.clientHeight, top));
      }
    },
  };
  children.forEach((child) => { child.parentElement = element; });
  return element;
}

function fixture({ count = 8, overflow = 'auto', stuck = false, documentScroll = false, table = false } = {}) {
  const cards = Array.from({ length: count }, (_, i) => node({ height: 192, total: 214,
    children: [node({ text: `09/${String(i + 1).padStart(2, '0')} 토 09:00` })] }));
  const values = node({ children: [node({ children: [node({ text: '게임수' }), node({ text: '승률' })] })] });
  const content = node({ height: 1683, children: table ? [node({ height: 192, total: 214, children: [values] })] : cards });
  const list = node({ height: 1120, total: 1683, overflow: documentScroll ? 'visible' : overflow, children: [content], stuck });
  const body = node({ height: 1120, children: [list] });
  const root = node({ height: 1120, total: documentScroll ? 1683 : 1120, children: [body] });
  root.isDocument = true;
  const document = { body, scrollingElement: root, querySelectorAll: () => [root, ...root.querySelectorAll('*')] };
  const inspect = (args) => JSON.parse(JSON.stringify(vm.runInNewContext(`(${scrollCollectionDom.toString()})(args)`, {
    document, getComputedStyle: (element) => ({ overflowY: element.overflow }), args,
  })));
  return { cards, content, list, root, body, inspect };
}

test('scrolls the actual list, not a visible-overflow card', () => {
  const dom = fixture();
  assert.equal(dom.inspect({ inspectOnly: true }).top, 0);
  assert.equal(dom.list.scrollTop, 0);
  const result = dom.inspect({});
  assert.equal(result.advanced, true);
  assert.equal(result.atEnd, true);
  assert.equal(dom.list.scrollTop, 563);
  assert.ok(dom.cards.every((card) => card.scrollTop === 0));
  assert.equal(dom.inspect({}).advanced, false);
});

test('table scrolling uses the same actual overflow selection', () => {
  const dom = fixture({ table: true });
  assert.equal(dom.inspect({ kind: 'table', anchor: '게임수', expectedHeaders: ['게임수', '승률'] }).advanced, true);
  assert.equal(dom.list.scrollTop, 563);
  assert.equal(dom.inspect({ kind: 'table', anchor: 'ERA', expectedHeaders: ['ERA'] }).atEnd, false);
});

test('a horizontal-only wrapper does not hide the outer vertical scroller; fitted lists still finish', () => {
  const dom = fixture();
  dom.content.overflow = 'auto';
  assert.equal(dom.inspect({}).advanced, true);
  assert.equal(dom.content.scrollTop, 0);
  const fitted = fixture();
  fitted.list.scrollHeight = fitted.list.clientHeight;
  fitted.body.overflow = 'hidden';
  assert.equal(fitted.inspect({}).atEnd, true);
});

test('body overflow cannot replace a fitted table scroll surface or the actual document scroller', () => {
  const dom = fixture({ table: true });
  dom.list.scrollHeight = dom.list.clientHeight;
  dom.body.overflow = 'auto';
  dom.body.scrollHeight = 1396;
  dom.root.scrollHeight = 1396;
  const result = dom.inspect({ kind: 'table', anchor: '게임수', expectedHeaders: ['게임수', '승률'] });
  assert.equal(result.atEnd, true);
  assert.equal(result.advanced, false);
  assert.equal(dom.body.scrollTop, 0);
  assert.equal(dom.root.scrollTop, 0);
  const documentOnly = fixture({ documentScroll: true });
  documentOnly.body.overflow = 'auto';
  documentOnly.body.scrollHeight = 1683;
  assert.equal(documentOnly.inspect({}).advanced, true);
  assert.equal(documentOnly.body.scrollTop, 0);
  assert.equal(documentOnly.root.scrollTop, 563);
});

test('quirks-mode body remains usable when it actually is document.scrollingElement', () => {
  const body = node({ height: 720, total: 796, overflow: 'auto', children: [node({ text: '09/05 토 09:00' })] });
  body.isDocument = true;
  const document = { body, scrollingElement: body, querySelectorAll: () => [body, ...body.querySelectorAll('*')] };
  const result = vm.runInNewContext(`(${scrollCollectionDom.toString()})({})`, {
    document, getComputedStyle: (element) => ({ overflowY: element.overflow }),
  });
  assert.equal(result.advanced, true);
  assert.equal(result.atEnd, true);
  assert.equal(body.scrollTop, 76);
});

test('supports the document scrolling element and rejects hidden/clip as list surfaces', () => {
  const dom = fixture({ documentScroll: true });
  assert.equal(dom.inspect({}).advanced, true);
  assert.equal(dom.root.scrollTop, 563);
  assert.equal(dom.list.scrollTop, 0);
  for (const overflow of ['hidden', 'clip']) {
    const hidden = fixture({ overflow });
    hidden.body.overflow = 'hidden';
    const result = hidden.inspect({});
    assert.equal(result.atEnd, false);
    assert.equal(result.reason, 'SCROLL_SURFACE_MISSING');
  }
});

test('three stalled attempts away from the end never count as completion', async () => {
  const dom = fixture({ stuck: true });
  const advance = async () => dom.inspect({});
  await assert.rejects(collectLazyList({ read: async () => ['A'], identify: (row) => row, advance, maxPasses: 5 }), { code: 'COLLECTION_INCOMPLETE' });
  await assert.rejects(collectUntilStable({ read: async () => ({ rows: [{ fixed: ['1', 'A'], values: ['1'] }] }), advance, maxPasses: 5 }), { code: 'COLLECTION_INCOMPLETE' });
});

test('incomplete table diagnostics include only safe stage and geometry, never arbitrary source values', async () => {
  await assert.rejects(collectUntilStable({
    read: async () => ({ rows: [{ fixed: ['1', 'private@example.invalid'], values: ['1'] }] }),
    advance: async () => ({ advanced: false, atEnd: false, top: 0, height: 720, total: 796, reason: 'PRIVATE SECRET' }),
    context: { groupCode: 'A', table: 'STANDINGS', email: 'private@example.invalid' }, maxPasses: 4,
  }), (error) => {
    assert.equal(error.code, 'COLLECTION_INCOMPLETE');
    assert.match(error.message, /group=A; table=STANDINGS; rows=1; atEnd=false; top=0; height=720; total=796/u);
    assert.doesNotMatch(error.message, /private|PRIVATE|SECRET|email/u);
    return true;
  });
});

test('collects later lazy batches after temporary bottom, including batches excluded from A-H', async () => {
  const dom = fixture();
  let batches = 1;
  let bottomWaits = 0;
  let waits = 0;
  const result = await collectLazyList({
    read: async () => Array.from({ length: batches * 8 }, (_, i) => i).filter((i) => i !== 1 && i !== 2),
    identify: (id) => String(id),
    advance: async () => dom.inspect({}),
    wait: async () => {
      waits += 1;
      if (batches < 3 && dom.list.scrollTop + dom.list.clientHeight >= dom.list.scrollHeight && ++bottomWaits === 3) {
        batches += 1;
        bottomWaits = 0;
        dom.list.scrollHeight += 1683;
      }
    },
  });
  assert.equal(result.length, 22);
  assert.equal(batches, 3);
  assert.ok(waits > 6);
});

function seasonFixture() {
  const groups = Object.fromEntries([...'ABCDEFGH'].map((groupCode) => [groupCode, {
    standings: Array.from({ length: 5 }, (_, index) => ({ teamName: `${groupCode}-${index}`, games: '6' })),
  }]));
  const games = [...'ABCDEFGH'].flatMap((groupCode) => Array.from({ length: 15 }, (_, index) => ({
    groupCode, playedAt: `2026-08-${String(index + 1).padStart(2, '0')}T09:00:00+09:00`,
    status: 'COMPLETED', homeTeamName: `${groupCode} home alias`, awayTeamName: `${groupCode} away alias`,
  })));
  return { groups, games };
}

test('blocks the six-game first batch and even an entirely empty completed list before candidate creation', () => {
  const season = seasonFixture();
  for (const games of [season.games.slice(0, 6), []]) {
    assert.throws(() => assertCompleteGameCollection({ ...season, games }), (error) => {
      assert.equal(error.code, 'COLLECTION_INCOMPLETE');
      assert.match(error.message, /A조 \d+\/15/u);
      assert.doesNotMatch(error.message, /alias|home|away/u);
      return true;
    });
  }
});

test('complete snapshots and re-runs pass without relying on team alias or hardcoded season totals', () => {
  const season = seasonFixture();
  const before = JSON.stringify(season);
  assertCompleteGameCollection(season);
  assertCompleteGameCollection(season);
  assert.equal(JSON.stringify(season), before);
  for (const group of Object.values(season.groups)) for (const row of group.standings) row.games = '0';
  assertCompleteGameCollection({ ...season, games: [] });
});

test('duplicates, scheduled and canceled games cannot disguise missing completed games', () => {
  const season = seasonFixture();
  const missing = season.games[0];
  const games = season.games.slice(1);
  games.push({ ...games[0] }, { ...missing, status: 'SCHEDULED' }, { ...missing, status: 'CANCELED' });
  assert.throws(() => assertCompleteGameCollection({ ...season, games }), { code: 'COLLECTION_INCOMPLETE' });
});

test('one short group is blocked even when another group has excess games', () => {
  const season = seasonFixture();
  season.games[0].groupCode = 'B';
  assert.throws(() => assertCompleteGameCollection(season), /A조 14\/15/u);
});
