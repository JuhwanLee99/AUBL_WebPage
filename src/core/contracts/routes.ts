export const ROUTES = {
  login: '/login',
  scorekeeper: '/scorekeeper',
  scoreboard: '/scoreboard',
  scoreboardText: '/scoreboard-text',
  liveOverlay: '/live-overlay',
  admin: '/admin',
  scheduleManage: '/schedule/manage',
} as const;

export const EMBEDDED_LOGIN_QUERY = {
  embedded: 'flutter',
  nativeGoogle: '1',
} as const;
