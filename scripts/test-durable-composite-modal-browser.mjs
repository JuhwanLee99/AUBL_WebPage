import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '../services/uniqueplay-sync-worker/node_modules/playwright/index.mjs';
import { sourceModules } from './e2e/scoring/source-modules.mjs';

const root = process.cwd(), modules = sourceModules(root), results = [];
const bundle = await build({ entryPoints: ['scripts/e2e/scoring/durable-app.jsx'], bundle: true,
  write: false, format: 'iife', platform: 'browser', jsx: 'automatic', loader: { '.css': 'empty' },
  define: { 'import.meta.env': '{}' },
  alias: { '@shared/state/demoStore': path.join(root, 'scripts/e2e/scoring/durable-store.jsx'), '@shared': path.join(root, 'src/shared') },
  plugins: [{ name: 'isolated-reducer', setup(build) {
    build.onResolve({ filter: /^virtual:/ }, args => ({ path: args.path, namespace: 'virtual' }));
    build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => ({ contents: modules.get(args.path), resolveDir: root, loader: 'js' }));
    build.onResolve({ filter: /^\/@fs\// }, args => ({ path: args.path.slice(5) }));
    build.onResolve({ filter: /firebase|demoStore\.effects|backendClient|AuthProvider/ }, args => ({ errors: [{ text: `Unsafe dependency: ${args.path}` }] }));
  } }],
});
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', request.url === '/app.js' ? 'application/javascript' : 'text/html');
  response.end(request.url === '/app.js' ? bundle.outputFiles[0].text : '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const directory = `outputs/durable-composite-modal-browser/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(directory, { recursive: true });
let browser;
async function draft(page, batter = 'B', reset = false) {
  await page.getByRole('button', { name: '복합 플레이 기록', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (reset) await dialog.getByRole('button', { name: '작성 내용 비우고 현재 상황으로 시작', exact: true }).click();
  await dialog.getByRole('combobox', { name: /^타격 판정/ }).selectOption('single');
  await dialog.getByLabel('이번 투구', { exact: false }).selectOption('in_play');
  const runners = await page.evaluate(() => window.probe.state().bases.filter(Boolean).reverse());
  for (const runner of runners) {
    await dialog.getByRole('button', { name: `${runner} 이동 / 아웃 추가`, exact: true }).click();
  }
  await dialog.getByRole('button', { name: `${batter} 이동 / 아웃 추가`, exact: true }).click();
  await dialog.locator('fieldset.runner-matrix-row').last().getByRole('combobox', { name: /^원인/ }).selectOption('hit');
  await dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false }).check();
  return dialog;
}
const accept = dialog => dialog.getByRole('button', { name: '이 플레이 적용', exact: true }).click();
const state = page => page.evaluate(() => ({ events: window.probe.state().events,
  bases: window.probe.state().bases, home: window.probe.state().score.home,
  enqueueCalls: window.probe.enqueueCalls, applyCalls: window.probe.applyCalls, legacyCalls: window.probe.legacyCalls }));
const queue = page => page.evaluate(() => window.probe.recover());
const panel = page => page.getByRole('region', { name: '기기 기록 복구', exact: true });
const blockedPrepare = async page => {
  assert.equal(await page.evaluate(() => window.probe.prepare().then(() => 'prepared', error => error.message)), 'local-application-review-required');
  assert.equal(await page.evaluate(() => window.probe.commitCalls), 0);
};
async function stageFailure(page) {
  const dialog = await draft(page); await page.evaluate(() => { window.probe.failApply = true; });
  await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'test-apply-failed' }).waitFor();
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await panel(page).getByRole('button', { name: '복구 목록 새로고침', exact: true }).click();
  await panel(page).getByText('적용 확인 전 · 전송 차단', { exact: true }).waitFor();
}
const jobs = {
  async completed_intake_releases_snapshots_and_keeps_duplicate_guard(page) {
    const first = await draft(page); await accept(first); await first.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.probe.intake.retentionSummary()), { pendingSnapshots: 0, completedFingerprints: 1 });
    const calls = (await state(page)).applyCalls;
    await page.evaluate(() => window.probe.retry());
    assert.equal((await state(page)).applyCalls, calls);
    assert.equal(await page.evaluate(() => window.probe.changedRetry().then(() => 'accepted', error => error.message)), 'input-id-conflict');
    const next = await draft(page, 'A'); await accept(next); await next.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(() => window.probe.intake.retentionSummary()), { pendingSnapshots: 0, completedFingerprints: 2 });
  },
  async failed_confirmation_keeps_snapshot_until_successful_retry(page) {
    const dialog = await draft(page);
    await page.evaluate(() => { window.probe.failConfirm = true; });
    await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'test-confirm-failed' }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.probe.intake.retentionSummary()), { pendingSnapshots: 1, completedFingerprints: 0 });
    const calls = (await state(page)).applyCalls;
    await page.evaluate(async () => { window.probe.failConfirm = false; await window.probe.retry(); });
    assert.equal((await state(page)).applyCalls, calls);
    assert.deepEqual(await page.evaluate(() => window.probe.intake.retentionSummary()), { pendingSnapshots: 0, completedFingerprints: 1 });
  },
  async persisted_before_apply_with_replay_checkpoint(page) {
    const dialog = await draft(page); await accept(dialog); await dialog.waitFor({ state: 'hidden' });
    const actual = await state(page), saved = await queue(page), snapshot = JSON.parse(saved.inputs[0].snapshot);
    assert.equal(actual.events.length, 1); assert.equal(actual.bases[0], 'B');
    assert.equal(actual.applyCalls, 1); assert.equal(actual.legacyCalls, 0);
    assert.equal(snapshot.input.id, actual.events[0].eventId);
    assert.equal(snapshot.before.events.length, 0);
    assert.deepEqual(snapshot.after.events, JSON.parse(JSON.stringify(actual.events)));
    assert.equal(snapshot.after.feed.filter(row => row.eventId === snapshot.input.id).length, 1);
    assert.equal(snapshot.after.events[0].compositePlay.batters.B.h, 1);
    assert.equal(Object.hasOwn(snapshot.after, 'history'), false);
    await page.getByRole('status').filter({ hasText: '기기에 저장하고' }).waitFor();
    await page.evaluate(() => window.probe.retry());
    assert.equal((await queue(page)).inputs.length, 1); assert.equal((await state(page)).applyCalls, 1);
  },
  async quota_failure_keeps_reviewed_draft_then_retries(page) {
    const dialog = await draft(page);
    await page.evaluate(() => {
      window.restoreAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('Injected quota', 'QuotaExceededError'); };
    });
    await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'Injected quota' }).waitFor();
    assert.equal((await state(page)).events.length, 0); assert.equal((await queue(page)).inputs.length, 0);
    assert.equal(await dialog.getByLabel('순서·득점·타점·실책·책임 확인', { exact: false }).isChecked(), true);
    const original = await page.evaluate(() => window.probe.lastInput.id);
    await page.evaluate(() => { IDBObjectStore.prototype.add = window.restoreAdd; });
    await accept(dialog); await dialog.waitFor({ state: 'hidden' });
    assert.equal((await queue(page)).inputs[0].inputId, original); assert.equal((await state(page)).applyCalls, 1);
  },
  async pending_storage_blocks_repeat_and_close(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.hold = true; });
    await accept(dialog); await page.waitForFunction(() => typeof window.probe.release === 'function');
    assert.equal(await dialog.getByRole('button', { name: '적용 중', exact: true }).isDisabled(), true);
    assert.equal(await dialog.getByRole('button', { name: '닫기', exact: true }).isDisabled(), true);
    await page.keyboard.press('Escape'); assert.equal(await dialog.isVisible(), true);
    assert.equal((await state(page)).events.length, 0); assert.equal((await queue(page)).inputs.length, 0);
    const result = await page.evaluate(() => window.probe.retry().then(() => 'accepted', error => error.message));
    assert.equal(result, 'durable-intake-busy');
    await page.evaluate(() => window.probe.release()); await dialog.waitFor({ state: 'hidden' });
    assert.equal((await state(page)).enqueueCalls, 1); assert.equal((await queue(page)).inputs.length, 1);
  },
  async state_changes_during_storage_preserve_queue_without_overwrite(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.hold = true; });
    await accept(dialog); await page.waitForFunction(() => typeof window.probe.release === 'function');
    await page.evaluate(() => { window.probe.changeState(); window.probe.release(); });
    await dialog.getByRole('alert').filter({ hasText: 'durable-intake-state-changed' }).waitFor();
    const actual = await state(page); assert.equal(actual.events.length, 0); assert.equal(actual.home, 1);
    assert.equal((await queue(page)).inputs.length, 1); assert.equal(actual.applyCalls, 0);
  },
  async authority_revoked_during_storage_preserves_input(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.hold = true; });
    await accept(dialog); await page.waitForFunction(() => typeof window.probe.release === 'function');
    await page.evaluate(() => { window.probe.revoked = true; window.probe.release(); });
    await dialog.getByRole('alert').filter({ hasText: 'test-writer-not-authorized' }).waitFor();
    assert.equal((await queue(page)).inputs.length, 1); assert.equal((await state(page)).events.length, 0);
  },
  async failed_local_apply_reuses_exact_persisted_payload(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.failApply = true; });
    await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'test-apply-failed' }).waitFor();
    const first = (await queue(page)).inputs[0];
    await page.evaluate(() => { window.probe.failApply = false; });
    await accept(dialog); await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual((await queue(page)).inputs, [first]); assert.equal((await state(page)).applyCalls, 1);
  },
  async reload_retains_unacknowledged_checkpoint(page) {
    const dialog = await draft(page); await accept(dialog); await dialog.waitFor({ state: 'hidden' });
    const first = await queue(page);
    await page.reload(); await page.waitForFunction(() => window.probe?.ready);
    assert.deepEqual((await queue(page)).inputs, first.inputs);
    // Recovery is inspectable but not silently applied by this experimental harness.
    assert.equal((await state(page)).events.length, 0);
  },
  async denied_before_storage_retains_draft(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.revoked = true; });
    await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'test-writer-not-authorized' }).waitFor();
    assert.equal((await queue(page)).inputs.length, 0); assert.equal((await state(page)).enqueueCalls, 0);
  },
  async foreign_scope_and_mutated_id_rejected(page) {
    assert.equal(await page.evaluate(() => { try { window.probe.wrongScope(); } catch (error) { return error.message; } }), 'queue-scope-mismatch');
    const dialog = await draft(page); await accept(dialog); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.probe.changedRetry().then(() => 'accepted', error => error.message)), 'input-id-conflict');
    assert.equal((await queue(page)).inputs.length, 1);
  },
  async unapplied_input_blocks_transport_and_new_play(page) {
    await stageFailure(page); await blockedPrepare(page);
    const before = await queue(page);
    assert.equal(before.metadata.inputReceipts[before.inputs[0].inputId].localApplication, 'pending');
    assert.equal(await page.evaluate(() => window.probe.flush()), false);
    const rejection = await page.evaluate(() => window.probe.intake.accept({ ...window.probe.lastInput, id: crypto.randomUUID() })
      .then(() => 'accepted', error => error.message));
    assert.equal(rejection, 'local-application-review-required');
    assert.equal((await queue(page)).inputs.length, 1);
  },
  async explicit_recovery_replays_and_releases_barrier(page) {
    await stageFailure(page); await blockedPrepare(page);
    await page.evaluate(() => { window.probe.failApply = false; });
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('status').filter({ hasText: '기기 기록의 적용을 확인' }).waitFor();
    const saved = await queue(page);
    assert.equal(saved.metadata.inputReceipts[saved.inputs[0].inputId].localApplication, 'applied');
    assert.equal((await state(page)).events.length, 1);
    assert.equal(await page.evaluate(() => window.probe.state().history.length), 1);
    assert.equal(await page.evaluate(() => window.probe.prepare().then(() => 'prepared', error => error.message)), 'prepared');
    assert.equal(await page.evaluate(() => window.probe.commitCalls), 0);
  },
  async reload_pending_input_requires_explicit_recovery(page) {
    await stageFailure(page); const before = (await queue(page)).inputs;
    await page.reload(); await page.waitForFunction(() => window.probe?.ready);
    await panel(page).getByText('적용 확인 전 · 전송 차단', { exact: true }).waitFor();
    assert.equal((await state(page)).events.length, 0); await blockedPrepare(page);
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('status').waitFor();
    assert.deepEqual((await queue(page)).inputs, before);
    assert.equal((await state(page)).events.length, 1);
    assert.equal(await page.evaluate(() => window.probe.state().history.length), 1);
  },
  async confirmation_failure_recovers_without_duplicate_apply(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.failConfirm = true; });
    await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'test-confirm-failed' }).waitFor();
    assert.equal((await state(page)).applyCalls, 1); await blockedPrepare(page);
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.evaluate(() => { window.probe.failConfirm = false; });
    await panel(page).getByRole('button', { name: '복구 목록 새로고침', exact: true }).click();
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('status').waitFor();
    assert.equal((await state(page)).applyCalls, 1);
    assert.equal(await page.evaluate(() => window.probe.state().history.length), 1);
    assert.equal(await page.evaluate(() => window.probe.prepare().then(() => 'prepared', error => error.message)), 'prepared');
  },
  async recovery_conflict_keeps_barrier_and_current_state(page) {
    await stageFailure(page); await page.evaluate(() => { window.probe.failApply = false; window.probe.changeState(); });
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('alert').filter({ hasText: 'recovery-state-conflict' }).waitFor();
    assert.equal((await state(page)).events.length, 0); assert.equal((await state(page)).home, 1);
    await blockedPrepare(page); assert.equal((await queue(page)).inputs.length, 1);
  },
  async recovery_rechecks_authority(page) {
    await stageFailure(page); await page.evaluate(() => { window.probe.failApply = false; window.probe.revoked = true; });
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('alert').filter({ hasText: 'test-writer-not-authorized' }).waitFor();
    assert.equal((await state(page)).events.length, 0); await blockedPrepare(page);
  },
  async previously_applied_checkpoint_can_restore_after_reload(page) {
    const dialog = await draft(page); await accept(dialog); await dialog.waitFor({ state: 'hidden' });
    const original = (await queue(page)).inputs;
    await page.reload(); await page.waitForFunction(() => window.probe?.ready);
    await panel(page).getByText('기기 적용 확인 · 서버 미확정', { exact: true }).waitFor();
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('status').waitFor();
    assert.deepEqual((await queue(page)).inputs, original); assert.equal((await state(page)).events.length, 1);
  },
  async reload_blocks_new_input_until_latest_checkpoint_is_restored(page) {
    const first = await draft(page); await accept(first); await first.waitFor({ state: 'hidden' });
    const original = (await queue(page)).inputs;
    await page.reload(); await page.waitForFunction(() => window.probe?.ready);
    const stale = await draft(page); await accept(stale);
    await stale.getByRole('alert').filter({ hasText: 'recovery-required-before-input' }).waitFor();
    assert.deepEqual((await queue(page)).inputs, original);
    assert.equal((await state(page)).events.length, 0); assert.equal((await state(page)).enqueueCalls, 0);
    await stale.getByRole('button', { name: '닫기', exact: true }).click();
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('status').waitFor();
    const next = await draft(page, 'A', true); await accept(next); await next.waitFor({ state: 'hidden' });
    const saved = (await queue(page)).inputs;
    assert.equal(saved.length, 2); assert.deepEqual(saved[0], original[0]);
    const before = JSON.parse(saved[1].snapshot).before;
    assert.equal(before.events.length, 1); assert.equal(before.events[0].eventId, original[0].inputId);
    assert.equal((await state(page)).events.length, 2);
  },
  async uninterrupted_inputs_continue_from_latest_checkpoint(page) {
    const first = await draft(page); await accept(first); await first.waitFor({ state: 'hidden' });
    const second = await draft(page, 'A'); await accept(second); await second.waitFor({ state: 'hidden' });
    const saved = await queue(page);
    assert.deepEqual(saved.inputs.map(input => input.sequence), [1, 2]);
    assert.equal((await state(page)).events.length, 2);
    assert.equal(JSON.parse(saved.inputs[1].snapshot).before.events[0].eventId, saved.inputs[0].inputId);
    assert.equal(saved.metadata.inputReceipts[saved.inputs[1].inputId].localApplication, 'applied');
  },
  async partial_recovery_does_not_unlock_new_input(page) {
    const first = await draft(page); await accept(first); await first.waitFor({ state: 'hidden' });
    const second = await draft(page, 'A'); await accept(second); await second.waitFor({ state: 'hidden' });
    const original = (await queue(page)).inputs;
    await page.reload(); await page.waitForFunction(() => window.probe?.ready);
    const recoveryButtons = panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true });
    await recoveryButtons.nth(0).click(); await panel(page).getByRole('status').waitFor();
    assert.equal((await state(page)).events.length, 1);
    const stale = await draft(page, 'A'); await accept(stale);
    await stale.getByRole('alert').filter({ hasText: 'recovery-required-before-input' }).waitFor();
    assert.deepEqual((await queue(page)).inputs, original);
    await stale.getByRole('button', { name: '닫기', exact: true }).click();
    await recoveryButtons.nth(1).click(); await panel(page).getByRole('status').waitFor();
    assert.equal((await state(page)).events.length, 2);
    const third = await draft(page, 'C', true); await accept(third); await third.waitFor({ state: 'hidden' });
    const saved = (await queue(page)).inputs;
    assert.equal(saved.length, 3); assert.deepEqual(saved.slice(0, 2), original);
    assert.equal(JSON.parse(saved[2].snapshot).before.events.length, 2);
  },
  async cached_failed_attempt_cannot_bypass_latest_checkpoint(page) {
    const dialog = await draft(page);
    await page.evaluate(() => {
      window.restoreAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('Injected quota', 'QuotaExceededError'); };
    });
    await accept(dialog); await dialog.getByRole('alert').filter({ hasText: 'Injected quota' }).waitFor();
    await page.evaluate(async () => {
      IDBObjectStore.prototype.add = window.restoreAdd;
      await window.probe.intake.accept({ ...window.probe.lastInput, id: crypto.randomUUID() });
      window.probe.restoreBase();
    });
    const original = (await queue(page)).inputs;
    assert.equal(original.length, 1);
    assert.equal(await page.evaluate(() => window.probe.retry().then(() => 'accepted', error => error.message)), 'recovery-required-before-input');
    assert.deepEqual((await queue(page)).inputs, original);
    assert.equal((await state(page)).events.length, 0);
  },
  async ambient_updates_do_not_block_next_input(page) {
    const first = await draft(page); await accept(first); await first.waitFor({ state: 'hidden' });
    await page.evaluate(() => window.probe.changeAmbient());
    const next = await draft(page, 'A'); await accept(next); await next.waitFor({ state: 'hidden' });
    assert.equal((await state(page)).events.length, 2);
    const saved = (await queue(page)).inputs;
    const snapshot = JSON.parse(saved[1].snapshot);
    assert.equal(snapshot.checkpointVersion, 2);
    for (const key of ['matches', 'onlineViewerCount', 'scorerUid', 'scorerLockedAt', 'history']) {
      assert.equal(Object.hasOwn(snapshot.after, key), false, key);
    }
  },
  async ambient_updates_during_storage_are_preserved(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.hold = true; });
    await accept(dialog); await page.waitForFunction(() => typeof window.probe.release === 'function');
    await page.evaluate(() => { window.probe.changeAmbient(); window.probe.release(); });
    await dialog.waitFor({ state: 'hidden' });
    const current = await page.evaluate(() => window.probe.state());
    assert.equal(current.events.length, 1); assert.equal(current.onlineViewerCount, 73);
    assert.equal(current.scorerName, 'LOCAL_DISPLAY_CHANGED'); assert.equal(current.liveVideoUrl, 'LOCAL_AMBIENT_VIDEO');
    assert.equal(current.matches[0].notes, 'LOCAL_AMBIENT_NOTE');
    assert.equal(current.history.at(-1).onlineViewerCount, 73);
  },
  async recovery_keeps_latest_ambient_and_lease_metadata(page) {
    await stageFailure(page); await page.reload(); await page.waitForFunction(() => window.probe?.ready);
    await page.evaluate(() => window.probe.changeAmbient());
    const lease = await page.evaluate(() => window.probe.state().scorerLockedAt);
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('status').waitFor();
    const current = await page.evaluate(() => window.probe.state());
    assert.equal(current.events.length, 1); assert.equal(current.onlineViewerCount, 73);
    assert.equal(current.scorerLockedAt, lease); assert.equal(current.scorerName, 'LOCAL_DISPLAY_CHANGED');
    assert.equal(current.matches[0].notes, 'LOCAL_AMBIENT_NOTE');
  },
  async owner_change_is_not_ignored_as_ambient(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.hold = true; });
    await accept(dialog); await page.waitForFunction(() => typeof window.probe.release === 'function');
    await page.evaluate(() => { window.probe.changeOwner(); window.probe.release(); });
    await dialog.getByRole('alert').filter({ hasText: 'durable-intake-access-denied' }).waitFor();
    assert.equal((await state(page)).events.length, 0); await blockedPrepare(page);
  },
  async official_promotion_during_storage_blocks_application(page) {
    const dialog = await draft(page); await page.evaluate(() => { window.probe.hold = true; });
    await accept(dialog); await page.waitForFunction(() => typeof window.probe.release === 'function');
    await page.evaluate(() => { window.probe.promoteOfficial(); window.probe.release(); });
    await dialog.getByRole('alert').filter({ hasText: 'durable-intake-access-denied' }).waitFor();
    assert.equal((await state(page)).events.length, 0); await blockedPrepare(page);
  },
  async official_promotion_blocks_recovery(page) {
    await stageFailure(page); await page.evaluate(() => { window.probe.failApply = false; window.probe.promoteOfficial(); });
    await panel(page).getByRole('button', { name: '기록 복구 / 적용 확인', exact: true }).click();
    await panel(page).getByRole('alert').filter({ hasText: 'durable-intake-access-denied' }).waitFor();
    assert.equal((await state(page)).events.length, 0); await blockedPrepare(page);
  },
};
try {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const [viewport, size] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
    for (const [name, job] of Object.entries(jobs)) {
      const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
      const errors = [], blocked = [];
      await context.route('**/*', route => {
        if (route.request().url().startsWith(`${origin}/`) && route.request().method() === 'GET') return route.continue();
        blocked.push(route.request().url()); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(6000);
      page.on('pageerror', error => errors.push(error.message));
      let failure;
      try {
        await page.goto(origin); await page.waitForFunction(() => window.probe?.ready);
        await job(page); assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
        assert.equal((await state(page)).legacyCalls, 0);
      } catch (error) {
        failure = String(error.stack || error);
        await page.screenshot({ path: `${directory}/${viewport}-${name}.png` }).catch(() => {});
      } finally { await context.close(); }
      const result = { viewport, name, status: failure ? 'failed' : 'passed', failure, errors, blocked };
      results.push(result); console.log(JSON.stringify(result));
    }
  }
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  writeFileSync(`${directory}/summary.json`, JSON.stringify({ results, productionAccess: false,
    limitations: ['isolated reducer and fake auth, not production Provider', 'CSS excluded, no visual layout assertions', 'explicit recovery only, no automatic replay', 'no server RPC or physical device tests'] }, null, 2));
  console.log(`DURABLE_MODAL_E2E_OUTPUT=${directory}`);
}
if (results.some(result => result.status !== 'passed')) process.exitCode = 1;
