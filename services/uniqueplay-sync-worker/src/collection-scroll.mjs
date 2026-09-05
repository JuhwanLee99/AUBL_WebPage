// Self-contained so Playwright can serialize it into the provider page. It only
// inspects public date/header anchors and scroll geometry, never account data.
export function scrollCollectionDom({ kind = 'games', anchor, expectedHeaders = [], inspectOnly = false } = {}) {
  const normalize = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').replace(/[▲▼]/gu, '').trim();
  const all = [...document.querySelectorAll('*')];
  const documentScroller = document.scrollingElement;
  const findScroller = (start) => {
    let fittedSurface = null;
    for (let node = start; node; node = node.parentElement) {
      if (node === documentScroller) break;
      // Visible text overflow is NOT a scroll surface (e.g. a 192px game card
      // with 214px of content). Keep climbing to the real auto/scroll list.
      if (node.clientHeight > 0 && /^(auto|scroll|overlay)$/u.test(getComputedStyle(node).overflowY)) {
        if (node.scrollHeight > node.clientHeight + 2) return node;
        // Horizontal-only wrappers may compute overflow-y:auto as well. They
        // must not hide an outer vertical list with more rows still to load.
        fittedSurface ||= node;
      }
    }
    if (documentScroller?.clientHeight > 0
      && !/^(hidden|clip)$/u.test(getComputedStyle(documentScroller).overflowY)
      && !/^(hidden|clip)$/u.test(getComputedStyle(document.body).overflowY)) {
      if (documentScroller.scrollHeight > documentScroller.clientHeight + 2) return documentScroller;
      fittedSurface ||= documentScroller;
    }
    return fittedSurface;
  };

  let anchors;
  if (kind === 'table') {
    const header = all.find((node) => normalize(node.textContent) === anchor && node.children.length <= 1
      && expectedHeaders.every((value, index) => normalize(node.parentElement?.children[index]?.textContent) === value));
    if (!header) return { advanced: false, atEnd: false, reason: 'TABLE_SCROLL_ANCHOR_MISSING' };
    anchors = [header.parentElement?.parentElement];
  } else {
    const datePattern = /^\d{2}\/\d{2}\s+\S+\s+\d{2}:\d{2}$/u;
    anchors = all.filter((node) => node.children.length === 0 && datePattern.test(normalize(node.textContent)));
  }

  const candidates = new Map();
  for (const anchorNode of anchors) {
    const scroller = findScroller(anchorNode?.parentElement);
    if (scroller) candidates.set(scroller, (candidates.get(scroller) || 0) + 1);
  }
  const target = [...candidates.entries()].sort((left, right) => right[1] - left[1]
    || (right[0].scrollHeight - right[0].clientHeight) - (left[0].scrollHeight - left[0].clientHeight))[0]?.[0];
  if (!target) {
    // A genuinely empty, non-scrollable schedule is allowed. A list with cards
    // but no usable surface is not proof that the collection reached its end.
    return { advanced: false, atEnd: anchors.length === 0, reason: anchors.length ? 'SCROLL_SURFACE_MISSING' : null };
  }
  const before = target.scrollTop;
  if (!inspectOnly) {
    target.scrollTo({ top: Math.min(target.scrollHeight - target.clientHeight,
      before + Math.max(kind === 'table' ? 180 : 300, Math.floor(target.clientHeight * 0.8))), behavior: 'instant' });
  }
  return {
    advanced: target.scrollTop > before,
    atEnd: target.scrollTop + target.clientHeight >= target.scrollHeight - 2,
    top: target.scrollTop, height: target.clientHeight, total: target.scrollHeight,
    reason: null,
  };
}

export function reachedCollectionEnd(result) {
  // Boolean adapters remain supported for deterministic collector fixtures.
  return typeof result === 'boolean' ? !result : result?.atEnd === true && result.advanced === false;
}
