import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
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

const STORAGE_KEY = 'aubl:content:v1';
const FIRESTORE_DOC = 'settings/content';

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

export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ContentState>(defaultContent);
  const loadedRef = useRef(false);
  const savingRef = useRef(false);

  // localStorage → Firestore 마이그레이션 (한 번만 실행)
  useEffect(() => {
    const migrate = async () => {
      if (typeof window === 'undefined') return;

      try {
        const contentDocRef = doc(firestore, FIRESTORE_DOC);
        const snapshot = await getDoc(contentDocRef);

        // Firestore에 문서가 없고 localStorage에 데이터가 있으면 마이그레이션
        if (!snapshot.exists()) {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<ContentState>;
            const migratedContent = deepMerge(defaultContent, parsed);
            await setDoc(contentDocRef, migratedContent);
            console.info('[ContentProvider] Migrated localStorage data to Firestore');
          }
        }
      } catch (error) {
        console.error('[ContentProvider] Migration failed:', error);
      }
    };

    void migrate();
  }, []);

  // Firestore 구독 및 초기 로드
  useEffect(() => {
    const contentDocRef = doc(firestore, FIRESTORE_DOC);

    // Firestore 실시간 구독
    const unsubscribe = onSnapshot(
      contentDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<ContentState>;
          setContent((prev) => deepMerge(defaultContent, data));

          // localStorage에도 캐시
          if (typeof window !== 'undefined') {
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch {
              // ignore quota errors
            }
          }
        } else {
          // Firestore에 문서가 없으면 기본값 사용
          setContent(defaultContent);
        }
        loadedRef.current = true;
      },
      (error) => {
        console.error('[ContentProvider] Firestore subscription error:', error);
        // Firestore 에러 시 localStorage 폴백
        if (typeof window !== 'undefined') {
          try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as Partial<ContentState>;
              setContent((prev) => deepMerge(prev, parsed));
            }
          } catch {
            // ignore malformed cache
          }
        }
        loadedRef.current = true;
      }
    );

    return () => unsubscribe();
  }, []);

  const updateContent = useCallback(async (next: Partial<ContentState>) => {
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      const contentDocRef = doc(firestore, FIRESTORE_DOC);

      // 현재 상태를 가져와서 병합
      let newContent: ContentState;
      setContent((prev) => {
        newContent = deepMerge(prev, next);
        return newContent;
      });

      // Firestore에 저장
      await setDoc(contentDocRef, newContent!, { merge: true });

      // localStorage에도 저장
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newContent));
        } catch {
          // ignore quota errors
        }
      }
    } catch (error) {
      console.error('[ContentProvider] Failed to save content:', error);
      // 에러 시에도 로컬 상태는 업데이트 (localStorage 폴백)
      setContent((prev) => deepMerge(prev, next));
    } finally {
      savingRef.current = false;
    }
  }, []);

  const resetContent = useCallback(async () => {
    try {
      const contentDocRef = doc(firestore, FIRESTORE_DOC);
      await setDoc(contentDocRef, defaultContent);
      setContent(defaultContent);

      // localStorage도 초기화
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    } catch (error) {
      console.error('[ContentProvider] Failed to reset content:', error);
      setContent(defaultContent);
    }
  }, []);

  const value = useMemo(() => ({ content, updateContent, resetContent }), [content, updateContent, resetContent]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export const useContent = () => useContext(ContentContext);

export const defaultContentState = defaultContent;
