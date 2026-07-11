import '../../../core/models/match.dart' as m;
import '../../../core/services/cache_service.dart';
import '../../../core/services/firestore_service.dart';

abstract class ScheduleDataSource {
  Future<List<m.Match>?> getCachedMatches();
  Future<List<m.Match>> getAllMatches();
  Stream<List<m.Match>> watchLiveMatches();
  Future<void> cacheMatches(List<m.Match> matches);
}

class ScheduleRepository implements ScheduleDataSource {
  ScheduleRepository({FirestoreService? firestore})
      : _firestore = firestore ?? FirestoreService();

  final FirestoreService _firestore;

  @override
  Future<List<m.Match>?> getCachedMatches() {
    return CacheService.instance.getCachedMatches();
  }

  @override
  Future<List<m.Match>> getAllMatches() {
    return _firestore.getAllMatches();
  }

  @override
  Stream<List<m.Match>> watchLiveMatches() {
    return _firestore.watchLiveMatches();
  }

  @override
  Future<void> cacheMatches(List<m.Match> matches) {
    return CacheService.instance.cacheMatches(matches);
  }
}
