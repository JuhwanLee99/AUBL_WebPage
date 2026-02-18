import '../../core/data/team_groups.dart';
import '../../core/models/match.dart' as m;
import 'data/schedule_repository.dart';

class ScheduleViewModel {
  ScheduleViewModel({ScheduleDataSource? dataSource})
      : _dataSource = dataSource ?? ScheduleRepository();

  final ScheduleDataSource _dataSource;

  List<m.Match> _allMatches = [];
  bool _isLoading = true;

  List<m.Match> get allMatches => _allMatches;
  bool get isLoading => _isLoading;

  List<m.Match> get liveMatches => _allMatches.where((m) => m.isLive).toList();

  List<m.Match> get completedMatches =>
      _allMatches.where((m) => m.isCompleted).toList()
        ..sort((a, b) => (b.startTime ?? '').compareTo(a.startTime ?? ''));

  List<m.Match> get practiceMatches =>
      _allMatches.where((m) => m.isPractice).toList();

  List<m.Match> groupMatches(String? groupFilter) {
    if (groupFilter == null) return _allMatches;
    return _allMatches.where((match) {
      final homeGroup = teamNameToGroup[match.homeTeamName];
      final awayGroup = teamNameToGroup[match.awayTeamName];
      return homeGroup == groupFilter || awayGroup == groupFilter;
    }).toList();
  }

  Stream<List<m.Match>> watchLiveMatches() {
    return _dataSource.watchLiveMatches();
  }

  Future<void> loadMatches() async {
    final cached = await _dataSource.getCachedMatches();
    if (cached != null && _isLoading) {
      _allMatches = cached;
      _isLoading = false;
    }

    try {
      final matches = await _dataSource.getAllMatches();
      _allMatches = matches;
      _isLoading = false;
      await _dataSource.cacheMatches(matches);
    } catch (_) {
      if (_isLoading) {
        _isLoading = false;
      }
    }
  }
}
