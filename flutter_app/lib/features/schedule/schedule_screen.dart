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
    _tabCtrl = TabController(length: 5, vsync: this);
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
            Tab(text: '연습경기'),
          ],
        ),
      ),
      body: _loading
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
                _MatchList(
                  matches: _practiceMatches,
                  emptyMessage: '연습경기가 없습니다.',
                  onRefresh: _loadMatches,
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
          color: AppTheme.slate800,
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
            // 상단: 날짜 + 상태
            Row(
              children: [
                Text(dateLabel,
                    style: const TextStyle(
                        color: AppTheme.slate400, fontSize: 12)),
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
            if (match.venue != null && match.venue!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(match.venue!,
                  style: const TextStyle(
                      color: AppTheme.slate500, fontSize: 11)),
            ],
          ],
        ),
      ),
    );
  }
}
