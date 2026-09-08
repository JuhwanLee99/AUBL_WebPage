import { normalizeRunnerPlay } from './runnerPlayEngine.ts';
import type { RunnerPlayRecord } from './runnerPlayEngine.ts';

type EventIdentity = { inning: number; half: 'top' | 'bottom'; eventId?: string };
const key = (event: EventIdentity) => JSON.stringify([event.inning, event.half, event.eventId]);

/** One normalized source per event. Missing responsibility never falls back to the reliever. */
export function createStructuredRunnerIndex(events: (EventIdentity & { runnerPlay?: RunnerPlayRecord; manualResolve?: { required: boolean } })[]) {
  const records = new Map<string, RunnerPlayRecord>();
  const conflicts = new Set<string>();
  for (const event of events) {
    if (!event.eventId || event.manualResolve?.required) continue;
    const record = normalizeRunnerPlay(event.runnerPlay);
    if (!record) continue;
    const id = key(event), previous = records.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) conflicts.add(id);
    records.set(id, record);
  }
  const get = (event: EventIdentity) => event.eventId && !conflicts.has(key(event)) ? records.get(key(event)) : undefined;
  const appliedMoves = new Set<string>();
  return {
    get,
    takeMovement(event: EventIdentity, runnerId: string) {
      const record = get(event);
      const move = record?.movements.find((item) => item.runnerId === runnerId);
      if (!move) return undefined;
      const id = JSON.stringify([key(event), move.from]);
      if (appliedMoves.has(id)) return { duplicate: true as const, move };
      appliedMoves.add(id);
      return { duplicate: false as const, move };
    },
  };
}
