import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/navigation/app_destination.dart';
import '../core/navigation/app_destination_navigation.dart';
import '../core/services/notification_service.dart';
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
  final GlobalKey<ScheduleScreenState> _scheduleKey =
      GlobalKey<ScheduleScreenState>();
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
    _notifNavSub = NotificationService.instance.navigationStream.listen(
      _handleNotifNav,
    );

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

  void _openEmbeddedWebView(
    String path,
    String title, {
    bool fullscreen = false,
  }) {
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
      switchTab: (destination, {recordsTabIndex, scheduleTabIndex}) {
        if (hasOverlay) _closeEmbeddedWebView();
        if (recordsTabIndex != null) {
          _recordsKey.currentState?.switchToTabIndex(recordsTabIndex);
        }
        if (scheduleTabIndex != null) {
          _scheduleKey.currentState?.switchToTabIndex(scheduleTabIndex);
        }
        setState(() => _currentDestination = destination);
      },
      child: LayoutBuilder(
        builder: (context, constraints) {
          final useRail = AppNavigationBreakpoints.useRail(
            constraints.maxWidth,
            height: constraints.maxHeight,
          );
          final useExpandedRail = AppNavigationBreakpoints.useExpandedRail(
            constraints.maxWidth,
            height: constraints.maxHeight,
          );
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
                    ScheduleScreen(key: _scheduleKey),
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
                        FloatingDestinationRail(
                          current: _currentDestination,
                          expanded: useExpandedRail,
                          onSelected: select,
                        ),
                        Expanded(child: content),
                      ],
                    )
                  : content,
              bottomNavigationBar: useRail || hideNavigation
                  ? null
                  : FloatingDestinationBar(
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
