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
import '../../core/services/backend_api_service.dart';
import '../../core/services/cache_service.dart';
import '../../core/services/firestore_service.dart';
import '../../core/services/notification_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/season_components.dart';
import '../community/notice_detail_screen.dart';
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

  final BackendApiService _api = BackendApiService();
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
  MatchViewMode _viewMode = MatchViewMode.list;
  DateTime _visibleMonth = _monthStart(_kstNow());
  DateTime _selectedDate = _kstToday();
  _SiteAnnouncement? _announcement;
  bool _announcementCollapsed = false;
  bool _announcementHidden = false;

  @override
  void initState() {
    super.initState();
    _restoreViewMode();
    _listenForAnnouncement();
    _loadAll();
    _authSubscription =
        FirebaseAuth.instance.authStateChanges().listen((_) => _loadUserTeam());
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
      final next =
          raw is Map<String, dynamic> ? _SiteAnnouncement.fromJson(raw) : null;
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
    try {
      final seasons = await _api.getSeasons();
      if (seasons.isEmpty) throw StateError('공개된 시즌이 없습니다.');
      final season = seasons.firstWhere(
        (item) => item.year == 2026,
        orElse: () => seasons.first,
      );
      nextOverview = await _api.getSeasonOverview(season.id);
    } catch (_) {
      nextError = '공식 시즌 데이터를 불러오지 못했습니다.';
    }

    await Future.wait([
      _loadNotices(),
      _loadUserTeam(),
    ]);

    if (!mounted) return;
    setState(() {
      _overview = nextOverview ?? _overview;
      _error = nextError;
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
    if (overview == null || _calendarLoading) return;
    setState(() => _calendarLoading = true);
    final first = _monthStart(_visibleMonth);
    final last = DateTime(first.year, first.month + 1, 0);
    try {
      final games = await _api.getPublicGames(
        seasonId: overview.seasonId,
        dateFrom: first,
        dateTo: last,
      );
      if (!mounted) return;
      setState(() => _monthGames = games);
    } catch (_) {
      if (!mounted) return;
      setState(() => _monthGames = const []);
    } finally {
      if (mounted) setState(() => _calendarLoading = false);
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
        title: Row(
          children: [
            Image.asset(
              'assets/images/aubl_clean.png',
              height: 32,
              width: 42,
              fit: BoxFit.contain,
              semanticLabel: 'AUBL',
            ),
            const SizedBox(width: 8),
            const Text('AUBL'),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadAll(showLoading: false),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
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
              DataFreshnessCard(freshness: _overview!.sourceFreshness)
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
            const SizedBox(height: 28),
            _buildMatches(),
            const SizedBox(height: 30),
            _buildGroups(),
            const SizedBox(height: 30),
            _buildLeaders(),
            const SizedBox(height: 30),
            _buildNotices(),
            const SizedBox(height: 30),
            _buildPartners(),
          ],
        ),
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
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: accent.withValues(alpha: 0.48)),
        ),
        child: Column(
          children: [
            ListTile(
              minTileHeight: 56,
              leading: Icon(
                warning ? Icons.campaign_outlined : Icons.info_outline,
                color: accent,
              ),
              title: Text(
                announcement.title,
                style: Theme.of(context).textTheme.titleSmall,
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
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            height: 1.5,
                          ),
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
    return SeasonPageHero(
      eyebrow: '46TH AUBL · 2026 연합회교 중앙대학교(서울)',
      leading: Image.asset(
        'assets/images/aubl_clean.png',
        width: 40,
        height: 40,
        fit: BoxFit.contain,
      ),
      title: const SeasonWordmark(
        lead: '우리의 청춘은 이번에도',
        emphasis: 'PLAY BALL',
      ),
      description:
          '40개 대학이 함께 만드는 순수 대학 아마추어 야구 리그. 일정과 결과, 조별 현황과 시즌 기록을 한곳에서 확인하세요.',
    );
  }

  Widget _buildMatches() {
    final overview = _overview;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SeasonSectionHeader(
          title: '일정과 결과를 한눈에',
          description: '공식 게시된 경기만 표시합니다.',
          action: IconButton(
            tooltip: '전체 경기 보기',
            onPressed: () =>
                ShellController.of(context)?.switchTab(AppDestination.games),
            icon: const Icon(Icons.arrow_forward),
          ),
        ),
        const SizedBox(height: 12),
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
    );
  }

  Widget _buildMatchList(SeasonOverview overview) {
    final games = <PublicGame>[
      ...overview.upcomingGames.take(4),
      ...overview.recentGames.take(4),
    ];
    if (games.isEmpty) {
      return const SeasonStatePanel(
        icon: Icons.event_available_outlined,
        title: '게시된 경기가 없습니다',
        message: '새 일정이나 결과가 게시되면 이곳에 표시됩니다.',
      );
    }
    return Column(
      children: [
        for (var index = 0; index < games.length; index++) ...[
          PublicMatchCard(
              game: games[index], onTap: () => _openGame(games[index])),
          if (index != games.length - 1) const SizedBox(height: 10),
        ],
      ],
    );
  }

  Widget _buildCalendar() {
    final colors = context.aublColors;
    final first = _monthStart(_visibleMonth);
    final days = DateTime(first.year, first.month + 1, 0).day;
    final leading = first.weekday - DateTime.monday;
    final cells = ((leading + days + 6) ~/ 7) * 7;
    final selectedGames = _gamesOn(_selectedDate);
    return Column(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
            child: Column(
              children: [
                Row(
                  children: [
                    IconButton(
                      tooltip: '이전 달',
                      onPressed: () => _changeMonth(-1),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Expanded(
                      child: Text(
                        DateFormat('yyyy년 M월').format(_visibleMonth),
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        setState(() {
                          _visibleMonth = _monthStart(_kstNow());
                          _selectedDate = _kstToday();
                        });
                        _loadMonthGames();
                      },
                      child: const Text('오늘'),
                    ),
                    IconButton(
                      tooltip: '다음 달',
                      onPressed: () => _changeMonth(1),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                if (_calendarLoading) const LinearProgressIndicator(),
                const SizedBox(height: 8),
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
                const SizedBox(height: 4),
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
                    if (day < 1 || day > days) {
                      return const SizedBox.shrink();
                    }
                    final date = DateTime(first.year, first.month, day);
                    final games = _gamesOn(date);
                    final selected = _sameDay(date, _selectedDate);
                    return Semantics(
                      button: true,
                      selected: selected,
                      label: '$day일, 경기 ${games.length}개',
                      child: InkWell(
                        onTap: () => setState(() => _selectedDate = date),
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
                              Text(
                                '$day',
                                style: TextStyle(
                                  color: selected ? colors.navy : colors.ink,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const Spacer(),
                              if (games.isNotEmpty) ...[
                                Text(
                                  '${games.length}경기',
                                  style: TextStyle(
                                    color: colors.cobalt,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 4),
                              ],
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
      return gameDate != null && _sameDay(gameDate, date);
    }).toList();
  }

  Widget _buildGroups() {
    final groups = _overview?.groups ?? const <GroupOverview>[];
    final selected = groups.where((group) => group.groupCode == _selectedGroup);
    final group = selected.isEmpty ? null : selected.first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SeasonSectionHeader(
          title: 'A~H 조별 현황',
          description: '진출 상태는 관리자가 확정한 공식 판정을 따릅니다.',
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final code in const ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('$code조'),
                    selected: _selectedGroup == code,
                    onSelected: (_) => setState(() => _selectedGroup = code),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
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
                      Text('${group.groupCode}조',
                          style: Theme.of(context).textTheme.titleMedium),
                      const Spacer(),
                      Text(
                        '${group.completedGameCount}경기 완료 · ${group.teamCount}팀',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: context.aublColors.muted,
                            ),
                      ),
                    ],
                  ),
                ),
                for (var index = 0;
                    index < group.standings.length;
                    index++) ...[
                  if (index > 0)
                    Divider(height: 1, color: context.aublColors.line),
                  _StandingRow(row: group.standings[index]),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildLeaders() {
    final batters = _overview?.batterLeaders ?? const <SeasonBatterLeader>[];
    final pitchers = _overview?.pitcherLeaders ?? const <SeasonPitcherLeader>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SeasonSectionHeader(
          title: '시즌 기록 리더',
          description: '검증이 완료된 공개 기록만 표시합니다.',
          action: IconButton(
            tooltip: '전체 기록 보기',
            onPressed: () =>
                ShellController.of(context)?.switchTab(AppDestination.records),
            icon: const Icon(Icons.arrow_forward),
          ),
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 640;
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
      ],
    );
  }

  Widget _buildNotices() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SeasonSectionHeader(
          title: '공지와 커뮤니티',
          description: _userTeamName == null
              ? '리그의 최신 소식을 확인하세요.'
              : '$_userTeamName 소식과 리그 공지입니다.',
          action: IconButton(
            tooltip: '커뮤니티 보기',
            onPressed: () => ShellController.of(context)
                ?.switchTab(AppDestination.community),
            icon: const Icon(Icons.arrow_forward),
          ),
        ),
        const SizedBox(height: 12),
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
    );
  }

  Widget _buildPartners() {
    const partners = [
      ('UniquePlay', '공식 경기·기록 데이터', _uniquePlayUrl),
      ('골드볼파크', '공인구', _goldballParkUrl),
      ('메이저', '배트', _majorUrl),
      ('Instagram', '@aubl_1981', _instagramUrl),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SeasonSectionHeader(
          title: '오피셜 파트너',
          description: 'AUBL과 함께하는 공식 파트너와 채널입니다.',
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: partners.length,
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            childAspectRatio: 1.55,
          ),
          itemBuilder: (context, index) {
            final (name, role, url) = partners[index];
            return Card(
              child: InkWell(
                onTap: () => _openExternal(url),
                borderRadius: BorderRadius.circular(14),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.north_east,
                          size: 18, color: context.aublColors.cobalt),
                      const Spacer(),
                      Text(name, style: Theme.of(context).textTheme.titleSmall),
                      const SizedBox(height: 3),
                      Text(
                        role,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: context.aublColors.muted,
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
      QualificationState.confirmedEutteum =>
        SeasonBadgeTone.navy,
      QualificationState.currentBeogeum ||
      QualificationState.confirmedBeogeum =>
        SeasonBadgeTone.blue,
      QualificationState.tiePending => SeasonBadgeTone.warning,
      QualificationState.currentOut ||
      QualificationState.confirmedOut =>
        SeasonBadgeTone.muted,
      QualificationState.unknown => SeasonBadgeTone.muted,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
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
                Text(row.teamName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 2),
                Text(
                  '${row.wins}승 ${row.ties}무 ${row.losses}패 · ${row.winPct.toStringAsFixed(3)}',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: context.aublColors.muted,
                      ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          SeasonStatusBadge(
            label: row.qualificationState.label,
            tone: tone,
          ),
        ],
      ),
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
                          Text(rows[index].playerName,
                              style: Theme.of(context).textTheme.titleSmall),
                          Text(
                            rows[index].teamName,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
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
        borderRadius: BorderRadius.circular(14),
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
                    child: Text(match.homeTeamName,
                        style: Theme.of(context).textTheme.titleMedium),
                  ),
                  Text('${match.homeScore ?? '-'}',
                      style: Theme.of(context).textTheme.titleLarge),
                ],
              ),
              const SizedBox(height: 7),
              Row(
                children: [
                  Expanded(
                    child: Text(match.awayTeamName,
                        style: Theme.of(context).textTheme.titleMedium),
                  ),
                  Text('${match.awayScore ?? '-'}',
                      style: Theme.of(context).textTheme.titleLarge),
                ],
              ),
              const SizedBox(height: 10),
              Text('경기 상세',
                  style: TextStyle(
                    color: context.aublColors.cobalt,
                    fontWeight: FontWeight.w800,
                  )),
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
            Text('공식 시즌 데이터를 불러오는 중입니다.',
                style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
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

DateTime _kstNow() => DateTime.now().toUtc().add(const Duration(hours: 9));

DateTime _kstToday() {
  final now = _kstNow();
  return DateTime(now.year, now.month, now.day);
}

DateTime _monthStart(DateTime date) => DateTime(date.year, date.month);

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;
