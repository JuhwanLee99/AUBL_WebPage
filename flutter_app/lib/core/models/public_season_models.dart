enum QualificationState {
  currentEutteum,
  currentBeogeum,
  currentOut,
  confirmedEutteum,
  confirmedBeogeum,
  confirmedOut,
  tiePending,
  unknown;

  factory QualificationState.fromWire(dynamic value) {
    return switch (value?.toString().trim().toUpperCase()) {
      'CURRENT_EUTTEUM' => currentEutteum,
      'CURRENT_BEOGEUM' => currentBeogeum,
      'CURRENT_OUT' => currentOut,
      'CONFIRMED_EUTTEUM' => confirmedEutteum,
      'CONFIRMED_BEOGEUM' => confirmedBeogeum,
      'CONFIRMED_OUT' => confirmedOut,
      'TIE_PENDING' => tiePending,
      _ => unknown,
    };
  }

  String get label => switch (this) {
        currentEutteum => '현재 으뜸권',
        currentBeogeum => '현재 버금권',
        currentOut => '탈락권',
        confirmedEutteum => '으뜸 진출 확정',
        confirmedBeogeum => '버금 진출 확정',
        confirmedOut => '예선 탈락',
        tiePending => '판정 대기',
        unknown => '확인 중',
      };
}

enum PublicGameStatus {
  scheduled,
  inProgress,
  completed,
  canceled,
  suspended,
  unknown;

  factory PublicGameStatus.fromWire(dynamic value) {
    return switch (value?.toString().trim().toUpperCase()) {
      'SCHEDULED' => scheduled,
      'IN_PROGRESS' || 'INPROGRESS' || 'LIVE' => inProgress,
      'COMPLETED' || 'FINISHED' => completed,
      'CANCELED' || 'CANCELLED' => canceled,
      'SUSPENDED' => suspended,
      _ => unknown,
    };
  }
}

class SourceFreshness {
  const SourceFreshness({
    required this.provider,
    required this.syncMode,
    required this.publishedRevision,
    required this.publishedAt,
    required this.latestSourceUpdatedAt,
    required this.checkedAt,
    required this.ageSeconds,
    required this.status,
  });

  final String? provider;
  final String? syncMode;
  final String? publishedRevision;
  final DateTime? publishedAt;
  final DateTime? latestSourceUpdatedAt;
  final DateTime? checkedAt;
  final int? ageSeconds;
  final String? status;

  factory SourceFreshness.fromJson(Map<String, dynamic> json) {
    return SourceFreshness(
      provider: _string(json['provider']),
      syncMode: _string(json['syncMode']),
      publishedRevision: _string(json['publishedRevision']),
      publishedAt: _dateTime(json['publishedAt']),
      latestSourceUpdatedAt: _dateTime(json['latestSourceUpdatedAt']),
      checkedAt: _dateTime(json['checkedAt']),
      ageSeconds: _int(json['ageSeconds']),
      status: _string(json['status']),
    );
  }
}

class PublicGame {
  const PublicGame({
    required this.backendGameId,
    required this.seasonId,
    required this.seasonYear,
    required this.gameDate,
    required this.startTime,
    required this.timezone,
    required this.venue,
    required this.groupCode,
    required this.status,
    required this.gameType,
    required this.gameNumber,
    required this.homeTeamId,
    required this.homeTeamName,
    required this.homeScore,
    required this.homeQualificationState,
    required this.awayTeamId,
    required this.awayTeamName,
    required this.awayScore,
    required this.awayQualificationState,
    required this.sourceProvider,
    required this.sourceGameId,
    required this.syncRevision,
    required this.sourceUpdatedAt,
    required this.freshnessStatus,
    required this.activeRevision,
  });

  final int backendGameId;
  final int seasonId;
  final int? seasonYear;
  final DateTime? gameDate;
  final DateTime? startTime;
  final String? timezone;
  final String? venue;
  final String? groupCode;
  final PublicGameStatus status;
  final String? gameType;
  final int? gameNumber;
  final int homeTeamId;
  final String homeTeamName;
  final int? homeScore;
  final QualificationState homeQualificationState;
  final int awayTeamId;
  final String awayTeamName;
  final int? awayScore;
  final QualificationState awayQualificationState;
  final String? sourceProvider;
  final String? sourceGameId;
  final String? syncRevision;
  final DateTime? sourceUpdatedAt;
  final String? freshnessStatus;
  final bool activeRevision;

  bool get isCompleted => status == PublicGameStatus.completed;
  bool get isLive => status == PublicGameStatus.inProgress;
  bool get isScheduled => status == PublicGameStatus.scheduled;
  String get detailId => sourceGameId != null && sourceGameId!.isNotEmpty
      ? sourceGameId!
      : '$backendGameId';

  factory PublicGame.fromJson(Map<String, dynamic> json) {
    return PublicGame(
      backendGameId: _int(json['id']) ?? 0,
      seasonId: _int(json['seasonId']) ?? 0,
      seasonYear: _int(json['seasonYear']),
      gameDate: _date(json['gameDate']),
      startTime: _dateTime(json['startTime']),
      timezone: _string(json['timezone']),
      venue: _string(json['venue']),
      groupCode: _string(json['groupCode'])?.toUpperCase(),
      status: PublicGameStatus.fromWire(json['status']),
      gameType: _string(json['gameType']),
      gameNumber: _int(json['gameNumber']),
      homeTeamId: _int(json['homeTeamId']) ?? 0,
      homeTeamName: _string(json['homeTeamName']) ?? '',
      homeScore: _int(json['homeScore']),
      homeQualificationState:
          QualificationState.fromWire(json['homeQualificationState']),
      awayTeamId: _int(json['awayTeamId']) ?? 0,
      awayTeamName: _string(json['awayTeamName']) ?? '',
      awayScore: _int(json['awayScore']),
      awayQualificationState:
          QualificationState.fromWire(json['awayQualificationState']),
      sourceProvider: _string(json['sourceProvider']),
      sourceGameId: _string(json['sourceGameId']),
      syncRevision: _string(json['syncRevision']),
      sourceUpdatedAt: _dateTime(json['sourceUpdatedAt']),
      freshnessStatus: _string(json['freshnessStatus']),
      activeRevision: json['activeRevision'] != false,
    );
  }
}

class GroupStanding {
  const GroupStanding({
    required this.rank,
    required this.teamId,
    required this.teamName,
    required this.groupCode,
    required this.gamesPlayed,
    required this.wins,
    required this.ties,
    required this.losses,
    required this.runsFor,
    required this.runsAgainst,
    required this.runDifferential,
    required this.winPct,
    required this.points,
    required this.gamesBehind,
    required this.qualificationState,
    required this.syncRevision,
  });

  final int rank;
  final int teamId;
  final String teamName;
  final String groupCode;
  final int gamesPlayed;
  final int wins;
  final int ties;
  final int losses;
  final int runsFor;
  final int runsAgainst;
  final int runDifferential;
  final double winPct;
  final int? points;
  final double? gamesBehind;
  final QualificationState qualificationState;
  final String? syncRevision;

  factory GroupStanding.fromJson(
    Map<String, dynamic> json, {
    required String fallbackGroup,
  }) {
    return GroupStanding(
      rank: _int(json['rank']) ?? 0,
      teamId: _int(json['teamId']) ?? 0,
      teamName: _string(json['teamName']) ?? '',
      groupCode: (_string(json['groupCode']) ?? fallbackGroup).toUpperCase(),
      gamesPlayed: _int(json['gamesPlayed']) ?? 0,
      wins: _int(json['wins']) ?? 0,
      ties: _int(json['ties'] ?? json['draws']) ?? 0,
      losses: _int(json['losses']) ?? 0,
      runsFor: _int(json['runsFor']) ?? 0,
      runsAgainst: _int(json['runsAgainst']) ?? 0,
      runDifferential: _int(json['runDifferential']) ?? 0,
      winPct: _double(json['winPct']) ?? 0,
      points: _int(json['points']),
      gamesBehind: _double(json['gamesBehind']),
      qualificationState:
          QualificationState.fromWire(json['qualificationState']),
      syncRevision: _string(json['syncRevision']),
    );
  }
}

class GroupOverview {
  const GroupOverview({
    required this.groupCode,
    required this.teamCount,
    required this.completedGameCount,
    required this.standings,
  });

  final String groupCode;
  final int teamCount;
  final int completedGameCount;
  final List<GroupStanding> standings;

  factory GroupOverview.fromJson(Map<String, dynamic> json) {
    final group =
        (_string(json['groupCode'] ?? json['group']) ?? '').toUpperCase();
    final rows = (json['standings'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map((row) => GroupStanding.fromJson(row, fallbackGroup: group))
        .where((row) => row.teamId > 0 && row.teamName.isNotEmpty)
        .toList()
      ..sort((a, b) => a.rank.compareTo(b.rank));
    return GroupOverview(
      groupCode: group,
      teamCount: _int(json['teamCount']) ?? rows.length,
      completedGameCount: _int(json['completedGameCount']) ?? 0,
      standings: rows,
    );
  }
}

class SeasonBatterLeader {
  const SeasonBatterLeader({
    required this.rank,
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.groupCode,
    required this.battingAverage,
    required this.hits,
    required this.homeRuns,
  });

  final int rank;
  final int playerId;
  final String playerName;
  final String teamName;
  final String? groupCode;
  final double? battingAverage;
  final int? hits;
  final int? homeRuns;

  bool get hasPublishedStats =>
      battingAverage != null || hits != null || homeRuns != null;

  factory SeasonBatterLeader.fromJson(Map<String, dynamic> json) {
    return SeasonBatterLeader(
      rank: _int(json['rank']) ?? 0,
      playerId: _int(json['playerId']) ?? 0,
      playerName: _string(json['playerName']) ?? '',
      teamName: _string(json['teamName']) ?? '',
      groupCode: _string(json['groupCode']),
      battingAverage: _double(json['battingAverage']),
      hits: _int(json['hits']),
      homeRuns: _int(json['homeRuns']),
    );
  }
}

class SeasonPitcherLeader {
  const SeasonPitcherLeader({
    required this.rank,
    required this.playerId,
    required this.playerName,
    required this.teamName,
    required this.groupCode,
    required this.era,
    required this.wins,
    required this.strikeouts,
  });

  final int rank;
  final int playerId;
  final String playerName;
  final String teamName;
  final String? groupCode;
  final double? era;
  final int? wins;
  final int? strikeouts;

  bool get hasPublishedStats =>
      era != null || wins != null || strikeouts != null;

  factory SeasonPitcherLeader.fromJson(Map<String, dynamic> json) {
    return SeasonPitcherLeader(
      rank: _int(json['rank']) ?? 0,
      playerId: _int(json['playerId']) ?? 0,
      playerName: _string(json['playerName']) ?? '',
      teamName: _string(json['teamName']) ?? '',
      groupCode: _string(json['groupCode']),
      era: _double(json['era']),
      wins: _int(json['wins']),
      strikeouts: _int(json['strikeouts']),
    );
  }
}

class SeasonOverview {
  const SeasonOverview({
    required this.seasonId,
    required this.seasonYear,
    required this.generatedAt,
    required this.sourceFreshness,
    required this.upcomingGames,
    required this.recentGames,
    required this.groups,
    required this.batterLeaders,
    required this.pitcherLeaders,
  });

  final int seasonId;
  final int? seasonYear;
  final DateTime? generatedAt;
  final SourceFreshness sourceFreshness;
  final List<PublicGame> upcomingGames;
  final List<PublicGame> recentGames;
  final List<GroupOverview> groups;
  final List<SeasonBatterLeader> batterLeaders;
  final List<SeasonPitcherLeader> pitcherLeaders;

  factory SeasonOverview.fromJson(
    Map<String, dynamic> json, {
    required int fallbackSeasonId,
  }) {
    final freshnessJson = json['sourceFreshness'];
    final groups = (json['groups'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(GroupOverview.fromJson)
        .where((group) => RegExp(r'^[A-H]$').hasMatch(group.groupCode))
        .toList()
      ..sort((a, b) => a.groupCode.compareTo(b.groupCode));
    return SeasonOverview(
      seasonId: _int(json['seasonId']) ?? fallbackSeasonId,
      seasonYear: _int(json['seasonYear']),
      generatedAt: _dateTime(json['generatedAt']),
      sourceFreshness: SourceFreshness.fromJson(
        freshnessJson is Map<String, dynamic> ? freshnessJson : const {},
      ),
      upcomingGames: _games(json['upcomingGames']),
      recentGames: _games(json['recentGames']),
      groups: groups,
      batterLeaders: (json['batterLeaders'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SeasonBatterLeader.fromJson)
          .where((row) =>
              row.playerId > 0 &&
              row.playerName.isNotEmpty &&
              row.hasPublishedStats)
          .toList(),
      pitcherLeaders: (json['pitcherLeaders'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SeasonPitcherLeader.fromJson)
          .where((row) =>
              row.playerId > 0 &&
              row.playerName.isNotEmpty &&
              row.hasPublishedStats)
          .toList(),
    );
  }
}

List<PublicGame> _games(dynamic value) {
  return (value as List<dynamic>? ?? const [])
      .whereType<Map<String, dynamic>>()
      .map(PublicGame.fromJson)
      .where((game) => game.backendGameId > 0 && game.activeRevision)
      .toList();
}

String? _string(dynamic value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}

int? _int(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString().trim() ?? '');
}

double? _double(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString().trim() ?? '');
}

DateTime? _dateTime(dynamic value) {
  final text = _string(value);
  return text == null ? null : DateTime.tryParse(text);
}

DateTime? _date(dynamic value) {
  final parsed = _dateTime(value);
  if (parsed == null) return null;
  return DateTime(parsed.year, parsed.month, parsed.day);
}
