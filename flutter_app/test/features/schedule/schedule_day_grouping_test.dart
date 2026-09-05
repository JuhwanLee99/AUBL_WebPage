import 'package:aubl_flutter_app/core/models/public_season_models.dart';
import 'package:aubl_flutter_app/features/schedule/schedule_day_grouping.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('groups and orders official games by KST calendar day', () {
    final groups = groupScheduleGamesByKstDay([
      _game(id: 2, startTime: DateTime.utc(2026, 9, 5, 2)),
      _game(id: 1, startTime: DateTime.utc(2026, 9, 4, 15, 30)),
      _game(id: 3, startTime: DateTime.utc(2026, 9, 4, 14, 30)),
    ]);

    expect(groups, hasLength(2));
    expect(groups[0].date, DateTime(2026, 9, 4));
    expect(groups[0].games.map((game) => game.backendGameId), [3]);
    expect(groups[1].date, DateTime(2026, 9, 5));
    expect(groups[1].games.map((game) => game.backendGameId), [1, 2]);
  });

  test('keeps games without a date visible in the last bucket', () {
    final groups = groupScheduleGamesByKstDay([
      _game(id: 4),
      _game(id: 2, startTime: DateTime(2026, 9, 5, 9)),
    ]);

    expect(groups, hasLength(2));
    expect(groups.first.date, DateTime(2026, 9, 5));
    expect(groups.last.date, isNull);
    expect(groups.last.games.single.backendGameId, 4);
  });
}

PublicGame _game({required int id, DateTime? startTime}) {
  return PublicGame(
    backendGameId: id,
    seasonId: 2026,
    seasonYear: 2026,
    gameDate: null,
    startTime: startTime,
    timezone: 'Asia/Seoul',
    venue: null,
    groupCode: 'A',
    status: PublicGameStatus.scheduled,
    gameType: null,
    gameNumber: null,
    homeTeamId: 1,
    homeTeamName: '홈팀',
    homeScore: null,
    homeQualificationState: QualificationState.unknown,
    awayTeamId: 2,
    awayTeamName: '원정팀',
    awayScore: null,
    awayQualificationState: QualificationState.unknown,
    sourceProvider: 'UNIQUE_PLAY',
    sourceGameId: 'game-$id',
    syncRevision: 'revision-1',
    sourceUpdatedAt: null,
    freshnessStatus: null,
    activeRevision: true,
  );
}
