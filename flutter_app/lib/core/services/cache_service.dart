import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/match.dart';
import '../models/notice.dart';

/// SharedPreferences 기반 로컬 캐시.
/// 오프라인 시 마지막으로 로드된 데이터를 표시하기 위해 사용.
class CacheService {
  CacheService._();
  static final instance = CacheService._();

  static const _keyMatches = 'cache_matches_v2';
  static const _legacyKeyMatches = 'cache_matches';
  static const _keyNotices = 'cache_notices';
  static const _keyStaticContent = 'cache_static_content';

  SharedPreferences? _prefs;

  Future<SharedPreferences> get _sp async =>
      _prefs ??= await SharedPreferences.getInstance();

  // ── Matches ──

  Future<void> cacheMatches(List<Match> matches) async {
    final sp = await _sp;
    final json = jsonEncode(matches.map((m) => m.toJson()).toList());
    await sp.setString(_keyMatches, json);
    await sp.remove(_legacyKeyMatches);
  }

  Future<List<Match>?> getCachedMatches() async {
    final sp = await _sp;
    final raw = sp.getString(_keyMatches);
    if (raw == null) return null;
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list.map(Match.fromJson).where((m) => m.isPublic).toList();
    } catch (_) {
      return null;
    }
  }

  // ── Notices ──

  Future<void> cacheNotices(List<Notice> notices) async {
    final sp = await _sp;
    final json = jsonEncode(notices.map((n) => n.toJson()).toList());
    await sp.setString(_keyNotices, json);
  }

  Future<List<Notice>?> getCachedNotices() async {
    final sp = await _sp;
    final raw = sp.getString(_keyNotices);
    if (raw == null) return null;
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list.map(Notice.fromJson).toList();
    } catch (_) {
      return null;
    }
  }

  // ── Static Content (회칙 등) ──

  Future<void> cacheStaticContent(Map<String, dynamic> data) async {
    final sp = await _sp;
    await sp.setString(_keyStaticContent, jsonEncode(data));
  }

  Future<Map<String, dynamic>?> getCachedStaticContent() async {
    final sp = await _sp;
    final raw = sp.getString(_keyStaticContent);
    if (raw == null) return null;
    try {
      return (jsonDecode(raw) as Map).cast<String, dynamic>();
    } catch (_) {
      return null;
    }
  }
}
