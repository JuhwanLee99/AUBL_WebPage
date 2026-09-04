import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/shell_controller.dart';
import '../../core/contracts/web_contracts.dart';
import '../../core/models/match.dart';
import '../../core/models/match_view_mode.dart';
import '../../core/models/notice.dart';
import '../../core/models/public_season_models.dart';
import '../../core/models/team_notice.dart';
import '../../core/navigation/app_destination.dart';
import '../../core/services/cache_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/notification_service.dart';
import '../../core/services/public_season_repository.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/kst_clock.dart';
import '../../core/widgets/season_campaign_hero.dart';
import '../../core/widgets/season_components.dart';
import '../community/notice_detail_screen.dart';
import '../records/records_screen.dart';
import '../schedule/schedule_screen.dart';
import '../schedule/widgets/schedule_controls.dart';
import '../teams/team_notice_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _viewModeKey = 'aubl_home_match_view_v1';
  static const _announcementKeyPrefix = 'aubl_announcement_hidden_until_v1:';
  static const _uniquePlayUrl = 'https://unique-play.com/league/57';
  static const _goldballParkUrl = 'https://www.goldballpark.co.kr/';
  static const _majorUrl = 'https://www.baseballm.com/';
  static const _instagramUrl = 'https://www.instagram.com/aubl_1981/';

  final PublicSeasonRepository _seasonRepository = PublicSeasonRepository();
  final FirestoreService _firestore = FirestoreService();

  StreamSubscription<User?>? _authSubscription;
  StreamSubscription<Map<String, dynamic>?>? _liveInfoSubscription;
  ValueNotifier<int>? _refreshNotifier;

  SeasonOverview? _overview;
  List<PublicGame> _monthGames = const [];
  List<Notice> _leagueNotices = const [];
  List<TeamNotice> _teamNotices = const [];
  String? _userTeamId;
  String? _userTeamName;
  String _selectedGroup = 'A';
  String? _error;
  bool _loading = true;
  bool _calendarLoading = false;
  int _calendarRequestSerial = 0;
  bool _usingCachedSeasonData = false;
  DateTime? _seasonCacheTime;
  MatchViewMode _viewMode = MatchViewMode.list;
  DateTime _visibleMonth = _monthStart(KstClock.now());
  DateTime _selectedDate = KstClock.today();
  _SiteAnnouncement? _announcement;
  bool _announcementCollapsed = false;
  bool _announcementHidden = false;
  _CampaignContent _campaign = const _CampaignContent.fallback();

  @override
  void initState() {
    super.initState();
    _restoreViewMode();
    _listenForAnnouncement();
    _loadAll();
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen(
      (_) => _loadUserTeam(),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final notifier = ShellController.of(context)?.refreshNotifier;
    if (notifier == _refreshNotifier) return;
    _refreshNotifier?.removeListener(_onAppResume);
    _refreshNotifier = notifier;
    _refreshNotifier?.addListener(_onAppResume);
  }

  @override
  void dispose() {
    _refreshNotifier?.removeListener(_onAppResume);
    _authSubscription?.cancel();
    _liveInfoSubscription?.cancel();
    super.dispose();
  }

  void _onAppResume() => _loadAll(showLoading: false);

  Future<void> _restoreViewMode() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_viewModeKey);
    if (!mounted) return;
    setState(() {
      _viewMode = saved == MatchViewMode.calendar.name
          ? MatchViewMode.calendar
          : MatchViewMode.list;
    });
    if (_viewMode == MatchViewMode.calendar) {
      unawaited(_loadMonthGames());
    }
  }

  void _listenForAnnouncement() {
    _liveInfoSubscription = _firestore.watchLiveInfo().listen((payload) async {
      final raw = payload?['announcement'];
      final next = raw is Map<String, dynamic>
          ? _SiteAnnouncement.fromJson(raw)
          : null;
      var hidden = false;
      if (next != null) {
        final prefs = await SharedPreferences.getInstance();
        final hiddenUntil =
            prefs.getInt('$_announcementKeyPrefix${next.revision}') ?? 0;
        hidden = hiddenUntil > DateTime.now().millisecondsSinceEpoch;
      }
      if (!mounted) return;
      setState(() {
        if (_announcement?.revision != next?.revision) {
          _announcementCollapsed = false;
        }
        _announcement = next;
        _announcementHidden = hidden;
      });
    });
  }

  Future<void> _loadAll({bool showLoading = true}) async {
    if (showLoading && mounted) setState(() => _loading = true);
    String? nextError;
    SeasonOverview? nextOverview;
    var usingCache = false;
    DateTime? cacheTime;
    try {
      final result = await _seasonRepository.loadOverview();
      nextOverview = result.data;
      usingCache = result.fromCache;
      cacheTime = result.cachedAt;
    } catch (_) {
      nextError = '공식 시즌 데이터를 불러오지 못했습니다.';
    }

    await Future.wait([
      _loadNotices(),
      _loadUserTeam(),
      _loadCampaignContent(),
    ]);

    if (!mounted) return;
    setState(() {
      _overview = nextOverview ?? _overview;
      _error = nextError;
      _usingCachedSeasonData = usingCache;
      _seasonCacheTime = cacheTime;
      _loading = false;
      _applyPreferredGroup();
    });
    if (_viewMode == MatchViewMode.calendar) {
      unawaited(_loadMonthGames());
    }
  }

  Future<void> _loadNotices() async {
    final cached = await CacheService.instance.getCachedNotices();
    if (cached != null && mounted && _leagueNotices.isEmpty) {
      setState(() => _leagueNotices = cached.take(4).toList());
    }
    try {
      final notices = await _firestore.getNotices(limit: 4);
      if (!mounted) return;
      setState(() => _leagueNotices = notices);
      unawaited(CacheService.instance.cacheNotices(notices));
    } catch (_) {}
  }

  Future<void> _loadCampaignContent() async {
    final cached = await CacheService.instance.getCachedStaticContent();
    if (cached != null && mounted) {
      setState(() => _campaign = _CampaignContent.fromRoot(cached));
    }
    try {
      final content = await _firestore.getStaticContent();
      if (content == null) return;
      await CacheService.instance.cacheStaticContent(content);
      if (!mounted) return;
      setState(() => _campaign = _CampaignContent.fromRoot(content));
    } catch (_) {
      // The bundled campaign copy remains available while offline.
    }
  }

  Future<void> _loadUserTeam() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      await NotificationService.instance.updateTeamSubscriptions(null);
      if (!mounted) return;
      setState(() {
        _userTeamId = null;
        _userTeamName = null;
        _teamNotices = const [];
        _selectedGroup = 'A';
      });
      return;
    }

    try {
      final role = await _firestore.watchUserRole(user.uid).first;
      String? teamId = role?['teamId']?.toString();
      String? teamName = role?['teamName']?.toString();
      if (teamId == null || teamId.isEmpty) {
        final membership = await _firestore.findUserTeamMembership(user.uid);
        teamId = membership?['teamId']?.toString();
      }
      if (teamId != null && teamId.isNotEmpty) {
        final team = await _firestore.getTeam(teamId);
        teamName = team?.name ?? teamName ?? teamId;
        final notices = await _firestore.watchTeamNotices(teamId).first;
        await NotificationService.instance.updateTeamSubscriptions(teamId);
        if (!mounted) return;
        setState(() {
          _userTeamId = teamId;
          _userTeamName = teamName;
          _teamNotices = [
            ...notices.where((notice) => notice.pinned),
            ...notices.where((notice) => !notice.pinned),
          ].take(4).toList();
          _applyPreferredGroup();
        });
      }
    } catch (_) {}
  }

  void _applyPreferredGroup() {
    final teamName = _normalizeTeamName(_userTeamName);
    final overview = _overview;
    if (teamName == null || overview == null) return;
    for (final group in overview.groups) {
      if (group.standings.any(
        (row) => _normalizeTeamName(row.teamName) == teamName,
      )) {
        _selectedGroup = group.groupCode;
        return;
      }
    }
  }

  Future<void> _loadMonthGames() async {
    final overview = _overview;
    if (overview == null) return;
    final requestSerial = ++_calendarRequestSerial;
    final requestedMonth = _monthStart(_visibleMonth);
    setState(() => _calendarLoading = true);
    final first = requestedMonth;
    final last = DateTime(first.year, first.month + 1, 0);
    try {
      final result = await _seasonRepository.loadGames(
        seasonId: overview.seasonId,
        revision: overview.sourceFreshness.publishedRevision,
        dateFrom: first,
        dateTo: last,
      );
      if (!mounted || requestSerial != _calendarRequestSerial) return;
      setState(() => _monthGames = result.data);
    } catch (_) {
      if (!mounted || requestSerial != _calendarRequestSerial) return;
      setState(() => _monthGames = const []);
    } finally {
      if (mounted && requestSerial == _calendarRequestSerial) {
        setState(() => _calendarLoading = false);
      }
    }
  }

  Future<void> _setViewMode(MatchViewMode mode) async {
    if (_viewMode == mode) return;
    setState(() => _viewMode = mode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_viewModeKey, mode.name);
    if (mode == MatchViewMode.calendar) {
      await _loadMonthGames();
    }
  }

  Future<void> _hideAnnouncementForDay() async {
    final announcement = _announcement;
    if (announcement == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(
      '$_announcementKeyPrefix${announcement.revision}',
      DateTime.now().add(const Duration(hours: 24)).millisecondsSinceEpoch,
    );
    if (mounted) setState(() => _announcementHidden = true);
  }

  void _openGame(PublicGame game) {
    final shell = ShellController.of(context);
    final path = WebRouteContracts.scoreboardText(game.detailId);
    if (shell != null) {
      shell.openEmbeddedWebView(path, '경기 상세');
    }
  }

  void _openLegacyGame(Match match) {
    final shell = ShellController.of(context);
    if (shell != null) {
      shell.openEmbeddedWebView(
        WebRouteContracts.scoreboardText(match.detailId),
        '경기 상세',
      );
    }
  }

  Future<void> _openExternal(String rawUrl) async {
    final uri = Uri.tryParse(rawUrl);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Image.asset(
          'assets/images/aubl_clean.png',
          height: 32,
          width: 42,
          fit: BoxFit.contain,
          semanticLabel: 'AUBL',
        ),
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final horizontal = constraints.maxWidth < 520 ? 12.0 : 24.0;
          return Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1180),
              child: RefreshIndicator(
                onRefresh: () => _loadAll(showLoading: false),
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: EdgeInsets.fromLTRB(horizontal, 8, horizontal, 28),
                  children: [
                    if (_announcement != null &&
                        _announcement!.enabled &&
                        !_announcementHidden) ...[
                      _buildAnnouncement(_announcement!),
                      const SizedBox(height: 12),
                    ],
                    _buildHero(),
                    const SizedBox(height: 14),
                    if (_overview != null)
                      DataFreshnessCard(
                        freshness: _overview!.sourceFreshness,
                        fromCache: _usingCachedSeasonData,
                        cachedAt: _seasonCacheTime,
                      )
                    else if (_loading)
                      const _HomeLoadingCard()
                    else
                      SeasonStatePanel(
                        icon: Icons.cloud_off_outlined,
                        title: '공식 데이터를 확인할 수 없습니다',
                        message: _error ?? '잠시 후 아래로 당겨 다시 시도해 주세요.',
                        action: SeasonActionButton(
                          label: '다시 시도',
                          onPressed: _loadAll,
                          style: SeasonActionStyle.secondary,
                        ),
                      ),
                    const SizedBox(height: 14),
                    _buildMatches(),
                    const SizedBox(height: 14),
                    _buildGroups(),
                    const SizedBox(height: 14),
                    _buildLeaders(),
                    const SizedBox(height: 14),
                    _buildNotices(),
                    const SizedBox(height: 14),
                    _buildPartners(),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildAnnouncement(_SiteAnnouncement announcement) {
    final colors = context.aublColors;
    final warning = announcement.tone == 'warning';
    final accent = warning ? colors.warning : colors.cobalt;
    return Semantics(
      container: true,
      liveRegion: true,
      label: '중요 공지 ${announcement.title}',
      child: Container(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(4),
          border: Border(
            top: BorderSide(color: colors.line),
            right: BorderSide(color: colors.line),
            bottom: BorderSide(color: colors.line),
            left: BorderSide(color: accent, width: 4),
          ),
        ),
        child: Column(
          children: [
            ListTile(
              minTileHeight: 56,
              leading: Icon(
                warning ? Icons.campaign_outlined : Icons.info_outline,
                color: accent,
              ),
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'IMPORTANT NOTICE',
                    style: TextStyle(
                      color: accent,
                      fontFamily: 'BarlowCondensed',
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    announcement.title,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ],
              ),
              trailing: IconButton(
                tooltip: _announcementCollapsed ? '공지 펼치기' : '공지 접기',
                onPressed: () => setState(
                  () => _announcementCollapsed = !_announcementCollapsed,
                ),
                icon: Icon(
                  _announcementCollapsed
                      ? Icons.expand_more
                      : Icons.expand_less,
                ),
              ),
            ),
            if (!_announcementCollapsed) ...[
              Divider(height: 1, color: colors.line),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 13, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      announcement.message,
                      style: Theme.of(
                        context,
                      ).textTheme.bodyMedium?.copyWith(height: 1.5),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (announcement.safeLink != null)
                          SeasonActionButton(
                            label: announcement.linkLabel ?? '자세히 보기',
                            icon: Icons.open_in_new,
                            style: SeasonActionStyle.text,
                            onPressed: () =>
                                _openExternal(announcement.safeLink!),
                          ),
                        SeasonActionButton(
                          label: '하루 동안 보지 않기',
                          style: SeasonActionStyle.text,
                          onPressed: _hideAnnouncementForDay,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildHero() {
    return SeasonCampaignHero(
      topline: _campaign.topline,
      lead: '우리의 청춘은 이번에도',
      emphasis: 'PLAY BALL',
      description: _campaign.description,
      subcopy: _campaign.subcopy,
      primaryActionLabel: '경기 일정 · 결과',
      onPrimaryAction: () => ShellController.of(context)?.switchTab(
        AppDestination.games,
        scheduleTabIndex: ScheduleHubTab.schedule.index,
      ),
      secondaryActionLabel: '조별 순위 보기',
      onSecondaryAction: () => ShellController.of(context)?.switchTab(
        AppDestination.records,
        recordsTabIndex: RecordsHubTab.standings.index,
      ),
      facts: _campaign.facts,
    );
  }

  Widget _buildMatches() {
    final overview = _overview;
    return SeasonSectionPanel(
      eyebrow: 'GAME BOARD',
      title: '일정과 결과를 한눈에',
      description: '공식 게시된 경기만 표시합니다.',
      action: SeasonActionButton(
        label: '전체 일정',
        icon: Icons.arrow_forward,
        style: SeasonActionStyle.text,
        onPressed: () => ShellController.of(context)?.switchTab(
          AppDestination.games,
          scheduleTabIndex: ScheduleHubTab.schedule.index,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<MatchViewMode>(
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
              onSelectionChanged: (selection) => _setViewMode(selection.first),
            ),
          ),
          const SizedBox(height: 12),
          StreamBuilder<List<Match>>(
            stream: _firestore.watchLiveMatches(),
            builder: (context, snapshot) {
              final live = snapshot.data ?? const <Match>[];
              if (live.isEmpty) return const SizedBox.shrink();
              return Column(
                children: [
                  for (final match in live) ...[
                    _LiveMatchCard(match: match, onTap: _openLegacyGame),
                    const SizedBox(height: 10),
                  ],
                ],
              );
            },
          ),
          if (_viewMode == MatchViewMode.calendar)
            _buildCalendar()
          else if (overview == null && _loading)
            const _HomeLoadingCard()
          else if (overview == null)
            const SeasonStatePanel(
              icon: Icons.event_busy_outlined,
              title: '경기 정보를 표시할 수 없습니다',
              message: '공식 데이터 연결을 확인하고 다시 시도해 주세요.',
            )
          else
            _buildMatchList(overview),
        ],
      ),
    );
  }

  Widget _buildMatchList(SeasonOverview overview) {
    final upcoming = overview.upcomingGames.take(4).toList();
    final recent = overview.recentGames.take(4).toList();
    if (upcoming.isEmpty && recent.isEmpty) {
      return const SeasonStatePanel(
        icon: Icons.event_available_outlined,
        title: '게시된 경기가 없습니다',
        message: '새 일정이나 결과가 게시되면 이곳에 표시됩니다.',
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (upcoming.isNotEmpty) ...[
          _MatchGroupLabel(label: '가까운 예정 경기', count: upcoming.length),
          const SizedBox(height: 8),
          for (var index = 0; index < upcoming.length; index++) ...[
            PublicMatchCard(
              game: upcoming[index],
              onTap: () => _openGame(upcoming[index]),
            ),
            if (index != upcoming.length - 1) const SizedBox(height: 8),
          ],
        ],
        if (upcoming.isNotEmpty && recent.isNotEmpty)
          const SizedBox(height: 20),
        if (recent.isNotEmpty) ...[
          _MatchGroupLabel(label: '최근 경기 결과', count: recent.length),
          const SizedBox(height: 8),
          for (var index = 0; index < recent.length; index++) ...[
            PublicMatchCard(
              game: recent[index],
              onTap: () => _openGame(recent[index]),
            ),
            if (index != recent.length - 1) const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }

  Widget _buildCalendar() {
    final selectedGames = _gamesOn(_selectedDate);
    return Column(
      children: [
        ScheduleMonthNavigator(
          month: _visibleMonth,
          onPrevious: () => _changeMonth(-1),
          onToday: () {
            setState(() {
              _visibleMonth = _monthStart(KstClock.now());
              _selectedDate = KstClock.today();
            });
            _loadMonthGames();
          },
          onNext: () => _changeMonth(1),
        ),
        if (_calendarLoading) ...[
          const SizedBox(height: 8),
          const LinearProgressIndicator(),
        ],
        const SizedBox(height: 12),
        ScheduleMonthGrid(
          month: _visibleMonth,
          selectedDate: _selectedDate,
          eventCountForDate: (date) => _gamesOn(date).length,
          onDateSelected: (date) => setState(() => _selectedDate = date),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            DateFormat('M월 d일 EEEE', 'ko').format(_selectedDate),
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: 8),
        if (selectedGames.isEmpty)
          const SeasonStatePanel(
            icon: Icons.event_outlined,
            title: '이 날짜에는 경기가 없습니다',
            message: '다른 날짜를 선택해 주세요.',
          )
        else
          for (var index = 0; index < selectedGames.length; index++) ...[
            PublicMatchCard(
              game: selectedGames[index],
              onTap: () => _openGame(selectedGames[index]),
            ),
            if (index != selectedGames.length - 1) const SizedBox(height: 8),
          ],
      ],
    );
  }

  void _changeMonth(int delta) {
    final next = DateTime(_visibleMonth.year, _visibleMonth.month + delta, 1);
    setState(() {
      _visibleMonth = next;
      _selectedDate = next;
    });
    _loadMonthGames();
  }

  List<PublicGame> _gamesOn(DateTime date) {
    return _monthGames.where((game) {
      final gameDate = game.gameDate ?? game.startTime;
      return gameDate != null && KstClock.isSameDay(gameDate, date);
    }).toList();
  }

  Widget _buildGroups() {
    final groups = _overview?.groups ?? const <GroupOverview>[];
    final selected = groups.where((group) => group.groupCode == _selectedGroup);
    final group = selected.isEmpty ? null : selected.first;
    return SeasonSectionPanel(
      eyebrow: 'GROUP STANDINGS',
      title: 'A~H 조별 현황',
      description: '진출 상태는 관리자가 확정한 공식 판정을 따릅니다.',
      action: SeasonActionButton(
        label: '전체 순위',
        icon: Icons.arrow_forward,
        style: SeasonActionStyle.text,
        onPressed: () => ShellController.of(context)?.switchTab(
          AppDestination.records,
          recordsTabIndex: RecordsHubTab.standings.index,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          LayoutBuilder(
            builder: (context, constraints) {
              const codes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
              final columns = constraints.maxWidth >= 720 ? 8 : 4;
              final largeText =
                  MediaQuery.textScalerOf(context).scale(1) >= 1.5;
              const gap = 8.0;
              final itemWidth =
                  (constraints.maxWidth - (columns - 1) * gap) / columns;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final code in codes)
                    SizedBox(
                      width: itemWidth,
                      height: largeText ? 60 : 44,
                      child: ChoiceChip(
                        label: SizedBox(
                          width: double.infinity,
                          child: Text('$code조', textAlign: TextAlign.center),
                        ),
                        showCheckmark: false,
                        selected: _selectedGroup == code,
                        onSelected: (_) =>
                            setState(() => _selectedGroup = code),
                      ),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 12),
          if (_loading && group == null)
            const _HomeLoadingCard()
          else if (group == null || group.standings.isEmpty)
            const SeasonStatePanel(
              icon: Icons.table_rows_outlined,
              title: '조별 순위가 아직 게시되지 않았습니다',
              message: '공식 순위가 게시되면 승패와 진출 상태를 확인할 수 있습니다.',
            )
          else
            Card(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
                    child: Row(
                      children: [
                        Text(
                          '${group.groupCode}조',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const Spacer(),
                        Text(
                          '${group.completedGameCount}경기 완료 · ${group.teamCount}팀',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: context.aublColors.muted),
                        ),
                      ],
                    ),
                  ),
                  for (
                    var index = 0;
                    index < group.standings.length;
                    index++
                  ) ...[
                    if (index > 0)
                      Divider(height: 1, color: context.aublColors.line),
                    _StandingRow(row: group.standings[index]),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildLeaders() {
    final batters = _overview?.batterLeaders ?? const <SeasonBatterLeader>[];
    final pitchers = _overview?.pitcherLeaders ?? const <SeasonPitcherLeader>[];
    return SeasonSectionPanel(
      eyebrow: 'SEASON LEADERS',
      title: '시즌 기록 리더',
      description: '검증이 완료된 공개 기록만 표시합니다.',
      action: SeasonActionButton(
        label: '전체 기록',
        icon: Icons.arrow_forward,
        style: SeasonActionStyle.text,
        onPressed: () =>
            ShellController.of(context)?.switchTab(AppDestination.records),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide =
              constraints.maxWidth >= 640 &&
              MediaQuery.textScalerOf(context).scale(1) < 1.6;
          final batterCard = _LeaderCard(
            title: '타자',
            rows: batters.take(3).map((row) {
              final value = row.battingAverage == null
                  ? '${row.hits ?? '-'} H'
                  : row.battingAverage!.toStringAsFixed(3);
              return _LeaderRowData(
                rank: row.rank,
                playerName: row.playerName,
                teamName: row.teamName,
                value: value,
              );
            }).toList(),
          );
          final pitcherCard = _LeaderCard(
            title: '투수',
            rows: pitchers.take(3).map((row) {
              final value = row.era == null
                  ? '${row.wins ?? '-'} W'
                  : 'ERA ${row.era!.toStringAsFixed(2)}';
              return _LeaderRowData(
                rank: row.rank,
                playerName: row.playerName,
                teamName: row.teamName,
                value: value,
              );
            }).toList(),
          );
          return wide
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: batterCard),
                    const SizedBox(width: 12),
                    Expanded(child: pitcherCard),
                  ],
                )
              : Column(
                  children: [
                    batterCard,
                    const SizedBox(height: 12),
                    pitcherCard,
                  ],
                );
        },
      ),
    );
  }

  Widget _buildNotices() {
    return SeasonSectionPanel(
      eyebrow: 'NOTICE & COMMUNITY',
      title: '공지와 커뮤니티',
      description: _userTeamName == null
          ? '리그의 최신 소식을 확인하세요.'
          : '$_userTeamName 소식과 리그 공지입니다.',
      action: SeasonActionButton(
        label: '전체 공지',
        icon: Icons.arrow_forward,
        style: SeasonActionStyle.text,
        onPressed: () =>
            ShellController.of(context)?.switchTab(AppDestination.community),
      ),
      child: Column(
        children: [
          if (_leagueNotices.isEmpty && _teamNotices.isEmpty)
            const SeasonStatePanel(
              icon: Icons.notifications_none_outlined,
              title: '새 공지가 없습니다',
              message: '새 소식이 등록되면 이곳에 표시됩니다.',
            )
          else
            Card(
              child: Column(
                children: [
                  for (final notice in _teamNotices)
                    _NoticeTile(
                      label: '팀 공지',
                      title: notice.title,
                      pinned: notice.pinned,
                      onTap: _userTeamId == null || _userTeamName == null
                          ? null
                          : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => TeamNoticeDetailScreen(
                                  teamId: _userTeamId!,
                                  teamName: _userTeamName!,
                                  notice: notice,
                                  canManage: false,
                                ),
                              ),
                            ),
                    ),
                  for (final notice in _leagueNotices)
                    _NoticeTile(
                      label: notice.category,
                      title: notice.title,
                      pinned: notice.isImportant,
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => NoticeDetailScreen(notice: notice),
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildPartners() {
    const partners = [
      ('UniquePlay', '공식 경기·기록 데이터', _uniquePlayUrl),
      ('골드볼파크', '공인구', _goldballParkUrl),
      ('메이저', '배트', _majorUrl),
      ('Instagram', '@aubl_1981', _instagramUrl),
    ];
    return SeasonSectionPanel(
      eyebrow: 'OFFICIAL PARTNERS',
      title: '오피셜 파트너',
      description: 'AUBL과 함께하는 공식 파트너와 채널입니다.',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final columns = constraints.maxWidth >= 820
              ? 4
              : constraints.maxWidth >= 480
              ? 2
              : 1;
          final textScale = MediaQuery.textScalerOf(context).scale(1);
          return GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: partners.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              mainAxisExtent: textScale >= 1.6 ? 148 : 108,
            ),
            itemBuilder: (context, index) {
              final (name, role, url) = partners[index];
              return Card(
                child: InkWell(
                  onTap: () => _openExternal(url),
                  borderRadius: BorderRadius.circular(4),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.titleSmall,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                role,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context).textTheme.bodySmall
                                    ?.copyWith(color: context.aublColors.muted),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          Icons.north_east,
                          size: 18,
                          color: context.aublColors.cobalt,
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _StandingRow extends StatelessWidget {
  const _StandingRow({required this.row});

  final GroupStanding row;

  @override
  Widget build(BuildContext context) {
    final tone = switch (row.qualificationState) {
      QualificationState.currentEutteum ||
      QualificationState.confirmedEutteum => SeasonBadgeTone.navy,
      QualificationState.currentBeogeum ||
      QualificationState.confirmedBeogeum => SeasonBadgeTone.blue,
      QualificationState.tiePending => SeasonBadgeTone.warning,
      QualificationState.currentOut ||
      QualificationState.confirmedOut => SeasonBadgeTone.muted,
      QualificationState.unknown => SeasonBadgeTone.muted,
    };
    return LayoutBuilder(
      builder: (context, constraints) {
        final stackBadge =
            constraints.maxWidth < 360 ||
            MediaQuery.textScalerOf(context).scale(1) >= 1.3;
        final badge = SeasonStatusBadge(
          label: row.qualificationState.label,
          tone: tone,
        );
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 26,
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
              const SizedBox(width: 6),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      row.teamName,
                      maxLines: stackBadge ? 2 : 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${row.wins}승 ${row.ties}무 ${row.losses}패 · ${row.winPct.toStringAsFixed(3)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.aublColors.muted,
                      ),
                    ),
                    if (stackBadge) ...[const SizedBox(height: 8), badge],
                  ],
                ),
              ),
              if (!stackBadge) ...[const SizedBox(width: 8), badge],
            ],
          ),
        );
      },
    );
  }
}

class _MatchGroupLabel extends StatelessWidget {
  const _MatchGroupLabel({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(color: context.aublColors.navy),
          ),
        ),
        Text(
          '$count경기',
          style: TextStyle(
            color: context.aublColors.cobalt,
            fontFamily: 'BarlowCondensed',
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.8,
          ),
        ),
      ],
    );
  }
}

class _LeaderRowData {
  const _LeaderRowData({
    required this.rank,
    required this.playerName,
    required this.teamName,
    required this.value,
  });

  final int rank;
  final String playerName;
  final String teamName;
  final String value;
}

class _LeaderCard extends StatelessWidget {
  const _LeaderCard({required this.title, required this.rows});

  final String title;
  final List<_LeaderRowData> rows;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 18),
                child: Text(
                  '검증된 공개 기록이 없습니다.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: context.aublColors.muted,
                  ),
                ),
              )
            else
              for (var index = 0; index < rows.length; index++) ...[
                if (index > 0)
                  Divider(height: 17, color: context.aublColors.line),
                Row(
                  children: [
                    Text(
                      '${rows[index].rank}',
                      style: TextStyle(
                        color: context.aublColors.navy,
                        fontFamily: 'BarlowCondensed',
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rows[index].playerName,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          Text(
                            rows[index].teamName,
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(color: context.aublColors.muted),
                          ),
                        ],
                      ),
                    ),
                    Text(
                      rows[index].value,
                      style: TextStyle(
                        color: context.aublColors.cobalt,
                        fontFamily: 'BarlowCondensed',
                        fontSize: 19,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ],
          ],
        ),
      ),
    );
  }
}

class _NoticeTile extends StatelessWidget {
  const _NoticeTile({
    required this.label,
    required this.title,
    required this.pinned,
    required this.onTap,
  });

  final String label;
  final String title;
  final bool pinned;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 56,
      onTap: onTap,
      leading: SeasonStatusBadge(
        label: label,
        tone: pinned ? SeasonBadgeTone.warning : SeasonBadgeTone.muted,
      ),
      title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: const Icon(Icons.chevron_right),
    );
  }
}

class _LiveMatchCard extends StatelessWidget {
  const _LiveMatchCard({required this.match, required this.onTap});

  final Match match;
  final ValueChanged<Match> onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: () => onTap(match),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.all(15),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SeasonStatusBadge(
                label: 'LIVE',
                tone: SeasonBadgeTone.danger,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      match.homeTeamName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  Text(
                    '${match.homeScore ?? '-'}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ],
              ),
              const SizedBox(height: 7),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      match.awayTeamName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  Text(
                    '${match.awayScore ?? '-'}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '경기 상세',
                style: TextStyle(
                  color: context.aublColors.cobalt,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HomeLoadingCard extends StatelessWidget {
  const _HomeLoadingCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '공식 시즌 데이터를 불러오는 중입니다.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CampaignContent {
  const _CampaignContent({
    required this.topline,
    required this.description,
    required this.subcopy,
    required this.facts,
  });

  const _CampaignContent.fallback()
    : topline = '전국대학아마추어야구연합회 · SINCE 1981',
      description =
          '2026 제46회 전국대학아마추어야구연합회(AUBL). 대한민국 유일의 순수 대학 아마추어 야구 리그에서\n40개 대학 2,000여 명의 선수가 써 내려가는 각본 없는 드라마가 지금 시작됩니다.',
      subcopy =
          '2026 연합회교 중앙대학교(서울)와 함께하는 시즌 — 실시간 기록과 중계, 디지털화를 핵심 가치로 리그의 새로운 도약을 준비했습니다.',
      facts = const [
        SeasonHeroFact(
          label: '2026 연합회교',
          value: '중앙대학교(서울)',
          description: '46주년 시즌 운영을 담당하는 연합회교',
        ),
        SeasonHeroFact(
          label: 'FORMAT',
          value: 'A~H조 8개 조 / 약 40팀',
          description: '조별 예선 후 으뜸·버금 이원화 토너먼트로 최강자를 가립니다.',
        ),
        SeasonHeroFact(
          label: 'VISION',
          value: '실시간 기록 · 중계 · 디지털화',
          description: '웹 플랫폼 기반 실시간 기록과 중계로 리그 소식을 즉시 전달하는 2026 시즌',
        ),
      ];

  final String topline;
  final String description;
  final String subcopy;
  final List<SeasonHeroFact> facts;

  factory _CampaignContent.fromRoot(Map<String, dynamic> root) {
    const fallback = _CampaignContent.fallback();
    final rawLanding = root['landing'];
    if (rawLanding is! Map) return fallback;
    final landing = rawLanding.cast<String, dynamic>();
    final rawFacts = landing['snapshotCards'];
    final facts = <SeasonHeroFact>[];
    if (rawFacts is List) {
      for (final item in rawFacts.take(3)) {
        if (item is! Map) continue;
        final json = item.cast<String, dynamic>();
        final index = facts.length;
        final defaultFact = fallback.facts[index];
        facts.add(
          SeasonHeroFact(
            label: _campaignCopy(
              _campaignString(json['label'], defaultFact.label, 48),
            ),
            value: _campaignCopy(
              _campaignString(json['value'], defaultFact.value, 80),
            ),
            description: _campaignCopy(
              _campaignString(json['desc'], defaultFact.description, 180),
            ),
          ),
        );
      }
    }
    return _CampaignContent(
      topline: _campaignCopy(
        _campaignString(landing['heroBadgeText'], fallback.topline, 100),
      ),
      description: _campaignCopy(
        _campaignString(landing['heroDescription'], fallback.description, 420),
      ),
      subcopy: _campaignCopy(
        _campaignString(landing['heroSubDescription'], fallback.subcopy, 300),
      ),
      facts: [
        ...facts,
        ...fallback.facts.skip(facts.length),
      ].take(3).toList(growable: false),
    );
  }
}

String _campaignString(dynamic value, String fallback, int maxLength) {
  final text = value?.toString().trim() ?? '';
  if (text.isEmpty) return fallback;
  return text.length <= maxLength ? text : text.substring(0, maxLength);
}

String _campaignCopy(String value) {
  return value
      .replaceAll(
        RegExp(r'(?:2026\s*[·|/\-]?\s*)?HOSTED\s+BY', caseSensitive: false),
        '2026 연합회교',
      )
      .replaceAll(RegExp(r'2026\s+HOST\b', caseSensitive: false), '2026 연합회교')
      .replaceAll(RegExp(r'주최\s*\(\s*2026\s*\)'), '연합회교 (2026)')
      .replaceAll(RegExp(r'호스트\s*대학'), '연합회교')
      .replaceAll(RegExp('호스트'), '연합회교')
      .replaceAllMapped(
        RegExp(r'(중앙대학교(?:\(서울\))?)[가이]\s*주최(?:를)?\s*맡아'),
        (match) => '${match.group(1)}가 연합회교로서',
      )
      .replaceAllMapped(
        RegExp(r'(중앙대학교(?:\(서울\))?)[가이]\s*주최하는'),
        (match) => '${match.group(1)}가 연합회교로 운영하는',
      )
      .replaceAllMapped(
        RegExp(r'(중앙대학교(?:\(서울\))?)\s*주최'),
        (match) => '연합회교 ${match.group(1)}',
      )
      .replaceAllMapped(
        RegExp(r'(중앙대학교(?:\(서울\))?)[가이]\s*연합회교를 맡아'),
        (match) => '${match.group(1)}가 연합회교로서',
      )
      .replaceAll(
        RegExp(r'46주년 시즌 운영 전권(?:을)?\s*(?:맡은|위임받은) 연합회교'),
        '46주년 시즌 운영을 담당하는 연합회교',
      );
}

class _SiteAnnouncement {
  const _SiteAnnouncement({
    required this.enabled,
    required this.revision,
    required this.tone,
    required this.title,
    required this.message,
    required this.linkLabel,
    required this.safeLink,
  });

  final bool enabled;
  final String revision;
  final String tone;
  final String title;
  final String message;
  final String? linkLabel;
  final String? safeLink;

  factory _SiteAnnouncement.fromJson(Map<String, dynamic> json) {
    final revision = json['revision']?.toString().trim();
    final link = json['linkHref']?.toString().trim();
    return _SiteAnnouncement(
      enabled: json['enabled'] == true,
      revision: revision == null || revision.isEmpty ? 'default' : revision,
      tone: json['tone'] == 'warning' ? 'warning' : 'info',
      title: _clip(json['title'], 100, fallback: 'AUBL 중요 공지'),
      message: _clip(json['message'], 500, fallback: ''),
      linkLabel: _nullableClip(json['linkLabel'], 60),
      safeLink: _safeAnnouncementLink(link),
    );
  }
}

String _clip(dynamic value, int maxLength, {required String fallback}) {
  final text = value?.toString().trim() ?? '';
  if (text.isEmpty) return fallback;
  return text.length <= maxLength ? text : text.substring(0, maxLength);
}

String? _nullableClip(dynamic value, int maxLength) {
  final text = value?.toString().trim();
  if (text == null || text.isEmpty) return null;
  return text.length <= maxLength ? text : text.substring(0, maxLength);
}

String? _safeAnnouncementLink(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  if (raw.startsWith('/')) return 'https://aubl.club$raw';
  final uri = Uri.tryParse(raw);
  if (uri == null || uri.scheme != 'https' || uri.userInfo.isNotEmpty) {
    return null;
  }
  return uri.toString();
}

String? _normalizeTeamName(String? value) {
  final normalized = value?.replaceAll(RegExp(r'\s+'), '').toLowerCase();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

DateTime _monthStart(DateTime date) => KstClock.monthStart(date);
