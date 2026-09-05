import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthProvider';
import { useAdmin } from '../shared/auth/useAdmin';
import { useFeatureFlags } from '../shared/config/FeatureFlagsProvider';
import { ContentProvider } from '../shared/state/contentProvider';
import { useDemoStore } from '../shared/state/demoStore';
import { SeasonBadge, SeasonButton, SeasonLinkButton, SeasonWordmark } from '../shared/components/season';

const NOTIFICATION_PROMPT_KEY = 'aubl:notificationPrompt:v1';
const THEME_STORAGE_KEY = 'aubl:theme:v1';
const NOTIFICATION_PROMPT_SNOOZE_MS = 1000 * 60 * 60 * 24;

type NavigationLink = {
  path: string;
  label: string;
  requiresAdmin?: boolean;
  requiresScorekeeper?: boolean;
};

type NavigationItem = NavigationLink & {
  children?: NavigationLink[];
};

type ShellIconName = 'home' | 'calendar' | 'groups' | 'records' | 'more' | 'chevron' | 'close' | 'sun' | 'moon' | 'bell';

function ShellIcon({ name, size = 20 }: { name: ShellIconName; size?: number }) {
  const paths: Record<Exclude<ShellIconName, 'close'>, ReactNode> = {
    home: <path d="M3 11.25 12 4l9 7.25V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9.75Z" />,
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3" />
      </>
    ),
    groups: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M2.5 20c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M14 15c3.9-.8 6.4.9 7 4" />
      </>
    ),
    records: (
      <>
        <path d="M5 21V10M12 21V3M19 21v-6" />
        <path d="M2 21h20" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
      </>
    ),
    moon: <path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" />,
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 22h4" />
      </>
    ),
  };

  if (name === 'close') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function isRouteActive(pathname: string, search: string, path: string, includeChildren = false) {
  const [normalized, expectedQuery = ''] = path.split('?');
  if (normalized === '/') return pathname === '/';
  if (includeChildren) return pathname === normalized || pathname.startsWith(`${normalized}/`);
  if (pathname !== normalized) return false;
  if (!expectedQuery) return true;

  const expected = new URLSearchParams(expectedQuery);
  const current = new URLSearchParams(search);
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function DesktopMenuLink({
  item,
  canUseScorekeeper,
  isAdmin,
  pathname,
  search,
}: {
  item: NavigationLink;
  canUseScorekeeper: boolean;
  isAdmin: boolean;
  pathname: string;
  search: string;
}) {
  if (item.requiresAdmin && !isAdmin) return null;
  const blocked = item.requiresScorekeeper && !canUseScorekeeper;

  if (blocked) {
    return (
      <span
        className="shell-menu__link shell-menu__link--disabled"
        role="menuitem"
        aria-disabled="true"
        title="관리자 또는 기록원 권한이 필요합니다"
      >
        {item.label}
      </span>
    );
  }

  return (
    <Link
      to={item.path}
      role="menuitem"
      className={`shell-menu__link${isRouteActive(pathname, search, item.path) ? ' is-active' : ''}`}
    >
      {item.label}
    </Link>
  );
}

function MobileMenuLink({
  item,
  canUseScorekeeper,
  isAdmin,
  pathname,
  search,
}: {
  item: NavigationLink;
  canUseScorekeeper: boolean;
  isAdmin: boolean;
  pathname: string;
  search: string;
}) {
  if (item.requiresAdmin && !isAdmin) return null;
  const blocked = item.requiresScorekeeper && !canUseScorekeeper;

  if (blocked) {
    return (
      <span className="mobile-sheet__link is-disabled" aria-disabled="true" title="관리자 또는 기록원 권한이 필요합니다">
        <span>{item.label}</span>
        <small>권한 필요</small>
      </span>
    );
  }

  return (
    <Link to={item.path} className={`mobile-sheet__link${isRouteActive(pathname, search, item.path) ? ' is-active' : ''}`}>
      <span>{item.label}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

export default function Layout() {
  const location = useLocation();
  const { user, logout, initializing } = useAuth();
  const { isAdmin, canUseScorekeeper, canEditGameRecords, roleLabel, roleDetail } = useAdmin();
  const { state } = useDemoStore();
  const { allstarEnabled } = useFeatureFlags();
  const headerRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const mobileSheetRef = useRef<HTMLElement>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notificationRequesting, setNotificationRequesting] = useState(false);
  const [notificationBlocked, setNotificationBlocked] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  const isLiveOverlay = location.pathname.startsWith('/live-overlay');
  const isScoreboardText = location.pathname.startsWith('/scoreboard-text');
  const preservesScoreOperations = [
    '/scorekeeper',
    '/scoreboard',
    '/scoreboard-text',
    '/live-overlay',
    '/admin/games',
  ].some((path) => location.pathname.startsWith(path));
  const isEmbeddedParam = new URLSearchParams(location.search).get('embedded') === 'flutter';
  const embeddedRef = useRef(false);
  if (isEmbeddedParam) embeddedRef.current = true;
  const isEmbedded = embeddedRef.current;
  const hideChrome = isLiveOverlay || isEmbedded;
  const isDrawPage = location.pathname === '/draw';
  const showPublicNavigation = !hideChrome && !isDrawPage;
  const showSeasonDetailTheme =
    !hideChrome &&
    location.pathname !== '/' &&
    // Login owns its complete season layout; the legacy bridge overrides its
    // typography, controls and dark-mode contrast with higher specificity.
    !/^\/login\/?$/.test(location.pathname) &&
    !isDrawPage &&
    !preservesScoreOperations;

  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId),
    [state.activeMatchId, state.matches],
  );
  const hasLiveOverlay = Boolean((activeMatch?.liveVideoUrl || '').trim());
  const scorekeeperPath = state.activeMatchId ? `/scorekeeper/${state.activeMatchId}` : '/scorekeeper';
  const scoreboardTextPath = state.activeMatchId ? `/scoreboard-text/${state.activeMatchId}` : '/scoreboard-text';
  const liveOverlayPath = state.activeMatchId ? `/live-overlay/${state.activeMatchId}` : '/live-overlay';

  const navigationItems = useMemo<NavigationItem[]>(
    () => [
      {
        path: '/intro',
        label: '리그',
        children: [
          { path: '/intro', label: '리그 소개' },
          { path: '/rules', label: '회칙' },
          { path: '/intro/teams', label: '참가팀 · 조편성' },
        ],
      },
      { path: '/teams', label: '팀' },
      {
        path: '/schedule',
        label: '경기',
        children: [
          { path: '/schedule', label: '경기 일정' },
          { path: '/schedule/live', label: '실시간 경기' },
          { path: '/schedule/results', label: '경기 결과' },
          { path: '/schedule/groups', label: '조별 일정' },
          { path: '/schedule/practice', label: '연습경기' },
          { path: '/schedule/manage', label: '일정 관리', requiresAdmin: true },
        ],
      },
      ...(allstarEnabled ? [{ path: '/allstar', label: '올스타전' }] : []),
      {
        path: '/records',
        label: '기록',
        children: [
          { path: '/records?tab=overview', label: '기록 개요' },
          { path: '/records?tab=standings', label: '팀 순위' },
          { path: '/records?tab=pitchers', label: '투수 기록' },
          { path: '/records?tab=batters', label: '타자 기록' },
          { path: '/records/player', label: '선수 상세' },
          { path: '/records?tab=power', label: '파워랭킹' },
        ],
      },
      { path: '/community', label: '커뮤니티' },
      {
        path: '/more',
        label: '더보기',
        children: [
          { path: '/prediction', label: '승부예측' },
          { path: scorekeeperPath, label: '기록원', requiresScorekeeper: true },
          { path: '/manual', label: '사용설명서' },
        ],
      },
    ],
    [allstarEnabled, scorekeeperPath],
  );

  const mobileMenuGroups = useMemo(
    () => [
      {
        title: '리그',
        items: [
          { path: '/intro', label: '리그 소개' },
          { path: '/rules', label: '회칙' },
          { path: '/teams', label: '참가팀' },
        ],
      },
      {
        title: '경기 · 기록',
        items: [
          { path: '/schedule/live', label: '실시간 경기' },
          { path: '/schedule/results', label: '경기 결과' },
          { path: '/schedule/practice', label: '연습경기' },
          { path: '/records/player', label: '선수 상세' },
          { path: scorekeeperPath, label: '기록원', requiresScorekeeper: true },
          { path: '/schedule/manage', label: '일정 관리', requiresAdmin: true },
        ] satisfies NavigationLink[],
      },
      {
        title: 'AUBL',
        items: [
          ...(allstarEnabled ? [{ path: '/allstar', label: '올스타전' }] : []),
          { path: '/community', label: '커뮤니티' },
          { path: '/prediction', label: '승부예측' },
          { path: '/manual', label: '사용설명서' },
        ],
      },
    ],
    [allstarEnabled, scorekeeperPath],
  );

  const displayName = user?.displayName?.trim() || user?.email?.split('@')[0] || '내 계정';
  const accountInitial = displayName.slice(0, 1).toUpperCase();

  const mobileSection = useMemo(() => {
    if (location.pathname === '/') return 'home';
    if (location.pathname === '/schedule/groups') return 'groups';
    if (location.pathname === '/schedule' || location.pathname.startsWith('/schedule/')) return 'calendar';
    if (location.pathname === '/records' || location.pathname.startsWith('/records/')) return 'records';
    return 'more';
  }, [location.pathname]);

  useEffect(() => {
    setShowMobileMenu(false);
    headerRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => details.removeAttribute('open'));
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname, location.search]);

  useEffect(() => {
    const mobileViewport = window.matchMedia('(max-width: 900px)');
    const closeMenuOutsideMobile = (event: MediaQueryListEvent | MediaQueryList) => {
      if (!event.matches) setShowMobileMenu(false);
    };

    closeMenuOutsideMobile(mobileViewport);
    mobileViewport.addEventListener('change', closeMenuOutsideMobile);
    return () => mobileViewport.removeEventListener('change', closeMenuOutsideMobile);
  }, []);

  useEffect(() => {
    if (!showMobileMenu) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => mobileMenuCloseRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMobileMenu(false);
        window.requestAnimationFrame(() => moreButtonRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        mobileSheetRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMobileMenu]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined' || isLiveOverlay) return;

    const now = Date.now();
    const stored = window.localStorage.getItem(NOTIFICATION_PROMPT_KEY);
    let snoozedUntil = 0;
    let blockedSnoozedUntil = 0;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          snoozedAt?: number;
          snoozedUntil?: number;
          blockedSnoozedUntil?: number;
          permission?: NotificationPermission;
        };
        if (parsed.permission === 'granted') return;
        snoozedUntil = parsed.snoozedUntil ?? ((parsed.snoozedAt ?? 0) + NOTIFICATION_PROMPT_SNOOZE_MS);
        blockedSnoozedUntil = parsed.blockedSnoozedUntil ?? 0;
      } catch {
        // Ignore an invalid legacy cache value.
      }
    }

    if (Notification.permission === 'granted') {
      window.localStorage.setItem(NOTIFICATION_PROMPT_KEY, JSON.stringify({ permission: 'granted', updatedAt: now }));
      return;
    }
    if (Notification.permission === 'denied') {
      if (now < blockedSnoozedUntil) return;
      setNotificationBlocked(true);
      return;
    }
    if (now >= snoozedUntil) setShowNotificationPrompt(true);
  }, [isLiveOverlay]);

  useEffect(() => {
    const syncPermission = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      window.localStorage.setItem(
        NOTIFICATION_PROMPT_KEY,
        JSON.stringify({ permission: 'granted', updatedAt: Date.now() }),
      );
      setNotificationBlocked(false);
      setShowNotificationPrompt(false);
    };
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, []);

  const handleRequestNotification = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    setNotificationRequesting(true);
    try {
      const result = await Notification.requestPermission();
      const now = Date.now();
      window.localStorage.setItem(
        NOTIFICATION_PROMPT_KEY,
        JSON.stringify({
          permission: result,
          updatedAt: now,
          ...(result === 'default' ? { snoozedUntil: now + NOTIFICATION_PROMPT_SNOOZE_MS } : {}),
        }),
      );
      setNotificationBlocked(result === 'denied');
      setShowNotificationPrompt(false);
    } finally {
      setNotificationRequesting(false);
    }
  }, []);

  const handleLogout = useCallback(() => {
    setShowMobileMenu(false);
    void logout();
  }, [logout]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#07142b' : '#ffffff');
  }, [theme]);

  useEffect(() => {
    const handleNativeTheme = (event: Event) => {
      const requested = (event as CustomEvent<{ theme?: unknown }>).detail?.theme;
      if (requested === 'light' || requested === 'dark') setTheme(requested);
    };
    window.addEventListener('aubl-native-theme', handleNativeTheme);
    return () => window.removeEventListener('aubl-native-theme', handleNativeTheme);
  }, []);

  const handleShellMenuToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) return;
    headerRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => {
      if (details !== event.currentTarget) details.removeAttribute('open');
    });
  }, []);

  useEffect(() => {
    const closeDesktopMenus = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && headerRef.current?.contains(event.target as Node)) return;
      headerRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => details.removeAttribute('open'));
    };
    document.addEventListener('pointerdown', closeDesktopMenus);
    document.addEventListener('keydown', closeDesktopMenus);
    return () => {
      document.removeEventListener('pointerdown', closeDesktopMenus);
      document.removeEventListener('keydown', closeDesktopMenus);
    };
  }, []);

  return (
    <ContentProvider>
      <div className={`app-shell${showPublicNavigation ? ' app-shell--with-mobile-nav' : ''}`}>
        {showPublicNavigation && (
          <header ref={headerRef} className="app-header season-shell-header">
            <div className="app-header__inner season-shell-header__inner">
              <Link to="/" className="season-shell-brand" aria-label="AUBL 홈">
                <img className="season-shell-brand__logo" src="/assets/aubl_clean.png" alt="AUBL" />
              </Link>

              <button
                type="button"
                className="shell-theme-button shell-theme-button--mobile"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
              >
                <ShellIcon name={theme === 'dark' ? 'sun' : 'moon'} />
              </button>

              <nav className="shell-desktop-nav" aria-label="주요 메뉴">
                {navigationItems.map((item) => {
                  const visibleChildren = item.children?.filter((child) => !child.requiresAdmin || isAdmin);
                  const active = item.children
                    ? isRouteActive(location.pathname, location.search, item.path, true) ||
                      item.children.some((child) => isRouteActive(location.pathname, location.search, child.path))
                    : isRouteActive(location.pathname, location.search, item.path, true);

                  if (visibleChildren?.length) {
                    return (
                      <details key={item.label} className="shell-nav-menu" data-shell-menu onToggle={handleShellMenuToggle}>
                        <summary className={`shell-nav__item${active ? ' is-active' : ''}`}>
                          {item.label}
                          <ShellIcon name="chevron" size={16} />
                        </summary>
                        <div className="shell-menu" role="menu" aria-label={`${item.label} 하위 메뉴`}>
                          {visibleChildren.map((child) => (
                            <DesktopMenuLink
                              key={child.path}
                              item={child}
                              pathname={location.pathname}
                              search={location.search}
                              canUseScorekeeper={canUseScorekeeper}
                              isAdmin={isAdmin}
                            />
                          ))}
                        </div>
                      </details>
                    );
                  }

                  return (
                    <Link key={item.path} to={item.path} className={`shell-nav__item${active ? ' is-active' : ''}`}>
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="shell-account-area">
                {showNotificationPrompt && !notificationBlocked ? (
                  <button
                    type="button"
                    className="shell-theme-button"
                    onClick={handleRequestNotification}
                    disabled={notificationRequesting}
                    aria-label={notificationRequesting ? '경기 알림 권한 요청 중' : '경기 알림 켜기'}
                    title="경기 알림 켜기"
                  >
                    <ShellIcon name="bell" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="shell-theme-button"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                  title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
                >
                  <ShellIcon name={theme === 'dark' ? 'sun' : 'moon'} />
                </button>
                {initializing ? (
                  <span className="shell-account-loading" role="status">로그인 확인 중</span>
                ) : user ? (
                  <details className="shell-account-menu" data-shell-menu onToggle={handleShellMenuToggle}>
                    <summary className="shell-account-summary" aria-label="계정 메뉴 열기">
                      <span className="shell-account-avatar" aria-hidden="true">{accountInitial}</span>
                      <span className="shell-account-copy">
                        <strong>{displayName}</strong>
                        <small>내 계정</small>
                      </span>
                      <ShellIcon name="chevron" size={16} />
                    </summary>
                    <div className="shell-account-popover">
                      <div className="shell-account-popover__identity">
                        <SeasonBadge tone={isAdmin ? 'blue' : 'navy'}>{roleLabel}</SeasonBadge>
                        <strong>{displayName}</strong>
                        <span>{roleDetail}</span>
                      </div>
                      <Link to="/account" className="shell-account-link">계정 설정</Link>
                      {isAdmin && <Link to="/admin" className="shell-account-link">관리자 센터</Link>}
                      {!isAdmin && canEditGameRecords && (
                        <Link to="/admin/games" className="shell-account-link">경기 기록 관리</Link>
                      )}
                      {canUseScorekeeper && <Link to={scorekeeperPath} className="shell-account-link">기록원 열기</Link>}
                      <SeasonButton variant="ghost" fullWidth onClick={handleLogout}>로그아웃</SeasonButton>
                    </div>
                  </details>
                ) : (
                  <SeasonLinkButton to="/login" size="compact">로그인</SeasonLinkButton>
                )}
              </div>
            </div>
          </header>
        )}

        <main
          className={`app-main${showSeasonDetailTheme ? ' season-detail-scope' : ''}`}
          style={hideChrome ? { maxWidth: '100%', margin: 0, padding: 0 } : undefined}
        >
          {!hideChrome && isScoreboardText && (
            <nav className="shell-context-nav" aria-label="중계 화면 전환">
              <Link to={scoreboardTextPath} className="is-active" aria-current="page">문자중계</Link>
              {hasLiveOverlay ? (
                <Link to={liveOverlayPath}>라이브 오버레이</Link>
              ) : (
                <span aria-disabled="true">라이브 없음</span>
              )}
            </nav>
          )}

          <Outlet />
        </main>

        {!hideChrome && (
          <footer className="season-shell-footer">
            <div className="season-shell-footer__inner">
              <SeasonWordmark compact />
              <div className="season-shell-footer__legal">
                <Link to="/privacy">개인정보 처리방침</Link>
                <Link to="/terms">이용약관</Link>
              </div>
              <span>© 2026 Amateur University Baseball League</span>
            </div>
          </footer>
        )}

        {showPublicNavigation && (
          <nav className="shell-mobile-nav" aria-label="모바일 주요 메뉴">
            <Link to="/" className={mobileSection === 'home' ? 'is-active' : ''} aria-current={mobileSection === 'home' ? 'page' : undefined}>
              <ShellIcon name="home" />
              <span>홈</span>
            </Link>
            <Link to="/schedule" className={mobileSection === 'calendar' ? 'is-active' : ''} aria-current={mobileSection === 'calendar' ? 'page' : undefined}>
              <ShellIcon name="calendar" />
              <span>경기</span>
            </Link>
            <Link to="/schedule/groups" className={mobileSection === 'groups' ? 'is-active' : ''} aria-current={mobileSection === 'groups' ? 'page' : undefined}>
              <ShellIcon name="groups" />
              <span>조별</span>
            </Link>
            <Link to="/records" className={mobileSection === 'records' ? 'is-active' : ''} aria-current={mobileSection === 'records' ? 'page' : undefined}>
              <ShellIcon name="records" />
              <span>기록</span>
            </Link>
            <button
              ref={moreButtonRef}
              type="button"
              className={mobileSection === 'more' || showMobileMenu ? 'is-active' : ''}
              aria-expanded={showMobileMenu}
              aria-controls="mobile-more-menu"
              onClick={() => setShowMobileMenu(true)}
            >
              <ShellIcon name="more" />
              <span>더보기</span>
            </button>
          </nav>
        )}

        {showPublicNavigation && showMobileMenu && (
          <>
            <div className="mobile-sheet-backdrop" aria-hidden="true" onClick={() => setShowMobileMenu(false)} />
            <aside ref={mobileSheetRef} id="mobile-more-menu" className="mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
              <div className="mobile-sheet__header">
                <div>
                  <SeasonBadge tone="blue">2026 SEASON</SeasonBadge>
                  <h2 id="mobile-sheet-title">더보기</h2>
                </div>
                <div className="mobile-sheet__header-actions">
                  {showNotificationPrompt && !notificationBlocked ? (
                    <button
                      type="button"
                      className="mobile-sheet__close"
                      onClick={handleRequestNotification}
                      disabled={notificationRequesting}
                      aria-label={notificationRequesting ? '경기 알림 권한 요청 중' : '경기 알림 켜기'}
                      title="경기 알림 켜기"
                    >
                      <ShellIcon name="bell" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mobile-sheet__close"
                    aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
                    title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
                    onClick={toggleTheme}
                  >
                    <ShellIcon name={theme === 'dark' ? 'sun' : 'moon'} />
                  </button>
                  <button
                    ref={mobileMenuCloseRef}
                    type="button"
                    className="mobile-sheet__close"
                    aria-label="더보기 메뉴 닫기"
                    onClick={() => {
                      setShowMobileMenu(false);
                      window.requestAnimationFrame(() => moreButtonRef.current?.focus());
                    }}
                  >
                    <ShellIcon name="close" />
                  </button>
                </div>
              </div>

              <section className="mobile-sheet__account" aria-label="계정">
                {initializing ? (
                  <span role="status">로그인 확인 중…</span>
                ) : user ? (
                  <>
                    <div className="mobile-sheet__identity">
                      <span className="shell-account-avatar" aria-hidden="true">{accountInitial}</span>
                      <span>
                        <strong>{displayName}</strong>
                        <small>{roleLabel} · {roleDetail}</small>
                      </span>
                    </div>
                    <div className="mobile-sheet__account-actions">
                      <SeasonLinkButton to="/account" variant="secondary" size="compact">계정 설정</SeasonLinkButton>
                      {isAdmin && <SeasonLinkButton to="/admin" variant="secondary" size="compact">관리자</SeasonLinkButton>}
                      {!isAdmin && canEditGameRecords && (
                        <SeasonLinkButton to="/admin/games" variant="secondary" size="compact">기록 관리</SeasonLinkButton>
                      )}
                      <SeasonButton variant="ghost" size="compact" onClick={handleLogout}>로그아웃</SeasonButton>
                    </div>
                  </>
                ) : (
                  <SeasonLinkButton to="/login" fullWidth>로그인</SeasonLinkButton>
                )}
              </section>

              <div className="mobile-sheet__groups">
                {mobileMenuGroups.map((group) => (
                  <section key={group.title} className="mobile-sheet__group">
                    <h3>{group.title}</h3>
                    <div>
                      {group.items.map((item) => (
                        <MobileMenuLink
                          key={item.path}
                          item={item}
                          pathname={location.pathname}
                          search={location.search}
                          canUseScorekeeper={canUseScorekeeper}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </aside>
          </>
        )}
      </div>
    </ContentProvider>
  );
}
