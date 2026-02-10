import 'dart:math';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/models/match.dart' as m;
import '../../core/services/firestore_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/match_status_badge.dart';
import '../../core/data/team_groups.dart';
import '../../core/webview/app_webview_screen.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  final _fs = FirestoreService();

  List<m.Match> _allMatches = [];
  bool _loading = true;
  String? _groupFilter;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 6, vsync: this);
    _loadMatches();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadMatches() async {
    final matches = await _fs.getAllMatches();
    if (mounted) {
      setState(() {
        _allMatches = matches;
        _loading = false;
      });
    }
  }

  List<m.Match> get _liveMatches =>
      _allMatches.where((m) => m.isLive).toList();

  List<m.Match> get _completedMatches => _allMatches
      .where((m) => m.isCompleted)
      .toList()
    ..sort((a, b) => (b.startTime ?? '').compareTo(a.startTime ?? ''));

  List<m.Match> get _practiceMatches =>
      _allMatches.where((m) => m.isPractice).toList();

  List<m.Match> _groupMatches() {
    if (_groupFilter == null) return _allMatches;
    return _allMatches.where((match) {
      final homeGroup = teamNameToGroup[match.homeTeamName];
      final awayGroup = teamNameToGroup[match.awayTeamName];
      return homeGroup == _groupFilter || awayGroup == _groupFilter;
    }).toList();
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
          Center(
            child: Opacity(
              opacity: 0.5,
              child: Image.asset(
                'assets/images/aubl_clean.png',
                width: 400,
                fit: BoxFit.contain,
              ),
            ),
          ),
          _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabCtrl,
              children: [
                _MatchList(
                  matches: _allMatches,
                  emptyMessage: '등록된 일정이 없습니다.',
                  onRefresh: _loadMatches,
                ),
                // 라이브
                StreamBuilder<List<m.Match>>(
                  stream: _fs.watchLiveMatches(),
                  builder: (context, snap) {
                    final live = snap.data ?? _liveMatches;
                    return _MatchList(
                      matches: live,
                      emptyMessage: '현재 진행 중인 경기가 없습니다.',
                      onRefresh: _loadMatches,
                      onMatchTap: (match) {
                        Navigator.of(context).push(MaterialPageRoute<void>(
                          builder: (_) => AppWebViewScreen(
                            path: '/scoreboard-text/${match.id}',
                            title: '문자중계',
                          ),
                        ));
                      },
                    );
                  },
                ),
                _MatchList(
                  matches: _completedMatches,
                  emptyMessage: '완료된 경기가 없습니다.',
                  onRefresh: _loadMatches,
                ),
                // 조별
                _buildGroupTab(),
                // 순위
                const _StandingsTab(),
                _MatchList(
                  matches: _practiceMatches,
                  emptyMessage: '연습경기가 없습니다.',
                  onRefresh: _loadMatches,
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
            matches: _groupMatches(),
            emptyMessage: '해당 조의 경기가 없습니다.',
            onRefresh: _loadMatches,
          ),
        ),
      ],
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
            // 팀 vs 팀
            Row(
              children: [
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
                if (match.isCompleted || match.isLive)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      '${match.homeScore ?? 0} : ${match.awayScore ?? 0}',
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
                    match.awayTeamName,
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
                  style: const TextStyle(
                      color: AppTheme.slate500, fontSize: 11)),
            ],
            if (match.notes != null && match.notes!.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(match.notes!,
                  style: const TextStyle(
                      color: AppTheme.slate500, fontSize: 11),
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
