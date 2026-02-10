import 'package:flutter/material.dart';

import '../features/account/account_screen.dart';
import '../features/home/home_screen.dart';
import '../features/records/records_screen.dart';
import '../features/schedule/schedule_screen.dart';
import '../features/teams/team_hub_screen.dart';
import 'more_screen.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;

  final _screens = const [
    HomeScreen(),
    TeamHubScreen(),
    ScheduleScreen(),
    RecordsScreen(),
    AccountScreen(),
    MoreScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _currentIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) {
          setState(() => _currentIndex = 0);
        }
      },
      child: Scaffold(
        body: IndexedStack(
          index: _currentIndex,
          children: _screens,
        ),
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (i) => setState(() => _currentIndex = i),
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home), label: '홈'),
            BottomNavigationBarItem(icon: Icon(Icons.groups), label: '팀'),
            BottomNavigationBarItem(
                icon: Icon(Icons.calendar_month), label: '일정'),
            BottomNavigationBarItem(
                icon: Icon(Icons.leaderboard), label: '기록'),
            BottomNavigationBarItem(
                icon: Icon(Icons.person), label: '계정'),
            BottomNavigationBarItem(icon: Icon(Icons.menu), label: '더보기'),
          ],
        ),
      ),
    );
  }
}
