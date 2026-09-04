import 'package:aubl_flutter_app/core/models/match.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('inactive source match is retained but not publicly visible', () {
    final match = Match.fromJson({
      'id': 'legacy-match',
      'homeTeamId': 'home',
      'awayTeamId': 'away',
      'status': 'completed',
      'sourceActive': false,
      'sourceGameId': 'up-replacement',
    });

    expect(match.isPublic, isFalse);
    expect(match.detailId, 'up-replacement');
    expect(match.toJson()['sourceActive'], isFalse);
  });

  test('legacy match without sourceActive remains visible', () {
    final match = Match.fromJson({
      'id': 'legacy-match',
      'homeTeamId': 'home',
      'awayTeamId': 'away',
      'status': 'scheduled',
    });

    expect(match.isPublic, isTrue);
    expect(match.detailId, 'legacy-match');
  });
}
