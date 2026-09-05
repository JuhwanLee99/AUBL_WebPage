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
import 'schedule_day_grouping.dart';
import 'widgets/schedule_controls.dart';

enum ScheduleHubTab { schedule, groups, live, practice }

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  ScheduleScreenState createState() => ScheduleScreenState();
}

class ScheduleScreenState extends State<ScheduleScreen>
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
  int _monthRequestSerial = 0;
  int _groupRequestSerial = 0;
  String? _error;
  String? _groupError;
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

  void switchToTabIndex(int index) {
    if (index < 0 || index >= _tabController.length) return;
    _tabController.animateTo(index);
  }

  Future<void> _loadInitial({bool showLoading = true}) async {
    final requestSerial = ++_monthRequestSerial;
    final requestedMonth = _monthStart(_visibleMonth);
    if (showLoading && mounted) setState(() => _loading = true);
    try {
      final overviewResult = await _seasonRepository.loadOverview();
      final overview = overviewResult.data;
      final games = await _fetchMonth(
        overview.seasonId,
        overview.sourceFreshness.publishedRevision,
        requestedMonth,
      );
      List<Match> practice = const [];
      try {
        practice = (await _firestore.getAllMatches())
            .where((match) => match.isPractice)
            .toList();
      } catch (_) {}
      if (!mounted || requestSerial != _monthRequestSerial) return;
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
      if (!mounted || requestSerial != _monthRequestSerial) return;
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
    final requestSerial = ++_monthRequestSerial;
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
      if (!mounted || requestSerial != _monthRequestSerial) return;
      setState(() {
        _monthGames = games.data;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted || requestSerial != _monthRequestSerial) return;
      setState(() {
        _monthGames = const [];
        _loading = false;
        _error = '선택한 달의 경기를 불러오지 못했습니다.';
      });
    }
  }

  Future<void> _loadGroupGames() async {
    final seasonId = _seasonId;
    if (seasonId == null) return;
    final requestSerial = ++_groupRequestSerial;
    final requestedFilter = _groupFilter;
    setState(() {
      _groupLoading = true;
      _groupError = null;
    });
    try {
      final isGroup = RegExp(r'^[A-H]$').hasMatch(requestedFilter);
      final games = await _seasonRepository.loadGames(
        seasonId: seasonId,
        revision: _overview?.sourceFreshness.publishedRevision,
        group: isGroup ? requestedFilter : null,
        qualification: isGroup ? null : requestedFilter,
      );
      if (!mounted || requestSerial != _groupRequestSerial) return;
      setState(() {
        _groupGames = games.data;
        _groupError = null;
      });
    } catch (_) {
      if (!mounted || requestSerial != _groupRequestSerial) return;
      setState(() {
        _groupGames = const [];
        _groupError = '조별 경기를 불러오지 못했습니다.';
      });
    } finally {
      if (mounted && requestSerial == _groupRequestSerial) {
        setState(() => _groupLoading = false);
      }
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
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return _buildTabScroll(
      onRefresh: () => _loadInitial(showLoading: false),
      children: [
        ScheduleMonthNavigator(
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
        if (_overview != null) ...[
          const SizedBox(height: 8),
          _CompactFreshnessStrip(
            freshness: _overview!.sourceFreshness,
            fromCache: _usingCachedSeasonData,
            cachedAt: _seasonCacheTime,
          ),
        ],
        const SizedBox(height: 10),
        TextField(
          controller: _searchController,
          onChanged: (value) => setState(() => _query = value.trim()),
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search),
            hintText: '팀 또는 구장 검색',
            suffixIcon: _query.isEmpty
                ? null
                : IconButton(
                    tooltip: '검색어 지우기',
                    onPressed: () {
                      _searchController.clear();
                      setState(() => _query = '');
                    },
                    icon: const Icon(Icons.close),
                  ),
          ),
        ),
        const SizedBox(height: 8),
        _StatusFilterStrip(
          height: textScale >= 1.6 ? 64 : 52,
          children: [
            _statusChip(null, '전체'),
            _statusChip(PublicGameStatus.scheduled, '예정'),
            _statusChip(PublicGameStatus.inProgress, '진행 중'),
            _statusChip(PublicGameStatus.completed, '종료'),
            _statusChip(PublicGameStatus.canceled, '취소'),
          ],
        ),
        const SizedBox(height: 14),
        _ScheduleSectionHeader(
          title: _viewMode == MatchViewMode.calendar ? '달력' : '공식 경기',
          detail: '${games.length}경기 · 현재 공개된 데이터',
          action: _ViewModeSelector(
            value: _viewMode,
            onChanged: (value) => setState(() => _viewMode = value),
          ),
        ),
        const SizedBox(height: 10),
        AnimatedSwitcher(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 180),
          child: _loading
              ? const Center(
                  key: ValueKey('loading'),
                  child: Padding(
                    padding: EdgeInsets.all(36),
                    child: CircularProgressIndicator(),
                  ),
                )
              : _error != null && _monthGames.isEmpty
              ? SeasonStatePanel(
                  key: const ValueKey('error'),
                  icon: Icons.cloud_off_outlined,
                  title: '경기 정보를 확인할 수 없습니다',
                  message: _error!,
                  action: SeasonActionButton(
                    label: '다시 시도',
                    onPressed: _loadInitial,
                    style: SeasonActionStyle.secondary,
                  ),
                )
              : _viewMode == MatchViewMode.calendar
              ? _ScheduleCalendar(
                  key: const ValueKey('calendar'),
                  month: _visibleMonth,
                  selectedDate: _selectedDate,
                  games: games,
                  onDateSelected: (date) =>
                      setState(() => _selectedDate = date),
                  onGameTap: _openPublicGame,
                )
              : _PublicGameDateList(
                  key: const ValueKey('list'),
                  games: games,
                  emptyMessage: '조건에 맞는 경기가 없습니다.',
                  onTap: _openPublicGame,
                ),
        ),
      ],
    );
  }

  Widget _statusChip(PublicGameStatus? status, String label) {
    return ChoiceChip(
      label: Text(label),
      selected: _statusFilter == status,
      onSelected: (_) => setState(() => _statusFilter = status),
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
    final selectedGroup = overview == null || overview.isEmpty
        ? null
        : overview.first;
    final tierTeams = isGroup ? const <GroupStanding>[] : _tierStandings();

    return _buildTabScroll(
      onRefresh: () async {
        await _loadInitial(showLoading: false);
        await _loadGroupGames();
      },
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: ScheduleGroupSelector(
              value: _groupFilter,
              onChanged: (value) {
                setState(() {
                  _groupFilter = value;
                  _groupGames = const [];
                  _groupError = null;
                });
                _loadGroupGames();
              },
            ),
          ),
        ),
        const SizedBox(height: 16),
        _ScheduleSectionHeader(
          title: isGroup
              ? '$_groupFilter조 순위'
              : _groupFilter == 'EUTTEUM'
              ? '으뜸권 현황'
              : '버금권 현황',
          detail: isGroup ? '공식 승패·진출 판정 기준' : '각 조의 공식 진출 상태 기준',
        ),
        const SizedBox(height: 8),
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
        const SizedBox(height: 18),
        _ScheduleSectionHeader(
          title: '해당 경기',
          detail: _groupLoading ? '불러오는 중' : '${_groupGames.length}경기',
        ),
        const SizedBox(height: 8),
        if (_groupLoading)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: CircularProgressIndicator(),
            ),
          )
        else if (_groupError != null)
          SeasonStatePanel(
            icon: Icons.cloud_off_outlined,
            title: '조별 경기를 확인할 수 없습니다',
            message: _groupError!,
            action: SeasonActionButton(
              label: '다시 시도',
              onPressed: _loadGroupGames,
              style: SeasonActionStyle.secondary,
            ),
          )
        else
          _PublicGameDateList(
            games: _groupGames,
            emptyMessage: '해당 조건의 경기가 없습니다.',
            onTap: _openPublicGame,
          ),
      ],
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
        return _buildTabScroll(
          onRefresh: () => _loadInitial(showLoading: false),
          children: [
            _ScheduleSectionHeader(
              title: liveProjection.isNotEmpty || apiLive.isNotEmpty
                  ? '진행 중인 경기'
                  : '라이브 대기',
              detail: '카드를 누르면 문자중계를 확인할 수 있습니다.',
            ),
            const SizedBox(height: 8),
            if (liveProjection.isNotEmpty)
              Column(
                children: [
                  for (
                    var index = 0;
                    index < liveProjection.length;
                    index++
                  ) ...[
                    _PracticeMatchCard(
                      match: liveProjection[index],
                      label: 'LIVE',
                      onTap: () => _openPracticeGame(liveProjection[index]),
                    ),
                    if (index != liveProjection.length - 1)
                      const SizedBox(height: 10),
                  ],
                ],
              )
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
                const SizedBox(height: 18),
                _ScheduleSectionHeader(
                  title: '가까운 예정 경기',
                  detail: '${upcoming.length}경기',
                ),
                const SizedBox(height: 8),
                _PublicGameDateList(
                  games: upcoming,
                  emptyMessage: '',
                  onTap: _openPublicGame,
                ),
              ],
            ],
          ],
        );
      },
    );
  }

  Widget _buildPracticeTab() {
    return _buildTabScroll(
      onRefresh: () => _loadInitial(showLoading: false),
      children: [
        _ScheduleSectionHeader(
          title: '연습경기',
          detail: '${_practiceGames.length}경기 · 공식 시즌 집계 제외',
        ),
        const SizedBox(height: 8),
        if (_practiceGames.isEmpty)
          const SeasonStatePanel(
            icon: Icons.event_outlined,
            title: '등록된 연습경기가 없습니다',
            message: '새 연습경기가 등록되면 이곳에 표시됩니다.',
          )
        else
          Column(
            children: [
              for (var index = 0; index < _practiceGames.length; index++) ...[
                _PracticeMatchCard(
                  match: _practiceGames[index],
                  label: _practiceGames[index].isLive ? 'LIVE' : '연습',
                  onTap: () => _openPracticeGame(_practiceGames[index]),
                ),
                if (index != _practiceGames.length - 1)
                  const SizedBox(height: 10),
              ],
            ],
          ),
      ],
    );
  }

  Widget _buildTabScroll({
    required Future<void> Function() onRefresh,
    required List<Widget> children,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final gutter = constraints.maxWidth >= 600 ? 24.0 : 12.0;
        return RefreshIndicator(
          onRefresh: onRefresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: EdgeInsets.fromLTRB(gutter, 10, gutter, 36),
                sliver: SliverToBoxAdapter(
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 960),
                      child: Column(children: children),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CompactFreshnessStrip extends StatelessWidget {
  const _CompactFreshnessStrip({
    required this.freshness,
    required this.fromCache,
    required this.cachedAt,
  });

  final SourceFreshness freshness;
  final bool fromCache;
  final DateTime? cachedAt;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final status = freshness.status?.trim().toUpperCase() ?? 'UNKNOWN';
    final statusLabel = switch (status) {
      'CURRENT' => '최신',
      'STALE' => '갱신 필요',
      _ => '게시 상태 확인 중',
    };
    final updatedAt = fromCache
        ? cachedAt
        : freshness.publishedAt ?? freshness.checkedAt;
    final displayUpdatedAt = updatedAt == null
        ? null
        : fromCache
        ? KstClock.now(instant: updatedAt)
        : KstClock.normalizeApi(updatedAt);
    final provider =
        freshness.provider?.toUpperCase().contains('UNIQUE') == true
        ? 'UniquePlay 공식 경기'
        : '공식 경기';
    final timeLabel = displayUpdatedAt == null
        ? '업데이트 시각 확인 중'
        : '${DateFormat('M월 d일 HH:mm', 'ko').format(displayUpdatedAt)} 업데이트';
    final message = [
      provider,
      timeLabel,
      if (fromCache) '저장된 데이터',
      statusLabel,
    ].join(' · ');
    final isStale = status == 'STALE';
    final isUnknown = status != 'CURRENT' && !isStale;
    final accent = fromCache || isStale
        ? colors.warning
        : isUnknown
        ? colors.muted
        : colors.cobalt;
    final icon = fromCache
        ? Icons.history
        : isStale
        ? Icons.warning_amber_rounded
        : isUnknown
        ? Icons.info_outline
        : Icons.verified_outlined;

    return Semantics(
      excludeSemantics: true,
      button: true,
      label: '$message. 출처와 게시 정보 보기',
      onTap: () => _showDetails(context),
      child: Material(
        color: colors.surfaceMuted,
        child: InkWell(
          onTap: () => _showDetails(context),
          child: Container(
            width: double.infinity,
            constraints: const BoxConstraints(minHeight: 44),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              border: Border(left: BorderSide(color: accent, width: 3)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 17, color: accent),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    message,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(Icons.chevron_right, size: 18, color: colors.muted),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _showDetails(BuildContext context) {
    final normalizedCachedAt = cachedAt == null
        ? null
        : KstClock.now(instant: cachedAt);
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) {
        final colors = sheetContext.aublColors;
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.56,
          minChildSize: 0.36,
          maxChildSize: 0.9,
          builder: (context, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Text(
                          '데이터 출처와 게시 정보',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                    ),
                    IconButton(
                      constraints: const BoxConstraints(
                        minWidth: 48,
                        minHeight: 48,
                      ),
                      tooltip: '닫기',
                      onPressed: () => Navigator.of(sheetContext).pop(),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                Divider(height: 1, color: colors.line),
                const SizedBox(height: 14),
                DataFreshnessCard(
                  freshness: freshness,
                  fromCache: fromCache,
                  cachedAt: normalizedCachedAt,
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () => Navigator.of(sheetContext).pop(),
                    child: const Text('닫기'),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _StatusFilterStrip extends StatelessWidget {
  const _StatusFilterStrip({required this.height, required this.children});

  final double height;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Semantics(
      container: true,
      label: '경기 상태 필터',
      child: Container(
        height: height,
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.line),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Icon(Icons.tune, size: 19, color: colors.muted),
            ),
            VerticalDivider(width: 1, color: colors.line),
            Expanded(
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                itemCount: children.length,
                separatorBuilder: (_, _) => const SizedBox(width: 6),
                itemBuilder: (context, index) => children[index],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScheduleSectionHeader extends StatelessWidget {
  const _ScheduleSectionHeader({
    required this.title,
    required this.detail,
    this.action,
  });

  final String title;
  final String detail;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    return LayoutBuilder(
      builder: (context, constraints) {
        final stack =
            action != null && (constraints.maxWidth < 430 || textScale >= 1.3);
        final heading = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 2),
            Text(
              detail,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: colors.muted),
            ),
          ],
        );

        return Container(
          width: double.infinity,
          padding: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.navy, width: 2)),
          ),
          child: stack
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    heading,
                    const SizedBox(height: 8),
                    Align(alignment: Alignment.centerLeft, child: action),
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(child: heading),
                    if (action != null) ...[const SizedBox(width: 12), action!],
                  ],
                ),
        );
      },
    );
  }
}

class _PublicGameDateList extends StatelessWidget {
  const _PublicGameDateList({
    super.key,
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
    final colors = context.aublColors;
    final groups = groupScheduleGamesByKstDay(games);

    return Column(
      children: [
        for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) ...[
          if (groupIndex > 0) const SizedBox(height: 16),
          Semantics(
            header: true,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: colors.surfaceMuted,
                border: Border(
                  left: BorderSide(color: colors.cobalt, width: 3),
                ),
              ),
              child: Wrap(
                spacing: 8,
                runSpacing: 4,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    groups[groupIndex].date == null
                        ? '일정 미정'
                        : DateFormat(
                            'M월 d일 EEEE',
                            'ko',
                          ).format(groups[groupIndex].date!),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  if (groups[groupIndex].date != null &&
                      KstClock.isSameDay(
                        groups[groupIndex].date!,
                        KstClock.today(),
                      ))
                    const SeasonStatusBadge(
                      label: 'TODAY',
                      tone: SeasonBadgeTone.blue,
                    ),
                  Text(
                    '${groups[groupIndex].games.length}경기',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: colors.muted),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 7),
          for (
            var gameIndex = 0;
            gameIndex < groups[groupIndex].games.length;
            gameIndex++
          ) ...[
            ScheduleCompactGameCard(
              game: groups[groupIndex].games[gameIndex],
              onTap: () => onTap(groups[groupIndex].games[gameIndex]),
            ),
            if (gameIndex != groups[groupIndex].games.length - 1)
              const SizedBox(height: 8),
          ],
        ],
      ],
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
          ScheduleCompactGameCard(
            game: games[index],
            onTap: () => onTap(games[index]),
          ),
          if (index != games.length - 1) const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ViewModeSelector extends StatelessWidget {
  const _ViewModeSelector({required this.value, required this.onChanged});

  final MatchViewMode value;
  final ValueChanged<MatchViewMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<MatchViewMode>(
      showSelectedIcon: false,
      segments: const [
        ButtonSegment(
          value: MatchViewMode.list,
          icon: Icon(Icons.view_agenda_outlined, size: 18),
          label: Text('목록'),
        ),
        ButtonSegment(
          value: MatchViewMode.calendar,
          icon: Icon(Icons.calendar_month_outlined, size: 18),
          label: Text('달력'),
        ),
      ],
      selected: {value},
      onSelectionChanged: (selection) => onChanged(selection.first),
    );
  }
}

class _ScheduleCalendar extends StatelessWidget {
  const _ScheduleCalendar({
    super.key,
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
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final agenda = _on(selectedDate);
    final calendar = ScheduleMonthGrid(
      month: month,
      selectedDate: selectedDate,
      eventCountForDate: (date) => _on(date).length,
      onDateSelected: onDateSelected,
    );

    final agendaPanel = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'SELECTED DATE',
          style: TextStyle(
            color: colors.cobalt,
            fontFamily: 'BarlowCondensed',
            fontSize: 11,
            fontStyle: FontStyle.italic,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.6,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          DateFormat('M월 d일 EEEE', 'ko').format(selectedDate),
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          agenda.isEmpty ? '예정된 경기가 없습니다.' : '${agenda.length}경기가 있습니다.',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: colors.muted),
        ),
        const SizedBox(height: 12),
        _PublicGameList(
          games: agenda,
          emptyMessage: '이 날짜에는 경기가 없습니다.',
          onTap: onGameTap,
        ),
      ],
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final useTwoPane =
            MediaQuery.sizeOf(context).width >= 768 &&
            constraints.maxWidth >= 620 &&
            textScale < 1.6;
        if (!useTwoPane) {
          return Column(
            children: [calendar, const SizedBox(height: 18), agendaPanel],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 6, child: calendar),
            const SizedBox(width: 22),
            Expanded(flex: 5, child: agendaPanel),
          ],
        );
      },
    );
  }
}

class _GroupStandingCard extends StatelessWidget {
  const _GroupStandingCard({required this.group});

  final GroupOverview group;

  @override
  Widget build(BuildContext context) {
    final colors = context.aublColors;
    return Container(
      clipBehavior: Clip.hardEdge,
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.line),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        children: [
          Container(height: 4, color: colors.cobalt),
          Padding(
            padding: const EdgeInsets.all(14),
            child: ScheduleCardHeader(
              title: '${group.groupCode}조',
              detail: '${group.completedGameCount}경기 완료',
            ),
          ),
          for (var index = 0; index < group.standings.length; index++) ...[
            Divider(height: 1, color: colors.line),
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
    final colors = context.aublColors;
    return Container(
      clipBehavior: Clip.hardEdge,
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.line),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        children: [
          Container(height: 4, color: colors.cobalt),
          Padding(
            padding: const EdgeInsets.all(14),
            child: ScheduleCardHeader(title: title, detail: '${teams.length}팀'),
          ),
          for (var index = 0; index < teams.length; index++) ...[
            Divider(height: 1, color: colors.line),
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
    final colors = context.aublColors;
    return LayoutBuilder(
      builder: (context, constraints) {
        final textScale = MediaQuery.textScalerOf(context).scale(1);
        final stackStatus = constraints.maxWidth < 440 || textScale >= 1.3;
        final rank = SizedBox(
          width: 34,
          child: Text(
            '${row.rank}',
            style: TextStyle(
              color: colors.navy,
              fontFamily: 'BarlowCondensed',
              fontSize: 22,
              fontStyle: FontStyle.italic,
              fontWeight: FontWeight.w900,
            ),
          ),
        );
        final team = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              row.teamName,
              maxLines: stackStatus ? 2 : 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 2),
            Text(
              '${row.groupCode}조 · ${row.wins}승 ${row.ties}무 ${row.losses}패',
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: colors.muted),
            ),
          ],
        );
        final status = SeasonStatusBadge(
          label: row.qualificationState.label,
          tone: row.qualificationState == QualificationState.tiePending
              ? SeasonBadgeTone.warning
              : SeasonBadgeTone.navy,
        );

        return MergeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                rank,
                Expanded(
                  child: stackStatus
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [team, const SizedBox(height: 8), status],
                        )
                      : Row(
                          children: [
                            Expanded(child: team),
                            const SizedBox(width: 10),
                            status,
                          ],
                        ),
                ),
              ],
            ),
          ),
        );
      },
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
    final colors = context.aublColors;
    final scoreVisible = match.homeScore != null || match.awayScore != null;
    return Container(
      clipBehavior: Clip.hardEdge,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: colors.line),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: 10,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SeasonStatusBadge(
                    label: label,
                    tone: match.isLive
                        ? SeasonBadgeTone.danger
                        : SeasonBadgeTone.muted,
                  ),
                  Text(
                    start == null
                        ? '시간 미정'
                        : DateFormat('M.d(E) HH:mm', 'ko').format(start),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colors.muted,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _PracticeMatchup(
                awayTeamName: match.awayTeamName,
                homeTeamName: match.homeTeamName,
                awayScore: scoreVisible ? match.awayScore : null,
                homeScore: scoreVisible ? match.homeScore : null,
              ),
              if (match.venue?.isNotEmpty == true) ...[
                const SizedBox(height: 12),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.only(top: 10),
                  decoration: BoxDecoration(
                    border: Border(top: BorderSide(color: colors.line)),
                  ),
                  child: Text(
                    match.venue!,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: colors.muted),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PracticeMatchup extends StatelessWidget {
  const _PracticeMatchup({
    required this.awayTeamName,
    required this.homeTeamName,
    required this.awayScore,
    required this.homeScore,
  });

  final String awayTeamName;
  final String homeTeamName;
  final int? awayScore;
  final int? homeScore;

  @override
  Widget build(BuildContext context) {
    final textScale = MediaQuery.textScalerOf(context).scale(1);
    final stack = textScale >= 1.6;

    Widget team(String name, int? score, CrossAxisAlignment alignment) {
      return Column(
        crossAxisAlignment: alignment,
        children: [
          Text(
            name,
            maxLines: stack ? 2 : 1,
            overflow: TextOverflow.ellipsis,
            textAlign: alignment == CrossAxisAlignment.end
                ? TextAlign.right
                : TextAlign.left,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (score != null) ...[
            const SizedBox(height: 4),
            Text(
              '$score',
              style: TextStyle(
                color: context.aublColors.navyStrong,
                fontFamily: 'BarlowCondensed',
                fontSize: 28,
                fontStyle: FontStyle.italic,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ],
      );
    }

    if (stack) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          team(awayTeamName, awayScore, CrossAxisAlignment.start),
          const SizedBox(height: 8),
          Text(
            'VS',
            style: TextStyle(
              color: context.aublColors.cobalt,
              fontFamily: 'BarlowCondensed',
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 8),
          team(homeTeamName, homeScore, CrossAxisAlignment.start),
        ],
      );
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: team(awayTeamName, awayScore, CrossAxisAlignment.end)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
          child: Text(
            'VS',
            style: TextStyle(
              color: context.aublColors.cobalt,
              fontFamily: 'BarlowCondensed',
              fontStyle: FontStyle.italic,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        Expanded(
          child: team(homeTeamName, homeScore, CrossAxisAlignment.start),
        ),
      ],
    );
  }
}

DateTime _monthStart(DateTime value) => KstClock.monthStart(value);
