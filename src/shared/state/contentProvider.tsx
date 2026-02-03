import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, increment, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase/client';
import { TEAM_GROUPS } from '../lib/teamGroups';
import type { GroupLetter } from '../lib/teamGroups';
import { DEFAULT_RULE_CHAPTERS, DEFAULT_RULE_HOST_ORDER } from '../content/defaultRules';

export type HistoryHighlight = { title: string; desc: string; accent: string };
export type GovernanceItem = { label: string; value: string; detail: string };
export type StructureCard = { title: string; points: string[] };
export type PostseasonMatch = { title: string; matchups: string[] };
export type HeroMetric = { label: string; value: string; note: string };

export type IntroContent = {
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  historyHighlights: HistoryHighlight[];
  governance: GovernanceItem[];
  structureCards: StructureCard[];
  postseasonMatches: PostseasonMatch[];
  heroMetrics: HeroMetric[];
};

export type LandingValueProp = { title: string; desc: string; icon: string };
export type LandingSnapshotCard = { label: string; value: string; desc: string };
export type LandingSeasonHighlight = { title: string; desc: string; icon: string; link: string };

export type LandingContent = {
  heroEyebrow: string;
  heroBadgeText: string;
  heroTitle: string;
  heroDescription: string;
  heroSubDescription: string;
  valueProps: LandingValueProp[];
  snapshotCards: LandingSnapshotCard[];
  seasonHighlights: LandingSeasonHighlight[];
};

export type RuleArticle = { title: string; body: string[] };
export type RuleChapter = { id: string; title: string; accent: string; articles: RuleArticle[] };
export type RulesContent = {
  headerBadge: string;
  headerTitle: string;
  headerDescription: string;
  chapters: RuleChapter[];
  hostOrder: string[];
  appendixText: string;
};

export type TeamContentEntry = { name: string; group: GroupLetter };
export type TeamsContent = {
  pageBadge: string;
  pageTitle: string;
  pageDescription: string;
  pageNote: string;
  entries: TeamContentEntry[];
};

export type ContentState = {
  tickerItems: string[];
  landing: LandingContent;
  intro: IntroContent;
  rules: RulesContent;
  teams: TeamsContent;
};

const DEFAULT_LANDING: LandingContent = {
  heroEyebrow: '46TH AUBL · HOSTED BY CHUNG-ANG UNIVERSITY (SEOUL)',
  heroBadgeText: '전국대학아마추어야구연합회 · SINCE 1981',
  heroTitle: '그라운드 위의 지성,\n멈추지 않는 열정.',
  heroDescription:
    '2026 제46회 전국대학아마추어야구연합회(AUBL). 대한민국 유일의 순수 대학 아마추어 야구 리그에서\n40개 대학 2,000여 명의 선수가 써 내려가는 각본 없는 드라마가 지금 시작됩니다.',
  heroSubDescription: '중앙대학교(서울)가 주최하는 2026 시즌 — 실시간 기록과 중계, 디지털화를 핵심 가치로 리그의 새로운 도약을 준비했습니다.',
  valueProps: [
    {
      title: 'Pure Amateurism',
      desc: '엘리트 선수 출신이 아닌 순수 일반 대학생만 참가. 승리보다 값진 땀방울을 지향합니다.',
      icon: '🧢',
    },
    {
      title: 'National Scale',
      desc: '1981년 창설 이후 45년, 수도권을 중심으로 40여 개 대학이 함께하는 국내 최대 대학 야구 리그입니다.',
      icon: '🗺️',
    },
    {
      title: 'Student Governance',
      desc: '기획·운영·심판·기록까지 학생이 주도하는 자치 리그. 실시간 기록과 중계로 모두가 같은 정보를 공유합니다.',
      icon: '🎓',
    },
  ],
  snapshotCards: [
    {
      label: '2026 HOST',
      value: '중앙대학교(서울)',
      desc: '46주년 시즌 운영 전권을 맡은 호스트 대학',
    },
    {
      label: 'FORMAT',
      value: 'A~H조 8개 조 / 약 40팀',
      desc: '조별 예선 후 으뜸·버금 이원화 토너먼트로 최강자를 가립니다.',
    },
    {
      label: 'VISION',
      value: '실시간 기록 · 중계 · 디지털화',
      desc: '웹 플랫폼 기반 실시간 기록과 중계로 리그 소식을 즉시 전달하는 2026 시즌',
    },
  ],
  seasonHighlights: [
    {
      title: '리그 규정 (Rulebook)',
      desc: '7이닝 경기, 5회 10점·6회 7점 콜드, 무단 불참 시 1년 출전 정지 등 최신 개정안을 반영했습니다.',
      icon: '📘',
      link: '/intro',
    },
    {
      title: '기록실 (Stats)',
      desc: '타율·방어율·홈런부터 TQB까지. 2026 시즌 최고의 팀과 선수를 데이터로 확인하세요.',
      icon: '📊',
      link: '/records',
    },
    {
      title: '팀 소개 (Teams)',
      desc: '중앙대, 연세대, 고려대, 한양대 등 40개 참가 팀의 프로필과 조 편성을 한눈에 모았습니다.',
      icon: '🏅',
      link: '/intro',
    },
  ],
};

const DEFAULT_INTRO: IntroContent = {
  tagline: 'AUBL · LEAGUE INTRO',
  heroTitle: '순수 아마추어 대학 야구의 46년 — 2026년, 중앙대학교(서울)와 함께 새로운 도약을 준비합니다.',
  heroSubtitle: '46th Amateur University Baseball League · Hosted by Chung-Ang University (Seoul)',
  heroDescription:
    '1981년 출범한 전국대학아마추어야구연합회(AUBL)는 엘리트 선수 중심이 아닌 일반 대학생들의 땀방울로 성장했습니다. 2026 시즌은 중앙대학교(서울)가 주최를 맡아 조별 예선과 으뜸·버금 토너먼트를 통해 리그의 전통과 혁신을 모두 보여줄 예정입니다.',
  historyHighlights: [
    {
      title: 'Since 1981',
      desc: '1981년 대학생들의 작은 교류전으로 출발해 45년을 이어온 국내 유일 순수 대학 아마추어 야구 리그.',
      accent: '#60a5fa',
    },
    {
      title: 'Dynasties',
      desc: '한국외국어대학교(서울)와 동국대학교(L.A.E)가 각각 통산 8회 우승으로 최다 우승 기록을 보유하며 리그의 역사를 이끌어왔습니다.',
      accent: '#a855f7',
    },
    {
      title: '2025 → 2026',
      desc: '2025년 아주대 주최 시즌을 지나 2026년에는 중앙대학교(서울)가 호스트를 맡아 8개 조 예선과 으뜸·버금 토너먼트로 리그를 운영합니다.',
      accent: '#34d399',
    },
  ],
  governance: [
    {
      label: '주최 (2026)',
      value: '중앙대학교(서울)',
      detail: '46주년 시즌 운영 전권을 위임받은 호스트 대학',
    },
    {
      label: '회장단',
      value: '회장 정흥영 · 기록부장 이주환',
      detail: '실시간 기록 · 중계 · 디지털화, 웹 개발을 기록부가 주도',
    },
    {
      label: '감사',
      value: '연 2회 회계 감사',
      detail: '주최 외 제3의 대학(차기 주최 등)이 상·하반기 2회 진행',
    },
  ],
  structureCards: [
    {
      title: '회원 자격',
      points: ['각 대학 본부에 정식 등록된 야구회 소속원만 참가', '재학생 원칙, 휴학생·군 복무자 참가 허용', '대학원생은 원칙적으로 불허', '엘리트 선수(대한야구소프트볼협회 등록) 출신 제한으로 순수 아마추어리즘 유지'],
    },
    {
      title: '경기 운영',
      points: ['정규 7이닝, 4이닝 이상 진행 시 정식 경기 인정', '콜드 게임: 5회 10점 차 / 6회 7점 차', '노쇼 10분 경과 시 몰수, 무단 불참 시 1년 출전 정지'],
    },
    {
      title: '순위 · 포스트시즌',
      points: ['A~H조, 조당 4~5팀 풀리그', '순위: 승률 → 승자승 → TQB → 최소 실점 → 최다 득점 → 추첨', '각 조 상위 2팀 으뜸 토너먼트 16강, 하위권 팀은 버금 16강으로 진출'],
    },
  ],
  postseasonMatches: [
    {
      title: '으뜸 4강 (2026.01.25 예정)',
      matchups: ['세종대 Kings vs 경희대 국제 Lions', '연세대 Eagles vs 서울시립대 Falcons'],
    },
    {
      title: '버금 4강 (2026.01.24 예정)',
      matchups: ['한국공학대 Winners vs 한국외대 글로벌 Union', '경희대 서울 Braves vs 인하대 Biryong'],
    },
  ],
  heroMetrics: [
    { label: '2026 HOST', value: '중앙대학교(서울)', note: '제46회 AUBL 운영' },
    { label: '참가 규모', value: '약 40개 대학', note: 'A~H조 조별 예선 후 으뜸·버금' },
    { label: '핵심 가치', value: '실시간 기록 · 중계 · 디지털화', note: '모바일 친화 기록/중계로 모두가 같은 정보를 공유' },
  ],
};

function cloneRuleChapters(chapters: RuleChapter[]): RuleChapter[] {
  return chapters.map((chapter) => ({
    ...chapter,
    articles: chapter.articles.map((article) => ({ ...article, body: [...article.body] })),
  }));
}

const DEFAULT_RULES: RulesContent = {
  headerBadge: 'AUBL · RULES',
  headerTitle: '전국대학아마추어야구연합회 회칙',
  headerDescription:
    '1997년 추계 제정 · 2024년까지 연차별 개정. 모든 AUBL 공식 경기는 본 회칙에 따라 운영되며, 회칙에 규정되지 않은 사항은 KBO 규정집을 적용합니다.',
  chapters: cloneRuleChapters(DEFAULT_RULE_CHAPTERS as RuleChapter[]),
  hostOrder: [...DEFAULT_RULE_HOST_ORDER],
  appendixText:
    '본 회칙은 1997년 추계에 제정되었으며, 이후 대표자회의 의결을 거쳐 2024년까지 연차별로 개정되었다. 회칙에 규정되지 않은 사항은 KBO 규정집을 적용한다.',
};

const DEFAULT_TEAMS: TeamsContent = {
  pageBadge: 'AUBL · TEAMS',
  pageTitle: '2026 참가팀 · 조편성',
  pageDescription: '총 40개 대학이 A~H조 조별 리그에 참가합니다. 조별 상위 2팀은 으뜸 토너먼트 16강, 3·4등은 버금 토너먼트 16강으로 포스트시즌이 진행됩니다.',
  pageNote: '조편성은 대표자회의 의결에 따라 확정되며, 변경될 수 있습니다. 최종 조편성은 시즌 개막 전 공지됩니다.',
  entries: TEAM_GROUPS,
};

const defaultContent: ContentState = {
  tickerItems: [
    '📢 [공지] 1월 25일 으뜸 토너먼트 4강전: 세종대 vs 경희대국제 / 연세대 vs 서울시립대 경기 예정',
    '🏆 [2024 결과] 으뜸 우승: 홍익대 / 버금 우승: 동국대 LAE',
    '⚾ [현재 시즌] 2025 AUBL 토너먼트 진행 중 (주최: 아주대학교)',
  ],
  landing: DEFAULT_LANDING,
  intro: DEFAULT_INTRO,
  rules: DEFAULT_RULES,
  teams: DEFAULT_TEAMS,
};

type ContentContextValue = {
  content: ContentState;
  updateContent: (next: Partial<ContentState>) => void;
  resetContent: () => void;
};

const LEGACY_STORAGE_KEY = 'aubl:content:v1';
const LIVE_STORAGE_KEY = 'aubl:content:live:v1';
const STATIC_STORAGE_KEY = 'aubl:content:static:v2';

const LEGACY_DOC = 'settings/content';
const LIVE_DOC = 'settings/liveInfo';
const STATIC_DOC = 'settings/staticContent';
const META_DOC = 'settings/contentMeta';

const STATIC_KEYS: (keyof Omit<ContentState, 'tickerItems'>)[] = ['landing', 'intro', 'rules', 'teams'];

const VALID_GROUPS: GroupLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

const ContentContext = createContext<ContentContextValue>({
  content: defaultContent,
  updateContent: () => {},
  resetContent: () => {},
});

function deepMerge(base: ContentState, patch: Partial<ContentState>): ContentState {
  return {
    ...base,
    ...patch,
    landing: patch.landing ? { ...base.landing, ...patch.landing } : base.landing,
    intro: patch.intro ? { ...base.intro, ...patch.intro } : base.intro,
    rules: patch.rules ? { ...base.rules, ...patch.rules } : base.rules,
    teams: patch.teams ? { ...base.teams, ...patch.teams } : base.teams,
  };
}

function readLocalCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function hasField<T extends object>(obj: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeTicker(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTeamsEntries(value: unknown, fallback: TeamContentEntry[]): TeamContentEntry[] {
  if (!Array.isArray(value)) return fallback;
  const next: TeamContentEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof (item as { name?: unknown }).name === 'string' ? (item as { name: string }).name.trim() : '';
    const group = (item as { group?: unknown }).group;
    if (!name || typeof group !== 'string' || !VALID_GROUPS.includes(group as GroupLetter)) continue;
    next.push({ name, group: group as GroupLetter });
  }
  return next.length ? next : fallback;
}

function normalizeRuleChapters(value: unknown, fallback: RuleChapter[]): RuleChapter[] {
  if (!Array.isArray(value)) return fallback;
  const chapters: RuleChapter[] = [];
  for (const chapter of value) {
    if (!chapter || typeof chapter !== 'object') continue;
    const title = typeof (chapter as { title?: unknown }).title === 'string' ? (chapter as { title: string }).title.trim() : '';
    const id = typeof (chapter as { id?: unknown }).id === 'string' ? (chapter as { id: string }).id.trim() : '';
    const accent = typeof (chapter as { accent?: unknown }).accent === 'string' ? (chapter as { accent: string }).accent.trim() : '#60a5fa';
    const rawArticles = (chapter as { articles?: unknown }).articles;
    if (!title || !id || !Array.isArray(rawArticles)) continue;

    const articles: RuleArticle[] = rawArticles
      .map((article) => {
        if (!article || typeof article !== 'object') return null;
        const articleTitle = typeof (article as { title?: unknown }).title === 'string' ? (article as { title: string }).title.trim() : '';
        const rawBody = (article as { body?: unknown }).body;
        const body = Array.isArray(rawBody)
          ? rawBody.filter((line): line is string => typeof line === 'string').map((line) => line.trim())
          : [];
        if (!articleTitle || !body.length) return null;
        return { title: articleTitle, body };
      })
      .filter((article): article is RuleArticle => Boolean(article));

    if (!articles.length) continue;
    chapters.push({ id, title, accent, articles });
  }
  if (!chapters.length) return fallback;

  const incomingById = new Map(chapters.map((chapter) => [chapter.id, chapter]));

  const mergeArticles = (incoming: RuleChapter['articles'], defaults: RuleChapter['articles']) => {
    const incomingByTitle = new Map(incoming.map((article) => [article.title, article]));
    const merged = defaults.map((article) => incomingByTitle.get(article.title) ?? article);
    const extra = incoming.filter((article) => !defaults.some((def) => def.title === article.title));
    return [...merged, ...extra];
  };

  const mergedWithDefaults = fallback.map((defaultChapter) => {
    const incoming = incomingById.get(defaultChapter.id);
    if (!incoming) return defaultChapter;
    return {
      id: incoming.id || defaultChapter.id,
      title: incoming.title || defaultChapter.title,
      accent: incoming.accent || defaultChapter.accent,
      articles: mergeArticles(incoming.articles, defaultChapter.articles),
    };
  });

  const extraChapters = chapters.filter((chapter) => !fallback.some((def) => def.id === chapter.id));
  return [...mergedWithDefaults, ...extraChapters];
}

function normalizeContentPatch(input: Partial<ContentState>): Partial<ContentState> {
  const patch: Partial<ContentState> = {};

  if (hasField(input, 'tickerItems')) {
    patch.tickerItems = normalizeTicker((input as { tickerItems?: unknown }).tickerItems, defaultContent.tickerItems);
  }

  if (input.landing) {
    patch.landing = {
      ...input.landing,
      valueProps: Array.isArray(input.landing.valueProps)
        ? input.landing.valueProps.filter((item) => item?.title && item?.desc)
        : defaultContent.landing.valueProps,
      snapshotCards: Array.isArray(input.landing.snapshotCards)
        ? input.landing.snapshotCards.filter((item) => item?.label && item?.value)
        : defaultContent.landing.snapshotCards,
      seasonHighlights: Array.isArray(input.landing.seasonHighlights)
        ? input.landing.seasonHighlights.filter((item) => item?.title && item?.desc && item?.link)
        : defaultContent.landing.seasonHighlights,
    };
  }

  if (input.intro) {
    patch.intro = {
      ...input.intro,
      historyHighlights: Array.isArray(input.intro.historyHighlights) ? input.intro.historyHighlights : defaultContent.intro.historyHighlights,
      governance: Array.isArray(input.intro.governance) ? input.intro.governance : defaultContent.intro.governance,
      structureCards: Array.isArray(input.intro.structureCards) ? input.intro.structureCards : defaultContent.intro.structureCards,
      postseasonMatches: Array.isArray(input.intro.postseasonMatches) ? input.intro.postseasonMatches : defaultContent.intro.postseasonMatches,
      heroMetrics: Array.isArray(input.intro.heroMetrics) ? input.intro.heroMetrics : defaultContent.intro.heroMetrics,
    };
  }

  if (input.rules) {
    patch.rules = {
      ...input.rules,
      chapters: normalizeRuleChapters(input.rules.chapters, defaultContent.rules.chapters),
      hostOrder: Array.isArray(input.rules.hostOrder)
        ? input.rules.hostOrder.filter((name): name is string => typeof name === 'string' && name.trim().length > 0).map((name) => name.trim())
        : defaultContent.rules.hostOrder,
    };
  }

  if (input.teams) {
    patch.teams = {
      ...input.teams,
      entries: normalizeTeamsEntries(input.teams.entries, defaultContent.teams.entries),
    };
  }

  return patch;
}

function areSameStrings(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
}

function staticPayload(content: ContentState): Omit<ContentState, 'tickerItems'> {
  return {
    landing: content.landing,
    intro: content.intro,
    rules: content.rules,
    teams: content.teams,
  };
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ContentState>(defaultContent);
  const contentRef = useRef<ContentState>(defaultContent);
  const savingRef = useRef(false);
  const staticVersionRef = useRef<number | null>(null);

  const applyPatch = useCallback((patch: Partial<ContentState>) => {
    const normalized = normalizeContentPatch(patch);
    const next = deepMerge(contentRef.current, normalized);
    contentRef.current = next;
    setContent(next);
    writeLocalCache(LEGACY_STORAGE_KEY, next);
    return next;
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const cachedLegacy = readLocalCache<Partial<ContentState>>(LEGACY_STORAGE_KEY);
    const cachedStatic = readLocalCache<Partial<ContentState>>(STATIC_STORAGE_KEY);
    const cachedLive = readLocalCache<{ tickerItems?: unknown }>(LIVE_STORAGE_KEY);

    const patch: Partial<ContentState> = {};
    if (cachedStatic) {
      patch.landing = cachedStatic.landing;
      patch.intro = cachedStatic.intro;
      patch.rules = cachedStatic.rules;
      patch.teams = cachedStatic.teams;
    } else if (cachedLegacy) {
      patch.landing = cachedLegacy.landing;
      patch.intro = cachedLegacy.intro;
      patch.rules = cachedLegacy.rules;
      patch.teams = cachedLegacy.teams;
    }

    if ((cachedLive && hasField(cachedLive, 'tickerItems')) || (cachedLegacy && hasField(cachedLegacy, 'tickerItems'))) {
      patch.tickerItems = normalizeTicker(cachedLive?.tickerItems ?? cachedLegacy?.tickerItems, defaultContent.tickerItems);
    }

    if (Object.keys(patch).length) {
      applyPatch(patch);
    }
  }, [applyPatch]);

  const fetchStaticContent = useCallback(async () => {
    try {
      const staticSnapshot = await getDoc(doc(firestore, STATIC_DOC));
      if (staticSnapshot.exists()) {
        const data = staticSnapshot.data() as Partial<ContentState>;
        const patch = normalizeContentPatch({
          landing: data.landing,
          intro: data.intro,
          rules: data.rules,
          teams: data.teams,
        });
        if (Object.keys(patch).length) {
          const next = applyPatch(patch);
          writeLocalCache(STATIC_STORAGE_KEY, staticPayload(next));
        }
        return;
      }

      const legacySnapshot = await getDoc(doc(firestore, LEGACY_DOC));
      if (!legacySnapshot.exists()) return;
      const legacy = legacySnapshot.data() as Partial<ContentState>;
      const patch = normalizeContentPatch(legacy);
      const next = applyPatch(patch);
      writeLocalCache(STATIC_STORAGE_KEY, staticPayload(next));
      writeLocalCache(LIVE_STORAGE_KEY, { tickerItems: next.tickerItems });
    } catch (error) {
      console.error('[ContentProvider] Failed to fetch static content:', error);
    }
  }, [applyPatch]);

  useEffect(() => {
    const liveRef = doc(firestore, LIVE_DOC);
    const legacyRef = doc(firestore, LEGACY_DOC);

    const loadLegacyTicker = async () => {
      try {
        const legacySnapshot = await getDoc(legacyRef);
        if (!legacySnapshot.exists()) return;
        const legacy = legacySnapshot.data() as Partial<ContentState>;
        const tickerItems = normalizeTicker(legacy.tickerItems, defaultContent.tickerItems);
        if (areSameStrings(contentRef.current.tickerItems, tickerItems)) return;
        applyPatch({ tickerItems });
        writeLocalCache(LIVE_STORAGE_KEY, { tickerItems });
      } catch {
        // ignore fallback
      }
    };

    const unsubscribe = onSnapshot(
      liveRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as { tickerItems?: unknown };
          const tickerItems = normalizeTicker(data.tickerItems, defaultContent.tickerItems);
          if (!areSameStrings(contentRef.current.tickerItems, tickerItems)) {
            applyPatch({ tickerItems });
            writeLocalCache(LIVE_STORAGE_KEY, { tickerItems });
          }
          return;
        }
        void loadLegacyTicker();
      },
      (error) => {
        console.error('[ContentProvider] LIVE INFO subscription error:', error);
      },
    );

    return () => unsubscribe();
  }, [applyPatch]);

  useEffect(() => {
    const metaRef = doc(firestore, META_DOC);
    const unsubscribe = onSnapshot(
      metaRef,
      (snapshot) => {
        const rawVersion = snapshot.data()?.staticVersion;
        const nextVersion = typeof rawVersion === 'number' ? rawVersion : 0;
        if (staticVersionRef.current === nextVersion) return;
        staticVersionRef.current = nextVersion;
        void fetchStaticContent();
      },
      () => {
        if (staticVersionRef.current === null) {
          staticVersionRef.current = 0;
          void fetchStaticContent();
        }
      },
    );

    return () => unsubscribe();
  }, [fetchStaticContent]);

  const updateContent = useCallback(async (next: Partial<ContentState>) => {
    if (savingRef.current) return;

    const hasTickerPatch = hasField(next, 'tickerItems');
    const hasStaticPatch = STATIC_KEYS.some((key) => hasField(next, key));
    if (!hasTickerPatch && !hasStaticPatch) return;

    savingRef.current = true;
    try {
      const merged = applyPatch(next);
      writeLocalCache(LIVE_STORAGE_KEY, { tickerItems: merged.tickerItems });
      writeLocalCache(STATIC_STORAGE_KEY, staticPayload(merged));

      const writes: Promise<unknown>[] = [];
      if (hasTickerPatch) {
        writes.push(
          setDoc(
            doc(firestore, LIVE_DOC),
            { tickerItems: merged.tickerItems, updatedAt: Date.now() },
            { merge: true },
          ),
        );
      }
      if (hasStaticPatch) {
        writes.push(
          setDoc(
            doc(firestore, STATIC_DOC),
            { ...staticPayload(merged), updatedAt: Date.now() },
            { merge: true },
          ),
        );
        writes.push(
          setDoc(
            doc(firestore, META_DOC),
            { staticVersion: increment(1), updatedAt: Date.now() },
            { merge: true },
          ),
        );
      }

      await Promise.all(writes);
    } catch (error) {
      console.error('[ContentProvider] Failed to save content:', error);
    } finally {
      savingRef.current = false;
    }
  }, [applyPatch]);

  const resetContent = useCallback(async () => {
    applyPatch(defaultContent);
    writeLocalCache(LIVE_STORAGE_KEY, { tickerItems: defaultContent.tickerItems });
    writeLocalCache(STATIC_STORAGE_KEY, staticPayload(defaultContent));

    try {
      await Promise.all([
        setDoc(doc(firestore, LIVE_DOC), { tickerItems: defaultContent.tickerItems, updatedAt: Date.now() }),
        setDoc(doc(firestore, STATIC_DOC), { ...staticPayload(defaultContent), updatedAt: Date.now() }),
        setDoc(
          doc(firestore, META_DOC),
          { staticVersion: increment(1), updatedAt: Date.now() },
          { merge: true },
        ),
      ]);
    } catch (error) {
      console.error('[ContentProvider] Failed to reset content:', error);
    }
  }, [applyPatch]);

  const value = useMemo(() => ({ content, updateContent, resetContent }), [content, updateContent, resetContent]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export const useContent = () => useContext(ContentContext);

export const defaultContentState = defaultContent;
