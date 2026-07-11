import 'package:aubl_flutter_app/core/services/backend_api_service.dart';
import 'package:aubl_flutter_app/features/records/records_view_model.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('RecordsViewModel', () {
    test('reloadRecords filters by group and injects jersey numbers', () async {
      final source = _FakeRecordsDataSource()
        ..mainBatters = [
          _batter(playerId: 1, teamName: 'A팀', partCode: 'A', jersey: ''),
          _batter(playerId: 2, teamName: 'B팀', partCode: 'B', jersey: ''),
        ]
        ..mainPitchers = [
          _pitcher(playerId: 1, teamName: 'A팀', partCode: 'A', jersey: ''),
          _pitcher(playerId: 2, teamName: 'B팀', partCode: 'B', jersey: ''),
        ]
        ..topBatters = [
          _batter(playerId: 1, teamName: 'A팀', partCode: 'A', jersey: ''),
        ]
        ..topPitchers = [
          _pitcher(playerId: 1, teamName: 'A팀', partCode: 'A', jersey: ''),
        ]
        ..standings = [
          _standing(teamName: 'A팀', partCode: 'A'),
          _standing(teamName: 'B팀', partCode: 'B'),
        ]
        ..playerIndex = const [
          PlayerLookup(
            playerId: 1,
            playerName: '선수A',
            teamName: 'A팀',
            jerseyNumber: '11',
            seasonId: 2025,
            seasonYear: 2025,
          ),
        ];

      final viewModel = RecordsViewModel(dataSource: source);
      final result = await viewModel.reloadRecords(
        const RecordsReloadRequest(
          seasonId: 2025,
          scope: RecordScope.all,
          group: RecordGroup.a,
          playoffDivision: RecordPlayoffDivision.all,
          regulation: RecordRegulation.inRule,
          searchQuery: '',
          topBatterSort: BatterRankingSort.ops,
          topPitcherSort: PitcherRankingSort.era,
        ),
      );

      expect(result.hasError, isFalse);
      expect(result.batters, hasLength(1));
      expect(result.pitchers, hasLength(1));
      expect(result.teamStandings, hasLength(1));
      expect(result.batters.first.jerseyNumber, '11');
      expect(result.pitchers.first.jerseyNumber, '11');
      expect(result.topInBatters.first.jerseyNumber, '11');
      expect(result.topInPitchers.first.jerseyNumber, '11');
    });

    test('reloadRecords sets warning on partial failures', () async {
      final source = _FakeRecordsDataSource()
        ..mainBatters = [_batter(playerId: 1, teamName: 'A팀', partCode: 'A')]
        ..mainPitchers = [_pitcher(playerId: 1, teamName: 'A팀', partCode: 'A')]
        ..standings = [_standing(teamName: 'A팀', partCode: 'A')]
        ..throwTopPitchers = true;
      final viewModel = RecordsViewModel(dataSource: source);

      final result = await viewModel.reloadRecords(
        const RecordsReloadRequest(
          seasonId: 2025,
          scope: RecordScope.all,
          group: RecordGroup.all,
          playoffDivision: RecordPlayoffDivision.all,
          regulation: RecordRegulation.inRule,
          searchQuery: '',
          topBatterSort: BatterRankingSort.ops,
          topPitcherSort: PitcherRankingSort.era,
        ),
      );

      expect(result.hasError, isFalse);
      expect(result.warningMessage, isNotNull);
    });

    test('reloadRecords returns error when all core data fails', () async {
      final source = _FakeRecordsDataSource()
        ..throwMainBatters = true
        ..throwMainPitchers = true
        ..throwStandings = true
        ..throwOverview = true;
      final viewModel = RecordsViewModel(dataSource: source);

      final result = await viewModel.reloadRecords(
        const RecordsReloadRequest(
          seasonId: 2025,
          scope: RecordScope.all,
          group: RecordGroup.all,
          playoffDivision: RecordPlayoffDivision.all,
          regulation: RecordRegulation.inRule,
          searchQuery: '',
          topBatterSort: BatterRankingSort.ops,
          topPitcherSort: PitcherRankingSort.era,
        ),
      );

      expect(result.hasError, isTrue);
      expect(result.errorMessage, '기록 데이터를 불러오지 못했습니다.');
    });
  });
}

class _FakeRecordsDataSource implements RecordsDataSource {
  List<SeasonSummary> seasons = const [SeasonSummary(id: 1, year: 2025)];
  List<BatterRanking> mainBatters = const [];
  List<PitcherRanking> mainPitchers = const [];
  List<BatterRanking> topBatters = const [];
  List<PitcherRanking> topPitchers = const [];
  RecordsOverview overview = const RecordsOverview(
    seasonId: 2025,
    totalGames: 10,
    totalTeams: 2,
    topBatter: null,
    topPitcher: null,
  );
  List<TeamRecordStanding> standings = const [];
  List<PlayoffSummaryRow> playoffRows = const [];
  List<PlayerLookup> playerIndex = const [];
  List<PowerRankingApiRow> powerRows = const [];

  bool throwMainBatters = false;
  bool throwMainPitchers = false;
  bool throwTopBatters = false;
  bool throwTopPitchers = false;
  bool throwOverview = false;
  bool throwStandings = false;
  bool throwPlayoff = false;
  bool throwPlayerIndex = false;

  @override
  Future<List<BatterRanking>> getBatterRankings({
    required int seasonId,
    int? limit,
    BatterRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) async {
    final isTop = (limit ?? 0) <= 5;
    if (isTop && throwTopBatters) throw Exception('top batters failed');
    if (!isTop && throwMainBatters) throw Exception('main batters failed');
    return isTop ? topBatters : mainBatters;
  }

  @override
  Future<List<PitcherRanking>> getPitcherRankings({
    required int seasonId,
    int? limit,
    PitcherRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) async {
    final isTop = (limit ?? 0) <= 5;
    if (isTop && throwTopPitchers) throw Exception('top pitchers failed');
    if (!isTop && throwMainPitchers) throw Exception('main pitchers failed');
    return isTop ? topPitchers : mainPitchers;
  }

  @override
  Future<List<PlayoffSummaryRow>> getPlayoffSummaries(
    int seasonId, {
    RecordFilterParams? filters,
  }) async {
    if (throwPlayoff) throw Exception('playoff failed');
    return playoffRows;
  }

  @override
  Future<List<PlayerLookup>> getPlayerSearchIndex(int seasonId) async {
    if (throwPlayerIndex) throw Exception('player index failed');
    return playerIndex;
  }

  @override
  Future<RecordsOverview> getRecordOverview(
    int seasonId, {
    RecordFilterParams? filters,
  }) async {
    if (throwOverview) throw Exception('overview failed');
    return overview;
  }

  @override
  Future<List<SeasonSummary>> getSeasons() async => seasons;

  @override
  Future<List<TeamRecordStanding>> getTeamRecordStandings(
    int seasonId, {
    RecordFilterParams? filters,
  }) async {
    if (throwStandings) throw Exception('standings failed');
    return standings;
  }

  @override
  Future<List<PowerRankingApiRow>> getPowerRankings({
    required int rankingYear,
    required int limit,
  }) async {
    return powerRows;
  }
}

BatterRanking _batter({
  required int playerId,
  required String teamName,
  required String partCode,
  String jersey = '7',
}) {
  return BatterRanking(
    rank: 1,
    playerId: playerId,
    playerName: '선수$playerId',
    teamId: 1,
    teamName: teamName,
    seasonId: 2025,
    seasonYear: 2025,
    jerseyNumber: jersey,
    gamesPlayed: 10,
    plateAppearance: 30,
    atBats: 25,
    hits: 10,
    homeRuns: 1,
    runsBattedIn: 5,
    stolenBases: 1,
    walks: 2,
    strikeouts: 3,
    battingAverage: 0.4,
    onBasePct: 0.45,
    sluggingPct: 0.5,
    ops: 0.95,
    partCode: partCode,
    group: null,
    seasonType: null,
    scope: 'LEAGUE',
    regulation: 'IN',
  );
}

PitcherRanking _pitcher({
  required int playerId,
  required String teamName,
  required String partCode,
  String jersey = '7',
}) {
  return PitcherRanking(
    rank: 1,
    playerId: playerId,
    playerName: '투수$playerId',
    teamId: 1,
    teamName: teamName,
    seasonId: 2025,
    seasonYear: 2025,
    jerseyNumber: jersey,
    gamesPlayed: 10,
    inningsPitched: 20.0,
    wins: 3,
    losses: 1,
    saves: 0,
    strikeouts: 20,
    walksAllowed: 5,
    era: 2.1,
    whip: 1.1,
    partCode: partCode,
    group: null,
    seasonType: null,
    scope: 'LEAGUE',
    regulation: 'IN',
  );
}

TeamRecordStanding _standing({
  required String teamName,
  required String partCode,
}) {
  return TeamRecordStanding(
    teamId: 1,
    teamName: teamName,
    wins: 5,
    losses: 2,
    ties: 0,
    winPct: 0.714,
    partCode: partCode,
    group: null,
    seasonType: null,
    scope: 'LEAGUE',
  );
}
