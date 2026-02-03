import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, increment, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase/client';

type HistoryHighlight = { title: string; desc: string; accent: string };
type GovernanceItem = { label: string; value: string; detail: string };
type StructureCard = { title: string; points: string[] };
type PostseasonMatch = { title: string; matchups: string[] };
type HeroMetric = { label: string; value: string; note: string };

type IntroContent = {
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

export type ContentState = {
  tickerItems: string[];
  intro: IntroContent;
};

const defaultContent: ContentState = {
  tickerItems: [
    '📢 [공지] 1월 25일 으뜸 토너먼트 4강전: 세종대 vs 경희대국제 / 연세대 vs 서울시립대 경기 예정',
    '🏆 [2024 결과] 으뜸 우승: 홍익대 / 버금 우승: 동국대 LAE',
    '⚾ [현재 시즌] 2025 AUBL 토너먼트 진행 중 (주최: 아주대학교)',
  ],
  intro: {
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
  },
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

const ContentContext = createContext<ContentContextValue>({
  content: defaultContent,
  updateContent: () => {},
  resetContent: () => {},
});

const deepMerge = (base: ContentState, patch: Partial<ContentState>): ContentState => {
  const merged: ContentState = { ...base, ...patch } as ContentState;
  if (patch.intro) {
    merged.intro = { ...base.intro, ...patch.intro };
  }
  return merged;
};

function normalizeTicker(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
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

function areSameStrings(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item === b[idx]);
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ContentState>(defaultContent);
  const contentRef = useRef<ContentState>(defaultContent);
  const savingRef = useRef(false);
  const staticVersionRef = useRef<number | null>(null);

  const applyPatch = useCallback((patch: Partial<ContentState>) => {
    const next = deepMerge(contentRef.current, patch);
    contentRef.current = next;
    setContent(next);
    writeLocalCache(LEGACY_STORAGE_KEY, next);
    return next;
  }, []);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // 캐시 우선 하이드레이션: 초기 렌더 지연 최소화
  useEffect(() => {
    const cachedLegacy = readLocalCache<Partial<ContentState>>(LEGACY_STORAGE_KEY);
    const cachedStatic = readLocalCache<Partial<ContentState>>(STATIC_STORAGE_KEY);
    const cachedLive = readLocalCache<{ tickerItems?: unknown }>(LIVE_STORAGE_KEY);

    const patch: Partial<ContentState> = {};
    if (cachedStatic?.intro || cachedLegacy?.intro) {
      patch.intro = (cachedStatic?.intro ?? cachedLegacy?.intro) as ContentState['intro'];
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
        if (data.intro) {
          applyPatch({ intro: data.intro });
          writeLocalCache(STATIC_STORAGE_KEY, { intro: data.intro });
        }
        return;
      }

      // 호환성: 새 문서가 없으면 기존 settings/content에서 읽기
      const legacySnapshot = await getDoc(doc(firestore, LEGACY_DOC));
      if (!legacySnapshot.exists()) return;
      const legacy = legacySnapshot.data() as Partial<ContentState>;
      if (legacy.intro) {
        applyPatch({ intro: legacy.intro });
        writeLocalCache(STATIC_STORAGE_KEY, { intro: legacy.intro });
      }
      if (hasField(legacy, 'tickerItems')) {
        const tickerItems = normalizeTicker(legacy.tickerItems, defaultContent.tickerItems);
        applyPatch({ tickerItems });
        writeLocalCache(LIVE_STORAGE_KEY, { tickerItems });
      }
    } catch (error) {
      console.error('[ContentProvider] Failed to fetch static content:', error);
    }
  }, [applyPatch]);

  // LIVE INFO만 실시간 구독
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
        // ignore legacy fallback errors
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

  // 정적 콘텐츠는 메타 버전만 구독하고, 변경될 때만 문서 1회 fetch
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
      (error) => {
        console.error('[ContentProvider] static version subscription error:', error);
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
    const hasTickerPatch = Object.prototype.hasOwnProperty.call(next, 'tickerItems');
    const hasIntroPatch = Object.prototype.hasOwnProperty.call(next, 'intro');
    if (!hasTickerPatch && !hasIntroPatch) return;

    savingRef.current = true;
    try {
      const patch: Partial<ContentState> = {};
      let tickerItems: string[] | null = null;
      if (hasTickerPatch) {
        tickerItems = normalizeTicker((next as { tickerItems?: unknown }).tickerItems, contentRef.current.tickerItems);
        patch.tickerItems = tickerItems;
      }
      if (hasIntroPatch && next.intro) {
        patch.intro = next.intro;
      }

      if (Object.keys(patch).length) {
        const merged = applyPatch(patch);
        writeLocalCache(LIVE_STORAGE_KEY, { tickerItems: merged.tickerItems });
        writeLocalCache(STATIC_STORAGE_KEY, { intro: merged.intro });
      }

      const writes: Promise<unknown>[] = [];
      if (tickerItems) {
        writes.push(
          setDoc(
            doc(firestore, LIVE_DOC),
            { tickerItems, updatedAt: Date.now() },
            { merge: true },
          ),
        );
      }
      if (hasIntroPatch && next.intro) {
        writes.push(
          setDoc(
            doc(firestore, STATIC_DOC),
            { intro: next.intro, updatedAt: Date.now() },
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
    writeLocalCache(STATIC_STORAGE_KEY, { intro: defaultContent.intro });

    try {
      await Promise.all([
        setDoc(doc(firestore, LIVE_DOC), { tickerItems: defaultContent.tickerItems, updatedAt: Date.now() }),
        setDoc(doc(firestore, STATIC_DOC), { intro: defaultContent.intro, updatedAt: Date.now() }),
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
