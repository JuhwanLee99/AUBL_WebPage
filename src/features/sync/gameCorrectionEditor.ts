import type { OfficialGameDetail } from '../../core/api/backendClient';
import type { GameCorrectionChange, GameCorrectionSection, GameCorrectionValue } from '../../core/contracts/uniquePlayGameReview';

export interface CorrectionSelection {
  teamName: string;
  section: GameCorrectionSection;
  rowKey?: string;
  inning?: number;
  field: string;
}

export const correctionFields: Record<GameCorrectionSection, Array<{ key: string; label: string }>> = {
  innings: [{ key: 'runs', label: '이닝 득점' }, { key: 'notPlayed', label: '미진행(X)' }],
  // Final game scores remain under the existing result/conflict workflow.
  totals: [{ key: 'hits', label: '팀 안타' }, { key: 'errors', label: '팀 실책' }, { key: 'walks', label: '팀 볼넷' }],
  batters: [
    { key: 'atBats', label: '타수' }, { key: 'hits', label: '안타' }, { key: 'rbi', label: '타점' },
    { key: 'stolenBases', label: '도루' }, { key: 'runs', label: '득점' },
    { key: 'battingAverage', label: '경기 타율' },
  ],
  pitchers: [
    { key: 'inningsPitched', label: '투구 이닝(예: 1.2)' }, { key: 'hitsAllowed', label: '피안타' },
    { key: 'runsAllowed', label: '실점' }, { key: 'earnedRuns', label: '자책점' },
    { key: 'walksAndHitByPitch', label: '4사구' }, { key: 'strikeouts', label: '탈삼진' }, { key: 'era', label: '방어율' },
  ],
};

export function selectedCorrectionValue(detail: OfficialGameDetail, selection: CorrectionSelection): GameCorrectionValue {
  const team = detail.teams.find(team => team.teamName === selection.teamName);
  if (!team) throw new Error('선택한 팀을 찾을 수 없습니다.');
  let record: object | undefined;
  if (selection.section === 'totals') record = team.totals;
  else if (selection.section === 'innings') record = team.innings.find(row => row.inning === selection.inning);
  else record = team[selection.section].find(row => row.rowKey === selection.rowKey)?.stats;
  if (!record || !Object.hasOwn(record, selection.field)) throw new Error('선택한 기록을 찾을 수 없습니다.');
  return (record as Record<string, GameCorrectionValue>)[selection.field];
}

export function buildCorrectionChanges(detail: OfficialGameDetail, selection: CorrectionSelection, input: string): GameCorrectionChange[] {
  if (!correctionFields[selection.section]?.some(field => field.key === selection.field)) throw new Error('직접 수정할 수 없는 항목입니다.');
  const expectedValue = selectedCorrectionValue(detail, selection);
  const text = input.trim();
  let value: GameCorrectionValue;
  if (selection.field === 'notPlayed') {
    if (text !== 'true' && text !== 'false') throw new Error('미진행 여부를 선택해 주세요.');
    value = text === 'true';
  } else if (selection.field === 'inningsPitched') {
    if (text && !/^\d{1,2}(?:\.[012])?$/.test(text)) throw new Error('투구 이닝은 1, 1.1, 1.2처럼 입력해 주세요.');
    value = text || null;
  } else if (!text) {
    value = null;
  } else {
    const average = selection.field === 'battingAverage';
    const decimal = average || selection.field === 'era';
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) throw new Error('0 이상의 숫자를 입력해 주세요.');
    const number = Number(text);
    if (!Number.isFinite(number) || number > (average ? 1 : 999) || (!decimal && !Number.isInteger(number))) {
      throw new Error(average ? '타율은 0~1 범위로 입력해 주세요.' : '기록 수치의 범위와 정수 여부를 확인해 주세요.');
    }
    value = number;
  }
  const changes: GameCorrectionChange[] = [{ ...selection, expectedValue, value }];
  const companion = (field: string, value: GameCorrectionValue) => {
    const paired = { ...selection, field };
    changes.push({ ...paired, expectedValue: selectedCorrectionValue(detail, paired), value });
  };
  if (selection.field === 'inningsPitched') {
    const [whole, fraction = '0'] = String(value ?? '').split('.');
    companion('outs', value === null ? null : Number(whole) * 3 + Number(fraction));
  } else if (selection.section === 'innings' && selection.field === 'notPlayed' && value === true) {
    companion('runs', null);
  } else if (selection.section === 'innings' && selection.field === 'runs' && value !== null) {
    companion('notPlayed', false);
  }
  return changes.filter(change => !Object.is(change.expectedValue, change.value));
}
