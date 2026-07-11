import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

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
  int _currentIndex = 0;
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
        setState(() => _currentIndex = 4);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          _communityKey.currentState?.switchToCategory('긴급');
        });
      case 'community_notice':
        setState(() => _currentIndex = 4);
      case 'team_notice':
        setState(() => _currentIndex = 1);
      case 'match':
        setState(() => _currentIndex = 2);
      case 'inquiry':
        setState(() => _currentIndex = 4);
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
      switchTab: (i, {recordsTabIndex}) {
        if (hasOverlay) _closeEmbeddedWebView();
        if (recordsTabIndex != null) {
          _recordsKey.currentState?.switchToTabIndex(recordsTabIndex);
        }
        setState(() => _currentIndex = i);
      },
      child: PopScope(
        canPop: _currentIndex == 0 && !hasOverlay,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) {
            if (hasOverlay) {
              _closeEmbeddedWebView();
            } else {
              setState(() => _currentIndex = 0);
            }
          }
        },
        child: Scaffold(
          body: Stack(
            children: [
              Offstage(
                offstage: hasOverlay,
                child: IndexedStack(
                  index: _currentIndex,
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
          ),
          bottomNavigationBar: (hasOverlay && _overlayFullscreen)
              ? null
              : BottomNavigationBar(
                  currentIndex: _currentIndex,
                  onTap: (i) {
                    if (hasOverlay) _closeEmbeddedWebView();
                    setState(() => _currentIndex = i);
                  },
                  items: [
                    const BottomNavigationBarItem(
                        icon: Icon(Icons.home), label: '홈'),
                    const BottomNavigationBarItem(
                        icon: Icon(Icons.groups), label: '팀'),
                    const BottomNavigationBarItem(
                        icon: Icon(Icons.calendar_month), label: '일정'),
                    const BottomNavigationBarItem(
                        icon: Icon(Icons.leaderboard), label: '기록'),
                    const BottomNavigationBarItem(
                        icon: Icon(Icons.forum), label: '커뮤니티'),
                    BottomNavigationBarItem(
                      icon: _loggedIn
                          ? const Icon(Icons.menu)
                          : const Badge(
                              label: Text('로그인', style: TextStyle(fontSize: 9)),
                              backgroundColor: Color(0xFF3B82F6),
                              child: Icon(Icons.menu),
                            ),
                      label: '더보기',
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
