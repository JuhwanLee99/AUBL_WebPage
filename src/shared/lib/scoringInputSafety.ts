import type { ErrorDetails } from '../state/demoStore';

type Context = { outs: number; bases: (string | null)[]; balls: number; strikes: number };

export function sacrificeInputIssue(state: Pick<Context, 'outs' | 'bases'>, kind: 'fly' | 'bunt'): string | null {
  if (state.outs >= 2) return '2아웃에서는 희생타로 기록할 수 없습니다. 실제 타자 결과를 선택하세요.';
  if (!state.bases.some(Boolean)) return '주자 없는 희생타는 기록할 수 없습니다.';
  if (kind === 'fly' && !state.bases[2]) return '현재 희생플라이 입력은 3루 주자의 득점만 지원합니다. 다른 주자의 득점은 복합 플레이 확인이 필요합니다.';
  return null;
}

export function droppedThirdStrikeInputIssue(state: Pick<Context, 'outs' | 'bases'>): string | null {
  return state.outs < 2 && state.bases[0]
    ? '무사·1사에 1루 주자가 있으면 낫아웃 출루가 불가능합니다. 삼진 아웃과 주자 결과를 기록하세요.' : null;
}

export function multipleOutInputIssue(state: Pick<Context, 'outs' | 'bases'>, outs: number, selected?: number[]): string | null {
  if (state.outs + outs > 3) return '남은 아웃 수보다 많은 병살·삼중살은 기록할 수 없습니다.';
  if (state.bases.filter(Boolean).length < outs - 1) return '병살·삼중살에 필요한 주자가 없습니다.';
  if (selected && (selected.length !== outs - 1 || new Set(selected).size !== selected.length ||
    selected.some((index) => !Number.isInteger(index) || index < 0 || index > 2 || !state.bases[index]))) {
    return '아웃될 주자 수와 출발 루를 다시 확인하세요.';
  }
  return null;
}

// The old forms do not carry force/tag/appeal timing. Do not guess a score.
export function legacyThirdOutIssue(outs: number, runs: number): string | null {
  if (outs > 3) return '남은 아웃 수를 초과했습니다.';
  return outs === 3 && runs > 0
    ? '제3아웃과 홈 도달이 함께 있습니다. 기존 입력에는 순서·아웃 종류가 없어 저장하지 않습니다. 구조화된 주루 패널 또는 복합 플레이 정정이 필요합니다.' : null;
}

export function miscPlayKind(errorType: string): 'wp' | 'pb' | 'balk' | 'error' {
  if (/WP|폭투/i.test(errorType)) return 'wp';
  if (/PB|포일|패스트볼|패스볼/i.test(errorType)) return 'pb';
  if (/BK|보크/i.test(errorType)) return 'balk';
  return 'error';
}

export function miscPlayInputIssue(state: Context, details: Pick<ErrorDetails, 'errorType' | 'pitchResult' | 'advanceResults' | 'extraCalls'>): string | null {
  const kind = miscPlayKind(details.errorType);
  if (kind === 'error') return null;
  if (details.extraCalls?.length) return '폭투·포일·보크와 추가 방해 판정의 동시 처리는 복합 플레이 입력이 필요합니다.';
  const batter = details.advanceResults.batter;
  const result = details.pitchResult;
  if (kind === 'balk') {
    if (!state.bases.some(Boolean)) return '주자 없는 반칙 투구는 보크로 기록하지 않습니다.';
    if (batter !== 'hold' || result) return '보크의 기본 입력은 투구 없이 타자를 유지합니다. 플레이 선택권이 있는 상황은 별도 확인이 필요합니다.';
  } else {
    if (result !== 'ball' && result !== 'strike') return '폭투·포일의 투구 결과를 선택하세요.';
    if (result === 'strike' && state.strikes >= 2) return '제3스트라이크와 폭투·포일의 결합은 아직 이 입력에서 지원하지 않습니다. 삼진·출루·수비 처리의 복합 판정이 필요합니다.';
    if (result === 'ball' && state.balls >= 3) {
      if (batter !== 1) return '4구째 폭투·포일은 타자 1루를 선택하세요. 타자의 추가 진루·아웃은 복합 플레이 입력이 필요합니다.';
      let forced = true;
      for (let i = 0; i < 3; i++) {
        forced = forced && Boolean(state.bases[i]);
        const move = details.advanceResults.runners[i as 0 | 1 | 2];
        if (forced && !(move === 'advance' || move === 'score' || (typeof move === 'number' && move >= i + 2))) {
          return '볼넷으로 밀려나는 모든 주자의 안전진루를 입력하세요.';
        }
      }
    } else if (batter !== 'hold') return '타석이 끝나지 않은 폭투·포일은 타자 유지를 선택하세요.';
  }
  let advanced = false;
  for (let i = 0; i < 3; i++) {
    if (!state.bases[i]) continue;
    const move = details.advanceResults.runners[i as 0 | 1 | 2];
    if (move === 'out') return '폭투·포일·보크와 주자 아웃의 원인·순서는 복합 플레이 확인이 필요합니다.';
    const target = move === 'score' ? 4 : move === 'advance' ? i + 2 : typeof move === 'number' ? move : i + 1;
    if (kind === 'balk' && target !== i + 2) return '기본 보크 입력에서는 모든 주자에게 한 베이스씩 진루권을 적용하세요.';
    if (target > i + 1) advanced = true;
  }
  if (!advanced && kind !== 'balk') return '주자의 추가 진루가 없는 투구는 일반 볼·스트라이크로 기록하세요.';
  if (kind !== 'balk' && result === 'ball' && state.balls >= 3) {
    let forced = true;
    let extra = false;
    for (let i = 0; i < 3; i++) {
      forced = forced && Boolean(state.bases[i]);
      if (!state.bases[i]) continue;
      const move = details.advanceResults.runners[i as 0 | 1 | 2];
      const target = move === 'score' ? 4 : move === 'advance' ? i + 2 : typeof move === 'number' ? move : i + 1;
      if (target > i + 1 + (forced ? 1 : 0)) extra = true;
    }
    if (!extra) return '볼넷의 안전진루만 발생했습니다. 폭투·포일을 추가하지 말고 일반 볼넷으로 기록하세요.';
  }
  return null;
}
