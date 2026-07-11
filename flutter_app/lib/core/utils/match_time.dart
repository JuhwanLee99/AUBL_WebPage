import 'package:intl/intl.dart';

DateTime? parseMatchStartTimeLocal(String? value) {
  if (value == null || value.isEmpty) return null;
  final parsed = DateTime.tryParse(value);
  if (parsed == null) return null;
  return parsed.isUtc ? parsed.toLocal() : parsed;
}

String? formatMatchStartTime(
  String? value, {
  required String pattern,
  String locale = 'ko',
}) {
  final local = parseMatchStartTimeLocal(value);
  if (local == null) return null;
  return DateFormat(pattern, locale).format(local);
}

String? matchStartDateKey(String? value) {
  final local = parseMatchStartTimeLocal(value);
  if (local == null) return null;
  return DateFormat('yyyy-MM-dd').format(local);
}
