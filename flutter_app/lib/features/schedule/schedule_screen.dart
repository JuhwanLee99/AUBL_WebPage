import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/shell_controller.dart';
import '../../core/contracts/web_contracts.dart';
import '../../core/models/api_cache_envelope.dart';
import '../../core/models/match.dart';
import '../../core/models/match_view_mode.dart';
import '../../core/models/public_season_models.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/public_season_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/kst_clock.dart';
import '../../core/widgets/season_components.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen>
    with SingleTickerProviderStateMixin {
  final PublicSeasonRepository _seasonRepository = PublicSeasonRepository();
  final FirestoreService _firestore = FirestoreService();
  late final TabController _tabController;
  final TextEditingController _searchController = TextEditingController();

  ValueNotifier<int>? _refreshNotifier;
  SeasonOverview? _overview;
  int? _seasonId;
  List<PublicGame> _monthGames = const [];
  List<PublicGame> _groupGames = const [];
  List<Match> _practiceGames = const [];
  DateTime _visibleMonth = _monthStart(KstClock.now());
  DateTime _selectedDate = KstClock.today();
  MatchViewMode _viewMode = MatchViewMode.list;
  PublicGameStatus? _statusFilter;
  String _groupFilter = 'A';
  String _query = '';
  bool _loading = true;
  bool _groupLoading = false;
  String? _error;
  bool _usingCachedSeasonData = false;
  DateTime? _seasonCacheTime;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this)
      ..addListener(_handleTabChanged);
    _loadInitial();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final notifier = ShellController.of(context)?.refreshNotifier;
    if (notifier == _refreshNotifier) return;
    _refreshNotifier?.removeListener(_handleRefreshSignal);
    _refreshNotifier = notifier;
    _refreshNotifier?.addListener(_handleRefreshSignal);
  }

  @override
  void dispose() {
    _refreshNotifier?.removeListener(_handleRefreshSignal);
    _tabController
      ..removeListener(_handleTabChanged)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _handleRefreshSignal() => _loadInitial(showLoading: false);

  void _handleTabChanged() {
    if (_tabController.indexIsChanging) return;
    if (_tabController.index == 1 && _groupGames.isEmpty) {
      _loadGroupGames();
    }
  }

  Future<void> _loadInitial({bool showLoading = true}) async {
    if (showLoading && mounted) setState(() => _loading = true);
    try {
      final overviewResult = await _seasonRepository.loadOverview();
      final overview = overviewResult.data;
      final games = await _fetchMonth(
        overview.seasonId,
        overview.sourceFreshness.publishedRevision,
        _visibleMonth,
      );
      List<Match> practice = const [];
      try {
        practice = (await _firestore.getAllMatches())
            .where((match) => match.isPractice)
            .toList();
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _seasonId = overview.seasonId;
        _overview = overview;
        _monthGames = games.data;
        _practiceGames = practice;
        _usingCachedSeasonData = overviewResult.fromCache;
        _seasonCacheTime = overviewResult.cachedAt;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = '공식 경기 데이터를 불러오지 못했습니다.';
      });
    }
  }

  Future<ApiLoadResult<List<PublicGame>>> _fetchMonth(
    int seasonId,
    String? revision,
    DateTime month,
  ) {
    final first = _monthStart(month);
    final last = DateTime(first.year, first.month + 1, 0);
    return _seasonRepository.loadGames(
      seasonId: seasonId,
      revision: revision,
      dateFrom: first,
      dateTo: last,
    );
  }

  Future<void> _changeMonth(int delta) async {
    final seasonId = _seasonId;
    if (seasonId == null) return;
    final next = DateTime(_visibleMonth.year, _visibleMonth.month + delta, 1);
    setState(() {
      _visibleMonth = next;
      _selectedDate = next;
      _loading = true;
    });
    try {
      final games = await _fetchMonth(
        seasonId,
        _overview?.sourceFreshness.publishedRevision,
        next,
      );
      if (!mounted) return;
      setState(() {
        _monthGames = games.data;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _monthGames = const [];
        _loading = false;
        _error = '선택한 달의 경기를 불러오지 못했습니다.';
      });
    }
  }

  Future<void> _loadGroupGames() async {
    final seasonId = _seasonId;
    if (seasonId == null || _groupLoading) return;
    setState(() => _groupLoading = true);
    try {
      final isGroup = RegExp(r'^[A-H]$').hasMatch(_groupFilter);
      final games = await _seasonRepository.loadGames(
        seasonId: seasonId,
        revision: _overview?.sourceFreshness.publishedRevision,
        group: isGroup ? _groupFilter : null,
        qualification: isGroup ? null : _groupFilter,
      );
      if (!mounted) return;
      setState(() => _groupGames = games.data);
    } catch (_) {
      if (!mounted) return;
      setState(() => _groupGames = const []);
    } finally {
      if (mounted) setState(() => _groupLoading = false);
    }
  }

  void _openPublicGame(PublicGame game) {
    final shell = ShellController.of(context);
    shell?.openEmbeddedWebView(
      WebRouteContracts.scoreboardText(game.detailId),
      game.isLive ? '문자중계' : '경기 상세',
    );
  }

  void _openPracticeGame(Match match) {
    final shell = ShellController.of(context);
    shell?.openEmbeddedWebView(
      WebRouteContracts.scoreboardText(match.detailId),
      match.isLive ? '문자중계' : '연습경기 상세',
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('경기'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: '일정·결과'),
            Tab(text: '조별'),
            Tab(text: '라이브'),
            Tab(text: '연습경기'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildScheduleTab(),
          _buildGroupTab(),
          _buildLiveTab(),
          _buildPracticeTab(),
        ],
      ),
    );
  }

  Widget _buildScheduleTab() {
    final games = _filteredMonthGames();
    return RefreshIndicator(
      onRefresh: () => _loadInitial(showLoading: false),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          const SeasonPageHero(
            eyebrow: '2026 AUBL GAME CENTER',
            title: Text('일정과 결과'),
            description: '공식 게시된 경기만 월별·상태별로 확인할 수 있습니다.',
          ),
          const SizedBox(height: 16),
          if (_overview != null) ...[
            DataFreshnessCard(
              freshness: _overview!.sourceFreshness,
              fromCache: _usingCachedSeasonData,
              cachedAt: _seasonCacheTime,
            ),
            const SizedBox(height: 12),
          ],
          _MonthNavigator(
            month: _visibleMonth,
            onPrevious: () => _changeMonth(-1),
            onToday: () {
              setState(() {
                _visibleMonth = _monthStart(KstClock.now());
                _selectedDate = KstClock.today();
              });
              _loadInitial(showLoading: false);
            },
            onNext: () => _changeMonth(1),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _searchController,
            onChanged: (value) => setState(() => _query = value.trim()),
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: '팀 또는 구장 검색',
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _statusChip(null, '전체'),
                _statusChip(PublicGameStatus.scheduled, '예정'),
                _statusChip(PublicGameStatus.inProgress, '진행 중'),
                _statusChip(PublicGameStatus.completed, '종료'),
                _statusChip(PublicGameStatus.canceled, '취소'),
              ],
            ),
          ),
          const SizedBox(height: 10),
          SegmentedButton<MatchViewMode>(
            segments: const [
              ButtonSegment(
                value: MatchViewMode.list,
                icon: Icon(Icons.view_agenda_outlined),
                label: Text('목록'),
              ),
              ButtonSegment(
                value: MatchViewMode.calendar,
                icon: Icon(Icons.calendar_month_outlined),
                label: Text('달력'),
              ),
            ],
            selected: {_viewMode},
            onSelectionChanged: (selection) =>
                setState(() => _viewMode = selection.first),
          ),
          const SizedBox(height: 14),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(36),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_error != null && _monthGames.isEmpty)
            SeasonStatePanel(
              icon: Icons.cloud_off_outlined,
              title: '경기 정보를 확인할 수 없습니다',
              message: _error!,
              action: SeasonActionButton(
                label: '다시 시도',
                onPressed: _loadInitial,
                style: SeasonActionStyle.secondary,
              ),
            )
          else if (_viewMode == MatchViewMode.calendar)
            _ScheduleCalendar(
              month: _visibleMonth,
              selectedDate: _selectedDate,
              games: games,
              onDateSelected: (date) => setState(() => _selectedDate = date),
              onGameTap: _openPublicGame,
            )
          else
            _PublicGameList(
              games: games,
              emptyMessage: '조건에 맞는 경기가 없습니다.',
              onTap: _openPublicGame,
            ),
        ],
      ),
    );
  }

  Widget _statusChip(PublicGameStatus? status, String label) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: _statusFilter == status,
        onSelected: (_) => setState(() => _statusFilter = status),
      ),
    );
  }

  List<PublicGame> _filteredMonthGames() {
    final query = _query.toLowerCase();
    final games = _monthGames.where((game) {
      if (_statusFilter != null && game.status != _statusFilter) return false;
      if (query.isEmpty) return true;
      return game.homeTeamName.toLowerCase().contains(query) ||
          game.awayTeamName.toLowerCase().contains(query) ||
          (game.venue?.toLowerCase().contains(query) ?? false);
    }).toList();
    games.sort((a, b) {
      final aDate = a.startTime ?? a.gameDate ?? DateTime(2100);
      final bDate = b.startTime ?? b.gameDate ?? DateTime(2100);
      return aDate.compareTo(bDate);
    });
    return games;
  }

  Widget _buildGroupTab() {
    final isGroup = RegExp(r'^[A-H]$').hasMatch(_groupFilter);
    final overview = isGroup
        ? _overview?.groups.where((row) => row.groupCode == _groupFilter)
        : null;
    final selectedGroup =
        overview == null || overview.isEmpty ? null : overview.first;
    final tierTeams = isGroup ? const <GroupStanding>[] : _tierStandings();

    return RefreshIndicator(
      onRefresh: () async {
        await _loadInitial(showLoading: false);
        await _loadGroupGames();
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          const SeasonPageHero(
            eyebrow: '2026 AUBL GROUPS',
            title: Text('조별 현황'),
            description: 'A~H조 순위와 으뜸·버금 진출 상태를 공식 판정 기준으로 표시합니다.',
          ),
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final value in const [
                  'A',
                  'B',
                  'C',
                  'D',
                  'E',
                  'F',
                  'G',
                  'H',
                  'EUTTEUM',
                  'BEOGEUM',
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(switch (value) {
                        'EUTTEUM' => '으뜸',
                        'BEOGEUM' => '버금',
                        _ => '$value조',
                      }),
                      selected: _groupFilter == value,
                      onSelected: (_) {
                        setState(() {
                          _groupFilter = value;
                          _groupGames = const [];
                        });
                        _loadGroupGames();
                      },
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (isGroup && selectedGroup != null)
            _GroupStandingCard(group: selectedGroup)
          else if (!isGroup && tierTeams.isNotEmpty)
            _QualificationTeamsCard(
              title: _groupFilter == 'EUTTEUM' ? '으뜸권' : '버금권',
              teams: tierTeams,
            )
          else if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(30),
                child: CircularProgressIndicator(),
              ),
            )
          else
            const SeasonStatePanel(
              icon: Icons.table_rows_outlined,
              title: '순위가 아직 게시되지 않았습니다',
              message: '공식 조별 현황이 게시되면 이곳에서 확인할 수 있습니다.',
            ),
          const SizedBox(height: 22),
          const SeasonSectionHeader(
            title: '해당 경기',
            description: '활성 UniquePlay revision의 경기만 표시합니다.',
          ),
          const SizedBox(height: 10),
          if (_groupLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            )
          else
            _PublicGameList(
              games: _groupGames,
              emptyMessage: '해당 조건의 경기가 없습니다.',
              onTap: _openPublicGame,
            ),
        ],
      ),
    );
  }

  List<GroupStanding> _tierStandings() {
    final states = _groupFilter == 'EUTTEUM'
        ? {
            QualificationState.currentEutteum,
            QualificationState.confirmedEutteum,
          }
        : {
            QualificationState.currentBeogeum,
            QualificationState.confirmedBeogeum,
          };
    return (_overview?.groups ?? const <GroupOverview>[])
        .expand((group) => group.standings)
        .where((row) => states.contains(row.qualificationState))
        .toList()
      ..sort((a, b) {
        final group = a.groupCode.compareTo(b.groupCode);
        return group != 0 ? group : a.rank.compareTo(b.rank);
      });
  }

  Widget _buildLiveTab() {
    final apiLive = _monthGames.where((game) => game.isLive).toList();
    final upcoming = _overview?.upcomingGames.take(3).toList() ?? const [];
    return StreamBuilder<List<Match>>(
      stream: _firestore.watchLiveMatches(),
      builder: (context, snapshot) {
        final liveProjection = snapshot.data ?? const <Match>[];
        return RefreshIndicator(
          onRefresh: () => _loadInitial(showLoading: false),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
            children: [
              const SeasonPageHero(
                eyebrow: 'AUBL LIVE',
                title: Text('라이브 경기'),
                description: '진행 중인 경기를 우선 표시하고 없으면 가까운 예정 경기를 안내합니다.',
              ),
              const SizedBox(height: 14),
              if (liveProjection.isNotEmpty)
                for (final game in liveProjection) ...[
                  _PracticeMatchCard(
                    match: game,
                    label: 'LIVE',
                    onTap: () => _openPracticeGame(game),
                  ),
                  const SizedBox(height: 10),
                ]
              else if (apiLive.isNotEmpty)
                _PublicGameList(
                  games: apiLive,
                  emptyMessage: '',
                  onTap: _openPublicGame,
                )
              else ...[
                const SeasonStatePanel(
                  icon: Icons.sports_baseball_outlined,
                  title: '현재 진행 중인 경기가 없습니다',
                  message: '가장 가까운 예정 경기를 확인해 주세요.',
                ),
                if (upcoming.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  const SeasonSectionHeader(title: '가까운 예정 경기'),
                  const SizedBox(height: 10),
                  _PublicGameList(
                    games: upcoming,
                    emptyMessage: '',
                    onTap: _openPublicGame,
                  ),
                ],
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildPracticeTab() {
    return RefreshIndicator(
      onRefresh: () => _loadInitial(showLoading: false),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          const SeasonPageHero(
            eyebrow: 'AUBL PRACTICE',
            title: Text('연습경기'),
            description: 'AUBL 운영자가 등록한 연습경기입니다. 공식 시즌 집계에는 합산하지 않습니다.',
          ),
          const SizedBox(height: 14),
          if (_practiceGames.isEmpty)
            const SeasonStatePanel(
              icon: Icons.event_outlined,
              title: '등록된 연습경기가 없습니다',
              message: '새 연습경기가 등록되면 이곳에 표시됩니다.',
            )
          else
            for (final game in _practiceGames) ...[
              _PracticeMatchCard(
                match: game,
                label: game.isLive ? 'LIVE' : '연습',
                onTap: () => _openPracticeGame(game),
              ),
              const SizedBox(height: 10),
            ],
        ],
      ),
    );
  }
}

class _MonthNavigator extends StatelessWidget {
  const _MonthNavigator({
    required this.month,
    required this.onPrevious,
    required this.onToday,
    required this.onNext,
  });

  final DateTime month;
  final VoidCallback onPrevious;
  final VoidCallback onToday;
  final VoidCallback onNext;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          children: [
            IconButton(
                tooltip: '이전 달',
                onPressed: onPrevious,
                icon: const Icon(Icons.chevron_left)),
            Expanded(
              child: Text(
                DateFormat('yyyy년 M월').format(month),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton(onPressed: onToday, child: const Text('오늘')),
            IconButton(
                tooltip: '다음 달',
                onPressed: onNext,
                icon: const Icon(Icons.chevron_right)),
          ],
        ),
      ),
    );
  }
}

class _PublicGameList extends StatelessWidget {
  const _PublicGameList({
    required this.games,
    required this.emptyMessage,
    required this.onTap,
  });

  final List<PublicGame> games;
  final String emptyMessage;
  final ValueChanged<PublicGame> onTap;

  @override
  Widget build(BuildContext context) {
    if (games.isEmpty) {
      return SeasonStatePanel(
        icon: Icons.event_busy_outlined,
        title: emptyMessage,
        message: '필터나 날짜를 변경해 다시 확인해 주세요.',
      );
    }
    return Column(
      children: [
        for (var index = 0; index < games.length; index++) ...[
          PublicMatchCard(
            game: games[index],
            onTap: () => onTap(games[index]),
          ),
          if (index != games.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _ScheduleCalendar extends StatelessWidget {
  const _ScheduleCalendar({
    required this.month,
    required this.selectedDate,
    required this.games,
    required this.onDateSelected,
    required this.onGameTap,
  });

  final DateTime month;
  final DateTime selectedDate;
  final List<PublicGame> games;
  final ValueChanged<DateTime> onDateSelected;
  final ValueChanged<PublicGame> onGameTap;

  List<PublicGame> _on(DateTime date) => games.where((game) {
        final gameDate = game.gameDate ?? game.startTime;
        return gameDate != null && KstClock.isSameDay(gameDate, date);
      }).toList();

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final first = _monthStart(month);
    final days = DateTime(first.year, first.month + 1, 0).day;
    final leading = first.weekday - DateTime.monday;
    final cells = ((leading + days + 6) ~/ 7) * 7;
    final agenda = _on(selectedDate);
    return Column(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                Row(
                  children: ['월', '화', '수', '목', '금', '토', '일']
                      .map(
                        (day) => Expanded(
                          child: Text(
                            day,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: colors.muted,
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
                const SizedBox(height: 6),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: cells,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 7,
                    childAspectRatio: 0.82,
                  ),
                  itemBuilder: (context, index) {
                    final day = index - leading + 1;
                    if (day < 1 || day > days) return const SizedBox.shrink();
                    final date = DateTime(first.year, first.month, day);
                    final count = _on(date).length;
                    final selected = KstClock.isSameDay(date, selectedDate);
                    return Semantics(
                      button: true,
                      selected: selected,
                      label: '$day일, 경기 $count개',
                      child: InkWell(
                        onTap: () => onDateSelected(date),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          margin: const EdgeInsets.all(2),
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          decoration: BoxDecoration(
                            color: selected
                                ? colors.cobalt.withValues(alpha: 0.13)
                                : null,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: selected ? colors.cobalt : colors.line,
                            ),
                          ),
                          child: Column(
                            children: [
                              Text('$day',
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w800)),
                              const Spacer(),
                              if (count > 0)
                                Text(
                                  '$count경기',
                                  style: TextStyle(
                                    color: colors.cobalt,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            DateFormat('M월 d일 EEEE', 'ko').format(selectedDate),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: 8),
        _PublicGameList(
          games: agenda,
          emptyMessage: '이 날짜에는 경기가 없습니다.',
          onTap: onGameTap,
        ),
      ],
    );
  }
}

class _GroupStandingCard extends StatelessWidget {
  const _GroupStandingCard({required this.group});

  final GroupOverview group;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Text('${group.groupCode}조',
                    style: Theme.of(context).textTheme.titleMedium),
                const Spacer(),
                Text(
                  '${group.completedGameCount}경기 완료',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: context.aublColors.muted),
                ),
              ],
            ),
          ),
          for (var index = 0; index < group.standings.length; index++) ...[
            if (index > 0) Divider(height: 1, color: context.aublColors.line),
            _StandingTile(row: group.standings[index]),
          ],
        ],
      ),
    );
  }
}

class _QualificationTeamsCard extends StatelessWidget {
  const _QualificationTeamsCard({required this.title, required this.teams});

  final String title;
  final List<GroupStanding> teams;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Align(
              alignment: Alignment.centerLeft,
              child:
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
            ),
          ),
          for (var index = 0; index < teams.length; index++) ...[
            if (index > 0) Divider(height: 1, color: context.aublColors.line),
            _StandingTile(row: teams[index]),
          ],
        ],
      ),
    );
  }
}

class _StandingTile extends StatelessWidget {
  const _StandingTile({required this.row});

  final GroupStanding row;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 28,
            child: Text(
              '${row.rank}',
              style: TextStyle(
                color: context.aublColors.navy,
                fontFamily: 'BarlowCondensed',
                fontSize: 20,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row.teamName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall),
                Text(
                  '${row.groupCode}조 · ${row.wins}승 ${row.ties}무 ${row.losses}패',
                  style: Theme.of(context)
                      .textTheme
                      .bodySmall
                      ?.copyWith(color: context.aublColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SeasonStatusBadge(
            label: row.qualificationState.label,
            tone: row.qualificationState == QualificationState.tiePending
                ? SeasonBadgeTone.warning
                : SeasonBadgeTone.navy,
          ),
        ],
      ),
    );
  }
}

class _PracticeMatchCard extends StatelessWidget {
  const _PracticeMatchCard({
    required this.match,
    required this.label,
    required this.onTap,
  });

  final Match match;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final start = KstClock.tryParseApi(match.startTime);
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  SeasonStatusBadge(
                    label: label,
                    tone: match.isLive
                        ? SeasonBadgeTone.danger
                        : SeasonBadgeTone.muted,
                  ),
                  const Spacer(),
                  Text(
                    start == null
                        ? '시간 미정'
                        : DateFormat('M.d(E) HH:mm', 'ko').format(start),
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: context.aublColors.muted),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text('${match.awayTeamName}  vs  ${match.homeTeamName}',
                  style: Theme.of(context).textTheme.titleMedium),
              if (match.venue?.isNotEmpty == true) ...[
                const SizedBox(height: 6),
                Text(match.venue!,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: context.aublColors.muted)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

DateTime _monthStart(DateTime value) => KstClock.monthStart(value);
