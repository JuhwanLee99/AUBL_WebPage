import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/navigation/app_destination.dart';
import '../core/services/notification_service.dart';
import '../core/theme/app_theme.dart';
import '../features/feature_entries.dart';
import 'embedded_webview_panel.dart';
import 'more_screen.dart';
import 'shell_controller.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  AppDestination _currentDestination = AppDestination.home;
  bool _loggedIn = false;
  late final StreamSubscription<User?> _authSub;
  StreamSubscription<String>? _notifNavSub;
  final _refreshNotifier = ValueNotifier<int>(0);
  final GlobalKey<RecordsScreenState> _recordsKey =
      GlobalKey<RecordsScreenState>();
  final GlobalKey<CommunityScreenState> _communityKey =
      GlobalKey<CommunityScreenState>();

  // 임베디드 웹뷰 오버레이 상태
  String? _overlayPath;
  String? _overlayTitle;
  bool _overlayFullscreen = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loggedIn = FirebaseAuth.instance.currentUser != null;
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (mounted) setState(() => _loggedIn = user != null);
    });

    // 알림 탭 네비게이션 스트림 구독
    _notifNavSub =
        NotificationService.instance.navigationStream.listen(_handleNotifNav);

    // 앱 종료 후 알림으로 시작된 경우 처리
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final pending = NotificationService.instance.consumePendingNav();
      if (pending != null) _handleNotifNav(pending);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _refreshNotifier.dispose();
    _authSub.cancel();
    _notifNavSub?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshNotifier.value++;
    }
  }

  void _openEmbeddedWebView(String path, String title,
      {bool fullscreen = false}) {
    setState(() {
      _overlayPath = path;
      _overlayTitle = title;
      _overlayFullscreen = fullscreen;
    });
  }

  void _closeEmbeddedWebView() {
    setState(() {
      _overlayPath = null;
      _overlayTitle = null;
      _overlayFullscreen = false;
    });
  }

  /// 알림 탭 시 nav_type에 따라 적절한 탭/화면으로 이동.
  void _handleNotifNav(String navType) {
    if (!mounted) return;
    // 오버레이가 열려 있으면 닫기
    if (_overlayPath != null) _closeEmbeddedWebView();

    switch (navType) {
      case 'community_urgent':
        setState(() => _currentDestination = AppDestination.community);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _communityKey.currentState?.switchToCategory('긴급');
        });
      case 'community_notice':
        setState(() => _currentDestination = AppDestination.community);
      case 'team_notice':
        setState(() => _currentDestination = AppDestination.teams);
      case 'match':
        setState(() => _currentDestination = AppDestination.games);
      case 'inquiry':
        setState(() => _currentDestination = AppDestination.community);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          Navigator.of(context).push<void>(
            MaterialPageRoute(builder: (_) => const InquiryBoardScreen()),
          );
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasOverlay = _overlayPath != null;

    return ShellController(
      openEmbeddedWebView: _openEmbeddedWebView,
      closeEmbeddedWebView: _closeEmbeddedWebView,
      refreshNotifier: _refreshNotifier,
      switchTab: (destination, {recordsTabIndex}) {
        if (hasOverlay) _closeEmbeddedWebView();
        if (recordsTabIndex != null) {
          _recordsKey.currentState?.switchToTabIndex(recordsTabIndex);
        }
        setState(() => _currentDestination = destination);
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          final useRail = constraints.maxWidth >= 840;
          final hideNavigation = hasOverlay && _overlayFullscreen;
          final content = Stack(
            children: [
              Offstage(
                offstage: hasOverlay,
                child: IndexedStack(
                  index: _currentDestination.index,
                  children: [
                    const HomeScreen(),
                    const TeamHubScreen(),
                    const ScheduleScreen(),
                    RecordsScreen(key: _recordsKey),
                    CommunityScreen(key: _communityKey),
                    const MoreScreen(),
                  ],
                ),
              ),
              if (hasOverlay)
                EmbeddedWebViewPanel(
                  key: ValueKey(_overlayPath),
                  path: _overlayPath!,
                  title: _overlayTitle!,
                  fullscreen: _overlayFullscreen,
                  onClose: _closeEmbeddedWebView,
                ),
            ],
          );
          void select(AppDestination destination) {
            if (hasOverlay) _closeEmbeddedWebView();
            setState(() => _currentDestination = destination);
          }

          return PopScope(
            canPop: _currentDestination == AppDestination.home && !hasOverlay,
            onPopInvokedWithResult: (didPop, _) {
              if (!didPop) {
                if (hasOverlay) {
                  _closeEmbeddedWebView();
                } else {
                  setState(() => _currentDestination = AppDestination.home);
                }
              }
            },
            child: Scaffold(
              body: useRail && !hideNavigation
                  ? Row(
                      children: [
                        _FloatingNavigationRail(
                          current: _currentDestination,
                          onSelected: select,
                        ),
                        Expanded(child: content),
                      ],
                    )
                  : content,
              bottomNavigationBar: useRail || hideNavigation
                  ? null
                  : _FloatingNavigation(
                      current: _currentDestination,
                      loggedIn: _loggedIn,
                      onSelected: select,
                    ),
            ),
          );
        },
      ),
    );
  }
}

class _FloatingNavigationRail extends StatelessWidget {
  const _FloatingNavigationRail({
    required this.current,
    required this.onSelected,
  });

  final AppDestination current;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(12, 12, 0, 12),
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.line),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(21),
          child: NavigationRail(
            backgroundColor: colors.surface,
            selectedIndex: current.index,
            labelType: NavigationRailLabelType.all,
            groupAlignment: -0.6,
            onDestinationSelected: (index) =>
                onSelected(AppDestination.values[index]),
            destinations: AppDestination.values
                .map(
                  (destination) => NavigationRailDestination(
                    icon: Icon(_FloatingNavigation._icons[destination]),
                    selectedIcon: Icon(
                      _FloatingNavigation._icons[destination],
                      fill: 1,
                    ),
                    label: Text(destination.label),
                  ),
                )
                .toList(),
          ),
        ),
      ),
    );
  }
}

class _FloatingNavigation extends StatelessWidget {
  const _FloatingNavigation({
    required this.current,
    required this.loggedIn,
    required this.onSelected,
  });

  final AppDestination current;
  final bool loggedIn;
  final ValueChanged<AppDestination> onSelected;

  static const _icons = <AppDestination, IconData>{
    AppDestination.home: Icons.home_outlined,
    AppDestination.teams: Icons.groups_outlined,
    AppDestination.games: Icons.calendar_month_outlined,
    AppDestination.records: Icons.leaderboard_outlined,
    AppDestination.community: Icons.forum_outlined,
    AppDestination.more: Icons.menu,
  };

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return SafeArea(
      minimum: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: colors.line),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(
                alpha: Theme.of(context).brightness == Brightness.dark
                    ? 0.24
                    : 0.09,
              ),
              blurRadius: 22,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(21),
          child: NavigationBar(
            selectedIndex: current.index,
            labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
            onDestinationSelected: (index) =>
                onSelected(AppDestination.values[index]),
            destinations: AppDestination.values.map((destination) {
              Widget icon = Icon(_icons[destination]);
              if (destination == AppDestination.more && !loggedIn) {
                icon = Badge(child: icon);
              }
              return NavigationDestination(
                icon: icon,
                selectedIcon: Icon(_icons[destination], fill: 1),
                label: destination.label,
                tooltip: destination.label,
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}
