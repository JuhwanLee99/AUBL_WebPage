import 'package:aubl_flutter_app/core/utils/kst_clock.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('KstClock', () {
    test('moves a UTC instant across the KST midnight boundary', () {
      final value = KstClock.tryParseApi('2026-09-03T15:30:00Z');

      expect(value, DateTime(2026, 9, 4, 0, 30));
      expect(KstClock.dateOnly(value!), DateTime(2026, 9, 4));
    });

    test('keeps offset and offset-less server values on the same KST clock',
        () {
      final withOffset = KstClock.tryParseApi('2026-09-04T18:10:00+09:00');
      final withoutOffset = KstClock.tryParseApi('2026-09-04T18:10:00');

      expect(withOffset, DateTime(2026, 9, 4, 18, 10));
      expect(withoutOffset, DateTime(2026, 9, 4, 18, 10));
      expect(KstClock.isSameDay(withOffset!, withoutOffset!), isTrue);
    });

    test('computes today from a supplied instant without device timezone', () {
      final instant = DateTime.utc(2026, 9, 3, 15, 1);

      expect(KstClock.today(instant: instant), DateTime(2026, 9, 4));
    });
  });
}
