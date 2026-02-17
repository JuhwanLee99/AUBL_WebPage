import 'dart:convert';

import 'package:aubl_flutter_app/core/services/backend_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('BackendApiService', () {
    test('normalizes mixed camel/snake response for getPlayerStats', () async {
      final client = MockClient((request) async {
        if (request.url.path == '/api/players/42/stats') {
          return http.Response(
            jsonEncode({
              'player_id': 42,
              'player_name': '테스트 선수',
              'team_name': 'AUBL 테스트',
              'backNumber': '11',
              'batter_stats': [
                {
                  'season_id': '2024',
                  'gamesPlayed': '12',
                  'plateAppearance': '40',
                  'atBats': '35',
                  'hits': '13',
                  'homeRuns': '2',
                  'rbi': '9',
                  'stolenBases': '4',
                  'walks': '3',
                  'strikeouts': '6',
                  'avg': '0.371',
                  'obp': '0.410',
                  'slg': '0.571',
                  'ops': '0.981',
                }
              ],
              'pitcherStats': [
                {
                  'seasonId': 2024,
                  'gamesPlayed': '4',
                  'inningsPitched': '18.1',
                  'wins': '2',
                  'losses': '1',
                  'saves': '0',
                  'holds': '1',
                  'strikeouts': '19',
                  'walks': '5',
                  'era': '2.95',
                  'whip': '1.20',
                  'kPer9': '9.35',
                  'bbPer9': '2.46',
                }
              ],
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Not found', 404);
      });

      final service =
          BackendApiService(client: client, tokenProvider: () async => null);
      final result = await service.getPlayerStats(42);

      expect(result.playerId, 42);
      expect(result.playerName, '테스트 선수');
      expect(result.teamName, 'AUBL 테스트');
      expect(result.jerseyNumber, '11');

      expect(result.batterStats, hasLength(1));
      expect(result.batterStats.first.seasonId, 2024);
      expect(result.batterStats.first.runsBattedIn, 9);
      expect(result.batterStats.first.battingAverage, closeTo(0.371, 0.0001));

      expect(result.pitcherStats, hasLength(1));
      expect(result.pitcherStats.first.walksAllowed, 5);
      expect(result.pitcherStats.first.inningsPitched, closeTo(18.1, 0.0001));
    });

    test('falls back ranking endpoint and legacy sort key for batters',
        () async {
      final seen = <Uri>[];
      final client = MockClient((request) async {
        seen.add(request.url);

        if (request.url.path == '/api/rankings/batters') {
          return http.Response('Not found', 404);
        }

        if (request.url.path == '/api/records/batters') {
          final sort = request.url.queryParameters['sort'];
          if (sort == 'battingAverage') {
            return http.Response('Bad request', 400);
          }
          if (sort == 'avg') {
            return http.Response(
              jsonEncode([
                {
                  'rank': 1,
                  'player_id': '77',
                  'player_name': '레거시 타자',
                  'team_name': '레거시 팀',
                  'season_id': '2024',
                  'avg': '0.355',
                  'obp': '0.410',
                  'slg': '0.520',
                  'ops': '0.930',
                  'hits': '21',
                  'hr': '3',
                  'rbi': '14',
                }
              ]),
              200,
              headers: {'content-type': 'application/json'},
            );
          }
        }

        return http.Response('Unhandled', 500);
      });

      final service =
          BackendApiService(client: client, tokenProvider: () async => null);
      final result = await service.getBatterRankings(
        seasonId: 2024,
        sort: BatterRankingSort.battingAverage,
      );

      expect(result, hasLength(1));
      expect(result.first.playerId, 77);
      expect(result.first.playerName, '레거시 타자');
      expect(result.first.battingAverage, closeTo(0.355, 0.0001));

      final attemptedSorts = seen
          .where((uri) => uri.path == '/api/records/batters')
          .map((uri) => uri.queryParameters['sort'])
          .toList();
      expect(attemptedSorts, containsAllInOrder(['battingAverage', 'avg']));
    });

    test('retries rankings without filters when filtered request returns 400',
        () async {
      final seen = <Uri>[];
      final client = MockClient((request) async {
        seen.add(request.url);
        if (request.url.path == '/api/rankings/pitchers') {
          if (request.url.queryParameters.containsKey('scope')) {
            return http.Response('Bad request', 400);
          }
          return http.Response(
            jsonEncode([
              {
                'rank': 1,
                'playerId': 9,
                'playerName': '필터 폴백 투수',
                'teamName': 'A팀',
                'seasonId': 2024,
                'era': 1.95,
                'whip': 0.98,
              }
            ]),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('Unhandled', 500);
      });

      final service =
          BackendApiService(client: client, tokenProvider: () async => null);
      final result = await service.getPitcherRankings(
        seasonId: 2024,
        sort: PitcherRankingSort.era,
        filters: const RecordFilterParams(scope: RecordScope.playoff),
      );

      expect(result, hasLength(1));
      expect(result.first.playerName, '필터 폴백 투수');

      final pitcherCalls =
          seen.where((uri) => uri.path == '/api/rankings/pitchers').toList();
      expect(pitcherCalls, hasLength(2));
      expect(pitcherCalls.first.queryParameters.containsKey('scope'), true);
      expect(pitcherCalls.last.queryParameters.containsKey('scope'), false);
    });

    test('returns empty logs for empty payload', () async {
      final client = MockClient((request) async {
        if (request.url.path == '/api/players/7/game-logs') {
          return http.Response('{}', 200,
              headers: {'content-type': 'application/json'});
        }
        return http.Response('Not found', 404);
      });

      final service =
          BackendApiService(client: client, tokenProvider: () async => null);
      final logs = await service.getPlayerGameLogs(7);

      expect(logs.batterLogs, isEmpty);
      expect(logs.pitcherLogs, isEmpty);
    });
  });
}
