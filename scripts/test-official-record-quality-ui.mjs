import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Exercise the real public component, without authentication or network calls.
const vite = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: '.tmp/official-record-quality-ui-cache',
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { OfficialRecordQualityNotice } = await vite.ssrLoadModule('/src/shared/components/season/OfficialRecordQualityNotice.tsx');
  const render = (props = {}) => renderToStaticMarkup(createElement(OfficialRecordQualityNotice, props));
  await test('legacy, clean and unknown quality do not claim error resolution', () => {
    for (const quality of [undefined, null, 'CLEAN', 'FUTURE']) {
      assert.equal(render({ quality }), '');
    }
  });
  await test('pending notice preserves explicit error meaning and exposes review items', () => {
    const html = render({ quality: 'CORRECTION_PENDING', issues: [{ id: 'one', code: 'DETAIL_BATTER_TOTAL', message: '팀 12점 / 선수 득점 합계 6점', teamName: '테스트 팀' }] });
    assert.match(html, /오류 수정 중/);
    assert.match(html, /수치를 임의로 보정하지 않습니다/);
    assert.match(html, /확인 중인 항목 1건 보기/);
    assert.match(html, /테스트 팀/);
    assert.match(html, /팀 12점 \/ 선수 득점 합계 6점/);
    assert.match(html, /<summary>/);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /오류 해결/);
  });
  await test('source and manual resolutions retain their distinct provenance', () => {
    assert.match(render({ quality: 'RESOLVED', resolutionSource: 'MANUAL' }), /관리자가 수정한 기록/);
    assert.match(render({ quality: 'RESOLVED', resolutionSource: 'SOURCE' }), /UniquePlay 재동기화/);
    assert.match(render({ quality: 'RESOLVED' }), /오류 해결/);
    assert.doesNotMatch(render({ quality: 'RESOLVED' }), /관리자가 수정한 기록/);
  });
  await test('resolved time renders in KST and invalid time is omitted', () => {
    for (const resolvedAt of ['2026-09-05T00:20:00Z', '2026-09-05T09:20:00']) {
      const html = render({ quality: 'RESOLVED', resolvedAt });
      assert.match(html, /09:20/);
      assert.match(html, /KST/);
    }
    assert.doesNotMatch(render({ quality: 'RESOLVED', resolvedAt: 'invalid' }), /KST|invalid/);
  });
  await test('public review text is escaped and retained issues are labelled resolved', () => {
    const html = render({ quality: 'RESOLVED', issues: [{ id: 'one', code: 'DETAIL_BATTER_TOTAL', message: '<script>not markup</script>', teamName: '<b>team</b>' }] });
    assert.match(html, /해결된 항목 1건 보기/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>|<b>team/);
  });
} finally {
  await vite.close();
}
