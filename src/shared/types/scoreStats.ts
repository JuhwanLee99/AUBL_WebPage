import type { EarnedRunsStatus } from '../lib/earnedRuns.ts';

export type BatterStatLine = {
  name: string;
  pos?: string;
  order?: number | null;
  status?: 'out' | '대수비' | '대타' | '대주자';
  isElite?: boolean;
  pa: number;
  ab: number;
  h: number;
  tb?: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  ibb?: number;
  ci: number;
  fc: number;
  hbp: number;
  so: number;
  sac: number;
  sh?: number;
  sf?: number;
  sb?: number;
  cs?: number;
  gdp?: number;
  r: number;
  rbi: number;
};

export type PitcherStatLine = {
  name: string;
  pos?: string;
  status?: 'out' | '대수비';
  isElite?: boolean;
  bf: number;
  ab?: number;
  pitches: number;
  strikes: number;
  balls: number;
  outs: number;
  h: number;
  hr: number;
  bb: number;
  ibb?: number;
  hbp: number;
  so: number;
  r: number;
  er: number;
  wp?: number;
  bk?: number;
  sh?: number;
  sf?: number;
  earnedRunsStatus?: EarnedRunsStatus;
  appearanceOrder?: number | null;
  appearanceLabel?: string;
};

export type RemovedPlayerEntry = {
  name: string;
  pos?: string;
  number?: string;
};
