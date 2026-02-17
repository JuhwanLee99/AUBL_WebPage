import 'package:flutter/material.dart';

import '../../core/services/backend_api_service.dart';
import '../../core/theme/app_theme.dart';
import 'player_detail_screen.dart';

enum RecordsHubTab {
  overview('개요'),
  standings('팀순위'),
  pitchers('투수기록'),
  batters('타자기록'),
  power('파워랭킹'),
  playerDetail('선수상세');

  const RecordsHubTab(this.label);
  final String label;
}

class RecordsScreen extends StatefulWidget {
  const RecordsScreen({
    super.key,
    this.initialTab = RecordsHubTab.overview,
    this.apiService,
  });

  final RecordsHubTab initialTab;
  final BackendApiService? apiService;

  @override
  RecordsScreenState createState() => RecordsScreenState();
}

class RecordsScreenState extends State<RecordsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl;
  late final BackendApiService _api;
  late final bool _ownsApi;

  List<SeasonSummary> _seasons = [];
  int? _seasonId;

  RecordScope _scope = RecordScope.all;
  RecordGroup _group = RecordGroup.all;
  RecordPlayoffDivision _playoffDivision = RecordPlayoffDivision.all;
  RecordRegulation _regulation = RecordRegulation.inRule;
  String _search = '';
  int? _rankingYear;
  int _powerLimit = 50;
  BatterRankingSort _topBatterSort = BatterRankingSort.ops;
  PitcherRankingSort _topPitcherSort = PitcherRankingSort.era;

  bool _initializing = true;
  bool _loading = false;
  bool _powerLoading = false;
  String? _error;
  String? _warning;
  String? _powerError;
  bool _playoffFilterEnabled = false;

  RecordsOverview? _overview;
  List<TeamRecordStanding> _teamStandings = [];
  List<BatterRanking> _batters = [];
  List<PitcherRanking> _pitchers = [];
  List<BatterRanking> _topInBatters = [];
  List<PitcherRanking> _topInPitchers = [];
  List<PlayoffSummaryRow> _playoffRows = [];
  List<PowerRankingApiRow> _powerRows = [];

  @override
  void initState() {
    super.initState();
    _api = widget.apiService ?? BackendApiService();
    _ownsApi = widget.apiService == null;
    _tabCtrl = TabController(
      length: RecordsHubTab.values.length,
      vsync: this,
      initialIndex: widget.initialTab.index,
    )..addListener(_onTabChanged);

    _loadInitial();
  }

  @override
  void dispose() {
    _tabCtrl.removeListener(_onTabChanged);
    _tabCtrl.dispose();
    if (_ownsApi) {
      _api.dispose();
    }
    super.dispose();
  }

  void switchToTabIndex(int index) {
    if (index < 0 || index >= RecordsHubTab.values.length) return;
    _tabCtrl.animateTo(index);
  }

  void _onTabChanged() {
    if (_tabCtrl.indexIsChanging) return;
    if (_tabCtrl.index == RecordsHubTab.power.index &&
        _powerRows.isEmpty &&
        !_powerLoading) {
      _loadPowerRankings();
    }
    if (mounted) setState(() {});
  }

  Future<void> _loadInitial() async {
    setState(() {
      _initializing = true;
      _error = null;
    });

    try {
      final seasons = await _api.getSeasons();
      if (!mounted) return;
      if (seasons.isEmpty) {
        setState(() {
          _seasons = [];
          _error = '등록된 시즌이 없습니다.';
          _initializing = false;
        });
        return;
      }

      final selectedSeasonId = seasons.first.id;
      final selectedSeason = seasons.first;
      setState(() {
        _seasons = seasons;
        _seasonId = selectedSeasonId;
        _rankingYear = selectedSeason.year + 1;
        _initializing = false;
      });

      await _reloadRecords();
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = err.toString();
        _initializing = false;
      });
    }
  }

  Future<void> _reloadRecords() async {
    final seasonId = _seasonId;
    if (seasonId == null) return;

    setState(() {
      _loading = true;
      _error = null;
      _warning = null;
    });

    final filters = _toRecordFilterParams();

    final mainBattersFuture = _capture<List<BatterRanking>>(
      _api.getBatterRankings(
        seasonId: seasonId,
        limit: 200,
        sort: BatterRankingSort.ops,
        filters: filters,
        regulation: _regulation,
      ),
    );
    final mainPitchersFuture = _capture<List<PitcherRanking>>(
      _api.getPitcherRankings(
        seasonId: seasonId,
        limit: 200,
        sort: PitcherRankingSort.era,
        filters: filters,
        regulation: _regulation,
      ),
    );
    final topBattersFuture = _capture<List<BatterRanking>>(
      _api.getBatterRankings(
        seasonId: seasonId,
        limit: 5,
        sort: _topBatterSort,
        filters: filters,
        regulation: RecordRegulation.inRule,
      ),
    );
    final topPitchersFuture = _capture<List<PitcherRanking>>(
      _api.getPitcherRankings(
        seasonId: seasonId,
        limit: 5,
        sort: _topPitcherSort,
        filters: filters,
        regulation: RecordRegulation.inRule,
      ),
    );
    final overviewFuture = _capture<RecordsOverview>(
      _api.getRecordOverview(seasonId, filters: filters),
    );
    final standingsFuture = _capture<List<TeamRecordStanding>>(
      _api.getTeamRecordStandings(seasonId, filters: filters),
    );
    final playoffFuture = _capture<List<PlayoffSummaryRow>>(
      _api.getPlayoffSummaries(seasonId, filters: filters),
    );
    final playerIndexFuture = _capture<List<PlayerLookup>>(
      _api.getPlayerSearchIndex(seasonId),
    );

    await Future.wait<Object?>([
      mainBattersFuture,
      mainPitchersFuture,
      topBattersFuture,
      topPitchersFuture,
      overviewFuture,
      standingsFuture,
      playoffFuture,
      playerIndexFuture,
    ]);

    if (!mounted) return;

    final mainBattersRes = await mainBattersFuture;
    final mainPitchersRes = await mainPitchersFuture;
    final topBattersRes = await topBattersFuture;
    final topPitchersRes = await topPitchersFuture;
    final overviewRes = await overviewFuture;
    final standingsRes = await standingsFuture;
    final playoffRes = await playoffFuture;
    final playerIndexRes = await playerIndexFuture;
    final allResults = <_LoadResult<Object?>>[
      mainBattersRes,
      mainPitchersRes,
      topBattersRes,
      topPitchersRes,
      overviewRes,
      standingsRes,
      playoffRes,
      playerIndexRes,
    ];

    final warnings = <String>[];
    for (final result in allResults) {
      if (result.error != null) warnings.add(result.error!.toString());
    }

    final mainBatters = mainBattersRes.value ?? <BatterRanking>[];
    final mainPitchers = mainPitchersRes.value ?? <PitcherRanking>[];
    final topBatters = topBattersRes.value ?? <BatterRanking>[];
    final topPitchers = topPitchersRes.value ?? <PitcherRanking>[];
    final standings = standingsRes.value ?? <TeamRecordStanding>[];
    final playoff = playoffRes.value ?? <PlayoffSummaryRow>[];
    final playerIndex = playerIndexRes.value ?? <PlayerLookup>[];

    final hasAnyCoreData = mainBatters.isNotEmpty ||
        mainPitchers.isNotEmpty ||
        standings.isNotEmpty ||
        (overviewRes.value != null);

    if (!hasAnyCoreData && warnings.isNotEmpty) {
      setState(() {
        _loading = false;
        _error = '기록 데이터를 불러오지 못했습니다.';
      });
      return;
    }

    final jerseyByPlayerId = <int, String>{};
    for (final item in playerIndex) {
      if (item.jerseyNumber.trim().isEmpty) continue;
      jerseyByPlayerId[item.playerId] = item.jerseyNumber.trim();
    }

    List<BatterRanking> applyBatterJersey(List<BatterRanking> source) {
      if (jerseyByPlayerId.isEmpty) return source;
      return source
          .map(
            (row) => row.jerseyNumber.trim().isNotEmpty
                ? row
                : BatterRanking(
                    rank: row.rank,
                    playerId: row.playerId,
                    playerName: row.playerName,
                    teamId: row.teamId,
                    teamName: row.teamName,
                    seasonId: row.seasonId,
                    seasonYear: row.seasonYear,
                    jerseyNumber:
                        jerseyByPlayerId[row.playerId] ?? row.jerseyNumber,
                    gamesPlayed: row.gamesPlayed,
                    plateAppearance: row.plateAppearance,
                    atBats: row.atBats,
                    hits: row.hits,
                    homeRuns: row.homeRuns,
                    runsBattedIn: row.runsBattedIn,
                    stolenBases: row.stolenBases,
                    walks: row.walks,
                    strikeouts: row.strikeouts,
                    battingAverage: row.battingAverage,
                    onBasePct: row.onBasePct,
                    sluggingPct: row.sluggingPct,
                    ops: row.ops,
                    partCode: row.partCode,
                    group: row.group,
                    seasonType: row.seasonType,
                    scope: row.scope,
                    regulation: row.regulation,
                  ),
          )
          .toList();
    }

    List<PitcherRanking> applyPitcherJersey(List<PitcherRanking> source) {
      if (jerseyByPlayerId.isEmpty) return source;
      return source
          .map(
            (row) => row.jerseyNumber.trim().isNotEmpty
                ? row
                : PitcherRanking(
                    rank: row.rank,
                    playerId: row.playerId,
                    playerName: row.playerName,
                    teamId: row.teamId,
                    teamName: row.teamName,
                    seasonId: row.seasonId,
                    seasonYear: row.seasonYear,
                    jerseyNumber:
                        jerseyByPlayerId[row.playerId] ?? row.jerseyNumber,
                    gamesPlayed: row.gamesPlayed,
                    inningsPitched: row.inningsPitched,
                    wins: row.wins,
                    losses: row.losses,
                    saves: row.saves,
                    strikeouts: row.strikeouts,
                    walksAllowed: row.walksAllowed,
                    era: row.era,
                    whip: row.whip,
                    partCode: row.partCode,
                    group: row.group,
                    seasonType: row.seasonType,
                    scope: row.scope,
                    regulation: row.regulation,
                  ),
          )
          .toList();
    }

    final filteredBatters = _filterBatters(applyBatterJersey(mainBatters));
    final filteredPitchers = _filterPitchers(applyPitcherJersey(mainPitchers));
    final filteredStandings = _filterStandings(standings);
    final filteredPlayoffRows = _filterPlayoffRows(playoff);

    final playoffSupported = _supportsPlayoffFiltering(
      standings: standings,
      batterRows: mainBatters,
      pitcherRows: mainPitchers,
      playoffRows: playoff,
    );

    final mergedOverview = overviewRes.value ??
        RecordsOverview(
          seasonId: seasonId,
          totalGames: filteredStandings.fold<int>(
              0, (sum, row) => sum + row.wins + row.losses + row.ties),
          totalTeams: filteredStandings.length,
          topBatter: filteredBatters.isEmpty ? null : filteredBatters.first,
          topPitcher: filteredPitchers.isEmpty ? null : filteredPitchers.first,
        );

    setState(() {
      _overview = mergedOverview;
      _teamStandings = filteredStandings;
      _batters = filteredBatters;
      _pitchers = filteredPitchers;
      _topInBatters = applyBatterJersey(topBatters);
      _topInPitchers = applyPitcherJersey(topPitchers);
      _playoffRows = filteredPlayoffRows;
      _playoffFilterEnabled = playoffSupported;
      _warning =
          warnings.isNotEmpty ? '일부 데이터를 불러오지 못해 일부 항목이 제한될 수 있습니다.' : null;
      _loading = false;
    });

    if (_tabCtrl.index == RecordsHubTab.power.index) {
      await _loadPowerRankings();
    }
  }

  RecordFilterParams? _toRecordFilterParams() {
    if (_scope == RecordScope.all &&
        _group == RecordGroup.all &&
        _playoffDivision == RecordPlayoffDivision.all) {
      return null;
    }
    return RecordFilterParams(
      scope: _scope,
      group: _group,
      playoffDivision: _playoffDivision,
    );
  }

  Future<void> _loadPowerRankings() async {
    final rankingYear = _rankingYear;
    if (rankingYear == null || rankingYear <= 0) return;

    setState(() {
      _powerLoading = true;
      _powerError = null;
    });

    try {
      final rows = await _api.getPowerRankings(
          rankingYear: rankingYear, limit: _powerLimit);
      if (!mounted) return;
      setState(() {
        _powerRows = rows;
        _powerLoading = false;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _powerRows = [];
        _powerError = err.toString();
        _powerLoading = false;
      });
    }
  }

  List<BatterRanking> _filterBatters(List<BatterRanking> rows) {
    final q = _search.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
        partCode: row.partCode,
        seasonType: row.seasonType,
        scope: row.scope,
      )) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.playerName.toLowerCase().contains(q) ||
          row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  List<PitcherRanking> _filterPitchers(List<PitcherRanking> rows) {
    final q = _search.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
        partCode: row.partCode,
        seasonType: row.seasonType,
        scope: row.scope,
      )) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.playerName.toLowerCase().contains(q) ||
          row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  List<TeamRecordStanding> _filterStandings(List<TeamRecordStanding> rows) {
    final q = _search.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
          partCode: row.partCode,
          seasonType: row.seasonType,
          scope: row.scope)) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  List<PlayoffSummaryRow> _filterPlayoffRows(List<PlayoffSummaryRow> rows) {
    final q = _search.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
          partCode: row.partCode,
          seasonType: row.seasonType,
          scope: row.scope)) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  bool _matchesRecordFilters({
    String? partCode,
    String? seasonType,
    String? scope,
  }) {
    if (_group != RecordGroup.all) {
      final resolved = _resolveGroupFromPartCode(partCode);
      if (resolved != _group) return false;
    }

    final normalizedScope = _normalizeScope(scope);
    final normalizedDivision = _normalizeSeasonType(seasonType);

    if (_scope == RecordScope.league) {
      if (normalizedScope == RecordScope.playoff) return false;
      if (normalizedDivision == RecordPlayoffDivision.eutteum ||
          normalizedDivision == RecordPlayoffDivision.beogeum) {
        return false;
      }
    }

    if (_scope == RecordScope.playoff) {
      final isPlayoff = normalizedScope == RecordScope.playoff ||
          normalizedDivision == RecordPlayoffDivision.eutteum ||
          normalizedDivision == RecordPlayoffDivision.beogeum;
      if (!isPlayoff) return false;
    }

    if (_playoffDivision != RecordPlayoffDivision.all) {
      if (normalizedDivision != _playoffDivision) return false;
    }

    return true;
  }

  RecordGroup? _resolveGroupFromPartCode(String? partCode) {
    final normalized = (partCode ?? '').trim().toUpperCase();
    switch (normalized) {
      case '1':
      case 'A':
        return RecordGroup.a;
      case '2':
      case 'B':
        return RecordGroup.b;
      case '3':
      case 'C':
        return RecordGroup.c;
      case '4':
      case 'D':
        return RecordGroup.d;
      case '5':
      case 'E':
        return RecordGroup.e;
      case '6':
      case 'F':
        return RecordGroup.f;
      case '7':
      case 'G':
        return RecordGroup.g;
      case '8':
      case 'H':
        return RecordGroup.h;
      default:
        return null;
    }
  }

  RecordScope? _normalizeScope(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.isEmpty) {
      return null;
    }
    if (raw.contains('PLAYOFF') || raw.contains('포스트')) {
      return RecordScope.playoff;
    }
    if (raw.contains('LEAGUE') ||
        raw.contains('REGULAR') ||
        raw.contains('리그') ||
        raw.contains('정규')) {
      return RecordScope.league;
    }
    return null;
  }

  RecordPlayoffDivision? _normalizeSeasonType(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.isEmpty) {
      return null;
    }
    if (raw.contains('EUTTEUM') || raw.contains('으뜸')) {
      return RecordPlayoffDivision.eutteum;
    }
    if (raw.contains('BEOGEUM') || raw.contains('버금')) {
      return RecordPlayoffDivision.beogeum;
    }
    return null;
  }

  bool _supportsPlayoffFiltering({
    required List<TeamRecordStanding> standings,
    required List<BatterRanking> batterRows,
    required List<PitcherRanking> pitcherRows,
    required List<PlayoffSummaryRow> playoffRows,
  }) {
    bool hasPlayoffMetadata(String? seasonType, String? scope) {
      final division = _normalizeSeasonType(seasonType);
      final parsedScope = _normalizeScope(scope);
      return division == RecordPlayoffDivision.eutteum ||
          division == RecordPlayoffDivision.beogeum ||
          parsedScope == RecordScope.playoff;
    }

    if (playoffRows.isNotEmpty) {
      return true;
    }
    if (standings.any((e) => hasPlayoffMetadata(e.seasonType, e.scope))) {
      return true;
    }
    if (batterRows.any((e) => hasPlayoffMetadata(e.seasonType, e.scope))) {
      return true;
    }
    if (pitcherRows.any((e) => hasPlayoffMetadata(e.seasonType, e.scope))) {
      return true;
    }
    return false;
  }

  void _openPlayerDetail({int? playerId}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PlayerDetailScreen(
          initialPlayerId: playerId,
          initialSeasonId: _seasonId,
          apiService: _api,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('기록'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(kTextTabBarHeight),
          child: TabBar(
            controller: _tabCtrl,
            isScrollable: false,
            labelPadding: const EdgeInsets.symmetric(horizontal: 6),
            tabs: RecordsHubTab.values
                .map((tab) => Tab(text: tab.label))
                .toList(),
          ),
        ),
      ),
      body: _initializing
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_tabCtrl.index != RecordsHubTab.playerDetail.index)
                  _buildFilterBar(),
                if (_loading) const LinearProgressIndicator(minHeight: 1),
                if (_error != null)
                  _Banner(
                    icon: Icons.error_outline,
                    color: AppTheme.red500,
                    text: _error!,
                  ),
                if (_warning != null)
                  _Banner(
                    icon: Icons.warning_amber_rounded,
                    color: AppTheme.orange500,
                    text: _warning!,
                  ),
                Expanded(
                  child: TabBarView(
                    controller: _tabCtrl,
                    children: [
                      _buildOverviewTab(),
                      _buildStandingsTab(),
                      _buildPitchersTab(),
                      _buildBattersTab(),
                      _buildPowerTab(),
                      PlayerDetailScreen(
                        key: ValueKey<int?>(_seasonId),
                        initialSeasonId: _seasonId,
                        apiService: _api,
                        embedded: true,
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildFilterBar() {
    final selectedSeason = _seasons.where((e) => e.id == _seasonId).firstOrNull;
    final rankingYearOptions = _seasons.map((e) => e.year + 1).toSet().toList()
      ..sort((a, b) => b.compareTo(a));

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppTheme.slate900,
        border: Border(
            bottom:
                BorderSide(color: AppTheme.slate800.withValues(alpha: 0.8))),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          const horizontalPadding = 12.0;
          const spacing = 8.0;
          final usableWidth = constraints.maxWidth - horizontalPadding * 2;

          final secondaryControlWidth = usableWidth < 540
              ? usableWidth
              : usableWidth < 980
                  ? (usableWidth - spacing) / 2
                  : 220.0;

          final searchWidth = usableWidth < 540
              ? usableWidth
              : usableWidth < 980
                  ? (usableWidth - spacing) / 2
                  : 260.0;

          return Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _FilterDropdown<int>(
                        label: 'SEASON',
                        width: double.infinity,
                        value: _seasonId,
                        items: _seasons
                            .map((season) => DropdownMenuItem<int>(
                                  value: season.id,
                                  child: Text(
                                      '${season.year} 시즌 (ID:${season.id})'),
                                ))
                            .toList(),
                        onChanged: (value) {
                          if (value == null || value == _seasonId) return;
                          final nextSeason = _seasons.firstWhere(
                              (e) => e.id == value,
                              orElse: () => _seasons.first);
                          setState(() {
                            _seasonId = value;
                            _rankingYear =
                                _rankingYear ?? (nextSeason.year + 1);
                          });
                          _reloadRecords();
                        },
                      ),
                    ),
                    const SizedBox(width: spacing),
                    Expanded(
                      child: _FilterDropdown<RecordScope>(
                        label: '리그/플레이오프',
                        width: double.infinity,
                        value: _scope,
                        items: [
                          const DropdownMenuItem(
                              value: RecordScope.all, child: Text('전체')),
                          const DropdownMenuItem(
                              value: RecordScope.league, child: Text('리그')),
                          if (_playoffFilterEnabled)
                            const DropdownMenuItem(
                                value: RecordScope.playoff,
                                child: Text('플레이오프')),
                        ],
                        onChanged: (value) {
                          if (value == null || value == _scope) return;
                          setState(() {
                            _scope = value;
                            if (_scope != RecordScope.playoff) {
                              _playoffDivision = RecordPlayoffDivision.all;
                            }
                          });
                          _reloadRecords();
                        },
                      ),
                    ),
                    const SizedBox(width: spacing),
                    Expanded(
                      child: _FilterDropdown<RecordGroup>(
                        label: '조',
                        width: double.infinity,
                        value: _group,
                        items: const [
                          DropdownMenuItem(
                              value: RecordGroup.all, child: Text('전체조')),
                          DropdownMenuItem(
                              value: RecordGroup.a, child: Text('A조')),
                          DropdownMenuItem(
                              value: RecordGroup.b, child: Text('B조')),
                          DropdownMenuItem(
                              value: RecordGroup.c, child: Text('C조')),
                          DropdownMenuItem(
                              value: RecordGroup.d, child: Text('D조')),
                          DropdownMenuItem(
                              value: RecordGroup.e, child: Text('E조')),
                          DropdownMenuItem(
                              value: RecordGroup.f, child: Text('F조')),
                          DropdownMenuItem(
                              value: RecordGroup.g, child: Text('G조')),
                          DropdownMenuItem(
                              value: RecordGroup.h, child: Text('H조')),
                        ],
                        onChanged: (value) {
                          if (value == null || value == _group) return;
                          setState(() => _group = value);
                          _reloadRecords();
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: spacing),
                Wrap(
                  spacing: spacing,
                  runSpacing: spacing,
                  children: [
                    _FilterDropdown<RecordPlayoffDivision>(
                      label: '플레이오프',
                      width: secondaryControlWidth,
                      value: _playoffDivision,
                      enabled: _playoffFilterEnabled,
                      items: const [
                        DropdownMenuItem(
                            value: RecordPlayoffDivision.all,
                            child: Text('전체')),
                        DropdownMenuItem(
                            value: RecordPlayoffDivision.eutteum,
                            child: Text('으뜸')),
                        DropdownMenuItem(
                            value: RecordPlayoffDivision.beogeum,
                            child: Text('버금')),
                      ],
                      onChanged: (value) {
                        if (!_playoffFilterEnabled ||
                            value == null ||
                            value == _playoffDivision) {
                          return;
                        }
                        setState(() {
                          _playoffDivision = value;
                          if (_playoffDivision != RecordPlayoffDivision.all) {
                            _scope = RecordScope.playoff;
                          }
                        });
                        _reloadRecords();
                      },
                    ),
                    SizedBox(
                      width: searchWidth,
                      child: TextField(
                        onChanged: (value) => setState(() => _search = value),
                        style:
                            const TextStyle(fontSize: 13, color: Colors.white),
                        decoration: InputDecoration(
                          isDense: true,
                          labelText: 'SEARCH',
                          hintText: '팀/선수 검색',
                          prefixIcon: const Icon(Icons.search, size: 18),
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 10),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                    if (_tabCtrl.index == RecordsHubTab.pitchers.index ||
                        _tabCtrl.index == RecordsHubTab.batters.index)
                      SizedBox(
                        width: secondaryControlWidth,
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: _RegulationFilter(
                            value: _regulation,
                            onChanged: (next) {
                              setState(() => _regulation = next);
                              _reloadRecords();
                            },
                          ),
                        ),
                      ),
                    if (_tabCtrl.index == RecordsHubTab.power.index) ...[
                      _FilterDropdown<int>(
                        label: '기준 시즌',
                        width: secondaryControlWidth,
                        value: _rankingYear ?? (selectedSeason?.year ?? 0) + 1,
                        items: rankingYearOptions
                            .map((year) => DropdownMenuItem<int>(
                                value: year, child: Text('$year')))
                            .toList(),
                        onChanged: (value) {
                          if (value == null || value == _rankingYear) return;
                          setState(() => _rankingYear = value);
                          _loadPowerRankings();
                        },
                      ),
                      _FilterDropdown<int>(
                        label: 'LIMIT',
                        width: secondaryControlWidth,
                        value: _powerLimit,
                        items: const [
                          DropdownMenuItem(value: 20, child: Text('20')),
                          DropdownMenuItem(value: 50, child: Text('50')),
                          DropdownMenuItem(value: 100, child: Text('100')),
                          DropdownMenuItem(value: 200, child: Text('200')),
                        ],
                        onChanged: (value) {
                          if (value == null || value == _powerLimit) return;
                          setState(() => _powerLimit = value);
                          _loadPowerRankings();
                        },
                      ),
                    ],
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildOverviewTab() {
    final standings = _teamStandings;
    final avgWinPct = standings.isEmpty
        ? 0.0
        : standings
                .map((e) => e.winPct)
                .fold<double>(0.0, (sum, value) => sum + value) /
            standings.length;

    return RefreshIndicator(
      onRefresh: _reloadRecords,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _MetricCard(
                  label: '총 경기', value: '${_overview?.totalGames ?? 0} G'),
              _MetricCard(
                  label: '참여 팀',
                  value: '${_overview?.totalTeams ?? standings.length} 팀'),
              _MetricCard(
                  label: '평균 승률',
                  value: '${(avgWinPct * 100).toStringAsFixed(1)}%'),
              _MetricCard(
                  label: '타자/투수 행 수',
                  value: '${_batters.length}/${_pitchers.length}'),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _TopFivePanel<BatterRanking>(
                  title: '타자 TOP 5 (규정 IN)',
                  accent: AppTheme.purple500,
                  rows: _topInBatters,
                  emptyText: '타자 데이터가 없습니다.',
                  sortWidget: _SortDropdown<BatterRankingSort>(
                    value: _topBatterSort,
                    items: const [
                      _SortItem(
                          value: BatterRankingSort.battingAverage,
                          label: 'AVG'),
                      _SortItem(value: BatterRankingSort.ops, label: 'OPS'),
                      _SortItem(
                          value: BatterRankingSort.onBasePct, label: 'OBP'),
                      _SortItem(
                          value: BatterRankingSort.sluggingPct, label: 'SLG'),
                      _SortItem(value: BatterRankingSort.hits, label: 'H'),
                      _SortItem(value: BatterRankingSort.homeRuns, label: 'HR'),
                      _SortItem(value: BatterRankingSort.rbi, label: 'RBI'),
                    ],
                    onChanged: (value) {
                      setState(() => _topBatterSort = value);
                      _reloadRecords();
                    },
                  ),
                  itemBuilder: (row) => _TopPlayerTile(
                    rank: row.rank,
                    name: row.playerName,
                    team: row.teamName,
                    value: _formatTopBatterValue(row),
                    onTap: () => _openPlayerDetail(playerId: row.playerId),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TopFivePanel<PitcherRanking>(
                  title: '투수 TOP 5 (규정 IN)',
                  accent: AppTheme.blue400,
                  rows: _topInPitchers,
                  emptyText: '투수 데이터가 없습니다.',
                  sortWidget: _SortDropdown<PitcherRankingSort>(
                    value: _topPitcherSort,
                    items: const [
                      _SortItem(value: PitcherRankingSort.era, label: 'ERA'),
                      _SortItem(value: PitcherRankingSort.whip, label: 'WHIP'),
                      _SortItem(
                          value: PitcherRankingSort.strikeouts, label: 'K'),
                      _SortItem(value: PitcherRankingSort.wins, label: 'W'),
                      _SortItem(value: PitcherRankingSort.saves, label: 'SV'),
                    ],
                    onChanged: (value) {
                      setState(() => _topPitcherSort = value);
                      _reloadRecords();
                    },
                  ),
                  itemBuilder: (row) => _TopPlayerTile(
                    rank: row.rank,
                    name: row.playerName,
                    team: row.teamName,
                    value: _formatTopPitcherValue(row),
                    onTap: () => _openPlayerDetail(playerId: row.playerId),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStandingsTab() {
    if (_teamStandings.isEmpty) {
      return const _EmptyState(text: '표시할 팀 순위가 없습니다.');
    }

    return RefreshIndicator(
      onRefresh: _reloadRecords,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _Card(
            title: '팀 순위',
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowColor: WidgetStateProperty.all(AppTheme.slate800),
                columnSpacing: 14,
                columns: const [
                  DataColumn(label: Text('#', style: _thStyle)),
                  DataColumn(label: Text('팀', style: _thStyle)),
                  DataColumn(label: Text('구분', style: _thStyle)),
                  DataColumn(label: Text('플레이오프', style: _thStyle)),
                  DataColumn(label: Text('조', style: _thStyle)),
                  DataColumn(label: Text('경기', style: _thStyle), numeric: true),
                  DataColumn(
                      label: Text('승-무-패', style: _thStyle), numeric: true),
                  DataColumn(label: Text('승률', style: _thStyle), numeric: true),
                ],
                rows: List.generate(_teamStandings.length, (index) {
                  final row = _teamStandings[index];
                  final games = row.wins + row.losses + row.ties;
                  return DataRow(
                    cells: [
                      DataCell(Text('${index + 1}', style: _cellStyle)),
                      DataCell(Text(row.teamName,
                          style: _cellStyle.copyWith(
                              fontWeight: FontWeight.w600))),
                      DataCell(Text(_scopeLabel(row.scope), style: _cellStyle)),
                      DataCell(Text(_divisionLabel(row.seasonType),
                          style: _cellStyle)),
                      DataCell(
                          Text(_groupLabel(row.partCode), style: _cellStyle)),
                      DataCell(Text('$games', style: _numStyle)),
                      DataCell(Text('${row.wins}-${row.ties}-${row.losses}',
                          style: _numStyle)),
                      DataCell(Text('${(row.winPct * 100).toStringAsFixed(1)}%',
                          style: _numStyle)),
                    ],
                  );
                }),
              ),
            ),
          ),
          const SizedBox(height: 10),
          _Card(
            title: '플레이오프 스테이지 요약',
            child: _playoffRows.isEmpty
                ? const _EmptyState(text: '요약할 플레이오프 데이터가 없습니다.')
                : SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowColor:
                          WidgetStateProperty.all(AppTheme.slate800),
                      columns: const [
                        DataColumn(label: Text('구분', style: _thStyle)),
                        DataColumn(label: Text('라운드', style: _thStyle)),
                        DataColumn(
                            label: Text('점수', style: _thStyle), numeric: true),
                        DataColumn(label: Text('팀', style: _thStyle)),
                      ],
                      rows: _playoffRows
                          .map(
                            (row) => DataRow(cells: [
                              DataCell(
                                  Text(row.playoffTier, style: _cellStyle)),
                              DataCell(
                                  Text(row.playoffRound, style: _cellStyle)),
                              DataCell(Text(row.finalsPoints.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.teamName, style: _cellStyle)),
                            ]),
                          )
                          .toList(),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildBattersTab() {
    return RefreshIndicator(
      onRefresh: _reloadRecords,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _TopFivePanel<BatterRanking>(
            title: '타자 TOP 5 (규정 IN)',
            accent: AppTheme.purple500,
            rows: _topInBatters,
            emptyText: '타자 데이터가 없습니다.',
            sortWidget: _SortDropdown<BatterRankingSort>(
              value: _topBatterSort,
              items: const [
                _SortItem(
                    value: BatterRankingSort.battingAverage, label: 'AVG'),
                _SortItem(value: BatterRankingSort.ops, label: 'OPS'),
                _SortItem(value: BatterRankingSort.onBasePct, label: 'OBP'),
                _SortItem(value: BatterRankingSort.sluggingPct, label: 'SLG'),
                _SortItem(value: BatterRankingSort.hits, label: 'H'),
                _SortItem(value: BatterRankingSort.homeRuns, label: 'HR'),
                _SortItem(value: BatterRankingSort.rbi, label: 'RBI'),
              ],
              onChanged: (value) {
                setState(() => _topBatterSort = value);
                _reloadRecords();
              },
            ),
            itemBuilder: (row) => _TopPlayerTile(
              rank: row.rank,
              name: row.playerName,
              team: row.teamName,
              value: _formatTopBatterValue(row),
              onTap: () => _openPlayerDetail(playerId: row.playerId),
            ),
          ),
          const SizedBox(height: 10),
          _Card(
            title: '타자 기록',
            child: _batters.isEmpty
                ? const _EmptyState(text: '표시할 타자 기록이 없습니다.')
                : SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowColor:
                          WidgetStateProperty.all(AppTheme.slate800),
                      columnSpacing: 14,
                      columns: const [
                        DataColumn(label: Text('#', style: _thStyle)),
                        DataColumn(label: Text('이름', style: _thStyle)),
                        DataColumn(label: Text('팀', style: _thStyle)),
                        DataColumn(label: Text('구분', style: _thStyle)),
                        DataColumn(label: Text('플레이오프', style: _thStyle)),
                        DataColumn(label: Text('조', style: _thStyle)),
                        DataColumn(label: Text('규정', style: _thStyle)),
                        DataColumn(
                            label: Text('등번호', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('년도', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('AVG', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('OBP', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('SLG', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('OPS', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('HR', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('RBI', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('SB', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('H', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('G', style: _thStyle), numeric: true),
                      ],
                      rows: _batters.map((row) {
                        return DataRow(cells: [
                          DataCell(Text('${row.rank}', style: _cellStyle)),
                          DataCell(
                            InkWell(
                              onTap: () =>
                                  _openPlayerDetail(playerId: row.playerId),
                              child:
                                  Text(row.playerName, style: _linkCellStyle),
                            ),
                          ),
                          DataCell(Text(row.teamName, style: _cellStyle)),
                          DataCell(
                              Text(_scopeLabel(row.scope), style: _cellStyle)),
                          DataCell(Text(_divisionLabel(row.seasonType),
                              style: _cellStyle)),
                          DataCell(Text(_groupLabel(row.partCode),
                              style: _cellStyle)),
                          DataCell(Text((row.regulation ?? 'IN').toUpperCase(),
                              style: _cellStyle)),
                          DataCell(Text(
                              row.jerseyNumber.isEmpty ? '-' : row.jerseyNumber,
                              style: _numStyle)),
                          DataCell(Text('${row.seasonYear ?? '-'}',
                              style: _numStyle)),
                          DataCell(Text(row.battingAverage.toStringAsFixed(3),
                              style: _numStyle)),
                          DataCell(Text(row.onBasePct.toStringAsFixed(3),
                              style: _numStyle)),
                          DataCell(Text(row.sluggingPct.toStringAsFixed(3),
                              style: _numStyle)),
                          DataCell(Text(row.ops.toStringAsFixed(3),
                              style: _numStyle.copyWith(
                                  color: AppTheme.purple500))),
                          DataCell(Text('${row.homeRuns}', style: _numStyle)),
                          DataCell(
                              Text('${row.runsBattedIn}', style: _numStyle)),
                          DataCell(
                              Text('${row.stolenBases}', style: _numStyle)),
                          DataCell(Text('${row.hits}', style: _numStyle)),
                          DataCell(
                              Text('${row.gamesPlayed}', style: _numStyle)),
                        ]);
                      }).toList(),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildPitchersTab() {
    return RefreshIndicator(
      onRefresh: _reloadRecords,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _TopFivePanel<PitcherRanking>(
            title: '투수 TOP 5 (규정 IN)',
            accent: AppTheme.blue400,
            rows: _topInPitchers,
            emptyText: '투수 데이터가 없습니다.',
            sortWidget: _SortDropdown<PitcherRankingSort>(
              value: _topPitcherSort,
              items: const [
                _SortItem(value: PitcherRankingSort.era, label: 'ERA'),
                _SortItem(value: PitcherRankingSort.whip, label: 'WHIP'),
                _SortItem(value: PitcherRankingSort.strikeouts, label: 'K'),
                _SortItem(value: PitcherRankingSort.wins, label: 'W'),
                _SortItem(value: PitcherRankingSort.saves, label: 'SV'),
              ],
              onChanged: (value) {
                setState(() => _topPitcherSort = value);
                _reloadRecords();
              },
            ),
            itemBuilder: (row) => _TopPlayerTile(
              rank: row.rank,
              name: row.playerName,
              team: row.teamName,
              value: _formatTopPitcherValue(row),
              onTap: () => _openPlayerDetail(playerId: row.playerId),
            ),
          ),
          const SizedBox(height: 10),
          _Card(
            title: '투수 기록',
            child: _pitchers.isEmpty
                ? const _EmptyState(text: '표시할 투수 기록이 없습니다.')
                : SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowColor:
                          WidgetStateProperty.all(AppTheme.slate800),
                      columnSpacing: 14,
                      columns: const [
                        DataColumn(label: Text('#', style: _thStyle)),
                        DataColumn(label: Text('이름', style: _thStyle)),
                        DataColumn(label: Text('팀', style: _thStyle)),
                        DataColumn(label: Text('구분', style: _thStyle)),
                        DataColumn(label: Text('플레이오프', style: _thStyle)),
                        DataColumn(label: Text('조', style: _thStyle)),
                        DataColumn(label: Text('규정', style: _thStyle)),
                        DataColumn(
                            label: Text('등번호', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('년도', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('ERA', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('IP', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('WHIP', style: _thStyle),
                            numeric: true),
                        DataColumn(
                            label: Text('K', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('BB', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('W-L', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('SV', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('G', style: _thStyle), numeric: true),
                      ],
                      rows: _pitchers.map((row) {
                        return DataRow(cells: [
                          DataCell(Text('${row.rank}', style: _cellStyle)),
                          DataCell(
                            InkWell(
                              onTap: () =>
                                  _openPlayerDetail(playerId: row.playerId),
                              child:
                                  Text(row.playerName, style: _linkCellStyle),
                            ),
                          ),
                          DataCell(Text(row.teamName, style: _cellStyle)),
                          DataCell(
                              Text(_scopeLabel(row.scope), style: _cellStyle)),
                          DataCell(Text(_divisionLabel(row.seasonType),
                              style: _cellStyle)),
                          DataCell(Text(_groupLabel(row.partCode),
                              style: _cellStyle)),
                          DataCell(Text((row.regulation ?? 'IN').toUpperCase(),
                              style: _cellStyle)),
                          DataCell(Text(
                              row.jerseyNumber.isEmpty ? '-' : row.jerseyNumber,
                              style: _numStyle)),
                          DataCell(Text('${row.seasonYear ?? '-'}',
                              style: _numStyle)),
                          DataCell(Text(row.era.toStringAsFixed(2),
                              style: _numStyle)),
                          DataCell(Text(row.inningsPitched.toStringAsFixed(1),
                              style: _numStyle)),
                          DataCell(Text(row.whip.toStringAsFixed(2),
                              style: _numStyle)),
                          DataCell(Text('${row.strikeouts}', style: _numStyle)),
                          DataCell(
                              Text('${row.walksAllowed}', style: _numStyle)),
                          DataCell(Text('${row.wins}-${row.losses}',
                              style: _numStyle)),
                          DataCell(Text('${row.saves}', style: _numStyle)),
                          DataCell(
                              Text('${row.gamesPlayed}', style: _numStyle)),
                        ]);
                      }).toList(),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildPowerTab() {
    return RefreshIndicator(
      onRefresh: _loadPowerRankings,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (_powerLoading)
            const Padding(
              padding: EdgeInsets.all(12),
              child: LinearProgressIndicator(minHeight: 1),
            ),
          if (_powerError != null)
            _Banner(
                icon: Icons.error_outline,
                color: AppTheme.red500,
                text: _powerError!),
          _Card(
            title: '파워랭킹 (${_rankingYear ?? '-'})',
            child: _powerRows.isEmpty && !_powerLoading
                ? const _EmptyState(text: '파워랭킹 데이터가 없습니다.')
                : SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      headingRowColor:
                          WidgetStateProperty.all(AppTheme.slate800),
                      columnSpacing: 14,
                      columns: const [
                        DataColumn(
                            label: Text('#', style: _thStyle), numeric: true),
                        DataColumn(label: Text('팀', style: _thStyle)),
                        DataColumn(
                            label: Text('총점', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('Y1', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('Y2', style: _thStyle), numeric: true),
                        DataColumn(
                            label: Text('Y3', style: _thStyle), numeric: true),
                        DataColumn(label: Text('윈도우', style: _thStyle)),
                        DataColumn(label: Text('버전', style: _thStyle)),
                      ],
                      rows: _powerRows
                          .map(
                            (row) => DataRow(cells: [
                              DataCell(Text('${row.rank}', style: _numStyle)),
                              DataCell(Text(row.teamName, style: _cellStyle)),
                              DataCell(Text(
                                  row.weightedScore.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.y1Score.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.y2Score.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.y3Score.toStringAsFixed(1),
                                  style: _numStyle)),
                              DataCell(Text(row.windowYears.join(', '),
                                  style: _cellStyle)),
                              DataCell(Text(row.calcVersion ?? '-',
                                  style: _cellStyle)),
                            ]),
                          )
                          .toList(),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  String _formatTopBatterValue(BatterRanking row) {
    switch (_topBatterSort) {
      case BatterRankingSort.battingAverage:
        return 'AVG ${row.battingAverage.toStringAsFixed(3)}';
      case BatterRankingSort.hits:
        return 'H ${row.hits}';
      case BatterRankingSort.homeRuns:
        return 'HR ${row.homeRuns}';
      case BatterRankingSort.rbi:
        return 'RBI ${row.runsBattedIn}';
      case BatterRankingSort.onBasePct:
        return 'OBP ${row.onBasePct.toStringAsFixed(3)}';
      case BatterRankingSort.sluggingPct:
        return 'SLG ${row.sluggingPct.toStringAsFixed(3)}';
      case BatterRankingSort.ops:
        return 'OPS ${row.ops.toStringAsFixed(3)}';
    }
  }

  String _formatTopPitcherValue(PitcherRanking row) {
    switch (_topPitcherSort) {
      case PitcherRankingSort.whip:
        return 'WHIP ${row.whip.toStringAsFixed(2)}';
      case PitcherRankingSort.strikeouts:
        return 'K ${row.strikeouts}';
      case PitcherRankingSort.wins:
        return 'W ${row.wins}';
      case PitcherRankingSort.saves:
        return 'SV ${row.saves}';
      case PitcherRankingSort.era:
        return 'ERA ${row.era.toStringAsFixed(2)}';
    }
  }

  String _scopeLabel(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.contains('PLAYOFF') || raw.contains('포스트')) return 'PLAYOFF';
    if (raw.contains('LEAGUE') ||
        raw.contains('REGULAR') ||
        raw.contains('정규') ||
        raw.contains('리그')) {
      return 'LEAGUE';
    }
    return '-';
  }

  String _divisionLabel(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.contains('EUTTEUM') || raw.contains('으뜸')) return 'EUTTEUM';
    if (raw.contains('BEOGEUM') || raw.contains('버금')) return 'BEOGEUM';
    return '-';
  }

  String _groupLabel(String? partCode) {
    final group = _resolveGroupFromPartCode(partCode);
    if (group == null) return '-';
    return '${group.wire}조';
  }
}

Future<_LoadResult<T>> _capture<T>(Future<T> future) async {
  try {
    final value = await future;
    return _LoadResult<T>(value: value);
  } catch (err) {
    return _LoadResult<T>(error: err);
  }
}

class _LoadResult<T> {
  const _LoadResult({this.value, this.error});

  final T? value;
  final Object? error;
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.color,
    required this.text,
  });

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: color, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterDropdown<T> extends StatelessWidget {
  const _FilterDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
    this.enabled = true,
    this.width = 150,
  });

  final String label;
  final T? value;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;
  final bool enabled;
  final double width;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width,
      child: DropdownButtonFormField<T>(
        key: ValueKey<Object?>(value),
        isExpanded: true,
        initialValue: value,
        decoration: InputDecoration(
          isDense: true,
          labelText: label,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        ),
        items: items,
        onChanged: enabled ? onChanged : null,
      ),
    );
  }
}

class _RegulationFilter extends StatelessWidget {
  const _RegulationFilter({
    required this.value,
    required this.onChanged,
  });

  final RecordRegulation value;
  final ValueChanged<RecordRegulation> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.slate700),
      ),
      child: Row(
        children: [
          _regButton(
              label: 'IN',
              active: value == RecordRegulation.inRule,
              onTap: () => onChanged(RecordRegulation.inRule)),
          const SizedBox(width: 6),
          _regButton(
              label: 'OUT',
              active: value == RecordRegulation.out,
              onTap: () => onChanged(RecordRegulation.out)),
        ],
      ),
    );
  }

  Widget _regButton(
      {required String label,
      required bool active,
      required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: active
              ? AppTheme.blue500.withValues(alpha: 0.22)
              : Colors.transparent,
          border:
              Border.all(color: active ? AppTheme.blue400 : AppTheme.slate700),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: active ? AppTheme.blue400 : AppTheme.slate300,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 168,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.slate700),
        color: AppTheme.slate800.withValues(alpha: 0.35),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: const TextStyle(
                  color: AppTheme.slate400,
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.slate700.withValues(alpha: 0.7)),
        color: AppTheme.slate800.withValues(alpha: 0.35),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
                color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _TopFivePanel<T> extends StatelessWidget {
  const _TopFivePanel({
    required this.title,
    required this.accent,
    required this.rows,
    required this.emptyText,
    required this.sortWidget,
    required this.itemBuilder,
  });

  final String title;
  final Color accent;
  final List<T> rows;
  final String emptyText;
  final Widget sortWidget;
  final Widget Function(T row) itemBuilder;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: title,
      child: Column(
        children: [
          Align(alignment: Alignment.centerRight, child: sortWidget),
          const SizedBox(height: 8),
          if (rows.isEmpty)
            _EmptyState(text: emptyText)
          else
            ...rows.map(itemBuilder),
        ],
      ),
    );
  }
}

class _TopPlayerTile extends StatelessWidget {
  const _TopPlayerTile({
    required this.rank,
    required this.name,
    required this.team,
    required this.value,
    required this.onTap,
  });

  final int rank;
  final String name;
  final String team;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            SizedBox(
              width: 28,
              child: Text('$rank',
                  style: const TextStyle(
                      color: AppTheme.slate300, fontWeight: FontWeight.w700)),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w700)),
                  Text(team,
                      style: const TextStyle(
                          color: AppTheme.slate500, fontSize: 12)),
                ],
              ),
            ),
            Text(value,
                style: const TextStyle(
                    color: AppTheme.slate200,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _SortItem<T> {
  const _SortItem({required this.value, required this.label});

  final T value;
  final String label;
}

class _SortDropdown<T> extends StatelessWidget {
  const _SortDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
  });

  final T value;
  final List<_SortItem<T>> items;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 120,
      child: DropdownButtonFormField<T>(
        key: ValueKey<Object?>(value),
        isExpanded: true,
        initialValue: value,
        decoration: InputDecoration(
          isDense: true,
          labelText: '기준',
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
        ),
        items: items
            .map((item) => DropdownMenuItem<T>(
                value: item.value,
                child: Text(item.label, style: const TextStyle(fontSize: 12))))
            .toList(),
        onChanged: (next) {
          if (next == null) return;
          onChanged(next);
        },
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(18),
      child: Center(
        child: Text(
          text,
          style: const TextStyle(color: AppTheme.slate500, fontSize: 13),
        ),
      ),
    );
  }
}

const _thStyle = TextStyle(
    color: AppTheme.slate300, fontSize: 12, fontWeight: FontWeight.w700);
const _cellStyle = TextStyle(color: Colors.white, fontSize: 12);
const _linkCellStyle = TextStyle(
    color: AppTheme.blue400, fontSize: 12, fontWeight: FontWeight.w700);
final _numStyle =
    _cellStyle.copyWith(fontFeatures: const [FontFeature.tabularFigures()]);

extension _IterableFirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
