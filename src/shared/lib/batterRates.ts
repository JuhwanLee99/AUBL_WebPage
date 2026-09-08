type BatterRateInput = {
  ab: number;
  h: number;
  bb: number;
  hbp: number;
  sac: number;
  sh?: number;
  sf?: number;
};

type BatterRateView = {
  sh: number | null;
  sf: number | null;
  obp: number | null;
  status: '산출 가능' | '희생 구분 미확정' | '분모 없음' | '기록 오류';
};

const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

// KBO 9.21(f): SH and interference are excluded from the OBP denominator.
// Missing legacy SH/SF counts must not silently turn every sacrifice into SF.
export function batterRateView(line: BatterRateInput): BatterRateView {
  const sh = line.sh ?? 0;
  const sf = line.sf ?? 0;
  if (![line.ab, line.h, line.bb, line.hbp, line.sac, sh, sf].every(isCount) || line.h > line.ab) {
    return { sh: null, sf: null, obp: null, status: '기록 오류' };
  }
  if (sh + sf !== line.sac) {
    return { sh: null, sf: null, obp: null, status: '희생 구분 미확정' };
  }
  const denominator = line.ab + line.bb + line.hbp + sf;
  return {
    sh,
    sf,
    obp: denominator > 0 ? (line.h + line.bb + line.hbp) / denominator : null,
    status: denominator > 0 ? '산출 가능' : '분모 없음',
  };
}
