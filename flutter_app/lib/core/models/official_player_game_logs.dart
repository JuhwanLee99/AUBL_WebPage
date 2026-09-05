/// Published UniquePlay rows are read-only and never merged into manual logs.
class OfficialPlayerGameLogs {
  const OfficialPlayerGameLogs({
    required this.status,
    required this.games,
    this.seasonId,
    this.syncRevision,
    this.publishedAt,
  });

  final String status;
  final int? seasonId;
  final String? syncRevision;
  final DateTime? publishedAt;
  final List<OfficialPlayerGame> games;

  bool get allowsLegacyFallback => status == 'NO_ACTIVE_REVISION';

  factory OfficialPlayerGameLogs.fromJson(Map<String, dynamic> json) {
    final status = json['status'];
    if (!const {
      'AVAILABLE',
      'NOT_COLLECTED',
      'IDENTITY_UNRESOLVED',
      'REVIEW_REQUIRED',
      'NO_ACTIVE_REVISION',
    }.contains(status)) {
      throw const FormatException('공식 경기 기록 상태를 확인할 수 없습니다.');
    }
    return OfficialPlayerGameLogs(
      status: status as String,
      seasonId: (json['seasonId'] as num?)?.toInt(),
      syncRevision: json['syncRevision']?.toString(),
      publishedAt: DateTime.tryParse(json['publishedAt']?.toString() ?? ''),
      games:
          _maps(
              status == 'AVAILABLE' ? json['games'] : null,
            ).map(OfficialPlayerGame.fromJson).toList()
            ..sort((a, b) => b.playedAt.compareTo(a.playedAt)),
    );
  }
}

class OfficialPlayerGame {
  const OfficialPlayerGame({
    required this.sourceGameId,
    required this.backendGameId,
    required this.playedAt,
    required this.homeTeamName,
    required this.awayTeamName,
    required this.teamName,
    required this.batters,
    required this.pitchers,
    this.homeScore,
    this.awayScore,
  });

  final String sourceGameId;
  final int? backendGameId;
  final String playedAt;
  final String homeTeamName;
  final String awayTeamName;
  final String teamName;
  final num? homeScore;
  final num? awayScore;
  final List<OfficialPlayerRow> batters;
  final List<OfficialPlayerRow> pitchers;

  factory OfficialPlayerGame.fromJson(
    Map<String, dynamic> json,
  ) => OfficialPlayerGame(
    sourceGameId: json['sourceGameId']?.toString() ?? '',
    backendGameId: (json['backendGameId'] as num?)?.toInt(),
    playedAt: json['playedAt']?.toString() ?? '',
    homeTeamName: json['homeTeamName']?.toString() ?? '',
    awayTeamName: json['awayTeamName']?.toString() ?? '',
    teamName: json['teamName']?.toString() ?? '',
    homeScore: _number(json['homeScore']),
    awayScore: _number(json['awayScore']),
    batters: _maps(json['batters']).map(OfficialPlayerRow.fromJson).toList(),
    pitchers: _maps(json['pitchers']).map(OfficialPlayerRow.fromJson).toList(),
  );
}

class OfficialPlayerRow {
  const OfficialPlayerRow({
    required this.rowKey,
    required this.playerName,
    required this.stats,
    required this.plateAppearances,
    this.position,
    this.decision,
    this.inningsPitched,
  });

  final String rowKey;
  final String playerName;
  final String? position;
  final String? decision;
  final String? inningsPitched;
  final Map<String, num?> stats;
  final List<OfficialPlateAppearance> plateAppearances;

  String displayStat(String key, {int? decimals}) {
    final value = stats[key];
    if (value == null) return '—';
    return decimals == null ? '$value' : value.toStringAsFixed(decimals);
  }

  // Baseball innings are base-three outs, never a decimal sum of 1.1 + 1.2.
  String get inningsLabel {
    final outs = stats['outs'];
    if (outs != null && outs >= 0 && outs == outs.roundToDouble()) {
      return '${outs.toInt() ~/ 3}.${outs.toInt() % 3}';
    }
    return inningsPitched ?? '—';
  }

  factory OfficialPlayerRow.fromJson(Map<String, dynamic> json) {
    final raw = json['stats'] is Map
        ? Map<String, dynamic>.from(json['stats'] as Map)
        : <String, dynamic>{};
    return OfficialPlayerRow(
      rowKey: json['rowKey']?.toString() ?? '',
      playerName: json['playerName']?.toString() ?? '',
      position: json['position']?.toString(),
      decision: json['decision']?.toString(),
      inningsPitched: raw['inningsPitched']?.toString(),
      stats: {
        for (final key in const [
          'atBats',
          'hits',
          'rbi',
          'stolenBases',
          'runs',
          'battingAverage',
          'seasonBattingAverage',
          'outs',
          'hitsAllowed',
          'runsAllowed',
          'earnedRuns',
          'walksAndHitByPitch',
          'strikeouts',
          'era',
        ])
          key: _number(raw[key]),
      },
      plateAppearances: _maps(json['plateAppearances'])
          .map(
            (row) => OfficialPlateAppearance(
              inning: (row['inning'] as num?)?.toInt() ?? 0,
              result: row['result']?.toString() ?? '',
            ),
          )
          .where((row) => row.inning > 0 && row.result.isNotEmpty)
          .toList(),
    );
  }
}

class OfficialPlateAppearance {
  const OfficialPlateAppearance({required this.inning, required this.result});
  final int inning;
  final String result;
}

List<Map<String, dynamic>> _maps(dynamic value) => value is List
    ? value
          .whereType<Map>()
          .map((row) => Map<String, dynamic>.from(row))
          .toList()
    : const [];

num? _number(dynamic value) => value is num && value.isFinite ? value : null;
