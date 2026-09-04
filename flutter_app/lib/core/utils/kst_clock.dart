/// AUBL 공식 경기의 기준 시간대(Asia/Seoul)를 다루는 유틸리티입니다.
///
/// Flutter의 [DateTime]에는 IANA 시간대 정보가 없으므로, API에서 받은 시각은
/// KST 벽시계 값으로 정규화해 화면의 날짜 경계가 기기 시간대에 좌우되지 않게
/// 합니다. 서버의 오프셋 없는 시각은 API 계약에 따라 이미 KST로 간주합니다.
abstract final class KstClock {
  static const offset = Duration(hours: 9);

  static DateTime now({DateTime? instant}) =>
      (instant ?? DateTime.now()).toUtc().add(offset);

  static DateTime today({DateTime? instant}) {
    final value = now(instant: instant);
    return DateTime(value.year, value.month, value.day);
  }

  static DateTime normalizeApi(DateTime value) {
    final normalized = value.isUtc ? value.add(offset) : value;
    return DateTime(
      normalized.year,
      normalized.month,
      normalized.day,
      normalized.hour,
      normalized.minute,
      normalized.second,
      normalized.millisecond,
      normalized.microsecond,
    );
  }

  static DateTime? tryParseApi(dynamic value) {
    final text = value?.toString().trim();
    if (text == null || text.isEmpty) return null;
    final parsed = DateTime.tryParse(text);
    return parsed == null ? null : normalizeApi(parsed);
  }

  static DateTime dateOnly(DateTime value) {
    final normalized = normalizeApi(value);
    return DateTime(normalized.year, normalized.month, normalized.day);
  }

  static DateTime monthStart(DateTime value) {
    final normalized = normalizeApi(value);
    return DateTime(normalized.year, normalized.month);
  }

  static bool isSameDay(DateTime left, DateTime right) {
    final a = normalizeApi(left);
    final b = normalizeApi(right);
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }
}
