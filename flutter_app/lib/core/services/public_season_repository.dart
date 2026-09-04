import '../models/api_cache_envelope.dart';
import '../models/public_season_models.dart';
import 'backend_api_service.dart';
import 'cache_service.dart';

class PublicSeasonRepository {
  PublicSeasonRepository({
    BackendApiService? api,
    CacheService? cache,
  })  : _api = api ?? BackendApiService(),
        _cache = cache ?? CacheService.instance;

  final BackendApiService _api;
  final CacheService _cache;

  Future<ApiLoadResult<SeasonOverview>> loadOverview({
    int preferredYear = 2026,
  }) async {
    try {
      final seasons = await _api.getSeasons();
      if (seasons.isEmpty) throw StateError('공개된 시즌이 없습니다.');
      final season = seasons.firstWhere(
        (item) => item.year == preferredYear,
        orElse: () => seasons.first,
      );
      final overview = await _api.getSeasonOverview(season.id);
      await _cache.cacheSeasonOverview(overview);
      return ApiLoadResult(
        data: overview,
        fromCache: false,
        cachedAt: null,
        revision: overview.sourceFreshness.publishedRevision,
      );
    } catch (_) {
      final cached = await _cache.getCachedSeasonOverview();
      if (cached == null) rethrow;
      return ApiLoadResult(
        data: cached.data,
        fromCache: true,
        cachedAt: cached.cachedAt,
        revision: cached.revision,
      );
    }
  }

  Future<ApiLoadResult<List<PublicGame>>> loadGames({
    required int seasonId,
    required String? revision,
    DateTime? date,
    DateTime? dateFrom,
    DateTime? dateTo,
    String? group,
    String? status,
    String? qualification,
  }) async {
    final scope = gameCacheScope(
      seasonId: seasonId,
      date: date,
      dateFrom: dateFrom,
      dateTo: dateTo,
      group: group,
      status: status,
      qualification: qualification,
    );
    try {
      final games = await _api.getPublicGames(
        seasonId: seasonId,
        date: date,
        dateFrom: dateFrom,
        dateTo: dateTo,
        group: group,
        status: status,
        qualification: qualification,
      );
      await _cache.cachePublicGames(
        scope: scope,
        revision: revision,
        games: games,
      );
      return ApiLoadResult(
        data: games,
        fromCache: false,
        cachedAt: null,
        revision: revision,
      );
    } catch (_) {
      final cached = await _cache.getCachedPublicGames(
        scope: scope,
        revision: revision,
      );
      if (cached == null) rethrow;
      return ApiLoadResult(
        data: cached.data,
        fromCache: true,
        cachedAt: cached.cachedAt,
        revision: cached.revision,
      );
    }
  }

  static String gameCacheScope({
    required int seasonId,
    DateTime? date,
    DateTime? dateFrom,
    DateTime? dateTo,
    String? group,
    String? status,
    String? qualification,
  }) {
    String day(DateTime? value) => value == null
        ? '-'
        : '${value.year.toString().padLeft(4, '0')}'
            '${value.month.toString().padLeft(2, '0')}'
            '${value.day.toString().padLeft(2, '0')}';

    return [
      'season=$seasonId',
      'date=${day(date)}',
      'from=${day(dateFrom)}',
      'to=${day(dateTo)}',
      'group=${group?.trim().toUpperCase() ?? '-'}',
      'status=${status?.trim().toUpperCase() ?? '-'}',
      'qualification=${qualification?.trim().toUpperCase() ?? '-'}',
    ].join('&');
  }
}
