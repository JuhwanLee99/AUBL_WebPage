import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';

/// Service for communicating with the Spring Boot backend API.
class BackendApiService {
  BackendApiService({http.Client? client})
      : _client = client ?? http.Client();

  final http.Client _client;

  String get _baseUrl => AppConfig.backendApiUrl;

  Future<Map<String, String>> _authHeaders() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return {};
    final token = await user.getIdToken();
    return {'Authorization': 'Bearer $token'};
  }

  Future<dynamic> _get(String path, {Map<String, String>? query}) async {
    final uri = Uri.parse('$_baseUrl$path').replace(queryParameters: query);
    final headers = await _authHeaders();
    final res = await _client.get(uri, headers: headers);
    if (res.statusCode == 404) return null;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('API error ${res.statusCode}: ${res.reasonPhrase}');
    }
    return jsonDecode(res.body);
  }

  // ── Rankings ──

  Future<List<BatterRanking>> getBatterRankings({
    int? seasonId,
    int? limit,
    String sort = 'ops',
  }) async {
    final query = <String, String>{'sort': sort};
    if (seasonId != null) query['seasonId'] = '$seasonId';
    if (limit != null) query['limit'] = '$limit';
    final raw = await _get('/api/rankings/batters', query: query);
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(BatterRanking.fromJson)
        .toList();
  }

  Future<List<PitcherRanking>> getPitcherRankings({
    int? seasonId,
    int? limit,
    String sort = 'era',
  }) async {
    final query = <String, String>{'sort': sort};
    if (seasonId != null) query['seasonId'] = '$seasonId';
    if (limit != null) query['limit'] = '$limit';
    final raw = await _get('/api/rankings/pitchers', query: query);
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(PitcherRanking.fromJson)
        .toList();
  }

  // ── Player Stats ──

  Future<PlayerStatsResponse> getPlayerStats(int playerId, {int? seasonId}) async {
    final query = <String, String>{};
    if (seasonId != null) query['seasonId'] = '$seasonId';
    final raw = await _get('/api/players/$playerId/stats', query: query.isEmpty ? null : query);
    if (raw is! Map<String, dynamic>) {
      return PlayerStatsResponse(playerName: '선수 #$playerId', teamName: '');
    }
    return PlayerStatsResponse.fromJson(raw);
  }

  void dispose() {
    _client.close();
  }
}

// ── Models ──

class BatterRanking {
  const BatterRanking({
    required this.rank,
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.gamesPlayed,
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

  factory BatterRanking.fromJson(Map<String, dynamic> json) {
    return BatterRanking(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      playerId: (json['playerId'] as num?)?.toInt() ?? 0,
      playerName: json['playerName'] as String? ?? '',
      teamName: json['teamName'] as String? ?? '',
      gamesPlayed: (json['gamesPlayed'] as num?)?.toInt() ?? 0,
      atBats: (json['atBats'] as num?)?.toInt() ?? 0,
      hits: (json['hits'] as num?)?.toInt() ?? 0,
      homeRuns: (json['homeRuns'] as num?)?.toInt() ?? 0,
      runsBattedIn: (json['runsBattedIn'] as num?)?.toInt() ?? 0,
      stolenBases: (json['stolenBases'] as num?)?.toInt() ?? 0,
      walks: (json['walks'] as num?)?.toInt() ?? 0,
      strikeouts: (json['strikeouts'] as num?)?.toInt() ?? 0,
      battingAverage: (json['battingAverage'] as num?)?.toDouble() ?? 0,
      onBasePct: (json['onBasePct'] as num?)?.toDouble() ?? 0,
      sluggingPct: (json['sluggingPct'] as num?)?.toDouble() ?? 0,
      ops: (json['ops'] as num?)?.toDouble() ?? 0,
    );
  }

  final int rank, playerId, gamesPlayed, atBats, hits, homeRuns,
      runsBattedIn, stolenBases, walks, strikeouts;
  final String playerName, teamName;
  final double battingAverage, onBasePct, sluggingPct, ops;
}

class PitcherRanking {
  const PitcherRanking({
    required this.rank,
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.gamesPlayed,
    required this.inningsPitched,
    required this.wins,
    required this.losses,
    required this.saves,
    required this.strikeouts,
    required this.walksAllowed,
    required this.era,
    required this.whip,
  });

  factory PitcherRanking.fromJson(Map<String, dynamic> json) {
    return PitcherRanking(
      rank: (json['rank'] as num?)?.toInt() ?? 0,
      playerId: (json['playerId'] as num?)?.toInt() ?? 0,
      playerName: json['playerName'] as String? ?? '',
      teamName: json['teamName'] as String? ?? '',
      gamesPlayed: (json['gamesPlayed'] as num?)?.toInt() ?? 0,
      inningsPitched: (json['inningsPitched'] as num?)?.toDouble() ?? 0,
      wins: (json['wins'] as num?)?.toInt() ?? 0,
      losses: (json['losses'] as num?)?.toInt() ?? 0,
      saves: (json['saves'] as num?)?.toInt() ?? 0,
      strikeouts: (json['strikeouts'] as num?)?.toInt() ?? 0,
      walksAllowed: (json['walksAllowed'] as num?)?.toInt() ?? 0,
      era: (json['era'] as num?)?.toDouble() ?? 0,
      whip: (json['whip'] as num?)?.toDouble() ?? 0,
    );
  }

  final int rank, playerId, gamesPlayed, wins, losses, saves,
      strikeouts, walksAllowed;
  final String playerName, teamName;
  final double inningsPitched, era, whip;
  double get kbb => walksAllowed > 0 ? strikeouts / walksAllowed : 0;
}

class PlayerStatsResponse {
  const PlayerStatsResponse({
    required this.playerName,
    required this.teamName,
    this.batterStats = const [],
    this.pitcherStats = const [],
  });

  factory PlayerStatsResponse.fromJson(Map<String, dynamic> json) {
    return PlayerStatsResponse(
      playerName: json['playerName'] as String? ?? '',
      teamName: json['teamName'] as String? ?? '',
      batterStats: (json['batterStats'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(BatterStatSummary.fromJson)
              .toList() ??
          [],
      pitcherStats: (json['pitcherStats'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(PitcherStatSummary.fromJson)
              .toList() ??
          [],
    );
  }

  final String playerName, teamName;
  final List<BatterStatSummary> batterStats;
  final List<PitcherStatSummary> pitcherStats;
}

class BatterStatSummary {
  const BatterStatSummary({
    required this.seasonId,
    required this.gamesPlayed,
    required this.atBats,
    required this.hits,
    required this.homeRuns,
    required this.battingAverage,
    required this.onBasePct,
    required this.sluggingPct,
    required this.ops,
  });

  factory BatterStatSummary.fromJson(Map<String, dynamic> json) {
    return BatterStatSummary(
      seasonId: (json['seasonId'] as num?)?.toInt() ?? 0,
      gamesPlayed: (json['gamesPlayed'] as num?)?.toInt() ?? 0,
      atBats: (json['atBats'] as num?)?.toInt() ?? 0,
      hits: (json['hits'] as num?)?.toInt() ?? 0,
      homeRuns: (json['homeRuns'] as num?)?.toInt() ?? 0,
      battingAverage: (json['battingAverage'] as num?)?.toDouble() ?? 0,
      onBasePct: (json['onBasePct'] as num?)?.toDouble() ?? 0,
      sluggingPct: (json['sluggingPct'] as num?)?.toDouble() ?? 0,
      ops: (json['ops'] as num?)?.toDouble() ?? 0,
    );
  }

  final int seasonId, gamesPlayed, atBats, hits, homeRuns;
  final double battingAverage, onBasePct, sluggingPct, ops;
}

class PitcherStatSummary {
  const PitcherStatSummary({
    required this.seasonId,
    required this.gamesPlayed,
    required this.inningsPitched,
    required this.wins,
    required this.losses,
    required this.saves,
    required this.era,
    required this.whip,
    required this.kPer9,
    required this.bbPer9,
  });

  factory PitcherStatSummary.fromJson(Map<String, dynamic> json) {
    return PitcherStatSummary(
      seasonId: (json['seasonId'] as num?)?.toInt() ?? 0,
      gamesPlayed: (json['gamesPlayed'] as num?)?.toInt() ?? 0,
      inningsPitched: (json['inningsPitched'] as num?)?.toDouble() ?? 0,
      wins: (json['wins'] as num?)?.toInt() ?? 0,
      losses: (json['losses'] as num?)?.toInt() ?? 0,
      saves: (json['saves'] as num?)?.toInt() ?? 0,
      era: (json['era'] as num?)?.toDouble() ?? 0,
      whip: (json['whip'] as num?)?.toDouble() ?? 0,
      kPer9: (json['kPer9'] as num?)?.toDouble() ?? 0,
      bbPer9: (json['bbPer9'] as num?)?.toDouble() ?? 0,
    );
  }

  final int seasonId, gamesPlayed, wins, losses, saves;
  final double inningsPitched, era, whip, kPer9, bbPer9;
}
