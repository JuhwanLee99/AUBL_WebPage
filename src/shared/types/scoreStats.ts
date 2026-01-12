export type BatterStatLine = {
  name: string;
  pos?: string;
  order?: number | null;
  status?: 'out';
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
};

export type PitcherStatLine = {
  name: string;
  pos?: string;
  bf: number;
  pitches: number;
  strikes: number;
  balls: number;
  outs: number;
  h: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  appearanceOrder?: number | null;
  appearanceLabel?: string;
};

export type RemovedPlayerEntry = {
  name: string;
  pos?: string;
  number?: string;
};