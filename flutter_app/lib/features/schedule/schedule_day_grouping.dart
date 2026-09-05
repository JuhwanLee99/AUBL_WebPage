import '../../core/models/public_season_models.dart';
import '../../core/utils/kst_clock.dart';

/// A date bucket used by the compact, date-first schedule list.
class ScheduleGameDay {
  const ScheduleGameDay({required this.date, required this.games});

  /// KST calendar date. `null` is reserved for games without a published date.
  final DateTime? date;
  final List<PublicGame> games;
}

DateTime? scheduleGameTimeKst(PublicGame game) {
  final raw = game.startTime ?? game.gameDate;
  return raw == null ? null : KstClock.normalizeApi(raw);
}

/// Groups games by their KST calendar date and keeps the published order
/// deterministic. Games without a date remain visible at the end.
List<ScheduleGameDay> groupScheduleGamesByKstDay(Iterable<PublicGame> games) {
  final dated = <DateTime, List<PublicGame>>{};
  final undated = <PublicGame>[];

  for (final game in games) {
    final time = scheduleGameTimeKst(game);
    if (time == null) {
      undated.add(game);
      continue;
    }
    final day = DateTime(time.year, time.month, time.day);
    dated.putIfAbsent(day, () => <PublicGame>[]).add(game);
  }

  int compareGames(PublicGame left, PublicGame right) {
    final leftTime = scheduleGameTimeKst(left);
    final rightTime = scheduleGameTimeKst(right);
    if (leftTime == null && rightTime == null) {
      return left.backendGameId.compareTo(right.backendGameId);
    }
    if (leftTime == null) return 1;
    if (rightTime == null) return -1;
    final timeComparison = leftTime.compareTo(rightTime);
    return timeComparison != 0
        ? timeComparison
        : left.backendGameId.compareTo(right.backendGameId);
  }

  final dates = dated.keys.toList()..sort();
  final result = <ScheduleGameDay>[
    for (final date in dates)
      ScheduleGameDay(
        date: date,
        games: List<PublicGame>.of(dated[date]!)..sort(compareGames),
      ),
  ];
  if (undated.isNotEmpty) {
    result.add(
      ScheduleGameDay(
        date: null,
        games: List<PublicGame>.of(undated)..sort(compareGames),
      ),
    );
  }
  return result;
}
