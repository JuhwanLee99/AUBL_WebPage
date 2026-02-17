import 'package:aubl_flutter_app/core/services/backend_api_service.dart';
import 'package:aubl_flutter_app/core/theme/app_theme.dart';
import 'package:aubl_flutter_app/features/records/records_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('RecordsScreen', () {
    late _FakeBackendApiService fakeApi;

    setUp(() {
      fakeApi = _FakeBackendApiService();
    });

    testWidgets('renders 5 tabs and power ranking table', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: RecordsScreen(apiService: fakeApi),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('개요'), findsOneWidget);
      expect(find.text('팀순위'), findsOneWidget);
      expect(find.text('투수기록'), findsOneWidget);
      expect(find.text('타자기록'), findsOneWidget);
      expect(find.text('파워랭킹'), findsOneWidget);

      await tester.tap(find.text('파워랭킹'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('테스트팀'), findsOneWidget);
    });

    testWidgets('opens player detail screen from CTA', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: RecordsScreen(apiService: fakeApi),
        ),
      );

      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text('선수상세'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.text('선수 검색'), findsOneWidget);
      expect(find.text('경기별 기록 (Player Logs)'), findsOneWidget);
    });
  });
}

class _FakeBackendApiService extends BackendApiService {
  _FakeBackendApiService()
      : super(
          client: MockClient((_) async => http.Response('{}', 200)),
          tokenProvider: () async => null,
        );

  @override
  Future<List<SeasonSummary>> getSeasons() async {
    return const [
      SeasonSummary(id: 2024, year: 2024),
      SeasonSummary(id: 2023, year: 2023),
    ];
  }

  @override
  Future<List<BatterRanking>> getBatterRankings({
    required int seasonId,
    int? limit,
    BatterRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) async {
    return [
      BatterRanking(
        rank: 1,
        playerId: 11,
        playerName: '테스트 타자',
        teamId: 1,
        teamName: '테스트팀',
        seasonId: seasonId,
        seasonYear: 2024,
        jerseyNumber: '11',
        gamesPlayed: 12,
        plateAppearance: 40,
        atBats: 35,
        hits: 14,
        homeRuns: 3,
        runsBattedIn: 12,
        stolenBases: 5,
        walks: 4,
        strikeouts: 7,
        battingAverage: 0.400,
        onBasePct: 0.450,
        sluggingPct: 0.620,
        ops: 1.070,
        partCode: '1',
        group: 'A',
        seasonType: null,
        scope: 'LEAGUE',
        regulation: 'IN',
      ),
    ];
  }

  @override
  Future<List<PitcherRanking>> getPitcherRankings({
    required int seasonId,
    int? limit,
    PitcherRankingSort? sort,
    RecordFilterParams? filters,
    RecordRegulation? regulation,
  }) async {
    return [
      PitcherRanking(
        rank: 1,
        playerId: 22,
        playerName: '테스트 투수',
        teamId: 1,
        teamName: '테스트팀',
        seasonId: seasonId,
        seasonYear: 2024,
        jerseyNumber: '22',
        gamesPlayed: 8,
        inningsPitched: 31.2,
        wins: 4,
        losses: 1,
        saves: 0,
        strikeouts: 35,
        walksAllowed: 9,
        era: 2.28,
        whip: 1.08,
        partCode: '1',
        group: 'A',
        seasonType: null,
        scope: 'LEAGUE',
        regulation: 'IN',
      ),
    ];
  }

  @override
  Future<RecordsOverview> getRecordOverview(int seasonId,
      {RecordFilterParams? filters}) async {
    return RecordsOverview(
      seasonId: seasonId,
      totalGames: 90,
      totalTeams: 8,
      topBatter: null,
      topPitcher: null,
    );
  }

  @override
  Future<List<TeamRecordStanding>> getTeamRecordStandings(int seasonId,
      {RecordFilterParams? filters}) async {
    return const [
      TeamRecordStanding(
        teamId: 1,
        teamName: '테스트팀',
        wins: 10,
        losses: 2,
        ties: 1,
        winPct: 0.833,
        partCode: '1',
        group: 'A',
        seasonType: null,
        scope: 'LEAGUE',
      ),
    ];
  }

  @override
  Future<List<PlayoffSummaryRow>> getPlayoffSummaries(int seasonId,
      {RecordFilterParams? filters}) async {
    return const [];
  }

  @override
  Future<List<PowerRankingApiRow>> getPowerRankings(
      {required int rankingYear, int? limit}) async {
    return const [
      PowerRankingApiRow(
        rank: 1,
        teamId: 1,
        teamName: '테스트팀',
        weightedScore: 92.5,
        y1Score: 33.0,
        y2Score: 30.0,
        y3Score: 29.5,
        windowYears: [2022, 2023, 2024],
        calcVersion: 'test',
      ),
    ];
  }

  @override
  Future<List<PlayerLookup>> getPlayerSearchIndex(int seasonId) async {
    return const [
      PlayerLookup(
        playerId: 11,
        playerName: '테스트 타자',
        teamName: '테스트팀',
        jerseyNumber: '11',
        seasonId: 2024,
        seasonYear: 2024,
      ),
      PlayerLookup(
        playerId: 22,
        playerName: '테스트 투수',
        teamName: '테스트팀',
        jerseyNumber: '22',
        seasonId: 2024,
        seasonYear: 2024,
      ),
    ];
  }

  @override
  Future<PlayerStatsResponse> getPlayerStats(int playerId,
      {int? seasonId}) async {
    return PlayerStatsResponse(
      playerId: playerId,
      playerName: playerId == 11 ? '테스트 타자' : '테스트 투수',
      teamName: '테스트팀',
      jerseyNumber: playerId == 11 ? '11' : '22',
      batterStats: const [
        BatterStatSummary(
          seasonId: 2024,
          gamesPlayed: 12,
          plateAppearance: 40,
          atBats: 35,
          hits: 14,
          homeRuns: 3,
          runsBattedIn: 12,
          stolenBases: 5,
          walks: 4,
          strikeouts: 7,
          battingAverage: 0.400,
          onBasePct: 0.450,
          sluggingPct: 0.620,
          ops: 1.070,
        ),
      ],
      pitcherStats: const [
        PitcherStatSummary(
          seasonId: 2024,
          gamesPlayed: 8,
          inningsPitched: 31.2,
          wins: 4,
          losses: 1,
          saves: 0,
          holds: 0,
          strikeouts: 35,
          walksAllowed: 9,
          era: 2.28,
          whip: 1.08,
          kPer9: 9.95,
          bbPer9: 2.55,
        ),
      ],
    );
  }

  @override
  Future<PlayerGameLogsResponse> getPlayerGameLogs(int playerId,
      {int? gameId}) async {
    return const PlayerGameLogsResponse(batterLogs: [], pitcherLogs: []);
  }
}
