import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../features/community/community_screen.dart';
import '../features/home/home_screen.dart';
import '../features/records/records_screen.dart';
import '../features/schedule/schedule_screen.dart';
import '../features/teams/team_hub_screen.dart';
import 'embedded_webview_panel.dart';
import 'more_screen.dart';
import 'shell_controller.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;
  bool _loggedIn = false;
  late final StreamSubscription<User?> _authSub;

  // 임베디드 웹뷰 오버레이 상태
  String? _overlayPath;
  String? _overlayTitle;
  bool _overlayFullscreen = false;

  final _screens = const [
    HomeScreen(),
    TeamHubScreen(),
    ScheduleScreen(),
    RecordsScreen(),
    CommunityScreen(),
    MoreScreen(),
  ];

  @override
  void initState() {
    super.initState();
    _loggedIn = FirebaseAuth.instance.currentUser != null;
    _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (mounted) setState(() => _loggedIn = user != null);
    });
  }

  @override
  void dispose() {
    _authSub.cancel();
    super.dispose();
  }

  void _openEmbeddedWebView(String path, String title, {bool fullscreen = false}) {
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

  @override
  Widget build(BuildContext context) {
    final hasOverlay = _overlayPath != null;

    return ShellController(
      openEmbeddedWebView: _openEmbeddedWebView,
      closeEmbeddedWebView: _closeEmbeddedWebView,
      switchTab: (i) {
        if (hasOverlay) _closeEmbeddedWebView();
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
                  children: _screens,
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
          bottomNavigationBar: (hasOverlay && _overlayFullscreen) ? null : BottomNavigationBar(
            currentIndex: _currentIndex,
            onTap: (i) {
              if (hasOverlay) _closeEmbeddedWebView();
              setState(() => _currentIndex = i);
            },
            items: [
              const BottomNavigationBarItem(icon: Icon(Icons.home), label: '홈'),
              const BottomNavigationBarItem(icon: Icon(Icons.groups), label: '팀'),
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
                        label: Text('로그인',
                            style: TextStyle(fontSize: 9)),
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
