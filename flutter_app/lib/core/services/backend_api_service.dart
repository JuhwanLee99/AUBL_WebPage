import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../models/public_season_models.dart';

/// Service for communicating with the Spring Boot backend API.
class BackendApiService {
  BackendApiService({
    http.Client? client,
    Future<String?> Function()? tokenProvider,
  })  : _client = client ?? http.Client(),
        _tokenProvider = tokenProvider ?? _defaultTokenProvider;

  final http.Client _client;
  final Future<String?> Function() _tokenProvider;

  String get _baseUrl => AppConfig.backendApiUrl;

  Future<Map<String, String>> _authHeaders() async {
    final token = await _tokenProvider();
    if (token == null || token.isEmpty) return {};
    return {'Authorization': 'Bearer $token'};
  }

  static Future<String?> _defaultTokenProvider() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return null;
    return user.getIdToken();
  }

  Future<dynamic> _get(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('$_baseUrl$path').replace(queryParameters: query);
    final headers = await _authHeaders();
    final res = await _client.get(uri, headers: headers);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _ApiException(
          res.statusCode, 'API error ${res.statusCode}: ${res.reasonPhrase}');
    }
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  Future<dynamic> _patch(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('$_baseUrl$path').replace(queryParameters: query);
    final headers = await _authHeaders();
    final res = await _client.patch(uri, headers: headers);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw _ApiException(
          res.statusCode, 'API error ${res.statusCode}: ${res.reasonPhrase}');
    }
    if (res.body.isEmpty) return null;
    return jsonDecode(res.body);
  }

  bool _isNotFoundError(Object err) =>
      err is _ApiException && err.statusCode == 404;

  bool _isBadRequestError(Object err) =>
      err is _ApiException && err.statusCode == 400;

  // -- Records / Rankings --

  Future<List<BatterRanking>> getBatterRankings({
    required int seasonId,
    int? limit,
    BatterRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');

    final query = _buildRankingQuery(
      seasonId: seasonId,
      limit: limit,
      sort: sort?.wire,
      filters: filters,
      regulation: regulation,
    );

    try {
      final raw = await _get('/api/rankings/batters', query: query);
      return _normalizeBatterRankings(raw, seasonId);
    } catch (err) {
      if (_isBadRequestError(err) && _hasActiveRecordFilters(filters)) {
        final fallbackQuery = _buildRankingQuery(
          seasonId: seasonId,
          limit: limit,
          sort: sort?.wire,
          filters: null,
          regulation: regulation,
        );
        final raw = await _get('/api/rankings/batters', query: fallbackQuery);
        return _normalizeBatterRankings(raw, seasonId);
      }
      rethrow;
    }
  }

  Future<List<PitcherRanking>> getPitcherRankings({
    required int seasonId,
    int? limit,
    PitcherRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');

    final query = _buildRankingQuery(
      seasonId: seasonId,
      limit: limit,
      sort: sort?.wire,
      filters: filters,
      regulation: regulation,
    );

    try {
      final raw = await _get('/api/rankings/pitchers', query: query);
      return _normalizePitcherRankings(raw, seasonId);
    } catch (err) {
      if (_isBadRequestError(err) && _hasActiveRecordFilters(filters)) {
        final fallbackQuery = _buildRankingQuery(
          seasonId: seasonId,
          limit: limit,
          sort: sort?.wire,
          filters: null,
          regulation: regulation,
        );
        final raw = await _get('/api/rankings/pitchers', query: fallbackQuery);
        return _normalizePitcherRankings(raw, seasonId);
      }
      rethrow;
    }
  }

  Future<List<SeasonSummary>> getSeasons() async {
    final raw = await _get('/api/seasons');
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final id = _toInt(row['id'] ?? row['seasonId']);
          final year = _toInt(row['year'] ?? row['seasonYear']);
          if (id <= 0 || year <= 0) return null;
          return SeasonSummary(id: id, year: year);
        })
        .whereType<SeasonSummary>()
        .toList()
      ..sort((a, b) => b.year.compareTo(a.year));
  }

  Future<SeasonOverview> getSeasonOverview(int seasonId) async {
    _validatePositiveInt(seasonId, 'seasonId');
    final raw = await _get('/api/seasons/$seasonId/overview');
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('시즌 통합 현황 응답 형식이 올바르지 않습니다.');
    }
    return SeasonOverview.fromJson(raw, fallbackSeasonId: seasonId);
  }

  Future<List<PublicGame>> getPublicGames({
    int? seasonId,
    DateTime? date,
    DateTime? dateFrom,
    DateTime? dateTo,
    String? group,
    String? status,
    String? qualification,
  }) async {
    final query = <String, String>{};
    if (seasonId != null) {
      _validatePositiveInt(seasonId, 'seasonId');
      query['seasonId'] = '$seasonId';
    }
    if (date != null) query['date'] = _isoDate(date);
    if (dateFrom != null) query['dateFrom'] = _isoDate(dateFrom);
    if (dateTo != null) query['dateTo'] = _isoDate(dateTo);
    if (group != null && group.trim().isNotEmpty) {
      query['group'] = group.trim().toUpperCase();
    }
    if (status != null && status.trim().isNotEmpty) {
      query['status'] = status.trim().toUpperCase();
    }
    if (qualification != null && qualification.trim().isNotEmpty) {
      query['qualification'] = qualification.trim().toUpperCase();
    }

    final raw = await _get('/api/games', query: query);
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PublicGame.fromJson)
        .where((game) => game.activeRevision)
        .toList();
  }

  String _isoDate(DateTime value) => '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';

  Future<RecordsOverview> getRecordOverview(
    int seasonId, {
    RecordFilterParams? filters,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');
    final query = <String, String>{'seasonId': '$seasonId'};
    _applyRecordFilters(query, filters);

    dynamic raw;
    try {
      raw = await _get('/api/records/overview', query: query);
    } catch (err) {
      if (_isBadRequestError(err) && _hasActiveRecordFilters(filters)) {
        raw = await _get('/api/records/overview',
            query: {'seasonId': '$seasonId'});
      } else {
        rethrow;
      }
    }

    if (raw is! Map<String, dynamic>) {
      return RecordsOverview(
        seasonId: seasonId,
        totalGames: 0,
        totalTeams: 0,
        topBatter: null,
        topPitcher: null,
      );
    }

    final topBatter = _normalizeBatterRankingRow(
        raw['topBatter'] ?? raw['bestBatter'], seasonId, 1);
    final topPitcher = _normalizePitcherRankingRow(
        raw['topPitcher'] ?? raw['bestPitcher'], seasonId, 1);

    return RecordsOverview(
      seasonId: _toInt(raw['seasonId'], seasonId),
      totalGames: _toInt(raw['totalGames']),
      totalTeams: _toInt(raw['totalTeams']),
      topBatter: topBatter,
      topPitcher: topPitcher,
    );
  }

  Future<List<TeamRecordStanding>> getTeamRecordStandings(
    int seasonId, {
    RecordFilterParams? filters,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');
    final query = <String, String>{'seasonId': '$seasonId'};
    _applyRecordFilters(query, filters);

    dynamic raw;
    try {
      raw = await _get('/api/records/teams', query: query);
    } catch (err) {
      if (_isBadRequestError(err) && _hasActiveRecordFilters(filters)) {
        raw =
            await _get('/api/records/teams', query: {'seasonId': '$seasonId'});
      } else {
        rethrow;
      }
    }

    if (raw is! List) return [];

    final rows = raw
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final teamId = _toInt(row['teamId'] ?? row['id']);
          final teamName = _toString(row['teamName'] ?? row['name']);
          if (teamId <= 0 || teamName.isEmpty) return null;
          return TeamRecordStanding(
            teamId: teamId,
            teamName: teamName,
            wins: _toInt(row['wins']),
            losses: _toInt(row['losses']),
            ties: _toInt(row['ties'] ?? row['draws']),
            winPct: _toDouble(row['winPct'] ?? row['winPercentage']),
            partCode: _toNullableString(row['partCode'] ??
                row['part_code'] ??
                row['groupCode'] ??
                row['group_code']),
            group: _toNullableString(
                row['group'] ?? row['groupName'] ?? row['group_name']),
            seasonType: _toNullableString(
                row['seasonType'] ?? row['season_type'] ?? row['division']),
            scope: _toNullableString(
              row['scope'] ??
                  row['recordType'] ??
                  row['record_type'] ??
                  row['gameType'] ??
                  row['game_type'],
            ),
          );
        })
        .whereType<TeamRecordStanding>()
        .toList();

    rows.sort((a, b) {
      final byPct = b.winPct.compareTo(a.winPct);
      if (byPct != 0) return byPct;
      final byWins = b.wins.compareTo(a.wins);
      if (byWins != 0) return byWins;
      return a.losses.compareTo(b.losses);
    });

    return rows;
  }

  Future<List<PlayoffSummaryRow>> getPlayoffSummaries(
    int seasonId, {
    RecordFilterParams? filters,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');
    final query = <String, String>{'seasonId': '$seasonId', 'view': 'teams'};
    if (filters?.playoffDivision != null &&
        filters?.playoffDivision != RecordPlayoffDivision.all) {
      query['tier'] = filters!.playoffDivision!.wire;
    }

    dynamic raw;
    try {
      raw = await _get('/api/records/playoffs', query: query);
    } catch (err) {
      if (_isBadRequestError(err) && _hasActiveRecordFilters(filters)) {
        raw = await _get('/api/records/playoffs',
            query: {'seasonId': '$seasonId', 'view': 'teams'});
      } else if (_isNotFoundError(err)) {
        return [];
      } else {
        rethrow;
      }
    }

    if (raw is! List) return [];

    return raw
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final teamId = _toInt(row['teamId'] ?? row['team_id'] ?? row['id']);
          final teamName =
              _toString(row['teamName'] ?? row['team_name'] ?? row['name']);
          if (teamId <= 0 || teamName.isEmpty) {
            return null;
          }
          return PlayoffSummaryRow(
            teamId: teamId,
            teamName: teamName,
            playoffTier: _toString(
              row['playoffTier'] ??
                  row['playoff_tier'] ??
                  row['tier'] ??
                  row['seasonType'] ??
                  row['season_type'],
            ),
            playoffRound: _toString(row['playoffRound'] ??
                row['playoff_round'] ??
                row['round'] ??
                row['stage']),
            finalsPoints: _toDouble(
                row['finalsPoints'] ?? row['finals_points'] ?? row['points']),
            seasonId: _toInt(row['seasonId'] ?? row['season_id'], seasonId),
            seasonYear: _toNullableInt(
                row['seasonYear'] ?? row['season_year'] ?? row['year']),
            partCode: _toNullableString(row['partCode'] ??
                row['part_code'] ??
                row['groupCode'] ??
                row['group_code']),
            group: _toNullableString(row['group']),
            seasonType: _toNullableString(
              row['seasonType'] ??
                  row['season_type'] ??
                  row['division'] ??
                  row['playoffTier'] ??
                  row['playoff_tier'],
            ),
            scope: _toNullableString(
                  row['scope'] ??
                      row['recordType'] ??
                      row['record_type'] ??
                      row['gameType'] ??
                      row['game_type'],
                ) ??
                'PLAYOFF',
          );
        })
        .whereType<PlayoffSummaryRow>()
        .toList();
  }

  Future<List<PowerRankingApiRow>> getPowerRankings({
    required int rankingYear,
    int? limit,
  }) async {
    _validatePositiveInt(rankingYear, 'rankingYear');

    final query = <String, String>{'rankingYear': '$rankingYear'};
    if (limit != null) {
      final clamped = limit.clamp(0, 200);
      query['limit'] = '$clamped';
    }

    dynamic raw;
    try {
      raw = await _get('/api/records/power-ranking', query: query);
    } catch (err) {
      if (_isNotFoundError(err)) return [];
      rethrow;
    }

    if (raw is! List) return [];

    return raw
        .whereType<Map<String, dynamic>>()
        .toList()
        .asMap()
        .entries
        .map((entry) {
          final row = entry.value;
          final index = entry.key;
          final teamId = _toInt(row['teamId'] ?? row['team_id'] ?? row['id']);
          final teamName =
              _toString(row['teamName'] ?? row['team_name'] ?? row['name']);
          if (teamId <= 0 || teamName.isEmpty) return null;

          return PowerRankingApiRow(
            rank: _toInt(row['rank'] ?? row['ranking'], index + 1),
            teamId: teamId,
            teamName: teamName,
            weightedScore: _toDouble(
                row['weightedScore'] ?? row['weighted_score'] ?? row['total']),
            y1Score:
                _toDouble(row['y1Score'] ?? row['y1_score'] ?? row['year1']),
            y2Score:
                _toDouble(row['y2Score'] ?? row['y2_score'] ?? row['year2']),
            y3Score:
                _toDouble(row['y3Score'] ?? row['y3_score'] ?? row['year3']),
            windowYears:
                _toNumberList(row['windowYears'] ?? row['window_years'])
                    .map((e) => e.toInt())
                    .toList(),
            calcVersion:
                _toNullableString(row['calcVersion'] ?? row['calc_version']),
          );
        })
        .whereType<PowerRankingApiRow>()
        .toList();
  }

  Future<List<TeamSummary>> getTeams() async {
    dynamic raw;
    try {
      raw = await _get('/api/teams');
    } catch (err) {
      if (!_isNotFoundError(err)) rethrow;
      raw = await _get('/api/team');
    }
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final id = _toInt(row['id'] ?? row['teamId']);
          final teamName =
              _toString(row['teamName'] ?? row['team_name'] ?? row['name']);
          if (id <= 0 || teamName.isEmpty) return null;
          return TeamSummary(
            id: id,
            teamName: teamName,
            teamCode:
                _toString(row['teamCode'] ?? row['team_code'] ?? row['code']),
            active: _toBool(row['active'] ?? true),
          );
        })
        .whereType<TeamSummary>()
        .toList()
      ..sort((a, b) => a.teamName.compareTo(b.teamName));
  }

  Future<List<SeasonTeam>> getSeasonTeams(int seasonId) async {
    _validatePositiveInt(seasonId, 'seasonId');
    dynamic raw;
    try {
      raw = await _get('/api/seasons/$seasonId/teams');
    } catch (err) {
      if (_isNotFoundError(err)) return [];
      rethrow;
    }
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final resolvedSeasonId = _toInt(row['seasonId'] ?? row['season_id']);
          final teamId = _toInt(row['teamId'] ?? row['team_id'] ?? row['id']);
          final teamName =
              _toString(row['teamName'] ?? row['team_name'] ?? row['name']);
          if (resolvedSeasonId <= 0 || teamId <= 0 || teamName.isEmpty) {
            return null;
          }
          return SeasonTeam(
            seasonId: resolvedSeasonId,
            teamId: teamId,
            teamName: teamName,
            teamCode: _toString(row['teamCode'] ?? row['team_code']),
          );
        })
        .whereType<SeasonTeam>()
        .toList()
      ..sort((a, b) => a.teamName.compareTo(b.teamName));
  }

  Future<RecordFilterOptions?> getRecordFilterOptions(int seasonId) async {
    _validatePositiveInt(seasonId, 'seasonId');
    dynamic raw;
    try {
      raw = await _get('/api/records/filter-options',
          query: {'seasonId': '$seasonId'});
    } catch (err) {
      if (_isNotFoundError(err)) return null;
      rethrow;
    }
    if (raw is! Map<String, dynamic>) return null;

    final groups = _toList(raw['groups'])
        .map((row) {
          final partCode = _toString(row['partCode'] ?? row['part_code']);
          final group = _recordGroupFromWire(_toString(row['group']));
          if (partCode.isEmpty || group == null || group == RecordGroup.all) {
            return null;
          }
          return RecordFilterGroupOption(
            partCode: partCode,
            group: group,
            label: _toString(row['label'], '${group.wire}조'),
            order: _toInt(row['order']),
          );
        })
        .whereType<RecordFilterGroupOption>()
        .toList()
      ..sort((a, b) => a.order.compareTo(b.order));

    final scopes = _toDynamicList(raw['scopes'])
        .map((item) => _recordScopeFromWire(item?.toString()))
        .whereType<RecordScope>()
        .toList();

    final playoffDivisions = _toDynamicList(raw['playoffDivisions'])
        .map((item) => _recordPlayoffDivisionFromWire(item?.toString()))
        .whereType<RecordPlayoffDivision>()
        .toList();

    final regulations = _toDynamicList(raw['regulations'])
        .map((item) => _recordRegulationFromWire(item?.toString()))
        .whereType<RecordRegulation>()
        .toList();

    final batterSortOptions = _toDynamicList(raw['batterSortOptions'])
        .map((item) => _batterSortFromWire(item?.toString()))
        .whereType<BatterRankingSort>()
        .toList();

    final pitcherSortOptions = _toDynamicList(raw['pitcherSortOptions'])
        .map((item) => _pitcherSortFromWire(item?.toString()))
        .whereType<PitcherRankingSort>()
        .toList();

    final defaultRegulation =
        _recordRegulationFromWire(_toString(raw['defaultRegulation']));

    return RecordFilterOptions(
      seasonId: _toInt(raw['seasonId'], seasonId),
      groups: groups,
      scopes: scopes,
      playoffDivisions: playoffDivisions,
      regulations: regulations,
      defaultRegulation: defaultRegulation,
      batterSortOptions: batterSortOptions,
      pitcherSortOptions: pitcherSortOptions,
    );
  }

  Future<List<PlayerSearchResult>> searchPlayers({
    required int seasonId,
    required String q,
    int? teamId,
    int? limit,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');
    final keyword = q.trim();
    if (keyword.isEmpty) return [];
    final query = <String, String>{
      'seasonId': '$seasonId',
      'q': keyword,
    };
    if (teamId != null && teamId > 0) query['teamId'] = '$teamId';
    if (limit != null) {
      final clamped = limit.clamp(1, 50);
      query['limit'] = '$clamped';
    }

    dynamic raw;
    try {
      raw = await _get('/api/players/search', query: query);
    } catch (err) {
      if (_isNotFoundError(err)) return [];
      rethrow;
    }
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map((row) {
          final playerId = _toInt(row['playerId'] ?? row['player_id']);
          final teamId = _toInt(row['teamId'] ?? row['team_id']);
          final resolvedSeasonId = _toInt(row['seasonId'] ?? row['season_id']);
          final playerName =
              _toString(row['playerName'] ?? row['player_name'] ?? row['name']);
          if (playerId <= 0 ||
              teamId <= 0 ||
              resolvedSeasonId <= 0 ||
              playerName.isEmpty) {
            return null;
          }
          return PlayerSearchResult(
            playerId: playerId,
            playerName: playerName,
            teamId: teamId,
            teamName: _toString(row['teamName'] ?? row['team_name']),
            jerseyNumber: _toDisplayString(
              row['jerseyNumber'] ??
                  row['backNumber'] ??
                  row['uniformNumber'] ??
                  row['number'],
            ),
            seasonId: resolvedSeasonId,
          );
        })
        .whereType<PlayerSearchResult>()
        .toList();
  }

  Future<PlayerProfile?> getPlayerProfile(int playerId, {int? seasonId}) async {
    _validatePositiveInt(playerId, 'playerId');
    final query = <String, String>{};
    if (seasonId != null && seasonId > 0) query['seasonId'] = '$seasonId';
    dynamic raw;
    try {
      raw = await _get('/api/players/$playerId/profile',
          query: query.isEmpty ? null : query);
    } catch (err) {
      if (_isNotFoundError(err)) return null;
      rethrow;
    }
    if (raw is! Map<String, dynamic>) return null;
    final resolvedPlayerId = _toInt(raw['playerId'] ?? raw['player_id']);
    final resolvedSeasonId = _toInt(raw['seasonId'] ?? raw['season_id']);
    final teamId = _toInt(raw['teamId'] ?? raw['team_id']);
    if (resolvedPlayerId <= 0 || resolvedSeasonId <= 0 || teamId <= 0) {
      return null;
    }

    return PlayerProfile(
      playerId: resolvedPlayerId,
      playerName:
          _toString(raw['playerName'] ?? raw['player_name'] ?? raw['name']),
      seasonId: resolvedSeasonId,
      teamId: teamId,
      teamName: _toString(raw['teamName'] ?? raw['team_name']),
      teamCode: _toString(raw['teamCode'] ?? raw['team_code']),
      jerseyNumber: _toDisplayString(
        raw['jerseyNumber'] ??
            raw['backNumber'] ??
            raw['uniformNumber'] ??
            raw['number'],
      ),
    );
  }

  Future<void> updateTeamActive({
    required int teamId,
    required bool active,
  }) async {
    _validatePositiveInt(teamId, 'teamId');
    await _patch('/api/admin/teams/$teamId/active',
        query: {'active': active ? 'true' : 'false'});
  }

  // -- Player Search / Roster --

  Future<PlayerRosterResponse> getPlayerRoster({
    required int seasonId,
    int? teamId,
    String? q,
    int? limit,
    String? cursor,
  }) async {
    _validatePositiveInt(seasonId, 'seasonId');

    final query = <String, String>{'seasonId': '$seasonId'};
    if (teamId != null && teamId > 0) query['teamId'] = '$teamId';
    if (q != null && q.trim().isNotEmpty) query['q'] = q.trim();
    final safeLimit = limit == null ? 500 : limit.clamp(1, 500);
    query['limit'] = '$safeLimit';
    if (cursor != null && cursor.trim().isNotEmpty) {
      query['cursor'] = cursor.trim();
    }

    final raw = await _get('/api/players/roster', query: query);
    return _normalizePlayerRosterResponse(raw, seasonId);
  }

  Future<List<PlayerLookup>> getPlayerSearchIndex(int seasonId) async {
    _validatePositiveInt(seasonId, 'seasonId');

    try {
      final rosterItems = await _getAllPlayerRosterItems(seasonId);
      if (rosterItems.isNotEmpty) {
        final lookups = rosterItems
            .map(
              (item) => PlayerLookup(
                playerId: item.playerId,
                playerName: item.playerName,
                teamName: item.teamName,
                jerseyNumber: item.jerseyNumber,
                seasonId: item.seasonId,
                seasonYear: null,
              ),
            )
            .toList();
        lookups.sort((a, b) {
          final byName = a.playerName.compareTo(b.playerName);
          if (byName != 0) return byName;
          return a.teamName.compareTo(b.teamName);
        });
        return lookups;
      }
    } catch (err) {
      if (!_isNotFoundError(err) && !_isBadRequestError(err)) rethrow;
    }

    final batterFuture = getBatterRankings(
        seasonId: seasonId, limit: 0, sort: BatterRankingSort.battingAverage);
    final pitcherFuture = getPitcherRankings(
        seasonId: seasonId, limit: 0, sort: PitcherRankingSort.era);

    final results = await Future.wait<dynamic>([
      batterFuture.then((value) => value).catchError((_) => <BatterRanking>[]),
      pitcherFuture
          .then((value) => value)
          .catchError((_) => <PitcherRanking>[]),
    ]);

    final batters = results[0] as List<BatterRanking>;
    final pitchers = results[1] as List<PitcherRanking>;

    if (batters.isEmpty && pitchers.isEmpty) {
      throw Exception('선수 검색 인덱스를 불러오지 못했습니다.');
    }

    final byPlayerId = <int, PlayerLookup>{};

    void upsert({
      required int playerId,
      required String playerName,
      required String teamName,
      required String jerseyNumber,
      required int seasonId,
      required int? seasonYear,
    }) {
      final existing = byPlayerId[playerId];
      if (existing == null) {
        byPlayerId[playerId] = PlayerLookup(
          playerId: playerId,
          playerName: playerName,
          teamName: teamName,
          jerseyNumber: jerseyNumber,
          seasonId: seasonId,
          seasonYear: seasonYear,
        );
        return;
      }
      byPlayerId[playerId] = PlayerLookup(
        playerId: existing.playerId,
        playerName: existing.playerName,
        teamName: existing.teamName.isNotEmpty ? existing.teamName : teamName,
        jerseyNumber: existing.jerseyNumber.isNotEmpty
            ? existing.jerseyNumber
            : jerseyNumber,
        seasonId: existing.seasonId,
        seasonYear: existing.seasonYear ?? seasonYear,
      );
    }

    for (final row in batters) {
      upsert(
        playerId: row.playerId,
        playerName: row.playerName,
        teamName: row.teamName,
        jerseyNumber: row.jerseyNumber,
        seasonId: row.seasonId,
        seasonYear: row.seasonYear,
      );
    }
    for (final row in pitchers) {
      upsert(
        playerId: row.playerId,
        playerName: row.playerName,
        teamName: row.teamName,
        jerseyNumber: row.jerseyNumber,
        seasonId: row.seasonId,
        seasonYear: row.seasonYear,
      );
    }

    final values = byPlayerId.values.toList()
      ..sort((a, b) {
        final byName = a.playerName.compareTo(b.playerName);
        if (byName != 0) return byName;
        return a.teamName.compareTo(b.teamName);
      });

    return values;
  }

  Future<List<PlayerRosterItem>> _getAllPlayerRosterItems(int seasonId) async {
    final allItems = <PlayerRosterItem>[];
    final seenTeamPlayerIds = <int>{};
    String? cursor;

    for (var i = 0; i < 20; i += 1) {
      final page =
          await getPlayerRoster(seasonId: seasonId, cursor: cursor, limit: 500);
      for (final item in page.items) {
        if (seenTeamPlayerIds.contains(item.teamPlayerId)) continue;
        seenTeamPlayerIds.add(item.teamPlayerId);
        allItems.add(item);
      }

      if (!page.hasNext ||
          page.nextCursor == null ||
          page.nextCursor == cursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    return allItems;
  }

  // -- Player Stats / Logs --

  Future<PlayerStatsResponse> getPlayerStats(int playerId,
      {int? seasonId}) async {
    _validatePositiveInt(playerId, 'playerId');

    final query = <String, String>{};
    if (seasonId != null) query['seasonId'] = '$seasonId';
    final raw = await _get('/api/players/$playerId/stats',
        query: query.isEmpty ? null : query);

    if (raw is! Map<String, dynamic>) {
      return PlayerStatsResponse(
        playerId: playerId,
        playerName: '선수 #$playerId',
        teamName: '',
        jerseyNumber: '',
      );
    }

    final batterSource =
        _toList(raw['batterStats'] ?? raw['batter_stats'] ?? raw['batterStat']);
    final pitcherSource = _toList(
        raw['pitcherStats'] ?? raw['pitcher_stats'] ?? raw['pitcherStat']);

    final jerseyNumber = _readJersey(raw) ??
        _readJerseyFromList(batterSource) ??
        _readJerseyFromList(pitcherSource) ??
        '';
    final teamName = _toString(raw['teamName'] ?? raw['team_name']);

    return PlayerStatsResponse(
      playerId: _toInt(raw['playerId'], playerId),
      playerName: _toString(raw['playerName'] ??
          raw['player_name'] ??
          _readPlayerNameFromList(batterSource) ??
          _readPlayerNameFromList(pitcherSource) ??
          '선수 #$playerId'),
      teamName: teamName.isNotEmpty
          ? teamName
          : (_readTeamNameFromList(batterSource) ??
              _readTeamNameFromList(pitcherSource) ??
              ''),
      jerseyNumber: jerseyNumber,
      batterStats: batterSource
          .map((e) => BatterStatSummary.fromJson(e, fallbackSeasonId: seasonId))
          .whereType<BatterStatSummary>()
          .toList(),
      pitcherStats: pitcherSource
          .map(
              (e) => PitcherStatSummary.fromJson(e, fallbackSeasonId: seasonId))
          .whereType<PitcherStatSummary>()
          .toList(),
    );
  }

  Future<PlayerGameLogsResponse> getPlayerGameLogs(int playerId,
      {int? gameId}) async {
    _validatePositiveInt(playerId, 'playerId');
    final query = <String, String>{};
    if (gameId != null && gameId > 0) query['gameId'] = '$gameId';

    final raw = await _get('/api/players/$playerId/game-logs',
        query: query.isEmpty ? null : query);
    if (raw is! Map<String, dynamic>) {
      return const PlayerGameLogsResponse(batterLogs: [], pitcherLogs: []);
    }

    final batterLogs = _toList(raw['batterLogs'])
        .map(BatterGameLog.fromJson)
        .whereType<BatterGameLog>()
        .toList();

    final pitcherLogs = _toList(raw['pitcherLogs'])
        .map(PitcherGameLog.fromJson)
        .whereType<PitcherGameLog>()
        .toList();

    return PlayerGameLogsResponse(
        batterLogs: batterLogs, pitcherLogs: pitcherLogs);
  }

  Map<String, String> _buildRankingQuery({
    required int seasonId,
    int? limit,
    String? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) {
    final query = <String, String>{'seasonId': '$seasonId'};
    final normalizedLimit = _normalizeRankingLimit(limit);
    if (normalizedLimit != null) query['limit'] = '$normalizedLimit';
    if (sort != null && sort.isNotEmpty) query['sort'] = sort;
    if (regulation != null && regulation != RecordRegulation.all) {
      query['regulation'] = regulation.wire;
    }
    _applyRecordFilters(query, filters);
    return query;
  }

  int? _normalizeRankingLimit(int? limit) {
    if (limit == null) return null;
    if (limit <= 0) return 0;
    return limit > 100 ? 100 : limit;
  }

  void _applyRecordFilters(
      Map<String, String> query, RecordFilterParams? filters) {
    if (filters == null) return;

    if (filters.scope != null && filters.scope != RecordScope.all) {
      query['scope'] = filters.scope!.wire;
    }

    if (filters.group != null && filters.group != RecordGroup.all) {
      query['group'] = filters.group!.wire;
      final partCode = _groupToPartCode(filters.group!);
      if (partCode != null) {
        query['partCode'] = partCode;
      }
    }

    if (filters.playoffDivision != null &&
        filters.playoffDivision != RecordPlayoffDivision.all) {
      query['playoffDivision'] = filters.playoffDivision!.wire;
      query['division'] = filters.playoffDivision!.wire;
    }
  }

  bool _hasActiveRecordFilters(RecordFilterParams? filters) {
    if (filters == null) return false;
    return (filters.scope != null && filters.scope != RecordScope.all) ||
        (filters.group != null && filters.group != RecordGroup.all) ||
        (filters.playoffDivision != null &&
            filters.playoffDivision != RecordPlayoffDivision.all);
  }

  String? _groupToPartCode(RecordGroup group) {
    switch (group) {
      case RecordGroup.a:
        return '1';
      case RecordGroup.b:
        return '2';
      case RecordGroup.c:
        return '3';
      case RecordGroup.d:
        return '4';
      case RecordGroup.e:
        return '5';
      case RecordGroup.f:
        return '6';
      case RecordGroup.g:
        return '7';
      case RecordGroup.h:
        return '8';
      case RecordGroup.all:
        return null;
    }
  }

  RecordScope? _recordScopeFromWire(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    switch (raw) {
      case 'ALL':
        return RecordScope.all;
      case 'LEAGUE':
        return RecordScope.league;
      case 'PLAYOFF':
        return RecordScope.playoff;
      default:
        return null;
    }
  }

  RecordGroup? _recordGroupFromWire(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    switch (raw) {
      case 'ALL':
        return RecordGroup.all;
      case 'A':
        return RecordGroup.a;
      case 'B':
        return RecordGroup.b;
      case 'C':
        return RecordGroup.c;
      case 'D':
        return RecordGroup.d;
      case 'E':
        return RecordGroup.e;
      case 'F':
        return RecordGroup.f;
      case 'G':
        return RecordGroup.g;
      case 'H':
        return RecordGroup.h;
      default:
        return null;
    }
  }

  RecordPlayoffDivision? _recordPlayoffDivisionFromWire(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    switch (raw) {
      case 'ALL':
        return RecordPlayoffDivision.all;
      case 'EUTTEUM':
        return RecordPlayoffDivision.eutteum;
      case 'BEOGEUM':
        return RecordPlayoffDivision.beogeum;
      default:
        return null;
    }
  }

  RecordRegulation? _recordRegulationFromWire(String? value) {
    final raw = (value ?? '').trim().toUpperCase();
    switch (raw) {
      case 'ALL':
        return RecordRegulation.all;
      case 'IN':
        return RecordRegulation.inRule;
      case 'OUT':
        return RecordRegulation.out;
      default:
        return null;
    }
  }

  BatterRankingSort? _batterSortFromWire(String? value) {
    final raw = (value ?? '').trim();
    for (final item in BatterRankingSort.values) {
      if (item.wire == raw) return item;
    }
    return null;
  }

  PitcherRankingSort? _pitcherSortFromWire(String? value) {
    final raw = (value ?? '').trim();
    for (final item in PitcherRankingSort.values) {
      if (item.wire == raw) return item;
    }
    return null;
  }

  BatterRanking? _normalizeBatterRankingRow(
      dynamic raw, int fallbackSeasonId, int fallbackRank) {
    if (raw is! Map<String, dynamic>) return null;

    final hasPublishedStats = <dynamic>[
      raw['gamesPlayed'] ?? raw['games_played'],
      raw['plateAppearance'] ?? raw['plate_appearance'],
      raw['atBats'] ?? raw['at_bats'],
      raw['hits'],
      raw['battingAverage'] ?? raw['batting_average'] ?? raw['avg'],
    ].any(_isPublishedNumber);
    if (!hasPublishedStats) return null;

    final playerId = _toNullableInt(raw['playerId'] ?? raw['player_id']);
    if (playerId == null || playerId <= 0) return null;

    return BatterRanking(
      rank: _toInt(raw['rank'] ?? raw['ranking'], fallbackRank),
      playerId: playerId,
      playerName: _toString(
          raw['playerName'] ?? raw['player_name'] ?? raw['name'],
          '선수 #$playerId'),
      teamId: _toInt(raw['teamId'] ?? raw['team_id']),
      teamName: _toString(raw['teamName'] ?? raw['team_name']),
      seasonId: _toInt(raw['seasonId'] ?? raw['season_id'], fallbackSeasonId),
      seasonYear: _toNullableInt(
          raw['seasonYear'] ?? raw['season_year'] ?? raw['year']),
      jerseyNumber: _toDisplayString(raw['jerseyNumber'] ??
          raw['backNumber'] ??
          raw['uniformNumber'] ??
          raw['number']),
      gamesPlayed: _toInt(raw['gamesPlayed'] ?? raw['games_played']),
      plateAppearance:
          _toInt(raw['plateAppearance'] ?? raw['plate_appearance']),
      atBats: _toInt(raw['atBats'] ?? raw['at_bats']),
      hits: _toInt(raw['hits']),
      homeRuns: _toInt(raw['homeRuns'] ?? raw['home_runs'] ?? raw['hr']),
      runsBattedIn:
          _toInt(raw['runsBattedIn'] ?? raw['runs_batted_in'] ?? raw['rbi']),
      stolenBases:
          _toInt(raw['stolenBases'] ?? raw['stolen_bases'] ?? raw['sb']),
      walks: _toInt(raw['walks'] ?? raw['bb']),
      strikeouts: _toInt(raw['strikeouts'] ?? raw['so']),
      battingAverage: _toDouble(
          raw['battingAverage'] ?? raw['batting_average'] ?? raw['avg']),
      onBasePct:
          _toDouble(raw['onBasePct'] ?? raw['on_base_pct'] ?? raw['obp']),
      sluggingPct:
          _toDouble(raw['sluggingPct'] ?? raw['slugging_pct'] ?? raw['slg']),
      ops: _toDouble(raw['ops']),
      partCode: _toNullableString(raw['partCode'] ??
          raw['part_code'] ??
          raw['groupCode'] ??
          raw['group_code']),
      group: _toNullableString(
          raw['group'] ?? raw['groupName'] ?? raw['group_name']),
      seasonType: _toNullableString(
          raw['seasonType'] ?? raw['season_type'] ?? raw['division']),
      scope: _toNullableString(
        raw['scope'] ??
            raw['recordType'] ??
            raw['record_type'] ??
            raw['gameType'] ??
            raw['game_type'],
      ),
      regulation: _toRegulation(raw['regulation'] ??
          raw['regulationType'] ??
          raw['regulation_type'] ??
          raw['outside']),
    );
  }

  PitcherRanking? _normalizePitcherRankingRow(
      dynamic raw, int fallbackSeasonId, int fallbackRank) {
    if (raw is! Map<String, dynamic>) return null;

    final hasPublishedStats = <dynamic>[
      raw['gamesPlayed'] ?? raw['games_played'],
      raw['inningsPitched'] ?? raw['innings_pitched'] ?? raw['ip'],
      raw['wins'] ?? raw['w'],
      raw['losses'] ?? raw['l'],
      raw['era'],
    ].any(_isPublishedNumber);
    if (!hasPublishedStats) return null;

    final playerId = _toNullableInt(raw['playerId'] ?? raw['player_id']);
    if (playerId == null || playerId <= 0) return null;

    return PitcherRanking(
      rank: _toInt(raw['rank'] ?? raw['ranking'], fallbackRank),
      playerId: playerId,
      playerName: _toString(
          raw['playerName'] ?? raw['player_name'] ?? raw['name'],
          '선수 #$playerId'),
      teamId: _toInt(raw['teamId'] ?? raw['team_id']),
      teamName: _toString(raw['teamName'] ?? raw['team_name']),
      seasonId: _toInt(raw['seasonId'] ?? raw['season_id'], fallbackSeasonId),
      seasonYear: _toNullableInt(
          raw['seasonYear'] ?? raw['season_year'] ?? raw['year']),
      jerseyNumber: _toDisplayString(raw['jerseyNumber'] ??
          raw['backNumber'] ??
          raw['uniformNumber'] ??
          raw['number']),
      gamesPlayed: _toInt(raw['gamesPlayed'] ?? raw['games_played']),
      inningsPitched: _toDouble(
          raw['inningsPitched'] ?? raw['innings_pitched'] ?? raw['ip']),
      wins: _toInt(raw['wins'] ?? raw['w']),
      losses: _toInt(raw['losses'] ?? raw['l']),
      saves: _toInt(raw['saves'] ?? raw['sv']),
      strikeouts: _toInt(raw['strikeouts'] ?? raw['so']),
      walksAllowed: _toInt(raw['walksAllowed'] ??
          raw['walks_allowed'] ??
          raw['walks'] ??
          raw['bb']),
      era: _toDouble(raw['era']),
      whip: _toDouble(raw['whip']),
      partCode: _toNullableString(raw['partCode'] ??
          raw['part_code'] ??
          raw['groupCode'] ??
          raw['group_code']),
      group: _toNullableString(
          raw['group'] ?? raw['groupName'] ?? raw['group_name']),
      seasonType: _toNullableString(
          raw['seasonType'] ?? raw['season_type'] ?? raw['division']),
      scope: _toNullableString(
        raw['scope'] ??
            raw['recordType'] ??
            raw['record_type'] ??
            raw['gameType'] ??
            raw['game_type'],
      ),
      regulation: _toRegulation(raw['regulation'] ??
          raw['regulationType'] ??
          raw['regulation_type'] ??
          raw['outside']),
    );
  }

  List<BatterRanking> _normalizeBatterRankings(dynamic raw, int seasonId) {
    if (raw is! List) return [];
    final out = <BatterRanking>[];
    for (var i = 0; i < raw.length; i += 1) {
      final normalized = _normalizeBatterRankingRow(raw[i], seasonId, i + 1);
      if (normalized != null) out.add(normalized);
    }
    return out;
  }

  List<PitcherRanking> _normalizePitcherRankings(dynamic raw, int seasonId) {
    if (raw is! List) return [];
    final out = <PitcherRanking>[];
    for (var i = 0; i < raw.length; i += 1) {
      final normalized = _normalizePitcherRankingRow(raw[i], seasonId, i + 1);
      if (normalized != null) out.add(normalized);
    }
    return out;
  }

  bool _isPublishedNumber(dynamic value) {
    if (value is num) return value.isFinite;
    if (value is String && value.trim().isNotEmpty) {
      return double.tryParse(value.trim()) != null;
    }
    return false;
  }

  PlayerRosterResponse _normalizePlayerRosterResponse(
      dynamic raw, int seasonId) {
    if (raw is! Map<String, dynamic>) {
      return const PlayerRosterResponse(
          items: [], nextCursor: null, hasNext: false, totalCount: 0);
    }

    final sourceItems = _toList(raw['items']);
    final items = sourceItems
        .map((entry) => PlayerRosterItem.fromJson(entry, seasonId))
        .whereType<PlayerRosterItem>()
        .toList();

    return PlayerRosterResponse(
      items: items,
      nextCursor: _toNullableString(raw['nextCursor'] ?? raw['next_cursor']),
      hasNext: _toBool(raw['hasNext'] ?? raw['has_next']),
      totalCount: _toInt(raw['totalCount'] ?? raw['total_count'], items.length),
    );
  }

  String? _readJersey(Map<String, dynamic> row) {
    final value = row['jerseyNumber'] ??
        row['backNumber'] ??
        row['uniformNumber'] ??
        row['number'];
    final parsed = _toDisplayString(value).trim();
    return parsed.isEmpty ? null : parsed;
  }

  String? _readJerseyFromList(List<Map<String, dynamic>> source) {
    for (final row in source) {
      final value = _readJersey(row);
      if (value != null && value.isNotEmpty) return value;
    }
    return null;
  }

  String? _readTeamNameFromList(List<Map<String, dynamic>> source) {
    for (final row in source) {
      final value =
          _toString(row['teamName'] ?? row['team_name'] ?? row['team']);
      if (value.isNotEmpty) return value;
    }
    return null;
  }

  String? _readPlayerNameFromList(List<Map<String, dynamic>> source) {
    for (final row in source) {
      final value =
          _toString(row['playerName'] ?? row['player_name'] ?? row['name']);
      if (value.isNotEmpty) return value;
    }
    return null;
  }

  List<Map<String, dynamic>> _toList(dynamic value) {
    if (value is List) {
      return value.whereType<Map<String, dynamic>>().toList();
    }
    if (value is Map<String, dynamic>) {
      return [value];
    }
    return [];
  }

  List<dynamic> _toDynamicList(dynamic value) {
    if (value is List) return value;
    return [];
  }

  num? _toNum(dynamic value) {
    if (value is num) return value;
    if (value is String && value.trim().isNotEmpty) {
      return num.tryParse(value.trim());
    }
    return null;
  }

  int _toInt(dynamic value, [int defaultValue = 0]) {
    final parsed = _toNum(value);
    if (parsed == null) return defaultValue;
    return parsed.toInt();
  }

  int? _toNullableInt(dynamic value) {
    final parsed = _toNum(value);
    return parsed?.toInt();
  }

  double _toDouble(dynamic value, [double defaultValue = 0]) {
    final parsed = _toNum(value);
    if (parsed == null) return defaultValue;
    return parsed.toDouble();
  }

  bool _toBool(dynamic value) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) {
      final v = value.trim().toLowerCase();
      return v == 'true' || v == '1' || v == 'y' || v == 'yes';
    }
    return false;
  }

  String _toString(dynamic value, [String defaultValue = '']) {
    if (value is String) return value;
    return defaultValue;
  }

  String? _toNullableString(dynamic value) {
    if (value is String) {
      final trimmed = value.trim();
      return trimmed.isEmpty ? null : trimmed;
    }
    return null;
  }

  String _toDisplayString(dynamic value) {
    if (value == null) return '';
    if (value is String) return value;
    if (value is num) return value.toString();
    return '';
  }

  String? _toRegulation(dynamic value) {
    if (value is String) {
      final raw = value.trim().toUpperCase();
      if (raw == 'IN' || raw == 'OUT') return raw;
    }
    if (value is bool) return value ? 'OUT' : 'IN';
    if (value is num) {
      if (value == 0) return 'IN';
      if (value == 1) return 'OUT';
    }
    return null;
  }

  List<num> _toNumberList(dynamic value) {
    if (value is List) {
      return value.map(_toNum).whereType<num>().toList();
    }
    if (value is String && value.trim().isNotEmpty) {
      return value
          .split(',')
          .map((e) => _toNum(e.trim()))
          .whereType<num>()
          .toList();
    }
    return [];
  }

  void _validatePositiveInt(int value, String name) {
    if (value <= 0) {
      throw ArgumentError('$name is required and must be a positive integer.');
    }
  }

  void dispose() {
    _client.close();
  }
}

class _ApiException implements Exception {
  const _ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

// -- Filter / Enum Types --

enum RecordScope {
  all('ALL'),
  league('LEAGUE'),
  playoff('PLAYOFF');

  const RecordScope(this.wire);
  final String wire;
}

enum RecordGroup {
  all('ALL'),
  a('A'),
  b('B'),
  c('C'),
  d('D'),
  e('E'),
  f('F'),
  g('G'),
  h('H');

  const RecordGroup(this.wire);
  final String wire;
}

enum RecordPlayoffDivision {
  all('ALL'),
  eutteum('EUTTEUM'),
  beogeum('BEOGEUM');

  const RecordPlayoffDivision(this.wire);
  final String wire;
}

enum RecordRegulation {
  all('ALL'),
  inRule('IN'),
  out('OUT');

  const RecordRegulation(this.wire);
  final String wire;
}

class RecordFilterParams {
  const RecordFilterParams({
    this.scope,
    this.group,
    this.playoffDivision,
  });

  final RecordScope? scope;
  final RecordGroup? group;
  final RecordPlayoffDivision? playoffDivision;
}

enum BatterRankingSort {
  battingAverage('battingAverage'),
  hits('hits'),
  homeRuns('homeRuns'),
  rbi('rbi'),
  ops('ops'),
  sluggingPct('sluggingPct'),
  onBasePct('onBasePct'),
  gamesPlayed('gamesPlayed'),
  plateAppearance('plateAppearance'),
  stolenBases('stolenBases');

  const BatterRankingSort(this.wire);
  final String wire;
}

enum PitcherRankingSort {
  era('era'),
  whip('whip'),
  strikeouts('strikeouts'),
  wins('wins'),
  saves('saves'),
  inningsPitched('inningsPitched'),
  walksAllowed('walksAllowed'),
  gamesPlayed('gamesPlayed');

  const PitcherRankingSort(this.wire);
  final String wire;
}

// -- Models --

class BatterRanking {
  const BatterRanking({
    required this.rank,
    required this.playerId,
    required this.playerName,
    required this.teamId,
    required this.teamName,
    required this.seasonId,
    required this.seasonYear,
    required this.jerseyNumber,
    required this.gamesPlayed,
    required this.plateAppearance,
    required this.atBats,
    required this.hits,
    required this.homeRuns,
    required this.runsBattedIn,
    required this.stolenBases,
    required this.walks,
    required this.strikeouts,
    required this.battingAverage,
    required this.onBasePct,
    required this.sluggingPct,
    required this.ops,
    required this.partCode,
    required this.group,
    required this.seasonType,
    required this.scope,
    required this.regulation,
  });

  final int rank;
  final int playerId;
  final String playerName;
  final int teamId;
  final String teamName;
  final int seasonId;
  final int? seasonYear;
  final String jerseyNumber;
  final int gamesPlayed;
  final int plateAppearance;
  final int atBats;
  final int hits;
  final int homeRuns;
  final int runsBattedIn;
  final int stolenBases;
  final int walks;
  final int strikeouts;
  final double battingAverage;
  final double onBasePct;
  final double sluggingPct;
  final double ops;
  final String? partCode;
  final String? group;
  final String? seasonType;
  final String? scope;
  final String? regulation;
}

class PitcherRanking {
  const PitcherRanking({
    required this.rank,
    required this.playerId,
    required this.playerName,
    required this.teamId,
    required this.teamName,
    required this.seasonId,
    required this.seasonYear,
    required this.jerseyNumber,
    required this.gamesPlayed,
    required this.inningsPitched,
    required this.wins,
    required this.losses,
    required this.saves,
    required this.strikeouts,
    required this.walksAllowed,
    required this.era,
    required this.whip,
    required this.partCode,
    required this.group,
    required this.seasonType,
    required this.scope,
    required this.regulation,
  });

  final int rank;
  final int playerId;
  final String playerName;
  final int teamId;
  final String teamName;
  final int seasonId;
  final int? seasonYear;
  final String jerseyNumber;
  final int gamesPlayed;
  final double inningsPitched;
  final int wins;
  final int losses;
  final int saves;
  final int strikeouts;
  final int walksAllowed;
  final double era;
  final double whip;
  final String? partCode;
  final String? group;
  final String? seasonType;
  final String? scope;
  final String? regulation;

  double get kbb => walksAllowed > 0 ? strikeouts / walksAllowed : 0;
}

class SeasonSummary {
  const SeasonSummary({required this.id, required this.year});

  final int id;
  final int year;
}

class TeamSummary {
  const TeamSummary({
    required this.id,
    required this.teamName,
    required this.teamCode,
    required this.active,
  });

  final int id;
  final String teamName;
  final String teamCode;
  final bool active;
}

class SeasonTeam {
  const SeasonTeam({
    required this.seasonId,
    required this.teamId,
    required this.teamName,
    required this.teamCode,
  });

  final int seasonId;
  final int teamId;
  final String teamName;
  final String teamCode;
}

class RecordFilterGroupOption {
  const RecordFilterGroupOption({
    required this.partCode,
    required this.group,
    required this.label,
    required this.order,
  });

  final String partCode;
  final RecordGroup group;
  final String label;
  final int order;
}

class RecordFilterOptions {
  const RecordFilterOptions({
    required this.seasonId,
    required this.groups,
    required this.scopes,
    required this.playoffDivisions,
    required this.regulations,
    required this.defaultRegulation,
    required this.batterSortOptions,
    required this.pitcherSortOptions,
  });

  final int seasonId;
  final List<RecordFilterGroupOption> groups;
  final List<RecordScope> scopes;
  final List<RecordPlayoffDivision> playoffDivisions;
  final List<RecordRegulation> regulations;
  final RecordRegulation? defaultRegulation;
  final List<BatterRankingSort> batterSortOptions;
  final List<PitcherRankingSort> pitcherSortOptions;
}

class TeamRecordStanding {
  const TeamRecordStanding({
    required this.teamId,
    required this.teamName,
    required this.wins,
    required this.losses,
    required this.ties,
    required this.winPct,
    required this.partCode,
    required this.group,
    required this.seasonType,
    required this.scope,
  });

  final int teamId;
  final String teamName;
  final int wins;
  final int losses;
  final int ties;
  final double winPct;
  final String? partCode;
  final String? group;
  final String? seasonType;
  final String? scope;
}

class RecordsOverview {
  const RecordsOverview({
    required this.seasonId,
    required this.totalGames,
    required this.totalTeams,
    required this.topBatter,
    required this.topPitcher,
  });

  final int seasonId;
  final int totalGames;
  final int totalTeams;
  final BatterRanking? topBatter;
  final PitcherRanking? topPitcher;
}

class PlayoffSummaryRow {
  const PlayoffSummaryRow({
    required this.teamId,
    required this.teamName,
    required this.playoffTier,
    required this.playoffRound,
    required this.finalsPoints,
    required this.seasonId,
    required this.seasonYear,
    required this.partCode,
    required this.group,
    required this.seasonType,
    required this.scope,
  });

  final int teamId;
  final String teamName;
  final String playoffTier;
  final String playoffRound;
  final double finalsPoints;
  final int seasonId;
  final int? seasonYear;
  final String? partCode;
  final String? group;
  final String? seasonType;
  final String? scope;
}

class PowerRankingApiRow {
  const PowerRankingApiRow({
    required this.rank,
    required this.teamId,
    required this.teamName,
    required this.weightedScore,
    required this.y1Score,
    required this.y2Score,
    required this.y3Score,
    required this.windowYears,
    required this.calcVersion,
  });

  final int rank;
  final int teamId;
  final String teamName;
  final double weightedScore;
  final double y1Score;
  final double y2Score;
  final double y3Score;
  final List<int> windowYears;
  final String? calcVersion;
}

class PlayerLookup {
  const PlayerLookup({
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.jerseyNumber,
    required this.seasonId,
    required this.seasonYear,
  });

  final int playerId;
  final String playerName;
  final String teamName;
  final String jerseyNumber;
  final int seasonId;
  final int? seasonYear;
}

class PlayerSearchResult {
  const PlayerSearchResult({
    required this.playerId,
    required this.playerName,
    required this.teamId,
    required this.teamName,
    required this.jerseyNumber,
    required this.seasonId,
  });

  final int playerId;
  final String playerName;
  final int teamId;
  final String teamName;
  final String jerseyNumber;
  final int seasonId;
}

class PlayerProfile {
  const PlayerProfile({
    required this.playerId,
    required this.playerName,
    required this.seasonId,
    required this.teamId,
    required this.teamName,
    required this.teamCode,
    required this.jerseyNumber,
  });

  final int playerId;
  final String playerName;
  final int seasonId;
  final int teamId;
  final String teamName;
  final String teamCode;
  final String jerseyNumber;
}

class PlayerRosterItem {
  const PlayerRosterItem({
    required this.seasonId,
    required this.teamId,
    required this.teamName,
    required this.teamCode,
    required this.teamPlayerId,
    required this.playerId,
    required this.playerName,
    required this.jerseyNumber,
    required this.hasBatterStats,
    required this.hasPitcherStats,
  });

  final int seasonId;
  final int teamId;
  final String teamName;
  final String teamCode;
  final int teamPlayerId;
  final int playerId;
  final String playerName;
  final String jerseyNumber;
  final bool hasBatterStats;
  final bool hasPitcherStats;

  static PlayerRosterItem? fromJson(
      Map<String, dynamic> row, int fallbackSeasonId) {
    final teamPlayerId = _parseInt(row['teamPlayerId'] ??
        row['team_player_id'] ??
        row['tpId'] ??
        row['tp_id']);
    final playerId = _parseInt(row['playerId'] ?? row['player_id']);
    final teamId = _parseInt(row['teamId'] ?? row['team_id']);
    if (teamPlayerId == null || playerId == null || teamId == null) return null;

    return PlayerRosterItem(
      seasonId:
          _parseInt(row['seasonId'] ?? row['season_id']) ?? fallbackSeasonId,
      teamId: teamId,
      teamName: (row['teamName'] ?? row['team_name'] ?? '').toString(),
      teamCode: (row['teamCode'] ?? row['team_code'] ?? '').toString(),
      teamPlayerId: teamPlayerId,
      playerId: playerId,
      playerName: (row['playerName'] ?? row['player_name'] ?? row['name'] ?? '')
          .toString(),
      jerseyNumber:
          row['jerseyNumber'] == null ? '' : row['jerseyNumber'].toString(),
      hasBatterStats:
          _parseBool(row['hasBatterStats'] ?? row['has_batter_stats']),
      hasPitcherStats:
          _parseBool(row['hasPitcherStats'] ?? row['has_pitcher_stats']),
    );
  }
}

class PlayerRosterResponse {
  const PlayerRosterResponse({
    required this.items,
    required this.nextCursor,
    required this.hasNext,
    required this.totalCount,
  });

  final List<PlayerRosterItem> items;
  final String? nextCursor;
  final bool hasNext;
  final int totalCount;
}

class PlayerStatsResponse {
  const PlayerStatsResponse({
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.jerseyNumber,
    this.batterStats = const [],
    this.pitcherStats = const [],
  });

  final int playerId;
  final String playerName;
  final String teamName;
  final String jerseyNumber;
  final List<BatterStatSummary> batterStats;
  final List<PitcherStatSummary> pitcherStats;
}

class BatterStatSummary {
  const BatterStatSummary({
    required this.seasonId,
    required this.gamesPlayed,
    required this.plateAppearance,
    required this.atBats,
    required this.hits,
    required this.homeRuns,
    required this.runsBattedIn,
    required this.stolenBases,
    required this.walks,
    required this.strikeouts,
    required this.battingAverage,
    required this.onBasePct,
    required this.sluggingPct,
    required this.ops,
  });

  final int seasonId;
  final int gamesPlayed;
  final int plateAppearance;
  final int atBats;
  final int hits;
  final int homeRuns;
  final int runsBattedIn;
  final int stolenBases;
  final int walks;
  final int strikeouts;
  final double battingAverage;
  final double onBasePct;
  final double sluggingPct;
  final double ops;

  static BatterStatSummary? fromJson(Map<String, dynamic> json,
      {int? fallbackSeasonId}) {
    final seasonId =
        _parseInt(json['seasonId'] ?? json['season_id']) ?? fallbackSeasonId;
    if (seasonId == null || seasonId <= 0) return null;

    return BatterStatSummary(
      seasonId: seasonId,
      gamesPlayed: _parseInt(json['gamesPlayed']) ?? 0,
      plateAppearance: _parseInt(json['plateAppearance']) ?? 0,
      atBats: _parseInt(json['atBats']) ?? 0,
      hits: _parseInt(json['hits']) ?? 0,
      homeRuns: _parseInt(json['homeRuns']) ?? 0,
      runsBattedIn: _parseInt(json['runsBattedIn'] ?? json['rbi']) ?? 0,
      stolenBases: _parseInt(json['stolenBases']) ?? 0,
      walks: _parseInt(json['walks']) ?? 0,
      strikeouts: _parseInt(json['strikeouts']) ?? 0,
      battingAverage: _parseDouble(json['battingAverage'] ?? json['avg']) ?? 0,
      onBasePct: _parseDouble(json['onBasePct'] ?? json['obp']) ?? 0,
      sluggingPct: _parseDouble(json['sluggingPct'] ?? json['slg']) ?? 0,
      ops: _parseDouble(json['ops']) ?? 0,
    );
  }
}

class PitcherStatSummary {
  const PitcherStatSummary({
    required this.seasonId,
    required this.gamesPlayed,
    required this.inningsPitched,
    required this.wins,
    required this.losses,
    required this.saves,
    required this.holds,
    required this.strikeouts,
    required this.walksAllowed,
    required this.era,
    required this.whip,
    required this.kPer9,
    required this.bbPer9,
  });

  final int seasonId;
  final int gamesPlayed;
  final double inningsPitched;
  final int wins;
  final int losses;
  final int saves;
  final int holds;
  final int strikeouts;
  final int walksAllowed;
  final double era;
  final double whip;
  final double kPer9;
  final double bbPer9;

  static PitcherStatSummary? fromJson(Map<String, dynamic> json,
      {int? fallbackSeasonId}) {
    final seasonId =
        _parseInt(json['seasonId'] ?? json['season_id']) ?? fallbackSeasonId;
    if (seasonId == null || seasonId <= 0) return null;

    return PitcherStatSummary(
      seasonId: seasonId,
      gamesPlayed: _parseInt(json['gamesPlayed']) ?? 0,
      inningsPitched: _parseDouble(json['inningsPitched']) ?? 0,
      wins: _parseInt(json['wins']) ?? 0,
      losses: _parseInt(json['losses']) ?? 0,
      saves: _parseInt(json['saves']) ?? 0,
      holds: _parseInt(json['holds']) ?? 0,
      strikeouts: _parseInt(json['strikeouts']) ?? 0,
      walksAllowed: _parseInt(json['walksAllowed'] ?? json['walks']) ?? 0,
      era: _parseDouble(json['era']) ?? 0,
      whip: _parseDouble(json['whip']) ?? 0,
      kPer9: _parseDouble(json['kPer9']) ?? 0,
      bbPer9: _parseDouble(json['bbPer9']) ?? 0,
    );
  }
}

class BatterGameLog {
  const BatterGameLog({
    required this.batterGlId,
    required this.teamId,
    required this.playerId,
    required this.gameId,
    required this.teamSide,
    required this.playerName,
    required this.playerPosition,
    required this.jerseyNumber,
    required this.atBats,
    required this.runs,
    required this.hits,
    required this.rbi,
    required this.walks,
    required this.strikeouts,
  });

  final int batterGlId;
  final int teamId;
  final int playerId;
  final int gameId;
  final String teamSide;
  final String playerName;
  final String playerPosition;
  final String jerseyNumber;
  final int atBats;
  final int runs;
  final int hits;
  final int rbi;
  final int walks;
  final int strikeouts;

  static BatterGameLog? fromJson(Map<String, dynamic> row) {
    return BatterGameLog(
      batterGlId: _parseInt(row['batterGlId'] ?? row['id']) ?? 0,
      teamId: _parseInt(row['teamId'] ?? row['team_idx']) ?? 0,
      playerId: _parseInt(row['playerId'] ?? row['player_idx']) ?? 0,
      gameId: _parseInt(row['gameId'] ?? row['game_idx']) ?? 0,
      teamSide: (row['teamSide'] ?? row['team_side'] ?? '').toString(),
      playerName: (row['playerName'] ?? row['player_name'] ?? '').toString(),
      playerPosition:
          (row['playerPosition'] ?? row['player_position'] ?? '').toString(),
      jerseyNumber: (row['jerseyNumber'] ??
              row['jersey_number'] ??
              row['backNumber'] ??
              row['uniformNumber'] ??
              '')
          .toString(),
      atBats: _parseInt(row['atBats'] ?? row['at_bats']) ?? 0,
      runs: _parseInt(row['runs']) ?? 0,
      hits: _parseInt(row['hits']) ?? 0,
      rbi: _parseInt(row['rbi']) ?? 0,
      walks: _parseInt(row['walks']) ?? 0,
      strikeouts: _parseInt(row['strikeouts']) ?? 0,
    );
  }
}

class PitcherGameLog {
  const PitcherGameLog({
    required this.pitcherGlId,
    required this.teamId,
    required this.playerId,
    required this.gameId,
    required this.teamSide,
    required this.playerName,
    required this.playerPosition,
    required this.jerseyNumber,
    required this.inningsPitched,
    required this.hitsAllowed,
    required this.runsAllowed,
    required this.earnedRuns,
    required this.walks,
    required this.strikeouts,
  });

  final int pitcherGlId;
  final int teamId;
  final int playerId;
  final int gameId;
  final String teamSide;
  final String playerName;
  final String playerPosition;
  final String jerseyNumber;
  final double inningsPitched;
  final int hitsAllowed;
  final int runsAllowed;
  final int earnedRuns;
  final int walks;
  final int strikeouts;

  static PitcherGameLog? fromJson(Map<String, dynamic> row) {
    return PitcherGameLog(
      pitcherGlId: _parseInt(row['pitcherGlId'] ?? row['id']) ?? 0,
      teamId: _parseInt(row['teamId'] ?? row['team_idx']) ?? 0,
      playerId: _parseInt(row['playerId'] ?? row['player_idx']) ?? 0,
      gameId: _parseInt(row['gameId'] ?? row['game_idx']) ?? 0,
      teamSide: (row['teamSide'] ?? row['team_side'] ?? '').toString(),
      playerName: (row['playerName'] ?? row['player_name'] ?? '').toString(),
      playerPosition:
          (row['playerPosition'] ?? row['player_position'] ?? '').toString(),
      jerseyNumber: (row['jerseyNumber'] ??
              row['jersey_number'] ??
              row['backNumber'] ??
              row['uniformNumber'] ??
              '')
          .toString(),
      inningsPitched:
          _parseDouble(row['inningsPitched'] ?? row['innings_pitched']) ?? 0,
      hitsAllowed: _parseInt(row['hitsAllowed'] ?? row['hits_allowed']) ?? 0,
      runsAllowed: _parseInt(row['runsAllowed'] ?? row['runs_allowed']) ?? 0,
      earnedRuns: _parseInt(row['earnedRuns'] ?? row['earned_runs']) ?? 0,
      walks: _parseInt(row['walks']) ?? 0,
      strikeouts: _parseInt(row['strikeouts']) ?? 0,
    );
  }
}

class PlayerGameLogsResponse {
  const PlayerGameLogsResponse({
    required this.batterLogs,
    required this.pitcherLogs,
  });

  final List<BatterGameLog> batterLogs;
  final List<PitcherGameLog> pitcherLogs;
}

int? _parseInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String && value.trim().isNotEmpty) {
    return int.tryParse(value.trim()) ?? num.tryParse(value.trim())?.toInt();
  }
  return null;
}

double? _parseDouble(dynamic value) {
  if (value is double) return value;
  if (value is num) return value.toDouble();
  if (value is String && value.trim().isNotEmpty) {
    return double.tryParse(value.trim());
  }
  return null;
}

bool _parseBool(dynamic value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  if (value is String) {
    final v = value.toLowerCase().trim();
    return v == 'true' || v == '1' || v == 'yes' || v == 'y';
  }
  return false;
}
