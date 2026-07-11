import '../../core/services/backend_api_service.dart';

abstract class RecordsDataSource {
  Future<List<SeasonSummary>> getSeasons();
  Future<List<BatterRanking>> getBatterRankings({
    required int seasonId,
    int? limit,
    BatterRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  });
  Future<List<PitcherRanking>> getPitcherRankings({
    required int seasonId,
    int? limit,
    PitcherRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  });
  Future<RecordsOverview> getRecordOverview(
    int seasonId, {
    RecordFilterParams? filters,
  });
  Future<List<TeamRecordStanding>> getTeamRecordStandings(
    int seasonId, {
    RecordFilterParams? filters,
  });
  Future<List<PlayoffSummaryRow>> getPlayoffSummaries(
    int seasonId, {
    RecordFilterParams? filters,
  });
  Future<List<PlayerLookup>> getPlayerSearchIndex(int seasonId);
  Future<List<PowerRankingApiRow>> getPowerRankings({
    required int rankingYear,
    required int limit,
  });
}

class BackendRecordsDataSource implements RecordsDataSource {
  BackendRecordsDataSource(this._api);

  final BackendApiService _api;

  @override
  Future<List<SeasonSummary>> getSeasons() => _api.getSeasons();

  @override
  Future<List<BatterRanking>> getBatterRankings({
    required int seasonId,
    int? limit,
    BatterRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) {
    return _api.getBatterRankings(
      seasonId: seasonId,
      limit: limit,
      sort: sort,
      filters: filters,
      regulation: regulation,
    );
  }

  @override
  Future<List<PitcherRanking>> getPitcherRankings({
    required int seasonId,
    int? limit,
    PitcherRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) {
    return _api.getPitcherRankings(
      seasonId: seasonId,
      limit: limit,
      sort: sort,
      filters: filters,
      regulation: regulation,
    );
  }

  @override
  Future<RecordsOverview> getRecordOverview(
    int seasonId, {
    RecordFilterParams? filters,
  }) {
    return _api.getRecordOverview(seasonId, filters: filters);
  }

  @override
  Future<List<TeamRecordStanding>> getTeamRecordStandings(
    int seasonId, {
    RecordFilterParams? filters,
  }) {
    return _api.getTeamRecordStandings(seasonId, filters: filters);
  }

  @override
  Future<List<PlayoffSummaryRow>> getPlayoffSummaries(
    int seasonId, {
    RecordFilterParams? filters,
  }) {
    return _api.getPlayoffSummaries(seasonId, filters: filters);
  }

  @override
  Future<List<PlayerLookup>> getPlayerSearchIndex(int seasonId) {
    return _api.getPlayerSearchIndex(seasonId);
  }

  @override
  Future<List<PowerRankingApiRow>> getPowerRankings({
    required int rankingYear,
    required int limit,
  }) {
    return _api.getPowerRankings(rankingYear: rankingYear, limit: limit);
  }
}

class RecordsReloadRequest {
  const RecordsReloadRequest({
    required this.seasonId,
    required this.scope,
    required this.group,
    required this.playoffDivision,
    required this.regulation,
    required this.searchQuery,
    required this.topBatterSort,
    required this.topPitcherSort,
  });

  final int seasonId;
  final RecordScope scope;
  final RecordGroup group;
  final RecordPlayoffDivision playoffDivision;
  final RecordRegulation regulation;
  final String searchQuery;
  final BatterRankingSort topBatterSort;
  final PitcherRankingSort topPitcherSort;
}

class RecordsReloadResult {
  const RecordsReloadResult({
    required this.overview,
    required this.teamStandings,
    required this.batters,
    required this.pitchers,
    required this.topInBatters,
    required this.topInPitchers,
    required this.playoffRows,
    required this.playoffFilterEnabled,
    this.warningMessage,
    this.errorMessage,
  });

  final RecordsOverview? overview;
  final List<TeamRecordStanding> teamStandings;
  final List<BatterRanking> batters;
  final List<PitcherRanking> pitchers;
  final List<BatterRanking> topInBatters;
  final List<PitcherRanking> topInPitchers;
  final List<PlayoffSummaryRow> playoffRows;
  final bool playoffFilterEnabled;
  final String? warningMessage;
  final String? errorMessage;

  bool get hasError => errorMessage != null;
}

class RecordsViewModel {
  RecordsViewModel({required RecordsDataSource dataSource})
      : _dataSource = dataSource;

  final RecordsDataSource _dataSource;

  Future<List<SeasonSummary>> loadSeasons() => _dataSource.getSeasons();

  Future<List<PowerRankingApiRow>> loadPowerRankings({
    required int rankingYear,
    required int limit,
  }) {
    return _dataSource.getPowerRankings(rankingYear: rankingYear, limit: limit);
  }

  static RecordGroup? resolveGroupFromPartCode(String? partCode) {
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

  Future<RecordsReloadResult> reloadRecords(
      RecordsReloadRequest request) async {
    final filters = _toRecordFilterParams(
      scope: request.scope,
      group: request.group,
      playoffDivision: request.playoffDivision,
    );

    final mainBattersFuture = _capture<List<BatterRanking>>(
      _dataSource.getBatterRankings(
        seasonId: request.seasonId,
        limit: 200,
        sort: BatterRankingSort.ops,
        filters: filters,
        regulation: request.regulation,
      ),
    );
    final mainPitchersFuture = _capture<List<PitcherRanking>>(
      _dataSource.getPitcherRankings(
        seasonId: request.seasonId,
        limit: 200,
        sort: PitcherRankingSort.era,
        filters: filters,
        regulation: request.regulation,
      ),
    );
    final topBattersFuture = _capture<List<BatterRanking>>(
      _dataSource.getBatterRankings(
        seasonId: request.seasonId,
        limit: 5,
        sort: request.topBatterSort,
        filters: filters,
        regulation: RecordRegulation.inRule,
      ),
    );
    final topPitchersFuture = _capture<List<PitcherRanking>>(
      _dataSource.getPitcherRankings(
        seasonId: request.seasonId,
        limit: 5,
        sort: request.topPitcherSort,
        filters: filters,
        regulation: RecordRegulation.inRule,
      ),
    );
    final overviewFuture = _capture<RecordsOverview>(
      _dataSource.getRecordOverview(request.seasonId, filters: filters),
    );
    final standingsFuture = _capture<List<TeamRecordStanding>>(
      _dataSource.getTeamRecordStandings(request.seasonId, filters: filters),
    );
    final playoffFuture = _capture<List<PlayoffSummaryRow>>(
      _dataSource.getPlayoffSummaries(request.seasonId, filters: filters),
    );
    final playerIndexFuture = _capture<List<PlayerLookup>>(
      _dataSource.getPlayerSearchIndex(request.seasonId),
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

    final mainBatters = mainBattersRes.value ?? const <BatterRanking>[];
    final mainPitchers = mainPitchersRes.value ?? const <PitcherRanking>[];
    final topBatters = topBattersRes.value ?? const <BatterRanking>[];
    final topPitchers = topPitchersRes.value ?? const <PitcherRanking>[];
    final standings = standingsRes.value ?? const <TeamRecordStanding>[];
    final playoff = playoffRes.value ?? const <PlayoffSummaryRow>[];
    final playerIndex = playerIndexRes.value ?? const <PlayerLookup>[];

    final hasAnyCoreData = mainBatters.isNotEmpty ||
        mainPitchers.isNotEmpty ||
        standings.isNotEmpty ||
        (overviewRes.value != null);
    if (!hasAnyCoreData && warnings.isNotEmpty) {
      return const RecordsReloadResult(
        overview: null,
        teamStandings: [],
        batters: [],
        pitchers: [],
        topInBatters: [],
        topInPitchers: [],
        playoffRows: [],
        playoffFilterEnabled: false,
        errorMessage: '기록 데이터를 불러오지 못했습니다.',
      );
    }

    final jerseyByPlayerId = <int, String>{};
    for (final item in playerIndex) {
      if (item.jerseyNumber.trim().isEmpty) continue;
      jerseyByPlayerId[item.playerId] = item.jerseyNumber.trim();
    }

    final mainBattersWithJersey =
        _applyBatterJersey(mainBatters, jerseyByPlayerId);
    final mainPitchersWithJersey =
        _applyPitcherJersey(mainPitchers, jerseyByPlayerId);
    final topBattersWithJersey =
        _applyBatterJersey(topBatters, jerseyByPlayerId);
    final topPitchersWithJersey =
        _applyPitcherJersey(topPitchers, jerseyByPlayerId);

    final filteredBatters = _filterBatters(
      rows: mainBattersWithJersey,
      scope: request.scope,
      group: request.group,
      playoffDivision: request.playoffDivision,
      searchQuery: request.searchQuery,
    );
    final filteredPitchers = _filterPitchers(
      rows: mainPitchersWithJersey,
      scope: request.scope,
      group: request.group,
      playoffDivision: request.playoffDivision,
      searchQuery: request.searchQuery,
    );
    final filteredStandings = _filterStandings(
      rows: standings,
      scope: request.scope,
      group: request.group,
      playoffDivision: request.playoffDivision,
      searchQuery: request.searchQuery,
    );
    final filteredPlayoffRows = _filterPlayoffRows(
      rows: playoff,
      scope: request.scope,
      group: request.group,
      playoffDivision: request.playoffDivision,
      searchQuery: request.searchQuery,
    );
    final playoffSupported = _supportsPlayoffFiltering(
      standings: standings,
      batterRows: mainBatters,
      pitcherRows: mainPitchers,
      playoffRows: playoff,
    );

    final mergedOverview = overviewRes.value ??
        RecordsOverview(
          seasonId: request.seasonId,
          totalGames: filteredStandings.fold<int>(
              0, (sum, row) => sum + row.wins + row.losses + row.ties),
          totalTeams: filteredStandings.length,
          topBatter: filteredBatters.isEmpty ? null : filteredBatters.first,
          topPitcher: filteredPitchers.isEmpty ? null : filteredPitchers.first,
        );

    return RecordsReloadResult(
      overview: mergedOverview,
      teamStandings: filteredStandings,
      batters: filteredBatters,
      pitchers: filteredPitchers,
      topInBatters: topBattersWithJersey,
      topInPitchers: topPitchersWithJersey,
      playoffRows: filteredPlayoffRows,
      playoffFilterEnabled: playoffSupported,
      warningMessage:
          warnings.isNotEmpty ? '일부 데이터를 불러오지 못해 일부 항목이 제한될 수 있습니다.' : null,
    );
  }

  RecordFilterParams? _toRecordFilterParams({
    required RecordScope scope,
    required RecordGroup group,
    required RecordPlayoffDivision playoffDivision,
  }) {
    if (scope == RecordScope.all &&
        group == RecordGroup.all &&
        playoffDivision == RecordPlayoffDivision.all) {
      return null;
    }
    return RecordFilterParams(
      scope: scope,
      group: group,
      playoffDivision: playoffDivision,
    );
  }

  List<BatterRanking> _applyBatterJersey(
      List<BatterRanking> rows, Map<int, String> jerseyByPlayerId) {
    if (jerseyByPlayerId.isEmpty) return rows;
    return rows
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

  List<PitcherRanking> _applyPitcherJersey(
      List<PitcherRanking> rows, Map<int, String> jerseyByPlayerId) {
    if (jerseyByPlayerId.isEmpty) return rows;
    return rows
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

  List<BatterRanking> _filterBatters({
    required List<BatterRanking> rows,
    required RecordScope scope,
    required RecordGroup group,
    required RecordPlayoffDivision playoffDivision,
    required String searchQuery,
  }) {
    final q = searchQuery.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
        partCode: row.partCode,
        seasonType: row.seasonType,
        scopeValue: row.scope,
        scope: scope,
        group: group,
        playoffDivision: playoffDivision,
      )) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.playerName.toLowerCase().contains(q) ||
          row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  List<PitcherRanking> _filterPitchers({
    required List<PitcherRanking> rows,
    required RecordScope scope,
    required RecordGroup group,
    required RecordPlayoffDivision playoffDivision,
    required String searchQuery,
  }) {
    final q = searchQuery.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
        partCode: row.partCode,
        seasonType: row.seasonType,
        scopeValue: row.scope,
        scope: scope,
        group: group,
        playoffDivision: playoffDivision,
      )) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.playerName.toLowerCase().contains(q) ||
          row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  List<TeamRecordStanding> _filterStandings({
    required List<TeamRecordStanding> rows,
    required RecordScope scope,
    required RecordGroup group,
    required RecordPlayoffDivision playoffDivision,
    required String searchQuery,
  }) {
    final q = searchQuery.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
        partCode: row.partCode,
        seasonType: row.seasonType,
        scopeValue: row.scope,
        scope: scope,
        group: group,
        playoffDivision: playoffDivision,
      )) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  List<PlayoffSummaryRow> _filterPlayoffRows({
    required List<PlayoffSummaryRow> rows,
    required RecordScope scope,
    required RecordGroup group,
    required RecordPlayoffDivision playoffDivision,
    required String searchQuery,
  }) {
    final q = searchQuery.trim().toLowerCase();
    return rows.where((row) {
      if (!_matchesRecordFilters(
        partCode: row.partCode,
        seasonType: row.seasonType,
        scopeValue: row.scope,
        scope: scope,
        group: group,
        playoffDivision: playoffDivision,
      )) {
        return false;
      }
      if (q.isEmpty) return true;
      return row.teamName.toLowerCase().contains(q);
    }).toList();
  }

  bool _matchesRecordFilters({
    required String? partCode,
    required String? seasonType,
    required String? scopeValue,
    required RecordScope scope,
    required RecordGroup group,
    required RecordPlayoffDivision playoffDivision,
  }) {
    if (group != RecordGroup.all) {
      final resolved = resolveGroupFromPartCode(partCode);
      if (resolved != group) return false;
    }

    final normalizedScope = _normalizeScope(scopeValue);
    final normalizedDivision = _normalizeSeasonType(seasonType);

    if (scope == RecordScope.league) {
      if (normalizedScope == RecordScope.playoff) return false;
      if (normalizedDivision == RecordPlayoffDivision.eutteum ||
          normalizedDivision == RecordPlayoffDivision.beogeum) {
        return false;
      }
    }

    if (scope == RecordScope.playoff) {
      final isPlayoff = normalizedScope == RecordScope.playoff ||
          normalizedDivision == RecordPlayoffDivision.eutteum ||
          normalizedDivision == RecordPlayoffDivision.beogeum;
      if (!isPlayoff) return false;
    }

    if (playoffDivision != RecordPlayoffDivision.all) {
      if (normalizedDivision != playoffDivision) return false;
    }

    return true;
  }

  RecordScope? _normalizeScope(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    if (raw.isEmpty) return null;
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
    if (raw.isEmpty) return null;
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
    bool hasPlayoffMetadata(String? seasonType, String? scopeValue) {
      final division = _normalizeSeasonType(seasonType);
      final parsedScope = _normalizeScope(scopeValue);
      return division == RecordPlayoffDivision.eutteum ||
          division == RecordPlayoffDivision.beogeum ||
          parsedScope == RecordScope.playoff;
    }

    if (playoffRows.isNotEmpty) return true;
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
