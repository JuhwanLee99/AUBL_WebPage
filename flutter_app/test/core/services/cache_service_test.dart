import 'package:aubl_flutter_app/core/models/public_season_models.dart';
import 'package:aubl_flutter_app/core/services/cache_service.dart';
import 'package:aubl_flutter_app/core/services/public_season_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('published API cache', () {
    late CacheService cache;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      cache = CacheService.forTesting(await SharedPreferences.getInstance());
    });

    test('round-trips overview with its published revision', () async {
      final overview = SeasonOverview.fromJson(
        _overviewJson,
        fallbackSeasonId: 12,
      );

      await cache.cacheSeasonOverview(overview);
      final cached = await cache.getCachedSeasonOverview(seasonId: 12);

      expect(cached, isNotNull);
      expect(cached!.revision, 'revision-7');
      expect(cached.data.groups.single.standings.single.teamName, 'AUBL 팀');
      expect(cached.data.upcomingGames.single.sourceGameId, 'up-101');
    });

    test('does not substitute a game cache from a different revision',
        () async {
      final game = PublicGame.fromJson(
        (_overviewJson['upcomingGames'] as List).single,
      );
      const scope = 'season=12&from=20260901&to=20260930';

      await cache.cachePublicGames(
        scope: scope,
        revision: 'revision-7',
        games: [game],
      );

      expect(
        await cache.getCachedPublicGames(
          scope: scope,
          revision: 'revision-8',
        ),
        isNull,
      );
      final exact = await cache.getCachedPublicGames(
        scope: scope,
        revision: 'revision-7',
      );
      expect(exact?.data.single.detailId, 'up-101');
    });

    test('cache scope separates dates and filters', () {
      final september = PublicSeasonRepository.gameCacheScope(
        seasonId: 12,
        dateFrom: DateTime(2026, 9, 1),
        dateTo: DateTime(2026, 9, 30),
        group: 'a',
      );
      final october = PublicSeasonRepository.gameCacheScope(
        seasonId: 12,
        dateFrom: DateTime(2026, 10, 1),
        dateTo: DateTime(2026, 10, 31),
        group: 'a',
      );

      expect(september, isNot(october));
      expect(september, contains('group=A'));
    });
  });
}

final Map<String, dynamic> _overviewJson = {
  'seasonId': 12,
  'seasonYear': 2026,
  'sourceFreshness': {
    'provider': 'UNIQUE_PLAY',
    'syncMode': 'MANUAL',
    'publishedRevision': 'revision-7',
    'publishedAt': '2026-09-03T15:30:00Z',
    'status': 'CURRENT',
  },
  'upcomingGames': [
    {
      'id': 101,
      'seasonId': 12,
      'gameDate': '2026-09-04',
      'startTime': '2026-09-04T18:00:00+09:00',
      'status': 'SCHEDULED',
      'homeTeamId': 1,
      'homeTeamName': 'AUBL 팀',
      'awayTeamId': 2,
      'awayTeamName': '상대 팀',
      'sourceGameId': 'up-101',
      'activeRevision': true,
    }
  ],
  'recentGames': [],
  'groups': [
    {
      'groupCode': 'A',
      'teamCount': 5,
      'completedGameCount': 1,
      'standings': [
        {
          'rank': 1,
          'teamId': 1,
          'teamName': 'AUBL 팀',
          'groupCode': 'A',
          'gamesPlayed': 1,
          'wins': 1,
          'ties': 0,
          'losses': 0,
          'qualificationState': 'CURRENT_EUTTEUM',
        }
      ],
    }
  ],
  'batterLeaders': [],
  'pitcherLeaders': [],
};
