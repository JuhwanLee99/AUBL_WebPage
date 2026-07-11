import fs from 'node:fs';
import path from 'node:path';

const DIST_DIR = path.resolve('dist');
const BASE_URL = (process.env.OG_BASE_URL || 'https://aubl.club').replace(/\/$/, '');
const DEFAULT_IMAGE = `${BASE_URL}/assets/aubl_clean.png`;

const ROUTES = [
  { route: '/', title: 'AUBL - 아마추어 대학 야구 리그', description: '전국대학아마추어야구연합회(AUBL) 공식 웹사이트. 공지, 일정, 기록, 팀 정보와 커뮤니티를 확인하세요.' },
  { route: '/intro', title: '리그 소개 | AUBL', description: 'AUBL 리그 소개와 운영 구조, 역사, 참가 정보를 확인하세요.' },
  { route: '/rules', title: '회칙 | AUBL', description: '전국대학아마추어야구연합회 회칙을 확인하세요.' },
  { route: '/intro/teams', title: '참가팀 · 조편성 | AUBL', description: 'AUBL 참가팀과 조편성 정보를 확인하세요.' },
  { route: '/teams', title: '팀 허브 | AUBL', description: 'AUBL 팀별 페이지, 공지, 로스터, 기록 정보를 확인하세요.' },
  {
    route: '/allstar',
    title: '2026 AUBL 올스타전 팬 투표 | AUBL',
    description: '2026 AUBL 올스타와 루키 후보를 확인하고 포지션별 팬 투표에 참여하세요.',
    image: `${BASE_URL}/assets/allstar-og.png`,
    imageWidth: '1733',
    imageHeight: '907',
  },
  { route: '/standings', title: '순위 | AUBL', description: 'AUBL 리그 순위와 팀 성적 정보를 확인하세요.' },
  { route: '/standings/power-ranking', title: '파워랭킹 | AUBL', description: 'AUBL 파워랭킹을 확인하세요.' },
  { route: '/schedule', title: '경기 일정 | AUBL', description: 'AUBL 경기 일정과 진행 상태를 확인하세요.' },
  { route: '/schedule/live', title: '실시간 일정 | AUBL', description: 'AUBL 실시간 경기 일정 정보를 확인하세요.' },
  { route: '/schedule/results', title: '경기 결과 | AUBL', description: 'AUBL 종료 경기 결과를 확인하세요.' },
  { route: '/schedule/groups', title: '조별 일정 | AUBL', description: 'AUBL 조별 경기 일정을 확인하세요.' },
  { route: '/records', title: '기록실 | AUBL', description: 'AUBL 팀/선수 기록과 리더보드를 확인하세요.' },
  { route: '/records/pitchers', title: '투수 기록 | AUBL', description: 'AUBL 투수 기록을 확인하세요.' },
  { route: '/records/batters', title: '타자 기록 | AUBL', description: 'AUBL 타자 기록을 확인하세요.' },
  { route: '/records/player', title: '선수 상세 | AUBL', description: 'AUBL 선수 상세 기록을 확인하세요.' },
  { route: '/community', title: '커뮤니티 | AUBL', description: 'AUBL 공지, 건의/문의, 선수 등록 게시판을 확인하세요.' },
  { route: '/community/notices', title: '공지사항 | AUBL', description: 'AUBL 커뮤니티 공지사항을 확인하세요.' },
  { route: '/community/inquiry', title: '건의/문의 | AUBL', description: 'AUBL 건의/문의 게시판을 확인하세요.' },
  { route: '/community/player-registration', title: '선수 등록 게시판 | AUBL', description: 'AUBL 선수 등록/유니폼 등록 게시판을 확인하세요.' },
  { route: '/prediction', title: '승부예측 | AUBL', description: 'AUBL 승부예측 페이지를 확인하세요.' },
  { route: '/manual', title: '사용설명서 | AUBL', description: 'AUBL 웹/앱 사용설명서를 확인하세요.' },
  { route: '/privacy', title: '개인정보처리방침 | AUBL', description: 'AUBL 개인정보처리방침을 확인하세요.' },
  { route: '/terms', title: '이용약관 | AUBL', description: 'AUBL 이용약관을 확인하세요.' },
  { route: '/account-deletion', title: '계정 삭제 안내 | AUBL', description: 'AUBL 계정 삭제 절차를 확인하세요.' },
  { route: '/login', title: '로그인 | AUBL', description: 'AUBL 로그인 페이지입니다.' },
  { route: '/draw', title: '조추첨 | AUBL', description: 'AUBL 조추첨 페이지입니다.' },
];

function replaceMeta(html, attr, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(<meta\\s+${attr}="${escaped}"[\\s\\S]*?content=")([^"]*)("([\\s]*?)\\/?>)`, 'i');
  return html.replace(pattern, `$1${value}$3`);
}

function replaceLinkCanonical(html, value) {
  return html.replace(/(<link\s+rel="canonical"\s+href=")([^"]*)(" ?\/?>)/i, `$1${value}$3`);
}

function replaceTitle(html, value) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${value}</title>`);
}

function normalizeRoute(route) {
  if (route === '/') return '/';
  return route.endsWith('/') ? route.slice(0, -1) : route;
}

function routeUrl(route) {
  const normalized = normalizeRoute(route);
  return normalized === '/' ? `${BASE_URL}/` : `${BASE_URL}${normalized}`;
}

function applyRouteMeta(template, { route, title, description, image = DEFAULT_IMAGE, imageWidth = '957', imageHeight = '895' }) {
  let html = template;
  const url = routeUrl(route);
  html = replaceTitle(html, title);
  html = replaceLinkCanonical(html, url);
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:url', url);
  html = replaceMeta(html, 'property', 'og:image', image);
  html = replaceMeta(html, 'property', 'og:image:width', imageWidth);
  html = replaceMeta(html, 'property', 'og:image:height', imageHeight);
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', image);
  return html;
}

function writeRouteHtml(template, entry) {
  const route = normalizeRoute(entry.route);
  const html = applyRouteMeta(template, entry);
  if (route === '/') {
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
    return;
  }
  const outDir = path.join(DIST_DIR, route.slice(1));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
}

function main() {
  const rootIndex = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(rootIndex)) {
    throw new Error(`Missing build output: ${rootIndex}`);
  }
  const template = fs.readFileSync(rootIndex, 'utf8');
  for (const entry of ROUTES) {
    writeRouteHtml(template, entry);
  }
  console.log(`[generate-og-pages] generated ${ROUTES.length} route html files.`);
}

main();
