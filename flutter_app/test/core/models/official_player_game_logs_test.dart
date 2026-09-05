import 'dart:convert';

import 'package:aubl_flutter_app/core/models/official_player_game_logs.dart';
import 'package:aubl_flutter_app/core/services/backend_api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test(
    'record quality is independent of availability and preserves raw values',
    () {
      final game = OfficialPlayerGame.fromJson({
        'quality': 'CORRECTION_PENDING',
        'homeScore': 12,
        'issues': [
          {
            'id': 'runs',
            'code': 'DETAIL_BATTER_TOTAL',
            'message': '팀 12점 / 선수 득점 합계 6점',
            'teamName': '테스트 팀',
            'email': 'not retained',
          },
        ],
        'batters': [
          {
            'stats': {'runs': 6, 'rbi': null},
          },
        ],
      });
      expect(game.qualityLabel, '오류 수정 중');
      expect(game.homeScore, 12);
      expect(game.batters.single.stats['runs'], 6);
      expect(game.batters.single.stats['rbi'], isNull);
      expect(game.issues.single.message, '팀 12점 / 선수 득점 합계 6점');
      expect(game.issues.single.teamName, '테스트 팀');
    },
  );

  test(
    'legacy and unknown quality cannot become a clean or resolved claim',
    () {
      final legacy = OfficialPlayerGame.fromJson({});
      expect(legacy.quality, isNull);
      expect(legacy.qualityLabel, isNull);
      for (final quality in [
        'FUTURE',
        {'status': 'RESOLVED'},
      ]) {
        expect(
          () => OfficialPlayerGame.fromJson({'quality': quality}),
          throwsFormatException,
        );
      }
      expect(
        OfficialPlayerGame.fromJson({'quality': 'CLEAN'}).qualityLabel,
        isNull,
      );
    },
  );

  test('resolution provenance and timestamp are parsed without defaulting', () {
    for (final source in ['MANUAL', 'SOURCE']) {
      final game = OfficialPlayerGame.fromJson({
        'quality': 'RESOLVED',
        'resolutionSource': source,
        'resolvedAt': '2026-09-05T00:20:00Z',
      });
      expect(game.qualityLabel, '오류 해결');
      expect(game.resolutionSource, source);
      expect(game.resolvedAt, DateTime.utc(2026, 9, 5, 0, 20));
    }
    final unknown = OfficialPlayerGame.fromJson({
      'quality': 'RESOLVED',
      'resolutionSource': 'FUTURE',
      'resolvedAt': 'invalid',
    });
    expect(unknown.resolutionSource, isNull);
    expect(unknown.resolvedAt, isNull);
  });

  test(
    'quality items cannot cross game identities and ignore invalid codes',
    () {
      expect(
        () => OfficialPlayerGame.fromJson({
          'sourceGameId': 'up-one',
          'quality': 'CORRECTION_PENDING',
          'issues': [
            {'sourceGameId': 'up-other', 'code': 'DETAIL_BATTER_TOTAL'},
          ],
        }),
        throwsFormatException,
      );
      final game = OfficialPlayerGame.fromJson({
        'sourceGameId': 'up-one',
        'quality': 'CORRECTION_PENDING',
        'issues': [
          {'code': 'invalid code'},
          {'code': 'DETAIL_BATTER_TOTAL'},
        ],
      });
      expect(game.issues.length, 1);
      expect(game.issues.single.code, 'DETAIL_BATTER_TOTAL');
    },
  );

  test('only explicit absence of an active revision permits legacy data', () {
    for (final status in [
      'AVAILABLE',
      'NOT_COLLECTED',
      'IDENTITY_UNRESOLVED',
      'REVIEW_REQUIRED',
    ]) {
      expect(
        OfficialPlayerGameLogs.fromJson({
          'status': status,
        }).allowsLegacyFallback,
        isFalse,
      );
    }
    expect(
      OfficialPlayerGameLogs.fromJson({
        'status': 'NO_ACTIVE_REVISION',
      }).allowsLegacyFallback,
      isTrue,
    );
    expect(
      () => OfficialPlayerGameLogs.fromJson({'status': 'NEW_UNKNOWN_STATUS'}),
      throwsFormatException,
    );
  });

  test('preserves absent values, baseball outs and inning result text', () {
    final row = OfficialPlayerRow.fromJson({
      'rowKey': 'row-1',
      'playerName': '테스트 선수',
      'stats': {
        'atBats': 0,
        'hits': null,
        'outs': 5,
        'inningsPitched': '1.2',
        'era': 4.2,
        'email': 'not retained',
      },
      'plateAppearances': [
        {'inning': 2, 'result': '사구,송구실책,사구'},
      ],
    });
    expect(row.displayStat('atBats'), '0');
    expect(row.displayStat('hits'), '—');
    expect(row.displayStat('walks'), '—');
    expect(row.inningsLabel, '1.2');
    expect(row.displayStat('era', decimals: 2), '4.20');
    expect(row.stats.containsKey('email'), isFalse);
    expect(row.plateAppearances.single.result, '사구,송구실책,사구');
  });

  test(
    'official API includes season and does not fall back on a network error',
    () async {
      final requests = <String>[];
      final api = BackendApiService(
        tokenProvider: () async => null,
        client: MockClient((request) async {
          requests.add(request.url.path);
          expect(request.url.queryParameters['seasonId'], '3');
          return http.Response('unavailable', 503);
        }),
      );
      addTearDown(api.dispose);
      await expectLater(
        api.getOfficialPlayerGameLogs(42, seasonId: 3),
        throwsException,
      );
      expect(requests, ['/api/players/42/official-game-logs']);
    },
  );

  test(
    'parses published revision rows in chronological order without aggregation',
    () async {
      final api = BackendApiService(
        tokenProvider: () async => null,
        client: MockClient(
          (request) async => http.Response(
            jsonEncode({
              'status': 'AVAILABLE',
              'playerId': 42,
              'provider': 'UNIQUE_PLAY',
              'seasonId': 3,
              'syncRevision': 'rev-2',
              'publishedAt': '2026-09-05T00:00:00Z',
              'games': [
                {
                  'sourceGameId': 'up-old',
                  'backendGameId': 99,
                  'playedAt': '2026-07-01T12:00:00',
                },
                {
                  'sourceGameId': 'up-new',
                  'backendGameId': 8,
                  'playedAt': '2026-08-24T15:00:00',
                },
              ],
              'futureField': 'ignored',
            }),
            200,
          ),
        ),
      );
      addTearDown(api.dispose);
      final data = await api.getOfficialPlayerGameLogs(42, seasonId: 3);
      expect(data.syncRevision, 'rev-2');
      expect(data.games.map((game) => game.sourceGameId), ['up-new', 'up-old']);
      expect(data.games.first.backendGameId, 8);
      expect(data.games.first.homeScore, isNull);
    },
  );
}
