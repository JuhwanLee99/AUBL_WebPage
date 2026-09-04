import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/api_cache_envelope.dart';
import '../models/match.dart';
import '../models/notice.dart';
import '../models/public_season_models.dart';

/// SharedPreferences 기반 로컬 캐시.
/// 오프라인 시 마지막으로 로드된 데이터를 표시하기 위해 사용.
class CacheService {
  CacheService._();
  CacheService.forTesting(SharedPreferences preferences) : _prefs = preferences;

  static final instance = CacheService._();

  static const _keyMatches = 'cache_matches_v2';
  static const _legacyKeyMatches = 'cache_matches';
  static const _keyNotices = 'cache_notices';
  static const _keyStaticContent = 'cache_static_content';
  static const _apiPrefix = 'aubl_api_v1';
  static const _overviewLatestKey = '$_apiPrefix:overview:latest';

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

  // ── Published season API ──

  Future<void> cacheSeasonOverview(SeasonOverview overview) async {
    final envelope = ApiCacheEnvelope<SeasonOverview>(
      schemaVersion: ApiCacheEnvelope.currentSchemaVersion,
      cachedAt: DateTime.now(),
      revision: overview.sourceFreshness.publishedRevision,
      data: overview,
    );
    final raw = jsonEncode(envelope.toJson((value) => value.toJson()));
    final sp = await _sp;
    await Future.wait([
      sp.setString('$_apiPrefix:overview:${overview.seasonId}', raw),
      sp.setString(_overviewLatestKey, raw),
    ]);
  }

  Future<ApiCacheEnvelope<SeasonOverview>?> getCachedSeasonOverview({
    int? seasonId,
  }) async {
    final sp = await _sp;
    final key = seasonId == null
        ? _overviewLatestKey
        : '$_apiPrefix:overview:$seasonId';
    final raw = sp.getString(key);
    if (raw == null) return null;
    try {
      return ApiCacheEnvelope.tryParse<SeasonOverview>(
        jsonDecode(raw),
        (value) {
          final json = (value as Map).cast<String, dynamic>();
          final fallback = json['seasonId'];
          return SeasonOverview.fromJson(
            json,
            fallbackSeasonId: fallback is int ? fallback : 0,
          );
        },
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> cachePublicGames({
    required String scope,
    required String? revision,
    required List<PublicGame> games,
  }) async {
    final envelope = ApiCacheEnvelope<List<PublicGame>>(
      schemaVersion: ApiCacheEnvelope.currentSchemaVersion,
      cachedAt: DateTime.now(),
      revision: revision,
      data: games,
    );
    final raw = jsonEncode(
      envelope.toJson(
        (value) => value.map((game) => game.toJson()).toList(),
      ),
    );
    final sp = await _sp;
    final normalizedRevision = _cacheSegment(revision ?? 'unpublished');
    await Future.wait([
      sp.setString(
        '$_apiPrefix:games:${_cacheSegment(scope)}:$normalizedRevision',
        raw,
      ),
      sp.setString('$_apiPrefix:games:${_cacheSegment(scope)}:latest', raw),
    ]);
  }

  Future<ApiCacheEnvelope<List<PublicGame>>?> getCachedPublicGames({
    required String scope,
    String? revision,
  }) async {
    final sp = await _sp;
    final suffix = revision == null ? 'latest' : _cacheSegment(revision);
    final raw = sp.getString(
      '$_apiPrefix:games:${_cacheSegment(scope)}:$suffix',
    );
    if (raw == null) return null;
    try {
      return ApiCacheEnvelope.tryParse<List<PublicGame>>(
        jsonDecode(raw),
        (value) => (value as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map(PublicGame.fromJson)
            .where((game) => game.activeRevision)
            .toList(),
      );
    } catch (_) {
      return null;
    }
  }

  String _cacheSegment(String value) =>
      Uri.encodeComponent(value.trim().toLowerCase());
}
