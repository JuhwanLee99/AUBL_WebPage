import 'dart:math';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/models/match.dart' as m;
import '../../app/shell_controller.dart';
import '../../core/contracts/web_contracts.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/background_logo.dart';
import '../../core/widgets/match_status_badge.dart';
import '../../core/data/team_groups.dart';
import '../../core/webview/app_webview_screen.dart';
import 'schedule_view_model.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  final _viewModel = ScheduleViewModel();

  String? _groupFilter;
  ValueNotifier<int>? _refreshNotifier;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 6, vsync: this);
    _refreshMatches();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final notifier = ShellController.of(context)?.refreshNotifier;
    if (notifier != _refreshNotifier) {
      _refreshNotifier?.removeListener(_handleRefreshSignal);
      _refreshNotifier = notifier;
      _refreshNotifier?.addListener(_handleRefreshSignal);
    }
  }

  @override
  void dispose() {
    _refreshNotifier?.removeListener(_handleRefreshSignal);
    _tabCtrl.dispose();
    super.dispose();
  }

  void _handleRefreshSignal() {
    _refreshMatches();
  }

  Future<void> _refreshMatches() async {
    await _viewModel.loadMatches();
    if (!mounted) return;
    setState(() {});
  }

  void _openMatchDetail(m.Match match) {
    final title = match.isLive ? '문자중계' : '경기 결과';
    Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => AppWebViewScreen(
        path: WebRouteContracts.scoreboardText(match.id),
        title: title,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('일정'),
        bottom: TabBar(
          controller: _tabCtrl,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: '전체'),
            Tab(text: '라이브'),
            Tab(text: '결과'),
            Tab(text: '조별'),
            Tab(text: '순위'),
            Tab(text: '연습경기'),
          ],
        ),
      ),
      body: Stack(
        children: [
          const BackgroundLogo(verticalOffset: -(kTextTabBarHeight / 2)),
          _viewModel.isLoading
              ? const Center(child: CircularProgressIndicator())
              : TabBarView(
                  controller: _tabCtrl,
                  children: [
                    _AllMatchesTab(
                      matches: _viewModel.allMatches,
                      onRefresh: _refreshMatches,
                      onMatchTap: _openMatchDetail,
                    ),
                    // 라이브
                    StreamBuilder<List<m.Match>>(
                      stream: _viewModel.watchLiveMatches(),
                      builder: (context, snap) {
                        final live = snap.data ?? _viewModel.liveMatches;
                        return _MatchList(
                          matches: live,
                          emptyMessage: '현재 진행 중인 경기가 없습니다.',
                          onRefresh: _refreshMatches,
                          onMatchTap: (match) {
                            Navigator.of(context).push(MaterialPageRoute<void>(
                              builder: (_) => AppWebViewScreen(
                                path:
                                    WebRouteContracts.scoreboardText(match.id),
                                title: '문자중계',
                              ),
                            ));
                          },
                        );
                      },
                    ),
                    _MatchList(
                      matches: _viewModel.completedMatches,
                      emptyMessage: '완료된 경기가 없습니다.',
                      onRefresh: _refreshMatches,
                      onMatchTap: _openMatchDetail,
                    ),
                    // 조별
                    _buildGroupTab(),
                    // 순위
                    const _StandingsTab(),
                    _MatchList(
                      matches: _viewModel.practiceMatches,
                      emptyMessage: '연습경기가 없습니다.',
                      onRefresh: _refreshMatches,
                      onMatchTap: _openMatchDetail,
                    ),
                  ],
                ),
        ],
      ),
    );
  }

  Widget _buildGroupTab() {
    return Column(
      children: [
        SizedBox(
          height: 44,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  label: const Text('전체'),
                  selected: _groupFilter == null,
                  onSelected: (_) => setState(() => _groupFilter = null),
                ),
              ),
              for (final g in groupLetters)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text('$g조'),
                    selected: _groupFilter == g,
                    selectedColor: groupColors[g],
                    onSelected: (_) => setState(() => _groupFilter = g),
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: _MatchList(
            matches: _viewModel.groupMatches(_groupFilter),
            emptyMessage: '해당 조의 경기가 없습니다.',
            onRefresh: _refreshMatches,
            onMatchTap: _openMatchDetail,
          ),
        ),
      ],
    );
  }
}

// ── 전체 탭: 날짜별 그룹 + 오늘 경기 하이라이트 ──

class _AllMatchesTab extends StatefulWidget {
  const _AllMatchesTab({
    required this.matches,
    required this.onRefresh,
    required this.onMatchTap,
  });

  final List<m.Match> matches;
  final Future<void> Function() onRefresh;
  final void Function(m.Match) onMatchTap;

  @override
  State<_AllMatchesTab> createState() => _AllMatchesTabState();
}

class _AllMatchesTabState extends State<_AllMatchesTab> {
  final _todayKey = GlobalKey();
  bool _didScroll = false;

  @override
  void didUpdateWidget(_AllMatchesTab old) {
    super.didUpdateWidget(old);
    if (!_didScroll && widget.matches.isNotEmpty) {
      _scheduleScroll();
    }
  }

  void _scheduleScroll() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _todayKey.currentContext;
      if (ctx != null && !_didScroll) {
        _didScroll = true;
        Scrollable.ensureVisible(
          ctx,
          alignment: 0.3,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (widget.matches.isEmpty) {
      return const Center(
        child:
            Text('등록된 일정이 없습니다.', style: TextStyle(color: AppTheme.slate500)),
      );
    }

    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());

    // 날짜별 그룹핑
    final grouped = <String, List<m.Match>>{};
    for (final match in widget.matches) {
      final dateKey = (match.startTime != null && match.startTime!.length >= 10)
          ? match.startTime!.substring(0, 10)
          : 'unknown';
      (grouped[dateKey] ??= []).add(match);
    }

    final sortedDates = grouped.keys.toList()..sort();

    if (grouped.containsKey(todayStr) && !_didScroll) {
      _scheduleScroll();
    }

    final children = <Widget>[];

    for (final dateKey in sortedDates) {
      final matches = grouped[dateKey]!;
      final isToday = dateKey == todayStr;

      String dateLabel;
      if (dateKey == 'unknown') {
        dateLabel = '일정 미정';
      } else {
        try {
          final dt = DateTime.parse(dateKey);
          dateLabel = DateFormat('M월 d일 (E)', 'ko').format(dt);
        } catch (_) {
          dateLabel = dateKey;
        }
      }

      if (isToday) {
        // 오늘 경기: 파란색 테두리로 전체 감싸기
        children.add(
          Container(
            key: _todayKey,
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: AppTheme.blue500.withValues(alpha: 0.6),
                width: 1.5,
              ),
              color: AppTheme.blue500.withValues(alpha: 0.04),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppTheme.blue500.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'TODAY',
                        style: TextStyle(
                          color: AppTheme.blue400,
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      dateLabel,
                      style: const TextStyle(
                        color: AppTheme.blue400,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                for (int i = 0; i < matches.length; i++) ...[
                  _MatchCard(
                    match: matches[i],
                    onTap: () => widget.onMatchTap(matches[i]),
                  ),
                  if (i < matches.length - 1) const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        );
      } else {
        // 다른 날짜: 날짜 헤더 + 카드
        children.add(
          Padding(
            padding: EdgeInsets.only(
              bottom: 6,
              top: children.isEmpty ? 0 : 12,
            ),
            child: Text(
              dateLabel,
              style: const TextStyle(
                color: AppTheme.slate500,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        );
        for (int i = 0; i < matches.length; i++) {
          children.add(
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _MatchCard(
                match: matches[i],
                onTap: () => widget.onMatchTap(matches[i]),
              ),
            ),
          );
        }
      }
    }

    children.add(const SizedBox(height: 32));

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: children,
      ),
    );
  }
}

class _MatchList extends StatelessWidget {
  const _MatchList({
    required this.matches,
    required this.emptyMessage,
    this.onRefresh,
    this.onMatchTap,
  });

  final List<m.Match> matches;
  final String emptyMessage;
  final Future<void> Function()? onRefresh;
  final void Function(m.Match)? onMatchTap;

  @override
  Widget build(BuildContext context) {
    if (matches.isEmpty) {
      return Center(
        child: Text(emptyMessage,
            style: const TextStyle(color: AppTheme.slate500)),
      );
    }

    final list = ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: matches.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final match = matches[i];
        return _MatchCard(
          match: match,
          onTap: onMatchTap != null ? () => onMatchTap!(match) : null,
        );
      },
    );

    if (onRefresh != null) {
      return RefreshIndicator(onRefresh: onRefresh!, child: list);
    }
    return list;
  }
}

class _MatchCard extends StatelessWidget {
  const _MatchCard({required this.match, this.onTap});

  final m.Match match;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    String dateLabel = '';
    if (match.startTime != null) {
      try {
        final dt = DateTime.parse(match.startTime!);
        dateLabel = DateFormat('M/d (E) HH:mm', 'ko').format(dt);
      } catch (_) {
        dateLabel = match.startTime!.substring(0, 10);
      }
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.slate800.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: match.isLive
                ? AppTheme.red500.withValues(alpha: 0.4)
                : AppTheme.slate700,
            width: match.isLive ? 1 : 0.5,
          ),
        ),
        child: Column(
          children: [
            // 상단: 날짜 + 배지들
            Row(
              children: [
                Text(dateLabel,
                    style: const TextStyle(
                        color: AppTheme.slate400, fontSize: 12)),
                if (match.isPractice) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppTheme.amber400.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text('연습',
                        style: TextStyle(
                            color: AppTheme.amber400,
                            fontSize: 10,
                            fontWeight: FontWeight.w600)),
                  ),
                ],
                const Spacer(),
                MatchStatusBadge(status: match.status),
              ],
            ),
            const SizedBox(height: 10),
            // 팀 vs 팀 (원정 왼쪽 - 홈 오른쪽)
            Row(
              children: [
                Expanded(
                  child: Text(
                    match.awayTeamName,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500),
                    textAlign: TextAlign.center,
                  ),
                ),
                if (match.isCompleted || match.isLive)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      '${match.awayScore ?? 0} : ${match.homeScore ?? 0}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  )
                else
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    child: Text('vs',
                        style:
                            TextStyle(color: AppTheme.slate500, fontSize: 14)),
                  ),
                Expanded(
                  child: Text(
                    match.homeTeamName,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w500),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
            // 장소 + 비고
            if (match.venue != null && match.venue!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(match.venue!,
                  style:
                      const TextStyle(color: AppTheme.slate500, fontSize: 11)),
            ],
            if (match.notes != null && match.notes!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(match.notes!,
                  style:
                      const TextStyle(color: AppTheme.slate500, fontSize: 11),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ],
          ],
        ),
      ),
    );
  }
}

// ── 순위 탭 (Elo 기반) ──

class _TeamRank {
  _TeamRank({required this.name, required this.colorHex});
  final String name;
  final String colorHex;
  int wins = 0, losses = 0, draws = 0;
  double elo = 1500;

  int get games => wins + losses + draws;
  double get winRate => games > 0 ? wins / games : 0;

  Color get color {
    final hex = colorHex.replaceFirst('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }
}

List<_TeamRank> _calculateRankings() {
  final teams = [
    _TeamRank(name: '한양대 불새', colorHex: '#4f46e5'),
    _TeamRank(name: '연세대 EAGLES', colorHex: '#8b5cf6'),
    _TeamRank(name: '고려대 백구회', colorHex: '#f59e0b'),
    _TeamRank(name: '중앙대 랑데뷰', colorHex: '#ef4444'),
    _TeamRank(name: '성균관대 킹고야구반', colorHex: '#10b981'),
    _TeamRank(name: '서강대 알바트로스', colorHex: '#3b82f6'),
    _TeamRank(name: '한국외대 야구부', colorHex: '#f97316'),
  ];

  final matches = [
    ('한양대 불새', '연세대 EAGLES', 3, 2),
    ('연세대 EAGLES', '고려대 백구회', 1, 1),
    ('고려대 백구회', '한양대 불새', 0, 2),
    ('중앙대 랑데뷰', '성균관대 킹고야구반', 5, 4),
    ('한양대 불새', '성균관대 킹고야구반', 2, 6),
    ('서강대 알바트로스', '중앙대 랑데뷰', 3, 3),
    ('한국외대 야구부', '서강대 알바트로스', 4, 1),
  ];

  const kFactor = 32.0;

  for (final (homeName, awayName, hs, as_) in matches) {
    final home = teams.firstWhere((t) => t.name == homeName);
    final away = teams.firstWhere((t) => t.name == awayName);

    final ratingDiff = away.elo - home.elo;
    final expectedHome = 1.0 / (1.0 + pow(10, ratingDiff / 400));
    final double actual;
    if (hs > as_) {
      home.wins++;
      away.losses++;
      actual = 1.0;
    } else if (hs < as_) {
      home.losses++;
      away.wins++;
      actual = 0.0;
    } else {
      home.draws++;
      away.draws++;
      actual = 0.5;
    }

    final mov = log((hs - as_).abs() + 1);
    final delta = (kFactor * mov * (actual - expectedHome)).round();
    home.elo += delta;
    away.elo -= delta;
  }

  teams.sort((a, b) => b.elo.compareTo(a.elo));
  return teams;
}

class _StandingsTab extends StatelessWidget {
  const _StandingsTab();

  @override
  Widget build(BuildContext context) {
    final rankings = _calculateRankings();

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        ...List.generate(rankings.length, (i) {
          final t = rankings[i];
          return Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppTheme.slate800.withValues(alpha: 0.5),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: i == 0
                    ? t.color.withValues(alpha: 0.4)
                    : AppTheme.slate700.withValues(alpha: 0.5),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: i < 3
                        ? t.color.withValues(alpha: 0.15)
                        : AppTheme.slate700.withValues(alpha: 0.5),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${i + 1}',
                    style: TextStyle(
                      color: i < 3 ? t.color : AppTheme.slate300,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: t.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    t.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                Text(
                  '${t.wins}승 ${t.draws}무 ${t.losses}패',
                  style: const TextStyle(
                    color: AppTheme.slate400,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  '${t.elo.round()}',
                  style: const TextStyle(
                    color: AppTheme.blue400,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: 8),
        const Center(
          child: Text(
            'Elo 레이팅 기반 · 데모 데이터',
            style: TextStyle(color: AppTheme.slate500, fontSize: 11),
          ),
        ),
      ],
    );
  }
}
