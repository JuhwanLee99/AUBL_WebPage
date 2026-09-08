import { readinessScenarios, readinessInput } from './readiness-scenarios.mjs';
import { resolveCompositePlay } from '../../../src/shared/lib/compositePlayEngine.ts';
import { resolveCompositePlay as resolveLegacy } from '../../../src/shared/lib/compositePlayEngine.v1.ts';
export const integrityFixtures = [
  { id: 'valid', review: false }, { id: 'legacy-force', review: true }, { id: 'tampered', review: true },
  { id: 'missing', review: true }, { id: 'pending', review: true }, { id: 'conflict', review: true },
  { id: 'preferred-manual', review: false }, { id: 'unsupported', review: true },
];
export function integrityEvents(id) {
  const input = readinessInput(readinessScenarios.find(s => s.id === 'Q15'));
  input.id = 'SECRET_AUDIT_EVENT';
  const resolved = resolveCompositePlay(input.expected, input);
  if (!resolved.ok) throw new Error(JSON.stringify(resolved));
  const base = { eventId: input.id, inning: 1, half: 'top', order: 1, pitch: 1, batter: 'B', type: 'composite', runners: [], compositePlay: resolved.record };
  if (id === 'valid') return [base];
  if (id === 'legacy-force') {
    const oldInput = readinessInput(readinessScenarios.find(s => s.id === 'Q02')); oldInput.id = input.id;
    const old = resolveLegacy(oldInput.expected, oldInput);
    if (!old.ok) throw new Error(JSON.stringify(old));
    return [{ ...base, compositePlay: old.record }];
  }
  if (id === 'missing') return [{ ...base, compositePlay: undefined }];
  if (id === 'pending') return [{ ...base, manualResolve: { required: true, reasons: ['SECRET_PENDING_REASON'] } }];
  if (id === 'unsupported') return [{ ...base, compositePlay: { ...resolved.record, version: 99 } }];
  const changed = { ...base, compositePlay: { ...resolved.record, runs: 99 } };
  if (id === 'tampered') return [changed];
  if (id === 'conflict') return [base, changed];
  if (id === 'preferred-manual') return [{ ...changed, source: { kind: 'text_feed_rebuild' } }, { ...base, source: { kind: 'manual' } }];
  throw new Error('Unknown local integrity fixture: ' + id);
}
