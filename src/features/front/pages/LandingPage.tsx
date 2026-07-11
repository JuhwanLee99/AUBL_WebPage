// **`src/front/pages/LandingPage.tsx`**
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useDemoStore } from '@shared/state/demoStore';
import type { MatchSchedule } from '@shared/state/demoStore';
import { collection, collectionGroup, doc, FieldPath, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore } from '@shared/firebase/client';
import { useContent } from '@shared/state/contentProvider';
import { useAdmin } from '@shared/auth/useAdmin';
import { useAuth } from '@shared/auth/AuthProvider';
import { useTeamRole } from '@shared/auth/useTeamRole';
import { decodeTeamId } from '@shared/lib/teamDirectory';
import type { Notice, TeamNotice } from '@shared/types';

const formatLiveTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시간 미정';
  // Intl 대신 명시적 KST 변환 사용을 권장하지만, 표시는 브라우저 편의를 위해 유지하되 타임존 명시
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

const safeMatchTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const scoreOrDash = (score?: number | null) => (typeof score === 'number' && Number.isFinite(score) ? score : '-');
const isPracticeMatch = (match: MatchSchedule) => (match.recordMode ?? 'official') === 'practice';

const countDots = (filled: number, total: number, color: string) =>
  Array.from({ length: total }, (_, idx) => ({
    active: idx < filled,
    color,
  }));

type LiveSnapshot = {
  home: number;
  away: number;
  inning?: number;
  half?: 'top' | 'bottom';
  balls?: number;
  strikes?: number;
  outs?: number;
  bases?: (string | null)[];
};

const clampCount = (value: unknown, max?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  const nonNegative = Math.max(0, value);
  return typeof max === 'number' ? Math.min(nonNegative, max) : nonNegative;
};

const normalizeBases = (value: unknown): (string | null)[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const trimmed = value
    .slice(0, 3)
    .map((runner) => (typeof runner === 'string' && runner.trim() ? runner : null));
  while (trimmed.length < 3) trimmed.push(null);
  return trimmed as (string | null)[];
};

const currentBatterName = (state: ReturnType<typeof useDemoStore>['state'], lineupVisible: boolean) => {
  if (!lineupVisible) return '라인업 공개 전';
  const side = state.half === 'top' ? 'away' : 'home';
  const lineup = state.lineups[side];
  const battingLineup = lineup.filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeLineup = battingLineup.length ? battingLineup : lineup;
  const safeLength = activeLineup.length || 1;
  const idx = state.batterIndex[side] % safeLength;
  const batter = activeLineup[idx];
  return batter?.name || '타자 대기 중';
};

const currentPitcherName = (state: ReturnType<typeof useDemoStore>['state'], lineupVisible: boolean) => {
  if (!lineupVisible) return '라인업 공개 전';
  const defenseSide = state.half === 'top' ? 'home' : 'away';
  const pitcher = state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P');
  return pitcher?.name || '투수 대기 중';
};

// [수정됨] KST(UTC+9) 기준 날짜 키 생성 (YYYY-MM-DD) - 수학적 계산으로 오차 제거
const getKstDateKey = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  const time = date.getTime();
  if (Number.isNaN(time)) return null;

  // 1. UTC 타임스탬프에 9시간(KST 오프셋)을 더함
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(time + kstOffset);

  // 2. 더해진 시간의 UTC 컴포넌트를 추출하면 정확한 KST 날짜가 됨
  const yyyy = kstDate.getUTCFullYear();
  const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getUTCDate()).padStart(2, '0');
  
  return `${yyyy}-${mm}-${dd}`;
};

const formatTimeShort = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시간 미정';
  
  // 시간 표시도 KST 기준으로 고정
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false 
  }).format(date);
};

const normalizeCreatedAt = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  return 0;
};

const UNIQUE_PLAY_URL = 'https://unique-play.com/league/57?item=%5Bobject%20Object%5D';

const formatNoticeDate = (value: number) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
};

const noticeCategoryStyle = (category: Notice['category']) => {
  switch (category) {
    case '긴급':
      return { background: 'rgba(239,68,68,0.16)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.32)' };
    case '심판/기록원 모집':
      return { background: 'rgba(34,197,94,0.16)', color: '#86efac', border: '1px solid rgba(34,197,94,0.32)' };
    case '경기공지':
      return { background: 'rgba(59,130,246,0.16)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.32)' };
    case '징계':
      return { background: 'rgba(248,113,113,0.16)', color: '#fda4af', border: '1px solid rgba(248,113,113,0.32)' };
    default:
      return { background: 'rgba(148,163,184,0.18)', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.3)' };
  }
};

function Badge({ label, dots }: { label: string; dots: { active: boolean; color: string }[] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '10px',
        padding: '6px 8px',
        border: '1px solid rgba(148,163,184,0.18)',
      }}
    >
      <span style={{ fontWeight: 900, color: '#e2e8f0', fontSize: '12px', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ display: 'flex', gap: '6px' }}>
        {dots.map((dot, idx) => (
          <span
            key={`${label}-${idx}`}
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              backgroundColor: dot.active ? dot.color : 'rgba(148,163,184,0.3)',
              boxShadow: dot.active ? `0 0 0 6px ${dot.color}33` : 'none',
              transition: 'all 0.2s ease',
            }}
          />
        ))}
      </span>
    </div>
  );
}

function MiniBases({ bases }: { bases?: (string | null | undefined)[] }) {
  const hasRunner = (index: 0 | 1 | 2) => Boolean(bases && bases[index]);
  const baseShape = (active: boolean, position: CSSProperties = {}): CSSProperties => ({
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: '2px',
    transform: position.transform ?? 'rotate(45deg)',
    background: active ? 'linear-gradient(135deg, #fcd34d, #f59e0b)' : 'rgba(148,163,184,0.12)',
    border: '1px solid rgba(226, 232, 240, 0.55)',
    boxShadow: active ? '0 0 0 4px rgba(252, 211, 77, 0.18)' : 'none',
    transition: 'all 0.18s ease',
    ...position,
  });

  return (
    <div
      aria-label="베이스 상황"
      style={{
        display: 'grid',
        placeItems: 'center',
        padding: '4px 6px',
        borderRadius: '10px',
        border: '1px solid rgba(148,163,184,0.28)',
        background: 'rgba(255,255,255,0.02)',
        width: '56px',
        height: '34px',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'relative', width: '38px', height: '24px' }}>
        <span style={baseShape(hasRunner(1), { left: '50%', top: 0, transform: 'translate(-50%, 0) rotate(45deg)' })} />
        <span style={baseShape(hasRunner(2), { left: 4, bottom: 1 })} />
        <span style={baseShape(hasRunner(0), { right: 4, bottom: 1 })} />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { state, actions } = useDemoStore();
  const { isAdmin } = useAdmin();
  const { user } = useAuth();
  const { isCoach, coachTeamId } = useTeamRole();
  const { content } = useContent();
  const landing = content.landing;
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const highlightRefs = useRef<HTMLDivElement[]>([]);
  const snapshotRef = useRef<HTMLDivElement>(null);
  const [liveMatchesRealtime, setLiveMatchesRealtime] = useState<MatchSchedule[]>([]);
  const [liveScores, setLiveScores] = useState<Record<string, LiveSnapshot>>({});
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [memberTeamId, setMemberTeamId] = useState<string | null>(null);
  const [teamNotices, setTeamNotices] = useState<TeamNotice[]>([]);
  const [latestCommunityNotices, setLatestCommunityNotices] = useState<Notice[]>([]);
  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId) ?? null,
    [state.matches, state.activeMatchId],
  );
  const lineupVisible = isAdmin || state.gameStarted || Boolean(activeMatch?.lineupPublic);
  const sortedTeamNotices = useMemo(() => {
    const copy = [...teamNotices];
    copy.sort((a, b) => {
      const pinnedA = a.pinned ? 1 : 0;
      const pinnedB = b.pinned ? 1 : 0;
      if (pinnedA !== pinnedB) return pinnedB - pinnedA;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
    return copy;
  }, [teamNotices]);

  useEffect(() => {
    if (!user || isCoach) return;
    let cancelled = false;
    const run = async () => {
      try {
        let snap = await getDocs(
          query(collectionGroup(firestore, 'members'), where('uid', '==', user.uid), limit(1)),
        );
        if (snap.empty) {
          snap = await getDocs(
            query(collectionGroup(firestore, 'members'), where(FieldPath.documentId(), '==', user.uid), limit(1)),
          );
        }
        if (cancelled) return;
        if (snap.empty) {
          setMemberTeamId(null);
          return;
        }
        const docSnap = snap.docs[0];
        const teamRef = docSnap.ref.parent.parent;
        const teamId = teamRef?.id ?? null;
        setMemberTeamId(teamId);
      } catch {
        if (!cancelled) setMemberTeamId(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user, isCoach]);

  const myTeamId = user ? (coachTeamId ?? memberTeamId) : null;
  const myTeamName = useMemo(() => (myTeamId ? decodeTeamId(myTeamId) : null), [myTeamId]);

  useEffect(() => {
    if (!myTeamId) return;
    const q = query(collection(firestore, 'teams', myTeamId, 'notices'), orderBy('createdAt', 'desc'), limit(5));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => ({ ...(docSnap.data() as Omit<TeamNotice, 'id'>), id: docSnap.id }));
        setTeamNotices(next);
      },
      () => {
        setTeamNotices([]);
      },
    );
    return () => unsub();
  }, [myTeamId]);

  useEffect(() => {
    const noticesQuery = query(collection(firestore, 'notices'), orderBy('createdAt', 'desc'), limit(6));
    const unsub = onSnapshot(
      noticesQuery,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<Notice>;
          return {
            id: docSnap.id,
            title: data.title ?? '제목 없음',
            category: data.category ?? '일반',
            content: data.content ?? '',
            author: data.author ?? '운영진',
            createdAt: normalizeCreatedAt(data.createdAt),
            isImportant: data.isImportant,
            allowComments: data.allowComments,
          } as Notice;
        });
        setLatestCommunityNotices(next);
      },
      () => {
        setLatestCommunityNotices([]);
      },
    );
    return () => unsub();
  }, []);

  // 1. 오늘 경기 계산
  const todaysScheduled = useMemo(() => {
    // 현재 KST 기준 '오늘'의 YYYY-MM-DD 키 생성
    const todayKey = getKstDateKey(new Date());
    
    return state.matches
      .filter(
        (match) =>
          match.status === 'scheduled' &&
          todayKey !== null && // todayKey가 유효할 때만
          getKstDateKey(match.startTime) === todayKey,
      )
      .sort((a, b) => safeMatchTime(a.startTime) - safeMatchTime(b.startTime));
  }, [state.matches]);

  // 2. 내일 경기 계산
  const tomorrowsScheduled = useMemo(() => {
    // 현재 시간에서 정확히 24시간을 더해 KST 기준 '내일'의 키 생성
    const tomorrow = new Date(nowTs + 24 * 60 * 60 * 1000);
    const tomorrowKey = getKstDateKey(tomorrow);
    
    return state.matches
      .filter(
        (match) =>
          match.status === 'scheduled' &&
          tomorrowKey !== null && // tomorrowKey가 유효할 때만
          getKstDateKey(match.startTime) === tomorrowKey,
      )
      .sort((a, b) => safeMatchTime(a.startTime) - safeMatchTime(b.startTime));
  }, [state.matches, nowTs]);

  // 3. 라이브 경기 계산
  const liveMatches = useMemo(() => {
    const source = liveMatchesRealtime.length ? liveMatchesRealtime : state.matches;
    return source
      .filter((match) => match.status === 'inProgress')
      .sort((a, b) => safeMatchTime(a.startTime) - safeMatchTime(b.startTime));
  }, [liveMatchesRealtime, state.matches]);

  // Ensure live widget always has full schedule data
  useEffect(() => {
    queueMicrotask(() => {
      setLiveMatchesRealtime([]);
      setLiveScores({});
    });
    void actions.loadFullSchedule();
  }, [actions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Fetch latest score/inning
  useEffect(() => {
    let cancelled = false;
    const fetchScores = async () => {
      const entries = await Promise.all(
        liveMatches.map(async (match) => {
          try {
            const snap = await getDoc(doc(firestore, 'matchStates', match.id));
            if (!snap.exists()) return null;
            const data = snap.data() as {
              score?: { home?: number; away?: number };
              inning?: number;
              half?: 'top' | 'bottom';
              balls?: number;
              strikes?: number;
              outs?: number;
              bases?: unknown;
            };
            return {
              id: match.id,
              home: data.score?.home ?? null,
              away: data.score?.away ?? null,
              inning: typeof data.inning === 'number' ? data.inning : undefined,
              half: data.half === 'top' || data.half === 'bottom' ? data.half : undefined,
              balls: clampCount(data.balls, 3),
              strikes: clampCount(data.strikes, 2),
              outs: clampCount(data.outs, 3),
              bases: normalizeBases(data.bases),
            };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const map: Record<string, LiveSnapshot> = {};
      entries.forEach((entry) => {
        if (!entry) return;
        map[entry.id] = {
          home: entry.home ?? 0,
          away: entry.away ?? 0,
          inning: entry.inning,
          half: entry.half,
          balls: entry.balls,
          strikes: entry.strikes,
          outs: entry.outs,
          bases: entry.bases,
        };
      });
      setLiveScores(map);
    };
    if (liveMatches.length) {
      void fetchScores();
    } else {
      queueMicrotask(() => setLiveScores({}));
    }
    return () => {
      cancelled = true;
    };
  }, [liveMatches]);

  // Dedicated in-progress subscription
  useEffect(() => {
    const liveQuery = query(collection(firestore, 'matches'), where('status', '==', 'inProgress'));
    const unsub = onSnapshot(
      liveQuery,
      (snap) => {
        const incoming = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Partial<MatchSchedule>),
        }));
        setLiveMatchesRealtime(
          incoming
            .filter((m) => !m.deleted)
            .sort((a, b) => safeMatchTime(a.startTime || '') - safeMatchTime(b.startTime || '')) as MatchSchedule[],
        );
      },
      (error) => {
        console.error('[landing live] snapshot error', error);
        setLiveMatchesRealtime([]);
      },
    );
    return () => unsub();
  }, []);

  const handleOpenMatch = (matchId: string, path: '/live-overlay' | '/scoreboard-text') => {
    actions.selectMatch(matchId);
    navigate(`${path}/${matchId}`);
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      const heroElements = heroRef.current?.querySelectorAll('.hero-animate');
      if (heroElements) {
        tl.fromTo(
          heroElements,
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, duration: 1.15, stagger: 0.08 },
        );
      }

      if (highlightRefs.current.length) {
        gsap.fromTo(
          highlightRefs.current,
          { y: 24, opacity: 0, scale: 0.97 },
          { y: 0, opacity: 1, scale: 1, duration: 0.95, stagger: 0.08, ease: 'power2.out', delay: 0.2 },
        );
      }

      const snapshotBlocks = snapshotRef.current?.querySelectorAll('.snapshot-card');
      if (snapshotBlocks) {
        gsap.fromTo(
          snapshotBlocks,
          { y: 26, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.95, stagger: 0.06, ease: 'power2.out', delay: 0.1 },
        );
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="landing-stack">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="landing-hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--hero-radius)',
          padding: 'var(--hero-padding)',
          background:
            'radial-gradient(circle at 18% 22%, rgba(59,130,246,0.24), transparent 32%), radial-gradient(circle at 90% 0%, rgba(12,74,110,0.18), transparent 30%), linear-gradient(140deg, #0b1f46 0%, #0d2f7f 100%)',
          boxShadow: '0 24px 60px rgba(6, 15, 40, 0.55)',
          isolation: 'isolate',
        }}
      >
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              className="hero-animate"
              style={{ fontSize: 'clamp(11px, 2.8vw, 13px)', fontWeight: 800, letterSpacing: '0.08em', color: '#60a5fa' }}
            >
              {landing.heroEyebrow}
            </span>
            <span
              className="hero-animate"
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#e2e8f0',
                fontSize: 'clamp(11px, 2.6vw, 12px)',
                border: '1px solid rgba(148, 163, 184, 0.28)',
              }}
            >
              {landing.heroBadgeText}
            </span>
          </div>
          <div className="hero-animate" style={{ display: 'grid', gap: '12px' }}>
            <h1 className="hero-animate" style={{ fontSize: 'clamp(28px, 6vw, 46px)', lineHeight: 1.15, fontWeight: 900, margin: 0, whiteSpace: 'pre-line' }}>
              {landing.heroTitle}
            </h1>
            <p
              className="hero-animate"
              style={{ color: '#cbd5e1', fontSize: 'clamp(14px, 4vw, 17px)', margin: 0, maxWidth: '760px', lineHeight: 1.6, whiteSpace: 'pre-line' }}
            >
              {landing.heroDescription}
            </p>
            <p className="hero-animate" style={{ color: '#93c5fd', fontWeight: 700, margin: 0, fontSize: 'clamp(13px, 3.4vw, 16px)' }}>
              {landing.heroSubDescription}
            </p>
          </div>
          <div className="hero-animate" style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '4px' }}>
            <Link
              to="/schedule"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: 'clamp(14px, 3.6vw, 15px)',
                backgroundColor: '#60a5fa',
                color: '#0b1635',
                boxShadow: '0 16px 40px rgba(96, 165, 250, 0.28)',
              }}
            >
              2026 경기 일정 확인하기
            </Link>
            <Link
              to="/intro"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: 'clamp(14px, 3.6vw, 15px)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#e2e8f0',
                border: '1px solid rgba(148, 163, 184, 0.32)',
              }}
            >
              참가 팀 및 조 편성 보기
            </Link>
            <a
              className="hero-animate"
              href="https://www.instagram.com/aubl_1981/"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '15px',
                backgroundColor: 'rgba(99, 102, 241, 0.18)',
                color: '#dbeafe',
                border: '1px solid rgba(99, 102, 241, 0.36)',
              }}
            >
              인스타그램 팔로우
            </a>
          </div>
        </div>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: "url('/assets/aubl_clean.png')",
            backgroundSize: 'contain',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            opacity: 0.32,
            pointerEvents: 'none',
          }}
        />
      </section>

      {/* Team Notice Spotlight */}
      <section
        style={{
          borderRadius: 'var(--surface-radius-md)',
          padding: '16px',
          border: '1px solid rgba(148, 163, 184, 0.24)',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.85), rgba(30,41,59,0.75))',
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.3)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(249,115,22,0.18)',
                color: '#f97316',
                fontWeight: 900,
                fontSize: '11px',
                letterSpacing: '0.06em',
                border: '1px solid rgba(249,115,22,0.4)',
              }}
            >
              TEAM NOTICE
            </span>
            <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>내 팀 소식</span>
          </div>
          {myTeamId && (
            <Link
              to={`/teams/${myTeamId}`}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.04)',
                color: '#e2e8f0',
                fontWeight: 800,
                fontSize: '12px',
                textDecoration: 'none',
              }}
            >
              팀 페이지 바로가기 →
            </Link>
          )}
        </div>

        {!user ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>로그인하면 내 팀 공지를 확인할 수 있습니다.</div>
        ) : !myTeamId ? (
          <div style={{ color: '#94a3b8', fontWeight: 700 }}>아직 팀에 소속되지 않았습니다. 감독에게 팀원 등록을 요청해주세요.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            <div style={{ color: '#e2e8f0', fontWeight: 800 }}>{myTeamName ?? '소속팀'}</div>
            {sortedTeamNotices.length ? (
              <div style={{ display: 'grid', gap: '8px' }}>
                {sortedTeamNotices.slice(0, 3).map((notice) => (
                  <div
                    key={notice.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      border: '1px solid rgba(148,163,184,0.25)',
                      background: 'rgba(255,255,255,0.02)',
                      display: 'grid',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {notice.pinned && (
                        <span style={{ padding: '2px 6px', borderRadius: '999px', background: 'rgba(249,115,22,0.16)', color: '#f97316', fontWeight: 800, fontSize: '11px' }}>
                          고정
                        </span>
                      )}
                      {notice.category && (
                        <span style={{ padding: '2px 6px', borderRadius: '999px', background: 'rgba(148,163,184,0.2)', color: '#e2e8f0', fontWeight: 800, fontSize: '11px' }}>
                          {notice.category}
                        </span>
                      )}
                      <Link
                        to={`/teams/${myTeamId}/notices/${notice.id}`}
                        style={{ fontWeight: 800, color: '#e2e8f0', textDecoration: 'none' }}
                      >
                        {notice.title}
                      </Link>
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '12px' }}>{notice.content}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#94a3b8', fontWeight: 700 }}>등록된 팀 공지가 없습니다.</div>
            )}
          </div>
        )}
      </section>

      {/* Community Notice Preview */}
      <section
        style={{
          borderRadius: 'var(--surface-radius-md)',
          padding: '14px',
          border: '1px solid rgba(148, 163, 184, 0.28)',
          background: 'rgba(15, 23, 42, 0.7)',
          boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(59,130,246,0.15)',
                color: '#93c5fd',
                fontWeight: 900,
                fontSize: '11px',
                letterSpacing: '0.06em',
                border: '1px solid rgba(59,130,246,0.3)',
              }}
            >
              COMMUNITY NOTICE
            </span>
            <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>공지사항 최신글</span>
          </div>
          <Link
            to="/community/notices"
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: '12px',
              textDecoration: 'none',
            }}
          >
            전체 공지 보기 →
          </Link>
        </div>

        {latestCommunityNotices.length ? (
          <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(150px, 1fr))',
                gap: '8px',
                minWidth: '960px',
              }}
            >
              {latestCommunityNotices.map((notice) => (
                <Link
                  key={notice.id}
                  to={`/community/notices/${notice.id}`}
                  style={{
                    textDecoration: 'none',
                    display: 'grid',
                    gap: '8px',
                    alignContent: 'space-between',
                    minHeight: '86px',
                    padding: '10px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(148, 163, 184, 0.22)',
                  }}
                >
                  <span
                    style={{
                      color: '#e2e8f0',
                      fontWeight: 700,
                      fontSize: '13px',
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {notice.title}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span
                      style={{
                        ...noticeCategoryStyle(notice.category),
                        padding: '2px 7px',
                        borderRadius: '999px',
                        fontWeight: 800,
                        fontSize: '10px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {notice.category}
                    </span>
                    <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {formatNoticeDate(notice.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(255,255,255,0.02)',
              color: '#94a3b8',
              fontWeight: 700,
            }}
          >
            등록된 공지사항이 없습니다.
          </div>
        )}
      </section>

      {/* Live Games Snapshot */}
      <section
        style={{
          borderRadius: 'var(--surface-radius-md)',
          padding: '18px 18px 14px',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          background: 'linear-gradient(135deg, rgba(8,47,73,0.72), rgba(15,23,42,0.92))',
          boxShadow: '0 18px 50px rgba(0, 0, 0, 0.32)',
          display: 'grid',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              aria-hidden
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '999px',
                backgroundColor: '#38bdf8',
                boxShadow: '0 0 0 6px rgba(56, 189, 248, 0.18)',
              }}
            />
            <div style={{ display: 'grid', gap: '4px' }}>
              <p style={{ margin: 0, fontWeight: 900, letterSpacing: '0.05em', fontSize: '13px', color: '#cbd5e1' }}>실시간 경기 상황</p>
              <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>지금 {liveMatches.length}경기 진행 중</p>
            </div>
          </div>
          <Link
            to="/schedule/live"
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(15, 23, 42, 0.6)',
              color: '#e2e8f0',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              fontWeight: 800,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            실시간 경기 목록 전체 보기 →
          </Link>
        </div>

        {liveMatches.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            {liveMatches.map((match) => (
              <div
                key={match.id}
                style={{
                  borderRadius: '16px',
                  padding: '14px',
                  border: '1px solid rgba(96, 165, 250, 0.24)',
                  background: 'linear-gradient(140deg, rgba(56,189,248,0.12), rgba(99,102,241,0.08))',
                  display: 'grid',
                  gap: '12px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: '999px',
                        background: 'rgba(248, 113, 113, 0.16)',
                        color: '#fca5a5',
                        fontWeight: 900,
                        fontSize: '12px',
                        letterSpacing: '0.05em',
                        border: '1px solid rgba(248, 113, 113, 0.36)',
                      }}
                    >
                      LIVE
                    </span>
                    <span style={{ color: '#cbd5e1', fontWeight: 700, fontSize: '13px' }}>
                      {formatLiveTime(match.startTime)} · {match.venue || '장소 미정'}
                    </span>
                    {isPracticeMatch(match) && (
                      <span
                        style={{
                          padding: '6px 10px',
                          borderRadius: '999px',
                          background: 'rgba(16,185,129,0.16)',
                          color: '#34d399',
                          fontWeight: 900,
                          fontSize: '11px',
                          letterSpacing: '0.05em',
                          border: '1px solid rgba(16,185,129,0.35)',
                        }}
                      >
                        연습경기
                      </span>
                    )}
                  </div>
                  {match.notes && (
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: '999px',
                        background: 'rgba(34, 197, 94, 0.12)',
                        color: '#86efac',
                        fontWeight: 800,
                        fontSize: '11px',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {match.notes}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                      aria-hidden
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '999px',
                        backgroundColor: '#38bdf8',
                        boxShadow: '0 0 0 6px rgba(56, 189, 248, 0.12)',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {match.awayTeamName}
                    </span>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: '22px', color: '#f8fafc', letterSpacing: '0.04em' }}>
                    {scoreOrDash(liveScores[match.id]?.away ?? match.awayScore)} : {scoreOrDash(liveScores[match.id]?.home ?? match.homeScore)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', minWidth: 0 }}>
                    <span style={{ fontWeight: 800, color: '#e2e8f0', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                      {match.homeTeamName}
                    </span>
                    <span
                      aria-hidden
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '999px',
                        backgroundColor: '#f97316',
                        boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.12)',
                        flexShrink: 0,
                      }}
                    />
                  </div>
                </div>

                {(() => {
                  const isActive = match.id === state.activeMatchId;
                  const snapshot = liveScores[match.id];
                  const balls = isActive ? state.balls : snapshot?.balls ?? 0;
                  const strikes = isActive ? state.strikes : snapshot?.strikes ?? 0;
                  const outs = isActive ? state.outs : snapshot?.outs ?? 0;
                  const bases = isActive ? state.bases : snapshot?.bases;
                  const inningLabel = isActive
                    ? `${state.inning}회${state.half === 'top' ? '초' : '말'}`
                    : snapshot?.inning
                      ? `${snapshot.inning}회${snapshot.half === 'top' ? '초' : '말'}`
                      : '이닝 정보 없음';
                  const batter = isActive ? currentBatterName(state, lineupVisible) : '실시간 선택 시 표시';
                  const pitcher = isActive ? currentPitcherName(state, lineupVisible) : '투수 정보 없음';
                  const bDots = countDots(balls ?? 0, 3, '#22c55e');
                  const sDots = countDots(strikes ?? 0, 2, '#facc15');
                  const oDots = countDots(outs ?? 0, 3, '#ef4444');
                  return (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: '10px',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'rgba(15,23,42,0.6)',
                        border: '1px solid rgba(148,163,184,0.28)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <Badge label="B" dots={bDots} />
                        <Badge label="S" dots={sDots} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Badge label="O" dots={oDots} />
                          <MiniBases bases={bases} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: '6px', justifyItems: 'end', textAlign: 'right' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '12px' }}>{inningLabel}</span>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <span style={{ color: '#a5b4fc', fontWeight: 800, fontSize: '12px', whiteSpace: 'nowrap' }}>현재 투수: {pitcher}</span>
                          <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: '12px', whiteSpace: 'nowrap' }}>현재 타석: {batter}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {(() => {
                    const hasOverlay = Boolean((match.liveVideoUrl || '').trim());
                    return (
                      <button
                        type="button"
                        onClick={() => hasOverlay && handleOpenMatch(match.id, '/live-overlay')}
                        disabled={!hasOverlay}
                        title={hasOverlay ? '라이브 오버레이' : '기록원에서 유튜브 링크 미입력'}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: hasOverlay ? 'rgba(15, 23, 42, 0.75)' : 'rgba(148, 163, 184, 0.12)',
                          color: hasOverlay ? '#e2e8f0' : '#94a3b8',
                          border: hasOverlay ? '1px solid rgba(148, 163, 184, 0.35)' : '1px dashed rgba(148, 163, 184, 0.45)',
                          fontWeight: 800,
                          fontSize: '13px',
                          cursor: hasOverlay ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {hasOverlay ? '라이브 오버레이' : '라이브 없음'}
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => handleOpenMatch(match.id, '/scoreboard-text')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#dbeafe',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    문자 중계 보기
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              borderRadius: '14px',
              padding: '14px',
              border: '1px dashed rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.7)',
              color: '#cbd5e1',
              display: 'grid',
              gap: '8px',
              fontSize: '14px',
            }}
          >
            <span style={{ fontWeight: 800 }}>현재 진행 중인 경기가 없습니다.</span>
            <span style={{ color: '#94a3b8' }}>경기 일정에서 기록할 경기를 선택하거나 새 경기를 시작하면 실시간으로 표시됩니다.</span>
            <div>
              <Link
                to="/schedule"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(96, 165, 250, 0.3)',
                  color: '#bfdbfe',
                  fontWeight: 800,
                  fontSize: '13px',
                  background: 'rgba(96, 165, 250, 0.08)',
                }}
              >
                경기 일정 바로가기 →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Today's Schedule Strip */}
      <section
        style={{
          borderRadius: 'var(--surface-radius-md)',
          padding: '12px 14px',
          border: '1px solid rgba(148, 163, 184, 0.24)',
          background: 'rgba(15, 23, 42, 0.65)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.25)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              backgroundColor: '#a855f7',
              boxShadow: '0 0 0 6px rgba(168, 85, 247, 0.15)',
            }}
          />
          오늘 예정 경기
        </div>
        {todaysScheduled.length ? (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', alignItems: 'stretch' }}>
            {todaysScheduled.map((match) => (
              <div
                key={`today-${match.id}`}
                style={{
                  flexShrink: 0,
                  minWidth: '240px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(168, 85, 247, 0.28)',
                  background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(99,102,241,0.08))',
                  color: '#e2e8f0',
                  display: 'grid',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 900, fontSize: '13px', color: '#ede9fe' }}>{formatTimeShort(match.startTime)}</span>
                    {isPracticeMatch(match) && (
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '999px',
                          background: 'rgba(16,185,129,0.18)',
                          color: '#34d399',
                          fontWeight: 900,
                          fontSize: '11px',
                          border: '1px solid rgba(16,185,129,0.35)',
                        }}
                      >
                        연습경기
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: '#c4b5fd', whiteSpace: 'nowrap' }}>{match.venue || '장소 미정'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                  <span style={{ color: '#e5e7eb' }}>{match.homeTeamName}</span>
                  <span style={{ color: '#c4b5fd', fontSize: '12px' }}>vs</span>
                  <span style={{ color: '#e5e7eb' }}>{match.awayTeamName}</span>
                </div>
                {match.notes && (
                  <span style={{ color: '#c084fc', fontWeight: 700, fontSize: '12px' }}>{match.notes}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>오늘 예정된 경기가 없습니다.</span>
        )}
      </section>

      {/* Tomorrow's Schedule Strip */}
      <section
        style={{
          borderRadius: 'var(--surface-radius-md)',
          padding: '12px 14px',
          border: '1px solid rgba(148, 163, 184, 0.24)',
          background: 'rgba(15, 23, 42, 0.65)',
          boxShadow: '0 10px 28px rgba(0,0,0,0.25)',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '13px' }}>
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '999px',
              backgroundColor: '#0ea5e9',
              boxShadow: '0 0 0 6px rgba(14, 165, 233, 0.15)',
            }}
          />
          내일 예정 경기
        </div>
        {tomorrowsScheduled.length ? (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', alignItems: 'stretch' }}>
            {tomorrowsScheduled.map((match) => (
              <div
                key={`tomorrow-${match.id}`}
                style={{
                  flexShrink: 0,
                  minWidth: '240px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(14, 165, 233, 0.28)',
                  background: 'linear-gradient(135deg, rgba(14,165,233,0.12), rgba(99,102,241,0.08))',
                  color: '#e2e8f0',
                  display: 'grid',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 900, fontSize: '13px', color: '#e0f2fe' }}>{formatTimeShort(match.startTime)}</span>
                    {isPracticeMatch(match) && (
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '999px',
                          background: 'rgba(16,185,129,0.18)',
                          color: '#34d399',
                          fontWeight: 900,
                          fontSize: '11px',
                          border: '1px solid rgba(16,185,129,0.35)',
                        }}
                      >
                        연습경기
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: '#bae6fd', whiteSpace: 'nowrap' }}>{match.venue || '장소 미정'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                  <span style={{ color: '#e5e7eb' }}>{match.homeTeamName}</span>
                  <span style={{ color: '#bae6fd', fontSize: '12px' }}>vs</span>
                  <span style={{ color: '#e5e7eb' }}>{match.awayTeamName}</span>
                </div>
                {match.notes && (
                  <span style={{ color: '#7dd3fc', fontWeight: 700, fontSize: '12px' }}>{match.notes}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '13px' }}>내일 예정된 경기가 없습니다.</span>
        )}
      </section>

      {/* Key Value Propositions */}
      <section
        ref={snapshotRef}
        style={{
          display: 'grid',
          gap: '22px',
          padding: 'var(--section-padding) 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#60a5fa',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(96, 165, 250, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>AUBL KEY VALUES</p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {landing.valueProps.map(({ title, desc, icon }) => (
            <div
              key={title}
              className="snapshot-card"
              style={{
                borderRadius: 'var(--surface-radius-md)',
                padding: 'clamp(16px, 3.2vw, 22px)',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(148,163,184,0.05))',
                border: '1px solid rgba(148, 163, 184, 0.22)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '24px' }}>{icon}</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{title}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 2026 Season Snapshot */}
      <section
        style={{
          display: 'grid',
          gap: '22px',
          padding: 'var(--section-padding) 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#34d399',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(52, 211, 153, 0.16)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 800, letterSpacing: '0.05em', fontSize: '13px' }}>2026 시즌 스냅샷</p>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
          }}
        >
          {landing.snapshotCards.map(({ label, value, desc }) => (
            <div
              key={label}
              className="snapshot-card"
              style={{
                borderRadius: 'var(--surface-radius-md)',
                padding: 'clamp(16px, 3.2vw, 22px)',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(52,211,153,0.06))',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '10px',
              }}
            >
              <span style={{ fontSize: '12px', letterSpacing: '0.08em', fontWeight: 800, color: '#34d399' }}>{label}</span>
              <p style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#e2e8f0' }}>{value}</p>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Season Highlights */}
      <section style={{ display: 'grid', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#cbd5e1' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: '#f97316',
              borderRadius: '999px',
              boxShadow: '0 0 0 6px rgba(249, 115, 22, 0.18)',
            }}
          />
          <p style={{ margin: 0, fontWeight: 700, letterSpacing: '0.05em', fontSize: '13px' }}>2026 시즌 하이라이트 & 바로가기</p>
        </div>
        <div
          style={{
            display: 'grid',
            gap: '18px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          {landing.seasonHighlights.map(({ title, desc, icon, link }, index) => (
            <div
              key={title}
              ref={(el) => {
                if (el) highlightRefs.current[index] = el;
              }}
              style={{
                padding: 'clamp(16px, 3.4vw, 22px)',
                borderRadius: 'var(--surface-radius-md)',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                display: 'grid',
                gap: '12px',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.22)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    backgroundColor: 'rgba(249, 115, 22, 0.12)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '24px',
                  }}
                >
                  {icon}
                </div>
                <h3 style={{ margin: 0, fontSize: 'clamp(16px, 4vw, 18px)', fontWeight: 800, color: '#e2e8f0' }}>{title}</h3>
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.6, fontSize: 'clamp(14px, 3.6vw, 15px)' }}>{desc}</p>
              {link && (
                <Link
                  to={link}
                  style={{
                    marginTop: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#93c5fd',
                    fontWeight: 700,
                  }}
                >
                  바로가기 →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Unique Play CTA */}
      <section
        className="cta-band"
        style={{
          borderRadius: 'var(--surface-radius-lg)',
          padding: 'var(--cta-padding)',
          background: 'linear-gradient(120deg, rgba(59, 130, 246, 0.15), rgba(16, 185, 129, 0.14))',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '18px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '6px', minWidth: '220px' }}>
          <span style={{ fontSize: 'clamp(11px, 2.8vw, 12px)', letterSpacing: '0.05em', fontWeight: 800, color: '#93c5fd' }}>
            UNIQUE-PLAY
          </span>
          <p style={{ margin: 0, fontSize: 'clamp(18px, 4.8vw, 20px)', fontWeight: 900, color: '#dbeafe' }}>
            유니크 플레이에서 리그 정보를 확인하세요.
          </p>
          <span style={{ color: '#bfdbfe', opacity: 0.9, fontWeight: 600, fontSize: 'clamp(13px, 3.5vw, 14px)' }}>
            경기/리그 관련 외부 페이지로 바로 이동할 수 있습니다.
          </span>
        </div>
        <a
          href={UNIQUE_PLAY_URL}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: 'clamp(14px, 3.6vw, 15px)',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid rgba(15, 23, 42, 0.6)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.28)',
          }}
        >
          유니크 플레이 바로가기 →
        </a>
      </section>

      {/* Social CTA */}
      <section
        className="cta-band"
        style={{
          borderRadius: 'var(--surface-radius-lg)',
          padding: 'var(--cta-padding)',
          background: 'linear-gradient(120deg, rgba(249, 115, 22, 0.16), rgba(99, 102, 241, 0.16))',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '18px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'grid', gap: '6px', minWidth: '220px' }}>
          <span style={{ fontSize: 'clamp(11px, 2.8vw, 12px)', letterSpacing: '0.05em', fontWeight: 800, color: '#a4a9b5ff' }}>
            FOLLOW
          </span>
          <p style={{ margin: 0, fontSize: 'clamp(18px, 4.8vw, 20px)', fontWeight: 900, color: '#a4a9b5ff' }}>
            인스타그램 @aubl_1981 에서 실시간 경기 사진과 이벤트를 확인하세요.
          </p>
          <span style={{ color: '#a4a9b5ff', opacity: 0.8, fontWeight: 600, fontSize: 'clamp(13px, 3.5vw, 14px)' }}>
            선수들의 루틴, 경기 비하인드, 팬 굿즈 소식까지 놓치지 마세요.
          </span>
        </div>
        <a
          href="https://www.instagram.com/aubl_1981/"
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: 'clamp(14px, 3.6vw, 15px)',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid rgba(15, 23, 42, 0.6)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.28)',
          }}
        >
          인스타그램 바로가기 →
        </a>
      </section>
    </div>
  );
}
