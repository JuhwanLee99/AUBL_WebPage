import 'package:flutter_cache_manager/flutter_cache_manager.dart';

/// 팀 관련 화면(팀 카드/엠블럼/선수 프로필) 전용 이미지 캐시 매니저.
class TeamImageCacheManager {
  TeamImageCacheManager._();

  static final CacheManager instance = CacheManager(
    Config(
      'teamImageCache',
      stalePeriod: const Duration(days: 30),
      maxNrOfCacheObjects: 400,
    ),
  );
}
